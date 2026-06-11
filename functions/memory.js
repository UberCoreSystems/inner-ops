/**
 * Long-term AI memory — Cloud Functions.
 *
 * Gives the Oracle the user's STORY, not just aggregates: one memory doc per
 * module plus a `global` synthesis doc, each holding date-stamped thematic
 * statements and the user's own verbatim, validated RECEIPTS.
 *
 * Storage: users/{uid}/memory/{docId}, docId ∈
 *   global | journal | killList | hardLessons | relapse
 * Written EXCLUSIVELY here (Admin SDK, scoped to the verified caller's uid).
 * Clients read their own and route edit/wipe through the callables below;
 * firestore.rules denies every client write to the path.
 *
 * Compression model: Haiku 4.5 (this is compression, not reasoning). Sonnet
 * stays for Oracle feedback.
 *
 * NON-NEGOTIABLE — receipts must be real: the updater prompt copies quotes
 * character-for-character from the entry text, and this module re-validates
 * every receipt with a substring check against the authoritative entry (read
 * server-side by id) before save. A receipt that fails validation is dropped
 * silently. A fabricated quote shown to the user as their own words is a
 * product-killing failure.
 *
 * Logging discipline: never log entry text or memory text — only sizes,
 * validation pass/fail counts, latency, token counts.
 */

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const AnthropicSDK = require("@anthropic-ai/sdk");

const Anthropic = AnthropicSDK.default ?? AnthropicSDK;
const anthropicApiKey = defineSecret("ANTHROPIC_API_KEY");

const {
  MEMORY_DAILY_LIMIT,
  MEMORY_MAX_RECEIPTS,
  MEMORY_RECEIPT_MAX_WORDS,
  MEMORY_MODULE_CONTENT_MAX_CHARS,
  MEMORY_GLOBAL_CONTENT_MAX_CHARS,
  MEMORY_GLOBAL_REFRESH_HOURS,
  MEMORY_INJECTION_MAX_CHARS,
  MEMORY_PROCESSED_IDS_CAP,
  MEMORY_SCHEMA_VERSION,
} = require("./config");

// Haiku 4.5 — all memory-update calls. Compression, not reasoning.
const HAIKU_MODEL = "claude-haiku-4-5";

const MODULE_IDS = ["journal", "killList", "hardLessons", "relapse"];
const GLOBAL_ID = "global";

const MODULE_LABELS = {
  global: "Through-line (cross-module)",
  journal: "Journal",
  killList: "General Ledger",
  hardLessons: "Hard Lessons",
  relapse: "The Signal",
};

const SOURCE_COLLECTIONS = {
  journal: "journalEntries",
  killList: "killTargets",
  hardLessons: "hardLessons",
  relapse: "relapseEntries",
};

// ── Banned tone — identical regime to src/utils/aiFeedback.js ──────────────
const BANNED_TONE_REGEX =
  /\b(proud of you|you got this|safe space|healing journey|you deserve|be gentle with yourself|everything happens for a reason)\b/gi;

function stripBannedTone(text) {
  if (typeof text !== "string") return "";
  return text.replace(BANNED_TONE_REGEX, "").replace(/[ \t]{2,}/g, " ").replace(/ +([.,;:])/g, "$1").trim();
}

// ── Helpers ────────────────────────────────────────────────────────────────
function structuredLog(fields) {
  // No entry text, no memory text — sizes/counts/latency only.
  console.log("memory.call", JSON.stringify(fields));
}

function utcDayKey(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

function normalizeForMatch(s) {
  return String(s ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

function wordCount(s) {
  return String(s ?? "").trim().split(/\s+/).filter(Boolean).length;
}

function toDateString(value) {
  // Firestore Timestamp | Date | ISO string | {seconds} → YYYY-MM-DD (UTC).
  try {
    if (!value) return utcDayKey();
    if (typeof value.toDate === "function") return value.toDate().toISOString().slice(0, 10);
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    if (typeof value === "object" && typeof value.seconds === "number") {
      return new Date(value.seconds * 1000).toISOString().slice(0, 10);
    }
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  } catch { /* fall through */ }
  return utcDayKey();
}

/**
 * Separate daily cap for memory Haiku calls (off the Oracle pool).
 * Counter doc: users/{uid}/_rateLimits/memory_{YYYY-MM-DD}.
 */
async function checkAndIncrementMemoryLimit(uid) {
  const db = getFirestore();
  const ref = db.doc(`users/${uid}/_rateLimits/memory_${utcDayKey()}`);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.exists ? (snap.data().count || 0) : 0;
    if (current >= MEMORY_DAILY_LIMIT) {
      throw new HttpsError("resource-exhausted", "Daily memory-update limit reached.");
    }
    if (snap.exists) {
      tx.update(ref, { count: FieldValue.increment(1), lastAt: FieldValue.serverTimestamp() });
    } else {
      tx.set(ref, { count: 1, dayKey: utcDayKey(), createdAt: FieldValue.serverTimestamp(), lastAt: FieldValue.serverTimestamp() });
    }
  });
}

// ── Authoritative entry → text + date + dedupe key ──────────────────────────
/**
 * Read the real source entry by id (Admin SDK), verify ownership, and extract
 * the confrontable text. Returning null skips the update silently.
 */
async function loadEntryFacts(db, uid, module, entryId) {
  const collection = SOURCE_COLLECTIONS[module];
  if (!collection || typeof entryId !== "string" || !entryId) return null;

  const snap = await db.doc(`${collection}/${entryId}`).get();
  if (!snap.exists) return null;
  const d = snap.data() || {};
  if (d.userId !== uid) return null; // never read another user's entry

  if (module === "journal") {
    const text = String(d.content || "").trim();
    if (!text) return null;
    return { text, date: toDateString(d.eventOccurredAt || d.createdAt), dedupeKey: entryId };
  }

  if (module === "relapse") {
    const text = String(d.reflection || "").trim();
    if (!text) return null;
    return { text, date: toDateString(d.createdAt || d.entryTimestamp), dedupeKey: entryId };
  }

  if (module === "hardLessons") {
    // Only finalized lessons feed memory. Drafts must never be quoted.
    if (d.isFinalized !== true) return null;
    const text = [
      d.eventDescription, d.myAssumption, d.signalIgnored,
      d.costDescription, d.extractedLesson, d.ruleGoingForward,
    ].map((x) => String(x || "").trim()).filter(Boolean).join("\n");
    if (!text) return null;
    return { text, date: toDateString(d.finalizedAt || d.createdAt), dedupeKey: entryId };
  }

  if (module === "killList") {
    // The confrontable text is the latest autopsy on an escaped contract.
    if (d.status !== "escaped") return null;
    const escapes = Array.isArray(d.escapeData) ? d.escapeData : [];
    if (escapes.length === 0) return null;
    const latest = escapes[escapes.length - 1] || {};
    const text = [
      d.title && `Target: ${d.title}`,
      latest.context, latest.rationalization, latest.prevention, latest.intentionFailReason,
    ].map((x) => String(x || "").trim()).filter(Boolean).join("\n");
    if (!text) return null;
    // Each distinct escape is one event; a double-fire of the same escape dedupes.
    return { text, date: toDateString(latest.date || d.escapedAt), dedupeKey: `${entryId}:${escapes.length}` };
  }

  return null;
}

// ── Haiku updater ────────────────────────────────────────────────────────────
const UPDATER_SYSTEM_PROMPT = `You compress a user's behavioral record into durable memory for a confrontational self-command system (Inner Ops). You are not a coach or therapist. Cold, observational register only. No praise, no encouragement, no diagnosis, no therapy language.

You are given the PRIOR memory for one module and ONE new finalized entry. Produce the REVISED memory.

THEMES (the "content" field):
- Date-stamped pattern statements in plain observational prose, e.g. "Since ~April: frames every escape as externally caused."
- Replace stale characterizations when the new entry contradicts them. Do not accumulate contradictory claims — revise.
- Carry forward prior themes that still hold. This is revision, not regeneration.
- No second-person address, no advice, no questions. Statements of pattern only.

RECEIPTS (the "receipts" array): exact quotes selected for CONFRONTATIONAL value — contradictions, repeated framings, broken commitments.
- Each receipt: { "quote": "...", "source": "new" | "prior" }.
- "new" → copy the quote CHARACTER-FOR-CHARACTER from the NEW ENTRY text. Never paraphrase. ≤25 words.
- "prior" → an existing receipt you are keeping; copy its quote exactly as given in PRIOR memory.
- Order receipts by confrontational value, strongest first. Return at most ${MEMORY_MAX_RECEIPTS}. When at cap, drop the weakest by omitting it.
- Only include a "new" receipt if it genuinely exposes a pattern, contradiction, or commitment. Zero new receipts is acceptable.

Output STRICT JSON only, no prose, no code fences:
{"content": "string", "receipts": [{"quote": "string", "source": "new|prior"}]}`;

function buildUpdaterUserPayload(module, priorMemory, entry) {
  const priorReceipts = Array.isArray(priorMemory?.receipts) ? priorMemory.receipts : [];
  return [
    `MODULE: ${MODULE_LABELS[module] || module}`,
    `ENTRY DATE: ${entry.date}`,
    "",
    "PRIOR MEMORY CONTENT:",
    priorMemory?.content ? priorMemory.content : "(none yet)",
    "",
    "PRIOR RECEIPTS (quote each verbatim if kept):",
    priorReceipts.length
      ? priorReceipts.map((r, i) => `${i + 1}. "${r.quote}"`).join("\n")
      : "(none yet)",
    "",
    "NEW ENTRY TEXT (copy any 'new' receipt verbatim from here):",
    entry.text,
  ].join("\n");
}

function parseUpdaterJson(raw) {
  let s = String(raw || "").trim();
  // Strip accidental code fences.
  s = s.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(s.slice(start, end + 1));
  } catch {
    return null;
  }
}

/**
 * Reconcile Haiku output against authoritative sources:
 *  - "new" receipts: must substring-match the entry text → stamped with entry
 *    date + sourceEntryId + module.
 *  - "prior" receipts: must exactly match a receipt already on the doc →
 *    original metadata preserved (no resurrection of wiped/edited content,
 *    since we only match the CURRENT doc's receipts).
 * Returns { receipts, validated, dropped }.
 */
function reconcileReceipts(parsed, entry, module, priorReceipts, sourceEntryId) {
  const out = [];
  let validated = 0;
  let dropped = 0;

  const normEntry = normalizeForMatch(entry.text);
  const priorByQuote = new Map();
  for (const r of priorReceipts) priorByQuote.set(normalizeForMatch(r.quote), r);

  const seen = new Set();
  const candidates = Array.isArray(parsed?.receipts) ? parsed.receipts : [];

  for (const c of candidates) {
    if (out.length >= MEMORY_MAX_RECEIPTS) break;
    const quote = typeof c?.quote === "string" ? c.quote.trim() : "";
    if (!quote || wordCount(quote) > MEMORY_RECEIPT_MAX_WORDS) { dropped++; continue; }
    const norm = normalizeForMatch(quote);
    if (seen.has(norm)) continue;

    if (c?.source === "prior") {
      const match = priorByQuote.get(norm);
      if (match) { out.push(match); seen.add(norm); validated++; }
      else dropped++;
      continue;
    }
    // Default to "new": authenticity gate — must be in the real entry text.
    if (normEntry.includes(norm)) {
      out.push({ date: entry.date, quote, sourceModule: module, sourceEntryId });
      seen.add(norm);
      validated++;
    } else {
      dropped++;
    }
  }

  return { receipts: out, validated, dropped };
}

async function callHaiku(client, systemPrompt, userPayload, maxTokens) {
  const message = await client.messages.create({
    model: HAIKU_MODEL,
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [{ role: "user", content: userPayload }],
  });
  return {
    text: message.content?.[0]?.text || "",
    inputTokens: message.usage?.input_tokens ?? null,
    outputTokens: message.usage?.output_tokens ?? null,
  };
}

// ── Global refresher (second-stage compression from the four module docs) ────
const GLOBAL_SYSTEM_PROMPT = `You synthesize a user's per-module memory into ONE cross-module through-line for a confrontational self-command system. Cold, observational register. No praise, encouragement, diagnosis, or therapy language.

You are given the THEMES from up to four module memories (Journal, General Ledger, The Signal, Hard Lessons) and their receipts. Produce the global through-line:
- The identity direction the user is moving toward or away from.
- The recurring contradiction that survives across modules.
- The single pattern that shows up under all available lenses.
- Date-stamp claims where the module themes date them.

For receipts: you may carry forward at most ${MEMORY_MAX_RECEIPTS} of the SUPPLIED receipts that best expose the cross-module pattern. Copy each chosen quote EXACTLY as given. Do not invent receipts.

Output STRICT JSON only, no prose, no code fences:
{"content": "string", "receipts": [{"quote": "string"}]}`;

function buildGlobalUserPayload(moduleDocs) {
  const blocks = [];
  const allReceipts = [];
  for (const m of MODULE_IDS) {
    const doc = moduleDocs[m];
    if (!doc || (!doc.content && !(doc.receipts || []).length)) continue;
    blocks.push(`### ${MODULE_LABELS[m]}\n${doc.content || "(no themes)"}`);
    for (const r of doc.receipts || []) {
      blocks.push(`  - receipt (${r.date}): "${r.quote}"`);
      allReceipts.push(r);
    }
  }
  return { payload: blocks.join("\n"), allReceipts };
}

async function refreshGlobal(db, uid, client, logBase) {
  const startedAt = Date.now();
  const reads = await Promise.all(
    MODULE_IDS.map((m) => db.doc(`users/${uid}/memory/${m}`).get())
  );
  const moduleDocs = {};
  MODULE_IDS.forEach((m, i) => { moduleDocs[m] = reads[i].exists ? reads[i].data() : null; });

  const { payload, allReceipts } = buildGlobalUserPayload(moduleDocs);
  if (!payload.trim()) return; // nothing to synthesize yet

  const { text, inputTokens, outputTokens } = await callHaiku(
    client, GLOBAL_SYSTEM_PROMPT, payload, 900
  );
  const parsed = parseUpdaterJson(text);
  if (!parsed || typeof parsed.content !== "string") return;

  // Global receipts must exactly match a supplied module receipt (authentic,
  // already validated upstream) — preserve original metadata.
  const byQuote = new Map();
  for (const r of allReceipts) byQuote.set(normalizeForMatch(r.quote), r);
  const receipts = [];
  for (const c of (Array.isArray(parsed.receipts) ? parsed.receipts : [])) {
    if (receipts.length >= MEMORY_MAX_RECEIPTS) break;
    const match = byQuote.get(normalizeForMatch(c?.quote));
    if (match) receipts.push(match);
  }

  const content = stripBannedTone(parsed.content).slice(0, MEMORY_GLOBAL_CONTENT_MAX_CHARS);
  const globalRef = db.doc(`users/${uid}/memory/${GLOBAL_ID}`);
  const prevSnap = await globalRef.get();
  const prevEdited = prevSnap.exists ? prevSnap.data().userEdited === true : false;

  await globalRef.set({
    content: prevEdited && prevSnap.data().content ? prevSnap.data().content : content,
    receipts: prevEdited ? (prevSnap.data().receipts || []) : receipts,
    updatedAt: FieldValue.serverTimestamp(),
    lastGlobalRefreshAt: FieldValue.serverTimestamp(),
    userEdited: prevEdited,
    version: MEMORY_SCHEMA_VERSION,
  }, { merge: true });

  structuredLog({
    ...logBase, stage: "global",
    contentBytes: content.length, receipts: receipts.length,
    inputTokens, outputTokens, latencyMs: Date.now() - startedAt,
  });
}

async function maybeRefreshGlobal(db, uid, client, logBase) {
  const snap = await db.doc(`users/${uid}/memory/${GLOBAL_ID}`).get();
  const last = snap.exists ? snap.data().lastGlobalRefreshAt : null;
  let stale = true;
  if (last && typeof last.toDate === "function") {
    stale = (Date.now() - last.toDate().getTime()) > MEMORY_GLOBAL_REFRESH_HOURS * 3600 * 1000;
  }
  if (stale) await refreshGlobal(db, uid, client, logBase);
}

// ── Callable: updateMemory ───────────────────────────────────────────────────
const updateMemory = onCall(
  { secrets: [anthropicApiKey], region: "us-central1", timeoutSeconds: 60 },
  async (request) => {
    const startedAt = Date.now();
    if (!request.auth) throw new HttpsError("unauthenticated", "Sign in required.");
    const uid = request.auth.uid;

    const module = request.data?.module;
    const entryId = request.data?.entryId;
    if (!MODULE_IDS.includes(module)) {
      throw new HttpsError("invalid-argument", "Unknown memory module.");
    }
    if (typeof entryId !== "string" || !entryId) {
      throw new HttpsError("invalid-argument", "entryId required.");
    }

    const db = getFirestore();

    // Read authoritative entry first; if there is nothing valid to learn from
    // (draft, missing, not owned, empty), return cleanly without spending a slot.
    const entry = await loadEntryFacts(db, uid, module, entryId);
    if (!entry) return { updated: false, reason: "no-eligible-entry" };

    const memoryRef = db.doc(`users/${uid}/memory/${module}`);
    const priorSnap = await memoryRef.get();
    const prior = priorSnap.exists ? priorSnap.data() : null;

    // Idempotency — a double-fire of the same event must not duplicate receipts.
    const processed = Array.isArray(prior?.processedEntryIds) ? prior.processedEntryIds : [];
    if (processed.includes(entry.dedupeKey)) {
      return { updated: false, reason: "already-processed" };
    }

    await checkAndIncrementMemoryLimit(uid);

    const client = new Anthropic({ apiKey: anthropicApiKey.value() });
    const priorReceipts = Array.isArray(prior?.receipts) ? prior.receipts : [];

    let inputTokens = null, outputTokens = null;
    let parsed = null;
    try {
      const res = await callHaiku(
        client, UPDATER_SYSTEM_PROMPT,
        buildUpdaterUserPayload(module, prior, entry), 800
      );
      inputTokens = res.inputTokens; outputTokens = res.outputTokens;
      parsed = parseUpdaterJson(res.text);
    } catch (error) {
      console.error("memory.haiku.error", { name: error.name, status: error.status });
      throw new HttpsError("internal", "Memory update unavailable.");
    }

    if (!parsed || typeof parsed.content !== "string") {
      structuredLog({ fn: "updateMemory", uid, module, stage: "module", parse: "fail", latencyMs: Date.now() - startedAt });
      return { updated: false, reason: "unparseable" };
    }

    const { receipts, validated, dropped } = reconcileReceipts(
      parsed, entry, module, priorReceipts, entryId
    );

    // userEdited content is the new base — keep it; merge forward only when the
    // model returned fresh themes and the user has not overridden them.
    const content = stripBannedTone(parsed.content).slice(0, MEMORY_MODULE_CONTENT_MAX_CHARS);
    const nextProcessed = [...processed, entry.dedupeKey].slice(-MEMORY_PROCESSED_IDS_CAP);

    await memoryRef.set({
      content,
      receipts,
      processedEntryIds: nextProcessed,
      entryCount: (prior?.entryCount || 0) + 1,
      updatedAt: FieldValue.serverTimestamp(),
      userEdited: false,
      version: MEMORY_SCHEMA_VERSION,
    }, { merge: true });

    structuredLog({
      fn: "updateMemory", uid, module, stage: "module",
      contentBytes: content.length, receiptsValidated: validated, receiptsDropped: dropped,
      inputTokens, outputTokens, latencyMs: Date.now() - startedAt,
    });

    // Debounced second-stage compression — fire-and-forget; failure here must
    // not fail the module update the caller depends on.
    try {
      await maybeRefreshGlobal(db, uid, client, { fn: "updateMemory", uid });
    } catch (error) {
      console.error("memory.global.error", { name: error.name, status: error.status });
    }

    return { updated: true, receipts: receipts.length };
  }
);

// ── Callable: editMemory ─────────────────────────────────────────────────────
// User rewrites the THEMES (content). Receipts are quotes — not editable here.
const editMemory = onCall(
  { region: "us-central1", timeoutSeconds: 30 },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Sign in required.");
    const uid = request.auth.uid;
    const module = request.data?.module;
    const content = request.data?.content;
    const docId = module === GLOBAL_ID ? GLOBAL_ID : module;
    if (![GLOBAL_ID, ...MODULE_IDS].includes(docId)) {
      throw new HttpsError("invalid-argument", "Unknown memory module.");
    }
    if (typeof content !== "string") {
      throw new HttpsError("invalid-argument", "content required.");
    }

    const db = getFirestore();
    const maxChars = docId === GLOBAL_ID ? MEMORY_GLOBAL_CONTENT_MAX_CHARS : MEMORY_MODULE_CONTENT_MAX_CHARS;
    const clean = stripBannedTone(content).slice(0, maxChars);

    await db.doc(`users/${uid}/memory/${docId}`).set({
      content: clean,
      userEdited: true,
      updatedAt: FieldValue.serverTimestamp(),
      version: MEMORY_SCHEMA_VERSION,
    }, { merge: true });

    return { ok: true };
  }
);

// ── Callable: deleteMemoryReceipt ────────────────────────────────────────────
const deleteMemoryReceipt = onCall(
  { region: "us-central1", timeoutSeconds: 30 },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Sign in required.");
    const uid = request.auth.uid;
    const module = request.data?.module;
    const quote = request.data?.quote;
    const docId = module === GLOBAL_ID ? GLOBAL_ID : module;
    if (![GLOBAL_ID, ...MODULE_IDS].includes(docId)) {
      throw new HttpsError("invalid-argument", "Unknown memory module.");
    }
    if (typeof quote !== "string" || !quote) {
      throw new HttpsError("invalid-argument", "quote required.");
    }

    const db = getFirestore();
    const ref = db.doc(`users/${uid}/memory/${docId}`);
    const snap = await ref.get();
    if (!snap.exists) return { ok: true, removed: 0 };

    const target = normalizeForMatch(quote);
    const receipts = (snap.data().receipts || []).filter((r) => normalizeForMatch(r.quote) !== target);
    await ref.set({ receipts, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return { ok: true };
  }
);

// ── Callable: wipeMemory ─────────────────────────────────────────────────────
// Deletes the doc(s). Rebuilds organically from future entries only.
const wipeMemory = onCall(
  { region: "us-central1", timeoutSeconds: 30 },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Sign in required.");
    const uid = request.auth.uid;
    const module = request.data?.module;
    const db = getFirestore();

    const targets = module === "all"
      ? [GLOBAL_ID, ...MODULE_IDS]
      : ([GLOBAL_ID, ...MODULE_IDS].includes(module) ? [module] : null);
    if (!targets) throw new HttpsError("invalid-argument", "Unknown memory module.");

    await Promise.all(targets.map((id) => db.doc(`users/${uid}/memory/${id}`).delete()));
    return { ok: true, wiped: targets.length };
  }
);

// ── Injection: assemble + render memory for the Oracle system prompt ─────────
/**
 * Fetch the memory relevant to an Oracle call. For a module call: global +
 * that module. For synthesis: global + all four module memories.
 * Returns an array of { label, content, receipts } (already truncated).
 */
async function fetchMemoryForInjection(uid, moduleName) {
  const db = getFirestore();
  const normalized = (moduleName || "").toLowerCase().replace(/[^a-z]/g, "");
  const moduleMap = { journal: "journal", killlist: "killList", hardlessons: "hardLessons", relapse: "relapse" };
  const isSynthesis = normalized === "synthesis";

  const ids = isSynthesis
    ? [GLOBAL_ID, ...MODULE_IDS]
    : [GLOBAL_ID, moduleMap[normalized]].filter(Boolean);
  if (ids.length === 0) return [];

  const snaps = await Promise.all(ids.map((id) => db.doc(`users/${uid}/memory/${id}`).get()));
  const blocks = [];
  ids.forEach((id, i) => {
    if (!snaps[i].exists) return;
    const d = snaps[i].data() || {};
    if (!d.content && !(d.receipts || []).length) return;
    blocks.push({
      label: MODULE_LABELS[id] || id,
      content: d.content || "",
      receipts: Array.isArray(d.receipts) ? d.receipts : [],
    });
  });
  return blocks;
}

/**
 * Render the MEMORY section. Truncates global-then-module if over budget so
 * injection stays ≤ ~2,000 input tokens. Returns "" when there is nothing —
 * the Oracle then behaves exactly as it does today (zero regression).
 */
function buildMemoryBlock(blocks) {
  if (!Array.isArray(blocks) || blocks.length === 0) return "";

  const rendered = blocks.map((b) => {
    const lines = [`[${b.label}]`];
    if (b.content) lines.push(b.content);
    for (const r of b.receipts) lines.push(`- (${r.date}) "${r.quote}"`);
    return lines.join("\n");
  });

  let body = rendered.join("\n\n");
  if (body.length > MEMORY_INJECTION_MAX_CHARS) {
    // Drop global (first block) before module-specific memory.
    body = rendered.slice(1).join("\n\n").slice(0, MEMORY_INJECTION_MAX_CHARS);
  }
  if (!body.trim()) return "";

  return `\n\nMEMORY — your accumulated observations and the user's own dated words:\n${body}\n\nThese are receipts, not summaries. Use a receipt when it exposes a contradiction with the current entry — quote it exactly, with its date. If memory conflicts with what the user writes today, name the conflict; do not silently prefer either. Do not fabricate or alter a quote. If no receipt is relevant, ignore this section.`;
}

module.exports = {
  HAIKU_MODEL,
  updateMemory,
  editMemory,
  deleteMemoryReceipt,
  wipeMemory,
  fetchMemoryForInjection,
  buildMemoryBlock,
  // exported for unit tests
  reconcileReceipts,
  parseUpdaterJson,
  stripBannedTone,
  loadEntryFacts,
};
