const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { initializeApp, getApps } = require("firebase-admin/app");
const AnthropicSDK = require("@anthropic-ai/sdk");
const Anthropic = AnthropicSDK.default ?? AnthropicSDK;

const anthropicApiKey = defineSecret("ANTHROPIC_API_KEY");

const {
  TRUST_THRESHOLD,
  MAX_ENTRY_TEXT_CHARS,
  MAX_USER_RESPONSE_CHARS,
  MAX_REACTANCE_SUMMARY_CHARS,
  MAX_REACTANCE_QUESTION_CHARS,
  RECENT_ENTRY_EXCERPT_MAX_CHARS,
} = require("./config");

const { checkAndIncrementOracleLimit } = require("./rateLimit");
const memory = require("./memory");
const usage = require("./usage");

// Initialize the admin app at module load. The prior lazy guard checked
// `getApps().length === 0`, but the v2 Cloud Functions runtime can register
// non-default apps before our code runs, so that condition would skip
// initializeApp() and leave the [DEFAULT] app missing — which then crashed
// getFirestore() with `app/no-app`. Check for the default app specifically
// and initialize it idempotently.
if (!getApps().some((a) => a.name === '[DEFAULT]')) {
  initializeApp();
}

/**
 * Server-side prompt context registry.
 *
 * Finding 3 remediation: the client may NOT supply raw system-prompt text.
 * It supplies a `promptContextKey` that maps to a pre-approved template here.
 * Any user-provided parameters are length-clamped and interpolated as data,
 * never as instructions.
 */
const PROMPT_CONTEXT_REGISTRY = {
  // BER-200 reactance instruction. Takes user's pre-committed question + the
  // data summary that triggered the criterion. Both fields are clamped.
  reactance: (params) => {
    const ds = typeof params?.dataSummary === "string"
      ? params.dataSummary.slice(0, MAX_REACTANCE_SUMMARY_CHARS)
      : "";
    const q = typeof params?.question === "string"
      ? params.question.slice(0, MAX_REACTANCE_QUESTION_CHARS)
      : "";
    if (!ds || !q) return "";
    return `CONFRONTATION TRIGGER ACTIVE: The user pre-committed to this confrontation when the following condition was met: ${ds}. Their own question for this moment: "${q}". Your response MUST: (1) state the data pattern plainly ("You have logged [dataSummary]"), (2) put their own question to them verbatim — do not paraphrase it, (3) continue with your confrontational analysis. The question comes from the user in a clear-headed state. Do not soften it.`;
  },

  // Synthesis confrontation question — fixed server-side template.
  synthesis_confrontation: () => `You generate one confrontation question. Rules:\n- One question only. No preamble, no context, no explanation.\n- Derived directly from the data provided. No invented patterns.\n- Not answerable with yes/no. Requires honest reflection.\n- No advisory language, no suggestions, no affirmations, no motivational framing.\n- Uncomfortable, specific, unflinching.`,

  // The Reckoning — lay stated commitments against documented contradictions.
  // The entry is a rules-assembled ledger: each commitment, then the real
  // events (with dates and the user's own verbatim words) that contradict it.
  reckoning_confrontation: (params) => {
    const n = Number(params?.contradictionCount);
    const note = Number.isFinite(n) && n > 0 ? ` ${Math.floor(n)} contradiction(s) are documented below.` : "";
    return `THE RECKONING.${note} The entry lists the user's stated commitments (Kill List targets he vowed to eliminate, rules he finalized) and, under each, the real logged events — with dates and his own words — that contradict them. Your job: hold his word against his act and name the gap. Rules: (1) Confront ONLY with the commitments and events provided. Invent no events, dates, numbers, or quotes; cite nothing not in the entry. (2) Name each contradiction plainly — the commitment, then what he actually did and when. (3) This is a confrontation in prose, NOT a metrics report — no scores, no bullet dashboards, no tallies. (4) No encouragement, no reassurance, no affirmation, no "but." (5) Close on the single decision he keeps making that lets word and act diverge. Stark, precise, unflinching.`;
  },

  // BER-136 Oracle regen — same data, different angle. Data depth is a
  // numeric parameter; no free-form text is accepted.
  oracle_regen: (params) => {
    const n = Number(params?.entryCount);
    const dataDepthNote = Number.isFinite(n) && n > 0
      ? ` The user has ${Math.floor(n)} total behavioral entries logged — calibrate confrontation depth accordingly.`
      : '';
    return `The user has already seen one perspective on this data. Approach the same data from a different confrontational angle. Do not repeat the same observation. Do not soften your assessment. Identify a different pattern, contradiction, or uncomfortable truth than the one already surfaced.${dataDepthNote}`;
  },

  // Predictive Relapse Radar — forward-looking confrontation fired when known
  // antecedents of past rule breaks (Hard Lesson violations, the record of a
  // slip that landed) are active in the current window. The specific
  // antecedents + lead times ride in the (computed) entryText; this template
  // sets the posture. Only `activeCount` is accepted, coerced to a number.
  relapse_forecast: (params) => {
    const n = Number(params?.activeCount);
    const note = Number.isFinite(n) && n > 0
      ? ` ${Math.floor(n)} known antecedent(s) of his past rule breaks are active in the current window.`
      : "";
    return `FORWARD-LOOKING CONFRONTATION — this is a PRE-failure signal. No rule has broken yet.${note} The entry lists behavioral antecedents that have historically preceded his rule breaks and are active right now. Your job: name the convergence plainly and put the decision in front of him before it happens. Rules: (1) State the pattern as history, not destiny — "X has preceded your rule breaks; it is active now," never "you will break it." (2) No alarmism, no catastrophizing, no urgency theater. (3) No encouragement, no reassurance, no affirmation. (4) Be precise about the named antecedent and its typical lead time as given; do not invent antecedents or numbers not in the entry. (5) One confrontation, not a list of tips. End with the single question he needs to sit with now.`;
  },

  // LEGACY single-turn follow-up, superseded by the fixed arc below
  // (oracle_pushback → oracle_close). Kept byte-identical because a tab still
  // running the pre-arc bundle sends this key until it reloads. Delete once
  // functions/scripts/readFollowUpArc.js shows no calls for 7 days.
  oracle_challenge: (params) => {
    const pushback = typeof params?.pushback === "string"
      ? params.pushback.slice(0, MAX_USER_RESPONSE_CHARS)
      : "";
    if (!pushback) return "";
    return `SECOND TURN — HIS PUSHBACK. The entry text has three labeled parts: ORIGINAL ENTRY, YOUR PRIOR READING, and HIS PUSHBACK. His pushback, verbatim: "${pushback}". This is not a new reading. Do not re-read the entry from scratch, do not restate your prior reading, and do not choose a new posture — the posture steps above do not apply to this turn. If YOUR PRIOR READING says "(none recorded)", answer his pushback against the entry alone and take no position you did not state.

Engage his specific pushback first. Then decide on the record alone — the entry, your prior reading, and any receipts provided above:
- If the record supports your position, hold it. Name the receipt it rests on: his own words, the logged fact.
- If his pushback is correct and the record supports him, concede plainly: one sentence naming exactly what you got wrong, then continue from the corrected read. A concession is a correction, not an apology and not praise.
- Rhetoric alone earns nothing. A reframe, a question turned back on you, or a philosophical move is not a receipt. Concede only to the record.
Never affirm for its own sake. Never invent a pattern, event, date, or quote that is not in the text above.

Voice rules above still hold: direct address, no motivational, wellness, or therapeutic language, no hedging. Make the core point once. Keep the prose to 80–140 words — noticeably shorter than your prior reading. This replaces the length rule above.

CLOSE WITH ONE COMMITMENT, NOT A QUESTION. This replaces the CLOSING MOVE above for this turn. Do not end on a question, never use <closing_question> tags, and put no question mark in the final line. Your final line is one commitment derived from the pattern named in this exchange — or from the corrected read, if you conceded — in exactly this shape, wrapped in <commitment> tags (these tags are required here; they are the only tags in your reply, and the "use no tags" rule above does not apply to them):
<commitment pattern="[the pattern, as a short Kill List target name, 60 characters or fewer]">Commitment: When [specific trigger or time], I will [specific observable action]. Checked by [how the record will show it].</commitment>
One commitment only. Concrete, observable, short: the trigger clause and the action clause are each 50 characters or fewer. Nothing follows the closing tag.`;
  },

  // Follow-up arc, turn 1. The entry text carries the exchange as labeled
  // sections (src/utils/buildFollowUpEntryText.js); this fragment, last in
  // the system prompt, overrides posture, length and the closing move for the
  // turn. Holds or concedes on the record, one insight, closes on ONE tagged
  // question — never a commitment. No params: his words ride the user message.
  oracle_pushback: () => `SECOND TURN — HIS PUSHBACK. The entry text has three labeled parts: ORIGINAL ENTRY, YOUR PRIOR READING, and HIS PUSHBACK. This is not a new reading. Do not re-read the entry from scratch, do not restate your prior reading, and do not choose a new posture — the posture steps and the variation rule above do not apply to this turn. If YOUR PRIOR READING says "(none recorded)", answer his pushback against the entry alone and take no position you did not state.

Engage HIS PUSHBACK first. Then decide on the record alone — the entry, your prior reading, and any receipts provided above:
- If the record supports your position, hold it. Name the receipt it rests on: his own words, the logged fact.
- If his pushback is correct and the record supports him, concede plainly: one sentence naming exactly what you got wrong, then continue from the corrected read. A concession is a correction, not an apology and not praise.
- Rhetoric alone earns nothing. A reframe, a question turned back on you, or a philosophical move is not a receipt. Concede only to the record.
- If he does not dispute your reading — he answers the question it closed on, or adds facts — take it as his response: correct your read only where a fact he adds contradicts it, and continue.
Never affirm for its own sake. Never invent a pattern, event, date, or quote that is not in the text above.

Then give ONE insight this exchange has earned: something true about the pattern that neither your reading nor his pushback has said. Not a summary, not advice, not a plan.

Voice rules above still hold: direct address, no motivational, wellness, or therapeutic language, no hedging. Make each point once. Keep the reply to 80–140 words, the question included: at most two short paragraphs and six sentences. This replaces the 150–220 word rule above — the shorter limit governs.

CLOSE WITH ONE QUESTION. This replaces the CLOSING MOVE above for this turn: whatever the posture, the reply ends on exactly one question, and it is the only question mark in the reply — no rhetorical questions in the body. He answers it next, and the exchange then closes on a commitment built from his answer — so ask for what that commitment needs and only he can supply: the specific moment, condition, or decision where this pattern runs. Not yes-or-no, not leading, not abstract; answerable in a few sentences, and not answerable without taking a position on what he actually does. Wrap it in <closing_question> tags, as the tag rule above requires. Do not propose a commitment, a plan, or a next step in this turn. Nothing follows the closing tag.`,

  // Follow-up arc, turn 2 — the last. Opens on a VERDICT line (parsed like
  // DEPTH), judges answered vs evaded, one concession per exchange, closes on
  // ONE tagged commitment and asks nothing. No params.
  oracle_close: () => `THIRD TURN — HIS ANSWER. The entry text has five labeled parts: ORIGINAL ENTRY, YOUR PRIOR READING, HIS PUSHBACK or HIS DIRECTION (the label says which: a challenge to your reading, or a request to go further), YOUR REPLY, and HIS ANSWER. YOUR REPLY closed on a question; HIS ANSWER is what he wrote back. This is the last turn of the exchange. Do not re-read the entry, do not restate your reading or your reply, and do not choose a new posture — the posture steps and the variation rule above do not apply. If YOUR PRIOR READING says "(none recorded)", your position is only what YOUR REPLY stated.

Judge the answer first, against the question it was given:
- He answered if he named something specific: a moment, a condition, a decision, a cost. Say what his answer shows that the record did not, and build on it.
- He evaded if he answered a different question, generalized, moved to philosophy, turned a question back on you, agreed without content ("you're right", "I know", "I'll do better"), or said he does not know. Name the evasion in one sentence, quoting his words, and state what a real answer would have had to contain. Do not ask again.
Answering is not progress. Do not thank him, praise the answer, or call it honest, brave, or a breakthrough.

Begin your reply with exactly one line stating that judgment — VERDICT:answered or VERDICT:evaded — then a blank line, then the prose. That line is read by the system and never shown to him.

Your position stays on the record. His agreement is not evidence and neither is his insistence. One concession per exchange: if YOUR REPLY conceded a point, concede nothing further. Otherwise, correct your read only when his answer shows that YOUR REPLY misstated a fact — a fact in the entry, or a concrete event he now states that directly contradicts a claim you made. An explanation is not a contradiction. Name any correction in one sentence and continue from it. Never invent a pattern, event, date, or quote that is not in the text above.

Voice rules above still hold: direct address, no motivational, wellness, or therapeutic language, no hedging. Keep the prose to 60–110 words, not counting the verdict line or the commitment line: one paragraph, at most five sentences. This replaces the 150–220 word rule above — the shorter limit governs.

CLOSE WITH ONE COMMITMENT. This replaces the CLOSING MOVE above for this turn. Ask nothing: no question mark anywhere in this reply — if you quote him, quote statements, not questions — and never use <closing_question> tags. Your final line is one commitment — built from his answer if he answered; if he evaded, built from the record and aimed at the moment he would not name — in exactly this shape, wrapped in <commitment> tags (these tags are required here; they are the only tags in your reply, and the "use no tags" rule above does not apply to them):
<commitment pattern="[the pattern, as a short Kill List target name, 60 characters or fewer]">Commitment: When [specific trigger or time], I will [specific observable action]. Checked by [how the record will show it].</commitment>
One commitment only. Concrete, observable, short: the trigger clause and the action clause are each 50 characters or fewer — the trigger at most eight words, the action at most seven words, one verb and its object with nothing after it, no "and", no "then", no "before", no second step. Where his answer named the trigger, use his words. Nothing follows the closing tag.`,

  // "Go further", turn 1. Same three-section entry text as oracle_pushback with
  // his section labeled HIS DIRECTION: he is not disputing the reading, so
  // there is nothing to hold or concede. Deepens the reading from where his
  // words point and closes on ONE tagged question, so oracle_close runs the
  // second turn unchanged. No params.
  oracle_further: () => `SECOND TURN — HE ASKS YOU TO GO FURTHER. The entry text has three labeled parts: ORIGINAL ENTRY, YOUR PRIOR READING, and HIS DIRECTION. He read your reading and chose to go further, not to dispute it: HIS DIRECTION is where he points — the thread he wants taken deeper, a detail he adds, or a line of your reading he wants opened. This is not a new reading. Do not re-read the entry from scratch, do not restate your prior reading, and do not choose a new posture — the posture steps and the variation rule above do not apply to this turn. If YOUR PRIOR READING says "(none recorded)", read the entry from where his direction points and take no position you did not state.

You are not defending a position. Do not hold, do not concede, do not weigh his words against your reading. Take the thread HIS DIRECTION names and go one level under it, on the record alone — the entry, your prior reading, and any receipts provided above: the mechanism that runs it, what it costs him, what it protects, or the older pattern it is one instance of. If he adds a fact, use it. If HIS DIRECTION points at nothing specific, take the one line of your reading his words come closest to and open that. Never invent a pattern, event, date, or quote that is not in the text above.

Then give ONE insight this turn has earned: something true about the pattern that your reading did not say. Not a summary, not advice, not a plan, not reassurance.

Voice rules above still hold: direct address, no motivational, wellness, or therapeutic language, no hedging. Make each point once. Keep the reply to 80–140 words, the question included: at most two short paragraphs and six sentences. This replaces the 150–220 word rule above — the shorter limit governs.

CLOSE WITH ONE QUESTION. This replaces the CLOSING MOVE above for this turn: whatever the posture, the reply ends on exactly one question, and it is the only question mark in the reply — no rhetorical questions in the body. He answers it next, and the exchange then closes on a commitment built from his answer — so ask for what that commitment needs and only he can supply: the specific moment, condition, or decision where this pattern runs. Not yes-or-no, not leading, not abstract; answerable in a few sentences, and not answerable without taking a position on what he actually does. Wrap it in <closing_question> tags, as the tag rule above requires. Do not propose a commitment, a plan, or a next step in this turn. Nothing follows the closing tag.`,

  // "It landed" — one turn, the last. Two-section entry text (ORIGINAL ENTRY,
  // YOUR PRIOR READING; src/utils/buildFollowUpEntryText.js
  // buildLandedEntryText). A receipt of what he accepted, in his own words,
  // closing on ONE tagged commitment. No VERDICT line, no question. Not
  // praise: accepting a reading earns nothing. No params.
  oracle_landed: () => `SECOND TURN — IT LANDED. The entry text has two labeled parts: ORIGINAL ENTRY and YOUR PRIOR READING. He read your reading and chose "It landed": he accepts it. He wrote nothing back. This is the only turn and the last. It is not a new reading, not a verdict on him, and not praise. Do not re-read the entry from scratch, do not restate your prior reading, and do not choose a new posture — the posture steps and the variation rule above do not apply to this turn. If YOUR PRIOR READING says "(none recorded)", state what the entry itself puts on the record, and take no position you did not state.

Write the receipt. Name precisely what he has accepted, in his own words: quote, verbatim and in quotation marks, the words in ORIGINAL ENTRY that your reading rested on — the moment, the choice, the line he wrote. Quote his entry, never YOUR PRIOR READING: the receipt is his words, not yours. Then state in one or two sentences what accepting them puts on the record about what he does. A receipt is a statement of fact, not an evaluation. Accepting a reading is not progress and earns nothing: do not thank him, do not call the acceptance honest, brave, mature, a step, or a breakthrough, and do not say it is good that it landed. Do not add a new observation, do not interpret further, do not advise. Never invent a pattern, event, date, or quote that is not in the text above.

Voice rules above still hold: direct address, no motivational, wellness, or therapeutic language, no hedging. Keep the prose to 40–80 words, not counting the commitment line. This replaces the length rule above.

CLOSE WITH ONE COMMITMENT. This replaces the CLOSING MOVE above for this turn. Ask nothing: no question mark anywhere in this reply — if you quote him, quote statements, not questions — and never use <closing_question> tags. Do not begin with a VERDICT line or any label; begin with the prose. Your final line is one commitment built from what he accepted, aimed at the moment in the entry where the pattern runs, in exactly this shape, wrapped in <commitment> tags (these tags are required here; they are the only tags in your reply, and the "use no tags" rule above does not apply to them):
<commitment pattern="[the pattern, as a short Kill List target name, 60 characters or fewer]">Commitment: When [specific trigger or time], I will [specific observable action]. Checked by [how the record will show it].</commitment>
One commitment only. Concrete, observable, short: the trigger clause and the action clause are each 50 characters or fewer — the trigger at most eight words, the action at most seven words, one verb and its object with nothing after it, no "and", no "then", no "before", no second step. Where the entry named the trigger, use his words. Nothing follows the closing tag.`,
};

function resolvePromptContext(key, params) {
  if (!key) return "";
  const builder = PROMPT_CONTEXT_REGISTRY[key];
  if (typeof builder !== "function") {
    throw new HttpsError("invalid-argument", `Unknown promptContextKey: ${key}`);
  }
  return builder(params || {});
}

/**
 * Structured logging helper — emits a single JSON-parseable log line so
 * Cloud Logging metric filters can aggregate cost/latency without
 * reconstructing ad-hoc fields.
 */
function logOracleCall(fields) {
  console.log("oracle.call", JSON.stringify(fields));
}

/**
 * Oracle — secure Claude API proxy.
 *
 * Called from the client via Firebase callable function.
 * Expects: { entryText, moduleName, userContext, tone, behavioralContext,
 *           entryCount, promptContextKey, promptContextParams, evasion }
 * Returns: { feedback, metacognitiveDepth, closingQuestion, commitment, verdict }
 *   commitment is non-null only on follow-up turns that closed on a tagged
 *   commitment line (oracle_close, oracle_landed; legacy oracle_challenge):
 *   { text, pattern, trigger, action, check }. verdict ('answered' | 'evaded')
 *   is set only on oracle_close turns, from the VERDICT line the model opens
 *   with.
 */
exports.oracle = onCall(
  { secrets: [anthropicApiKey], region: "us-central1", timeoutSeconds: 30 },
  async (request) => {
    const startedAt = Date.now();

    // Auth check — must be a signed-in user
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "You must be signed in to use the Oracle.");
    }

    const uid = request.auth.uid;

    // Reject any client-supplied raw system prompt. Upstream callers MUST use
    // promptContextKey + promptContextParams for any per-call prompt variation.
    if (request.data?.customSystemPrompt != null) {
      throw new HttpsError(
        "invalid-argument",
        "customSystemPrompt is not accepted. Use promptContextKey."
      );
    }

    // Per-user daily Oracle cap. Increments
    // before payload validation so abusive clients can't farm slot-free
    // 400-class errors, and before the Anthropic call so failed calls still
    // consume a slot (counts attempts, not successes). Throws HttpsError
    // 'resource-exhausted' on cap-hit; the outer try below re-throws cleanly.
    await checkAndIncrementOracleLimit(uid);

    const normalizedModuleForLimit = ((request.data?.moduleName) || '').toLowerCase().replace(/[^a-z]/g, '');

    const {
      entryText,
      moduleName,
      userContext,
      tone,
      behavioralContext,
      entryCount,
      promptContextKey,
      promptContextParams,
      evasion,
    } = request.data;

    if (!entryText || typeof entryText !== "string" || entryText.trim().length < 10) {
      throw new HttpsError("invalid-argument", "Entry text must be at least 10 characters.");
    }
    if (entryText.length > MAX_ENTRY_TEXT_CHARS) {
      throw new HttpsError("invalid-argument", "Entry text exceeds maximum length.");
    }

    // Dynamic response length: scaled feedback modules get a per-entry token
    // budget and a matching LENGTH TARGET directive; everything else keeps 600.
    const entryWords = countEntryWords(entryText);
    const lengthTier = lengthTierFor(normalizedModuleForLimit, entryWords);

    const client = new Anthropic({ apiKey: anthropicApiKey.value() });

    // Long-term memory: fetched SERVER-SIDE by verified uid (admin SDK) so the
    // receipts injected are the real, validated ones — never client-supplied.
    // Failure degrades to no-memory (identical to today); it never blocks feedback.
    let memoryBlocks = [];
    try {
      memoryBlocks = await memory.fetchMemoryForInjection(
        uid,
        memory.resolveMemoryScope(moduleName, request.data?.memoryModule)
      );
    } catch (error) {
      console.error("oracle.memory.fetch.error", { name: error.name });
    }

    // Split into a STABLE cacheable prefix + DYNAMIC per-user/per-session suffix.
    const blocks = buildSystemPromptBlocks(moduleName, tone, behavioralContext, entryCount, memoryBlocks, evasion, entryWords);
    const promptContextFragment = resolvePromptContext(promptContextKey, promptContextParams);
    // The registry fragment is per-call-type (and may carry clamped user text),
    // so it joins the dynamic suffix — never the cached prefix.
    const dynamicSuffix = `${blocks.dynamic}${promptContextFragment ? `\n\n${promptContextFragment}` : ""}`;
    // When cacheable, send `system` as content blocks with a cache_control
    // breakpoint at the END of the stable prefix; the dynamic suffix is a second,
    // uncached block. Otherwise send the byte-identical plain string. Either way,
    // stable + dynamicSuffix reproduces the exact prior system prompt verbatim.
    const systemPrompt = blocks.cacheable
      ? [
          { type: "text", text: blocks.stable, cache_control: { type: "ephemeral" } },
          ...(dynamicSuffix ? [{ type: "text", text: dynamicSuffix }] : []),
        ]
      : `${blocks.stable}${dynamicSuffix}`;
    const userPrompt = buildUserPrompt(entryText, userContext, promptContextKey);

    try {
      // NO-TRAINING POSTURE: Anthropic does not train its models on inputs or
      // outputs sent through the commercial Claude API by default — entry text
      // and behavioral context sent here are not used for model training.
      // VERIFY at the org level in the Anthropic Console (Settings → Privacy):
      // confirm no opt-in to model training / data-sharing is enabled. (Zero
      // data retention is a separate enterprise setting, not assumed here.)
      const message = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: lengthTier ? lengthTier.maxTokens : DEFAULT_MAX_TOKENS,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      });

      const rawText = message.content[0]?.text || "";
      const parsed = parseOracleResponse(rawText);

      logOracleCall({
        fn: "oracle",
        uid,
        module: normalizedModuleForLimit || "unknown",
        tone: tone || null,
        promptContextKey: promptContextKey || null,
        inputTokens: message.usage?.input_tokens ?? null,
        outputTokens: message.usage?.output_tokens ?? null,
        latencyMs: Date.now() - startedAt,
        posture: parsed.metacognitiveDepth || null,
        // Dynamic-length observability: which band fired, and whether the
        // response finished cleanly (a max_tokens stop means truncation).
        lengthBand: lengthTier ? lengthTier.band : null,
        stopReason: message.stop_reason ?? null,
        // Follow-up arc format checks — tag counts and the verdict, never text.
        ...describeResponseShape(rawText, parsed),
      });

      // Fire-and-forget cost telemetry — adds no latency, fails silently.
      usage.logUsage({
        uid,
        model: "claude-sonnet-4-6",
        callType: promptContextKey || normalizedModuleForLimit || "oracle",
        usage: message.usage,
      });

      return parsed;
    } catch (error) {
      // Re-surface known HttpsError instances (e.g. from rate limiter).
      if (error instanceof HttpsError) throw error;
      // Never log raw error.message — Anthropic SDK errors can echo failing
      // request bodies. Log shape only: name + status.
      console.error("Claude API error:", { name: error.name, status: error.status });
      logOracleCall({
        fn: "oracle",
        uid,
        module: normalizedModuleForLimit || "unknown",
        error: error.name,
        errorStatus: error.status ?? null,
        latencyMs: Date.now() - startedAt,
      });
      throw new HttpsError("internal", "The Oracle is unavailable. Try again shortly.");
    }
  }
);

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

// Fields below (kill-target titles, hard-lesson rule text, identity direction)
// are authored by the user. Wrap them in guillemets and strip newlines so they
// read as DATA, not instructions, and cap their length + count so a user can't
// inflate or hijack the system prompt with their own stored content.
const MAX_CTX_FIELD_CHARS = 200;
const MAX_CTX_ITEMS = 12;
function ctxField(value, maxChars = MAX_CTX_FIELD_CHARS) {
  const s = String(value ?? "").replace(/\s+/g, " ").trim().slice(0, maxChars);
  return `«${s}»`;
}

// Temporal-correlation rendering. The correlation field is COMPUTED (not user-
// authored), so it bypasses ctxField's per-field char clamp — but it is built
// ONLY from server-side labels + coerced numbers, never echoed client strings,
// so there is no prompt-injection surface. Unknown event-type keys are dropped.
const CORRELATION_EVENT_LABELS = {
  "relapse:signal": "a relapse precursor signal",
  "hardlesson:violation": "breaking a hard-earned rule",
  "killlist:escape": "a Kill List escape",
  "killlist:checkin_broke": "a failed Kill List check-in",
  "killlist:checkin_held": "a held Kill List check-in",
  "killlist:killed": "killing a Kill List target",
  "killlist:created": "naming a new Kill List target",
  "journal:entry": "a journal entry",
};
const MAX_CORRELATIONS_RENDERED = 3;

function renderTemporalCorrelations(temporalCorrelations) {
  if (!temporalCorrelations || typeof temporalCorrelations !== "object") return "";
  // Anything other than an explicit 'ok' with items injects NOTHING — the
  // Oracle must not imply a pattern exists below the trust gate.
  if (temporalCorrelations.status !== "ok") return "";
  const items = Array.isArray(temporalCorrelations.items) ? temporalCorrelations.items : [];
  if (items.length === 0) return "";

  const lines = [...items]
    .sort((a, b) => (Number(b.confidence) || 0) - (Number(a.confidence) || 0))
    .slice(0, MAX_CORRELATIONS_RENDERED)
    .map((c) => {
      const a = CORRELATION_EVENT_LABELS[c.antecedent];
      const b = CORRELATION_EVENT_LABELS[c.consequent];
      if (!a || !b) return null; // drop unrecognized event types
      const support = Math.max(0, Math.floor(Number(c.support) || 0));
      // Kill-list-derived correlations are daily; never report hour precision
      // for them. Trust the engine's resolution but coerce the unit to match.
      const daily = c.resolution !== "sub-day";
      const unit = daily ? "days" : "hours";
      const lag = Math.max(0, Math.round(Number(c.lagMedian) || 0));
      return `${a} tends to precede ${b} by ~${lag} ${unit} (seen ${support}x).`;
    })
    .filter(Boolean);

  if (lines.length === 0) return "";
  return (
    `Temporal patterns from his own logs (approximate, computed — not invented):\n` +
    lines.map((l) => `- ${l}`).join("\n") +
    `\nWhere relevant, confront him with the sequence directly — name the antecedent as an early warning of what follows. The ~ is approximate; do not overstate it, and do not invent sequences beyond those listed.`
  );
}

// How he responds to readings (src/utils/followUpArc.js
// summarizeReadingResponses): counts only, coerced and capped, never text. A
// COMPUTED field like the correlations, so no ctxField clamp applies. Renders
// nothing when every intent count is zero.
const MAX_RESPONSE_COUNT = 999;
const responseCount = (v) => Math.min(MAX_RESPONSE_COUNT, Math.max(0, Math.floor(Number(v) || 0)));
function renderReadingResponses(responses) {
  if (!responses || typeof responses !== "object" || Array.isArray(responses)) return "";
  const pushBack = responseCount(responses.pushBack);
  const goFurther = responseCount(responses.goFurther);
  const landed = responseCount(responses.landed);
  const sit = responseCount(responses.sit);
  if (pushBack + goFurther + landed + sit === 0) return "";
  const parts = [];
  if (pushBack) parts.push(`pushed back ${pushBack}`);
  if (goFurther) parts.push(`went further ${goFurther}`);
  if (landed) {
    const contracted = Math.min(responseCount(responses.landedContracted), landed);
    parts.push(`accepted ${landed}${contracted ? ` (${contracted} became a Kill Contract)` : ""}`);
  }
  if (sit) {
    const again = Math.min(responseCount(responses.sitsDeferredAgain), sit);
    parts.push(`sitting with ${sit}${again ? ` (${again} set aside more than once)` : ""}`);
  }
  const resolved = responseCount(responses.sitsReturnedResolved);
  if (resolved) parts.push(`${resolved} set-aside reading${resolved === 1 ? "" : "s"} came back and he responded`);
  return (
    `Reading responses (last ${responseCount(responses.windowDays) || 30}d): ${parts.join(", ")}. ` +
    `An accepted reading that did not become a contract is a gap between word and act; name it when the entry touches the same ground. ` +
    `A reading set aside is a deferral on the record, not an evasion — do not treat it as one.`
  );
}

function buildBehavioralContextBlock(behavioralContext, entryCount) {
  if (!behavioralContext || typeof behavioralContext !== "object") return "";
  // Below the trust threshold there is not enough record to assert a "dominant"
  // anything. Gate the two pattern-FRAMED lines (relapse archetype, journal
  // language) the same way the temporal-correlation block is gated, so thin
  // data can't yield a confident-sounding pattern claim that the trust-
  // calibration block downstream then has to contradict. A raw relapse COUNT is
  // a fact, not a pattern, so it stays. undefined entryCount → treat as
  // high-data (the live caller always passes a number; this guard only matters
  // for direct callers/tests).
  const isHighData = entryCount == null || entryCount >= TRUST_THRESHOLD;
  const parts = [];
  if (isHighData && behavioralContext.dominantRelapseArchetype) {
    parts.push(`Dominant relapse archetype (last 14d): ${ctxField(behavioralContext.dominantRelapseArchetype)}.`);
  }
  if (behavioralContext.recentRelapseCount > 0) {
    parts.push(`Signal entries in last 14 days: ${Number(behavioralContext.recentRelapseCount) || 0}.`);
  }
  // Protocol runs: urges he interrupted with the grounding tools instead of
  // acting on. A count is a fact, not a pattern, so it is not trust-gated.
  if (Number(behavioralContext.protocolRuns14d) > 0) {
    const runs = Number(behavioralContext.protocolRuns14d);
    const last = Number(behavioralContext.lastProtocolIntensity);
    const lastLine = last >= 1 && last <= 10 ? ` Last urge intensity: ${last}/10.` : "";
    parts.push(`Protocol runs in last 14 days (urges he interrupted with the grounding tools rather than acted on): ${runs}.${lastLine}`);
  }
  if (Array.isArray(behavioralContext.activeKillTargets) && behavioralContext.activeKillTargets.length > 0) {
    const targets = behavioralContext.activeKillTargets
      .slice(0, MAX_CTX_ITEMS)
      .map((t) => `${ctxField(t.title)} (streak: ${Number(t.streak) || 0}, escapes: ${Number(t.escapeCount) || 0})`)
      .join("; ");
    parts.push(`Active Kill List targets: ${targets}.`);
  }
  if (Array.isArray(behavioralContext.violatedHardLessons) && behavioralContext.violatedHardLessons.length > 0) {
    const rules = behavioralContext.violatedHardLessons.slice(0, MAX_CTX_ITEMS).map((l) => ctxField(l.rule)).join(", ");
    parts.push(`Hard Lessons rules being violated: ${rules}. Call these out by name if relevant.`);
  }
  if (isHighData && behavioralContext.journalLanguagePattern) {
    parts.push(`Dominant journal language pattern (last 7d): ${ctxField(behavioralContext.journalLanguagePattern)}.`);
  }
  if (behavioralContext.identityDirection) {
    parts.push(`User's stated identity direction: ${ctxField(behavioralContext.identityDirection)}. If the user's current behavior contradicts this stated direction, name the contradiction explicitly. Do not soften it.`);
  }
  const correlationBlock = renderTemporalCorrelations(behavioralContext.temporalCorrelations);
  if (correlationBlock) {
    parts.push(correlationBlock);
  }
  const responsesLine = renderReadingResponses(behavioralContext.readingResponses);
  if (responsesLine) {
    parts.push(responsesLine);
  }
  if (parts.length === 0) return "";
  return `\n\nCross-module behavioral context (use at least one data point when relevant; do not invent patterns not listed):\n${parts.join("\n")}\nDo not generate encouragement or affirmation. Maintain confrontational, not compassionate, tone.`;
}

// Trust-calibration block — injected only below the record-density threshold.
// It interpolates the entry count, so it is per-user and belongs in the dynamic,
// uncached suffix. Extracted to a single source so buildSystemPromptBlocks can
// reconstruct the exact same bytes and split them off the assembled prompt.
//
// An unknown entry count (non-number) yields NO block. This block softens the
// confrontation frame, so it must require positive evidence of a thin record
// rather than firing on a missing field — which is also the semantic
// buildBehavioralContextBlock already applies. The two gates previously
// disagreed inside one prompt: a caller that omitted entryCount got the
// high-data behavioral context AND the low-data trust caveat.
function buildTrustCalibrationBlock(count) {
  if (typeof count !== "number") return "";
  const n = count;
  return n < TRUST_THRESHOLD
    ? `\n\nTRUST CALIBRATION: This user has ${n} total behavioral entries logged — not enough data to support credible archetype or pattern claims. Adjust your confrontation frame accordingly:\n- Do NOT make claims about behavioral archetypes, dominant patterns, or systemic tendencies. You do not have enough signal.\n- DO identify the specific gap between what he committed to and what he actually did. Name it directly.\n- Frame: "You said X. You did Y. What happened?" — specific inconsistency confrontation, not pattern judgment.\n- Same directness. Same weight. Different attack vector.`
    : "";
}

// Evasion-aware tone calibration (UXR-002 Spec 5). The client detects
// linguistic avoidance markers in the entry and forwards a band + the marker
// keys that fired; the instruction text is authored HERE, never client-side.
//
// Same defensive posture as the behavioral-context fields: the payload is
// user-influenced, so nothing from it is interpolated. `band` must match one of
// two literals, and the marker labels are produced by iterating the server-side
// whitelist and testing membership — a client string that is not a known key
// can never reach the prompt. A malformed or hostile payload degrades to no
// calibration at all.
const EVASION_MARKER_LABELS = {
  passiveVoice: "passive voice (actions without an actor)",
  externalization: "externalization (circumstances framed as the cause)",
  hedging: "hedged language (softeners, epistemic retreat)",
  lowSpecificity: "abstraction without concrete detail",
};
const MAX_EVASION_MARKERS_RENDERED = 3;

function buildEvasionCalibrationBlock(evasion) {
  if (!evasion || typeof evasion !== "object" || Array.isArray(evasion)) return "";
  const band = evasion.band === "high" || evasion.band === "moderate" ? evasion.band : "";
  if (!band) return "";
  const claimed = Array.isArray(evasion.markers) ? evasion.markers : [];
  const labels = Object.keys(EVASION_MARKER_LABELS)
    .filter((key) => claimed.includes(key))
    .map((key) => EVASION_MARKER_LABELS[key])
    .slice(0, MAX_EVASION_MARKERS_RENDERED);
  const markerList = labels.length > 0 ? labels.join("; ") : "nonspecific avoidance patterning";
  if (band === "high") {
    return `\n\nEVASION CALIBRATION (high): The entry shows linguistic markers of avoidance — specifically: ${markerList}. Name the evasion pattern to him directly, quoting his own words back to him. Do not offer reframes, do not build content, do not soften. Ask him one specific question he cannot answer without taking a position on what he actually did. This calibration shapes what you say to him — it never changes who you are speaking to. Stay in direct address.`;
  }
  return `\n\nEVASION CALIBRATION (moderate): Evasion markers present — ${markerList}. Name them to him directly if relevant to your feedback. Stay in direct address.`;
}

// Journal-only metacognitive depth directive. Constant text appended at the very
// end of the journal system prompt; extracted so buildSystemPromptBlocks rebuilds
// the identical dynamic tail. Leads with a blank line, matching its inline use.
const JOURNAL_DEPTH_DIRECTIVE = `

METACOGNITIVE DEPTH CLASSIFICATION (journal entries only):
Before your response, output exactly one classification line as the very first line:
DEPTH:Surface — the entry describes events or observations ("what happened")
DEPTH:Pattern — the entry identifies recurring dynamics ("this keeps happening because...")
DEPTH:Identity — the entry addresses structural self-understanding ("this is how I operate")

Output only one of: DEPTH:Surface, DEPTH:Pattern, or DEPTH:Identity.
Then a blank line. Then your prose response. Do not mention the depth in your prose.`;

// Dynamic response length: persona feedback scales with entry length instead of
// the former fixed "150–220 words." Bands, not a formula — predictable and
// testable, and the model handles a stated range better than an exact count.
// max_tokens ≈ upper band × 1.4 tokens/word + ~25% headroom so every response
// finishes with end_turn — a max_tokens stop would sever the closing tag.
// Only the four feedback surfaces scale; classifier/extractors/morning brief/
// emergency and the oracle/synthesis fall-throughs keep their fixed shapes.
const LENGTH_SCALED_MODULES = new Set(["journal", "killlist", "relapse", "hardlessons"]);
const LENGTH_TIERS = [
  { band: "A", maxEntryWords: 99, targetWords: "130–200", maxTokens: 400 },
  { band: "B", maxEntryWords: 179, targetWords: "170–270", maxTokens: 500 },
  { band: "C", maxEntryWords: 299, targetWords: "230–400", maxTokens: 750 },
  { band: "D", maxEntryWords: 449, targetWords: "330–550", maxTokens: 1000 },
  { band: "E", maxEntryWords: Infinity, targetWords: "420–550", maxTokens: 1000 },
];
const DEFAULT_MAX_TOKENS = 600;

function countEntryWords(text) {
  return String(text || "").trim().split(/\s+/).filter(Boolean).length;
}

function lengthTierFor(normalizedModule, entryWords) {
  if (!LENGTH_SCALED_MODULES.has(normalizedModule)) return null;
  const words = Number.isFinite(entryWords) && entryWords > 0 ? entryWords : 0;
  const tier = LENGTH_TIERS.find((t) => words <= t.maxEntryWords);
  return { band: tier.band, targetWords: tier.targetWords, maxTokens: tier.maxTokens, entryWords: words };
}

// Per-entry, so this block always rides the UNCACHED dynamic suffix — see
// buildSystemPromptBlocks. Putting it in the stable prefix would invalidate the
// shared cache on every differently-sized entry.
function buildLengthDirectiveBlock(normalizedModule, entryWords) {
  const tier = lengthTierFor(normalizedModule, entryWords);
  if (!tier) return "";
  if (tier.band === "A") {
    return `\n\nLENGTH TARGET: The entry is short. That does not make it small. Respond with ${tier.targetWords} words. Find the thing worth pressure and give it full treatment. Do not mirror his brevity by going thin, and do not pad — if you run past what the entry supports, you are inventing.`;
  }
  if (tier.band === "E") {
    return `\n\nLENGTH TARGET: He wrote at length — roughly ${tier.entryWords} words. Respond with ${tier.targetWords} words. You will not match his length; match his seriousness. Choose the two or three load-bearing threads and go deep. If something significant goes unaddressed, name that you are leaving it — do not skim everything thinly.`;
  }
  return `\n\nLENGTH TARGET: He wrote roughly ${tier.entryWords} words. Respond with ${tier.targetWords} words — at least the weight he brought, at most half again as much. If you run out of substance before the floor, you missed something in the entry; read it again. Never stretch to fill the range.`;
}

function buildSystemPrompt(moduleName, tone, behavioralContext, entryCount, memoryBlocks, evasion, entryWords) {
  // Normalize: 'killList', 'Kill List', 'Kill_List' → 'killlist'
  const normalizedModule = (moduleName || '').toLowerCase().replace(/[^a-z]/g, '');

  // Long-term memory section (themes + the user's own validated receipts).
  // Empty string when there is no memory yet → Oracle behaves exactly as today.
  const memoryBlock = memory.buildMemoryBlock(memoryBlocks);

  // Module context — tells the Oracle what kind of entry this is
  const moduleContext = {
    journal: "This is a journal entry — the user's honest self-examination.",
    killlist: "This is from the Kill List — the user is eliminating a specific pattern (habit, addiction, behavior, or fear). Read whether he named a new target, killed one, or had one escape, and respond to THAT event.",
    relapse: "This is a Signal entry — the user is logging the conditions and patterns that precede a slip, before it lands. Read it as a precursor he caught, not as a relapse that happened; the slip itself, when it lands, is recorded as a Hard Lesson.",
    hardlessons: "This is a Hard Lesson extraction — the user is converting a painful experience into an enforceable rule.",
    emergency: "This is an EMERGENCY — the user is in the middle of an acute struggle right now. An urge, a crisis, intense pressure. He reached for help instead of acting out.",
  };

  const toneColors = {
    stoic: "Where relevant, frame things in terms of what is actually within his control versus what he has no leverage over.",
    jungian: "Where relevant, notice what he may be projecting outward that originates internally. Name it plainly.",
    "sun-tzu": "Where relevant, think in terms of terrain, timing, and position rather than motivation.",
    taoist: "Where relevant, notice where he is forcing something that would resolve with less resistance.",
    musashi: "Where relevant, measure the gap between stated values and actual behavior.",
    watts: "Where relevant, identify the belief he is gripping that generates the friction. Make it visible.",
  };

  const context = moduleContext[normalizedModule] || moduleContext.journal;
  const toneNote = toneColors[tone] ? `\nTone color: ${toneColors[tone]}` : "";
  const isEmergency = normalizedModule === "emergency";
  // Scaled modules defer length to the per-entry LENGTH TARGET in the dynamic
  // tail; non-scaled persona fall-throughs (oracle/synthesis) keep the fixed
  // range so the rule never dangles. Static per module → cache-safe.
  const lengthRules = LENGTH_SCALED_MODULES.has(normalizedModule)
    ? `- Length: obey the LENGTH TARGET appended at the end of this briefing. It scales with what he wrote.`
    : `- 150–220 words.`;
  const lengthBlock = buildLengthDirectiveBlock(normalizedModule, entryWords);
  // BER-167: trust calibration block — injected only when below threshold.
  // A non-number entryCount stays null so both gates below read "unknown" the
  // same way: high-data, no low-data caveat.
  const count = typeof entryCount === "number" ? entryCount : null;
  const behavioralContextBlock = buildBehavioralContextBlock(behavioralContext, count);

  const trustCalibrationBlock = buildTrustCalibrationBlock(count);
  const evasionBlock = buildEvasionCalibrationBlock(evasion);

  // Morning Brief — operator-cadence daily readout.
  // Single paragraph, 3-5 sentences, no line breaks within it. No greeting,
  // no motivational framing, no encouragement. Tone: operations commander's
  // briefing. Severe, specific, operator-grade. Data is passed in via
  // entryText as a serialized snapshot; this prompt instructs Claude to
  // read it and compose the paragraph.
  if (normalizedModule === "morningbrief") {
    return `You are an operations advisor preparing a daily briefing. The user has opened the app; this is the first surface he sees today. The briefing is a situational readout, not a prompt and not a coach. It reads like a staff briefing from a stoic operations commander — facts, patterns, one action focus.

Input: a JSON-like snapshot of the user's current behavioral state — active drift signals, violated rules, Kill List targets with recent escapes and their implementation intentions, dominant relapse archetype, identity direction, total entry count. All fields are already computed; your job is composition, not analysis beyond what the data states.

Output rules — every rule is a hard constraint:
- Produce ONE paragraph, 3-5 sentences, no line breaks within the paragraph.
- No greeting. Never open with "Good morning", "Today's brief", "Hello", or any salutation. Never address the user by name.
- No motivational framing. No "you've got this", "keep going", "stay strong". No encouragement. No affirmation. No celebration of progress.
- No emoji. No exclamation points. No question marks except inside a reference to the user's own question data. No hedging ("perhaps", "maybe", "you might want to").
- Open with a status observation — what the data shows right now. Declarative.
- Name ONE specific operationally relevant item: the most pressing drift signal, or a recent rule violation, or a Kill List target with an active escape pattern. Reference the user's own data points — archetype label, target title, implementation intention trigger text. Do not invent patterns not present in the snapshot.
- Close with ONE exposure focus for the day. Not a suggestion, not a question — a focus point. Format: "Exposure today: [specific condition, window, or pattern]." Tie it to a concrete data point from the snapshot (e.g., a failed implementation intention trigger, a drift-signal archetype, a violated rule).
- Tone: operator, stoic, spare. Declarative statements or second-person directives. Never "you should" or "try to".
- If the snapshot is sparse (no active drift signals, no violated rules, no escapes, low total entry count), produce 1-2 sentences noting the record is still forming and naming the single most recent meaningful data point. Do NOT produce filler to reach 3-5 sentences. Do NOT invent activity.
- Never mention any philosopher, tradition, or framework by name.
- No headers, no bullets, no labels, no numbered lists. Plain prose only.
- Output ONLY the paragraph text. No preamble, no meta-commentary, no trailing notes.`;
  }

  // Entry classification — upstream router that decides which (if any)
  // extraction prompts should run on a journal entry. Returns a single JSON
  // object naming the dominant nature of the entry and the list of warranted
  // extractions. If the entry is a win, reflection, or neutral logging,
  // `extractions` is an empty array and no downstream extractor fires.
  if (normalizedModule === "entryclassification") {
    return `You are an analytical advisor. A man wrote a journal entry. Your job is to classify the entry's dominant nature and decide which downstream extractions (if any) should run.

There are three downstream extractors:
- hardLesson — for entries where the man took a specific WRONG ACTION that demonstrably cost him something, and an enforceable rule should be derived.
- generalLedger — for entries that surface a RECURRING behavioral pattern (habit, compulsion, avoidance loop) the man wants to eliminate.
- signal — for entries containing relapse PRECURSORS: rationalization, environmental exposure, isolation, craving, or other early-warning conditions BEFORE a behavior occurs.

Classify the entry's primary nature into ONE of:
- mistake — the man took a specific wrong action; identifiable false assumption or ignored signal; concrete cost. → run hardLesson.
- pattern — the entry names a specific behavior, character flaw, recurring judgment, avoidance, compulsion, or tendency the man exhibits in himself. The act of naming it as his own is sufficient evidence — explicit "I want to eliminate this" framing is NOT required. Examples that qualify: jealousy, envy, judging others, selfishness, anger, avoidance, compulsive scrolling, rationalization, defensiveness. Self-awareness framing, philosophical reflection, partial-progress claims ("I've gotten better at catching it"), or attempting to defuse the question with introspection do NOT downgrade this — naming is enough. → run generalLedger.
- precursor — environmental or emotional warning sign that historically precedes relapse; the behavior has NOT yet occurred. → run signal.
- win — the man took a specific action that countered a temptation, broke a pattern, or executed against fear. Awareness or naming of difficulty alone is NOT a win — there must be a concrete action with a stated outcome. → no extraction.
- reflection — pure processing or thinking-through with NO specific named behavior, pattern, mistake, or precursor. If the entry names ANY specific behavior the man exhibits in himself — even framed as self-aware acceptance — it is pattern, not reflection. → no extraction.
- neutral — factual logging, mood snapshot, no actionable signal. → no extraction.

CRITICAL: Naming is not winning.
An entry where the man describes a pattern he has not yet eliminated (avoidance, compulsion, habit) is a pattern, not a win — even if he frames it with self-awareness, philosophical framing, or apparent acceptance. Self-observation is the precondition to extraction, not a substitute for it. Only classify as win if the entry describes a specific action taken AGAINST the pattern, with an observable result.

An entry can have more than one signal (a mistake AND a pattern, for example). When that happens, list every applicable extractor in the array. When primary is win, reflection, or neutral, extractions MUST be an empty array.

Tiebreaker: when an entry contains both reflection and a named pattern, prefer pattern (extract). False positives the user can dismiss are recoverable. False negatives leave actionable signal buried.

Return ONLY a valid JSON object — no preamble, no markdown code blocks:

{
  "primary": "mistake | pattern | precursor | win | reflection | neutral",
  "extractions": ["hardLesson" and/or "generalLedger" and/or "signal", or empty array],
  "reasoning": "one short sentence explaining the call"
}

Rules:
- Return ONLY the JSON object. No prose, no markdown fences.
- If primary is win, reflection, or neutral, extractions MUST be [].
- Be specific to what he wrote. Do not infer signals not present in the text.
- Never use motivational, wellness, or therapeutic language in any field.`;
  }

  // Kill List contract extraction — returns structured JSON or null
  if (normalizedModule === "killlistextraction") {
    const activeTargetsBlock =
      Array.isArray(behavioralContext?.activeKillTargets) && behavioralContext.activeKillTargets.length > 0
        ? `\n\nActive Kill List targets already being tracked (do NOT suggest these — they are already in the system):\n${behavioralContext.activeKillTargets.map((t) => `- "${t.title}"`).join("\n")}`
        : "";
    return `An upstream classifier has already determined that this journal entry contains a behavioral pattern worth surfacing on his Kill List. Your job is to STRUCTURE that pattern into a Kill List target — do not re-decide whether it qualifies. Extract what is there; the user will dismiss the card if it does not resonate.

Use the entry's language to fill these fields:
- A recurring habit, compulsion, avoidance, or behavioral loop he named.
- Self-identified bad habits, time sinks, or destructive patterns.
- Expressions of frustration with a recurring behavior.${activeTargetsBlock}

Return ONLY a valid JSON object:

{
  "targetTitle": "Short name for the kill target — specific and behavioral, not vague",
  "targetDescription": "What the behavior is and why it needs to be eliminated — derived from what he wrote",
  "evidenceFromEntry": "The specific language from his journal entry that surfaced this",
  "suggestedCategory": "One of: addiction, compulsion, avoidance, time_sink, relationship_pattern, digital, emotional_pattern, other"
}

Return exactly \`null\` ONLY if the entry contains no behavioral content you can use to fill these fields (e.g., a pure mood snapshot with no described behavior), OR if the pattern is already on his active Kill List shown above. Do NOT return null because the signal feels weak — the classifier already made the gating call.

Rules:
- Return ONLY the JSON object or null. No preamble, no markdown fences.
- Be specific to what he wrote. Do not invent patterns not present in the text.
- Do not suggest a pattern that matches an active Kill List target listed above.
- Never use motivational, wellness, or therapeutic language in any output field.`;
  }

  // Implementation-intention drafting — returns a JSON batch of When/I-Will
  // options for a Kill Contract. No prose. Each clause is capped to fit the
  // 50-char form fields; the client normalizes/truncates defensively.
  if (normalizedModule === "killintentionsuggest") {
    const archetype = behavioralContext?.dominantRelapseArchetype;
    const groundingBlock = archetype
      ? `\n\nHis dominant relapse archetype is "${archetype}". Bias the triggers toward the conditions that archetype surfaces in. Do not name the archetype in the output.`
      : "";
    return `The user is creating a Kill Contract — a commitment to eliminate one specific pattern. Draft implementation intentions: pre-committed "When [trigger], I will [response]" plans (if-then). The input names the target, its category, and optional context about when/where it strikes.${groundingBlock}

Produce 5 distinct, concrete options tailored to THIS target and category. Each has two clauses:
- "when": the triggering condition — a specific moment, place, internal state, or cue. NO leading "When".
- "iWill": the competing physical action — executable in seconds, no further decision. NO leading "I will".

Hard constraints — every one is mandatory:
- Return ONLY a valid JSON object, no preamble, no markdown fences:
{ "suggestions": [ { "when": "...", "iWill": "..." } ] }
- 5 items unless you genuinely cannot produce that many, then return fewer.
- Each "when" and each "iWill" is 50 CHARACTERS OR FEWER. Count characters. Terse — a clause, not a sentence.
- Concrete and physical. The response is an action a body executes immediately ("call my partner", "leave the room", "do 10 pushups") — never "resist", "try", "remember", "stay strong".
- Vary the triggers and responses — do not restate one plan five ways.
- Operator/stoic voice. Never use motivational, wellness, therapeutic, or affirmational language.
- Be specific to the named target and category. Do not invent facts about the user beyond the input and the grounding above.
- If you cannot produce specific options, return { "suggestions": [] }.`;
  }

  // Target framing critique — pressure-tests whether the named Kill Contract
  // target is the REAL target. Returns JSON only: a verdict plus, when the
  // framing is flawed, a critique and 1-3 truer targets. Defaults to "sound".
  if (normalizedModule === "targetframingcritique") {
    const archetype = behavioralContext?.dominantRelapseArchetype;
    const groundingBlock = archetype
      ? `\n\nHis dominant relapse archetype is "${archetype}". If the named target is a downstream symptom of that archetype, the redirect should name the upstream pattern. Do not name the archetype in the output.`
      : "";
    const activeTargetsBlock =
      Array.isArray(behavioralContext?.activeKillTargets) && behavioralContext.activeKillTargets.length > 0
        ? `\n\nTargets already on his Ledger — do NOT suggest any of these as a redirect:\n${behavioralContext.activeKillTargets.map((t) => `- "${t.title}"`).join("\n")}`
        : "";
    return `The user is about to commit to a Kill Contract — a commitment to eliminate one specific pattern. Before he commits, pressure-test his framing. The input names the target, its category, and optional context about when/where it strikes.

Your job: decide whether the named target is the REAL target, or whether it is a surface symptom, a vague catch-all, an effect mistaken for a cause, or a mis-frame that points him at the wrong problem. This is the Oracle finding the hole in his logic so he chases the correct problem.${groundingBlock}${activeTargetsBlock}

DEFAULT TO "sound". A target does not need to be perfectly worded — it needs to point at a real, killable pattern. Only return "redirect" when there is a genuine logical flaw: the named target is a symptom of a deeper pattern, too vague to act on, or simply not the thing actually costing him. Do NOT manufacture a problem. Do NOT redirect a target that is already specific and behavioral just to sound insightful.

When you redirect, name the flaw plainly, then offer 1-3 truer targets he could pursue instead.

Hard constraints — every one is mandatory:
- Return ONLY a valid JSON object, no preamble, no markdown fences:
{ "verdict": "sound" | "redirect", "critique": "...", "suggestions": [ { "title": "...", "category": "...", "why": "..." } ] }
- When verdict is "sound": "critique" is "" and "suggestions" is [].
- When verdict is "redirect": "critique" is one or two sentences naming the flaw in his framing — direct, specific to what he wrote. "suggestions" has 1-3 items.
- Each suggestion "title" is a short, specific, behavioral target name (≤100 chars) — what to actually eliminate, not advice.
- Each suggestion "category" is EXACTLY one of: bad-habit, negative-thought, addiction, toxic-behavior, fear, procrastination, other.
- Each suggestion "why" is one sentence: why this is the truer target than the one he named.
- Operator/stoic voice. Never use motivational, wellness, therapeutic, or affirmational language.
- Be specific to the named target and context. Do not invent facts about the user beyond the input and the grounding above.`;
  }

  // Relapse precursor detection — returns structured JSON or null
  if (normalizedModule === "relapsedetection") {
    const activeTargetsBlock =
      Array.isArray(behavioralContext?.activeKillTargets) && behavioralContext.activeKillTargets.length > 0
        ? `\n\nActive Kill List targets (use these to populate relatedKillTarget if relevant):\n${behavioralContext.activeKillTargets.map((t) => `- "${t.title}"`).join("\n")}`
        : "";
    return `An upstream classifier has already determined that this journal entry contains a behavioral precursor — an early-warning signal that historically precedes relapse. The relapse has NOT happened yet; that absence is the entire point of this module. Your job is to STRUCTURE the precursor into a Signal entry. Do not re-decide whether it qualifies.

"Behavioral content" for THIS extractor explicitly includes pre-consummation signals:
- Rationalization ("just this once", "I deserve", "it's not that bad")
- Environmental positioning (proximity to triggers, checking, lingering near)
- Emotional states that precede relapse (isolation, boredom, emotional flooding, numbness)
- Minimization of past commitments or rules
- Cravings, urges, pull toward eliminated behaviors
- Routine breaking, sleep disruption, stress without coping

The ABSENCE of a consummated act is NOT a reason to return null. If you can populate \`precursorConditions\` with at least one specific item from the list above based on what he wrote, you have enough.${activeTargetsBlock}

ANCHOR EXAMPLE
Entry: "Worked from home alone all day. Skipped the gym, skipped lunch with Marcus, ate standing over the sink. By 4pm I noticed I was checking the wine fridge every time I walked past it — not opening it, just checking. Told myself I deserved a glass for getting through the quarterly numbers. The exact rationalization I used the week before I broke the streak last year. Nothing happened. But the conditions are stacking: isolation, no anchor activities, the 'I earned it' voice. I'm watching it."

Correct output:
{
  "signalSummary": "Pre-relapse conditions stacking: isolation, abandoned anchor activities, checking behavior toward eliminated behavior, and a rationalization previously tied to a streak break.",
  "precursorConditions": ["isolation", "routine_disruption", "environmental_exposure", "rationalization"],
  "evidenceFromEntry": "checking the wine fridge every time I walked past it... Told myself I deserved a glass... The exact rationalization I used the week before I broke the streak last year.",
  "relatedKillTarget": null,
  "urgency": "high"
}

OUTPUT SCHEMA
Return ONLY a valid JSON object with this shape:

{
  "signalSummary": "One-sentence description of the detected precursor pattern",
  "precursorConditions": ["Array from: rationalization, isolation, environmental_exposure, emotional_flooding, routine_disruption, craving, minimization, stress_without_coping, boredom, numbness"],
  "evidenceFromEntry": "The specific language from his entry that surfaced this",
  "relatedKillTarget": "Title of any active Kill List target this connects to, or null",
  "urgency": "low | medium | high — based on signal density and language intensity"
}

Return exactly \`null\` ONLY if the entry describes a relapse that ALREADY happened (a consummated act of the eliminated behavior). Do NOT return null because no behavior has occurred yet — that is precisely when this extractor should fire.

Rules:
- Return ONLY the JSON object or null. No preamble, no markdown fences.
- These are precursors, not relapses — do not conflate them.
- Be specific to what he wrote. Do not invent signals not present in the text.
- Never use motivational, wellness, or therapeutic language in any output field.`;
  }

  // Lesson extraction — returns structured JSON when a hard lesson is present,
  // or null when the entry has no costly mistake / regret / ignored signal /
  // failure pattern worth converting into a rule. Used by the cross-module
  // auto-classification flow on save and by the per-entry "Reconsider"
  // re-run; both paths drop the suggestion when null comes back.
  if (normalizedModule === "lessonextraction") {
    return `An upstream classifier has already determined that this journal entry contains a Hard Lesson — a costly mistake, regret, ignored signal, failed assumption, or behavior that cost him something. Your job is to STRUCTURE that lesson into an enforceable rule — do not re-decide whether it qualifies. Extract what is there; the user will dismiss the card if it does not resonate.

Use the entry's language to fill these fields. Relevant signal types:
- Mistake, failure, regret, or "should have / shouldn't have"
- Cost — emotional, financial, relational, professional, time, or physical loss tied to a decision
- Ignored signals — "I noticed but dismissed...", "the warning was there", trusting against evidence
- False assumptions broken by reality
- Boundary failures or commitments violated

Return ONLY a valid JSON object:

{
  "eventDescription": "What actually happened — facts only, stripped of emotion and narrative. 1-2 sentences.",
  "myAssumption": "What he believed or assumed that turned out to be false. Start with 'I assumed...' or 'I believed...'",
  "signalIgnored": "The warning sign he noticed but dismissed. Start with 'I ignored...' or 'I noticed but dismissed...'",
  "costDescription": "What it actually cost him — be specific and concrete.",
  "extractedLesson": "The core lesson in one sentence. Brutally precise.",
  "ruleGoingForward": "An enforceable rule — not advice. Format: 'If... then...' or 'Never...' or 'Always...'",
  "suggestedCategory": "One of: relationship_misjudgment, leadership_error, boundary_failure, overconfidence, underestimation, ignored_intuition, trust_without_verification, other",
  "evidenceFromEntry": "The specific language from his journal entry that surfaced this lesson",
  "suggestedCosts": ["Array of applicable cost types from: emotional, financial, relational, physical, professional, time"]
}

Return exactly \`null\` ONLY if the entry contains no described action, decision, or cost you can use to fill these fields. Do NOT return null because the signal feels weak — the classifier already made the gating call. If a particular field cannot be inferred from the text, fill it with your best read of what the entry implies; do not leave fields empty.

Rules:
- Return ONLY the JSON object or null. No preamble, no markdown fences.
- Every field must be filled when returning JSON.
- The rule must be enforceable — something he can actually follow, not a wish.
- Be specific to what he wrote. Do not invent costs or assumptions not present in the text.
- Never use motivational, wellness, or therapeutic language in any output field.`;
  }

  if (isEmergency) {
    return `You are the Oracle — a grounded, immediate presence.

${context}

Do not philosophize. Do not ask questions. Be immediate.
- Name what is happening in his body and mind right now. Make him feel seen without softening it.
- Give one concrete action for the next 5 minutes. Physical, specific, executable.
- Close with one grounding statement — not advice, a truth that cuts through the noise.

Hard rules:
- No headers, bullets, or lists. Flowing prose only.
- Never name any philosopher, tradition, or framework.
- Never use: "healing journey", "be kind to yourself", "proud of you", "validate", "sit with."
- 100–150 words.${behavioralContextBlock}${trustCalibrationBlock}${evasionBlock}`;
  }

  return `You are the Oracle — a direct, grounded advisor for a man doing serious inner work. You speak like someone who has seen these patterns before — not a therapist, not a coach, not a motivational speaker. A straight-talking advisor who respects this man enough to be honest, and smart enough to know that honest does not always mean hard.

You know when to push and when to build. Not every entry needs a challenge. Read the entry first. Then choose your posture.

${context}${toneNote}

STEP 1 — READ BEFORE RESPONDING

Before you write anything, identify what is actually present in this entry. What is the man bringing you?

- Avoidance, rationalization, or a loop he is stuck in → CHALLENGE. Name what he is not seeing. Be direct.
- Genuine progress, a real shift, or momentum → BUILD. Name what is working and why. Tell him what to protect. Do not manufacture a problem.
- Grief, loss, or pain he is sitting with honestly → GROUND. Meet him where he is. Give perspective without destabilizing. Do not push.
- Confusion or uncertainty he is working through → CLARIFY. Help him think. Offer a frame that organizes what he is feeling. Do not add pressure.
- A win or breakthrough → RECEIVE. Acknowledge it cleanly. Name what shifted. Point him forward. No skepticism, no "but."

You can blend these — an entry can have progress AND avoidance. But your opening line must match the dominant energy of the entry. If a man is building, do not open by tearing something down.

STEP 2 — RESPOND

Journal entries:
- Open by responding to the most alive thing in what he wrote — the thing that carries the most energy, whether that energy is positive, painful, or unresolved.
- Engage with specifics from his entry. Quote or reference his exact language.
- Offer one insight that extends or deepens what he wrote — something he can use, not just something that sounds wise.
- When recent entries are provided and this entry continues one of them, name the through-line — he should feel that you remember. If there is no genuine continuity, do not fabricate one.
- If the entry is a win and you close with a question, it should point forward ("what does this make possible now?"), not backward ("what are you still avoiding?").

Kill List entries:
- If he named a new target: engage with the specific pattern — what makes it survive, what makes it killable. Close with a question about his history with this target.
- If he killed a target: receive the win. Name what shifted. Close with a forward-looking question about what this target looks like if it returns in another form.
- If a target escaped: name the decision point where a different choice existed. Give one concrete tactical adjustment. Close with a question about what was present right before it escaped.

AUTOPSY RATIONALIZATION CALIBRATION (escape entries only):
Read the rationalization the man provided — what he told himself in the moment. Most rationalizations are avoidance or situational excuses. But some carry a different signal: regret toward the old behavior. This is distinct and must be treated as a separate risk category.

Regret-toward-old-behavior signals include: nostalgia or longing for the old pattern ("I missed it", "it felt good", "part of me wanted it"), minimization of its harm ("it wasn't that bad", "just this once doesn't count", "at least it was only X"), or language that frames the escape as relief rather than failure. The tell is that the man is not just explaining why he slipped — he is expressing attachment to what he is supposed to be eliminating.

When these signals are present in the rationalization:
- Treat this as a habit-weakening risk signal, not a standard rationalization to challenge.
- Name the signal directly: the problem is not just that the target escaped — it is that the commitment to eliminate it is softening. The man is beginning to want it back.
- Do not moralize about the escape itself. Focus on the weakening of the elimination mission.
- Close with a question that forces him to confront whether he still actually wants to kill this target.

Signal entries (The Signal — precursors logged before a slip lands):
- Name the rationalization forming in the conditions he describes — the mental move, not an act that has not happened.
- Map the loop without moralizing: trigger, relief, cost. Make him see the full cycle before it closes.
- Give one environmental or timing change that interrupts the loop before it starts.
- Close with a question about the last time he held the line and what was different.

Hard Lesson entries:
- Go one level deeper than the lesson he already stated.
- Test the rule: name the most likely scenario where he will rationalize breaking it.
- Close with a question about when the next test of this rule will arrive.

CLOSING MOVE — the module notes above describe what a closing question should aim at when you use one. Whether you close with a question is governed by the posture you chose in Step 1, not by template:
- CHALLENGE → close with one question he cannot answer without taking a position.
- BUILD or RECEIVE → close with a forward-pointing question OR a single directive naming what to protect or repeat. A win does not always need to be interrogated.
- GROUND → close with a statement that holds the weight. No question required. Do not manufacture inquiry into grief.
- CLARIFY → the probing question may sit mid-response where it does the organizing work; close with the frame it produces.

Vary the body with the entry: a synthesis across his recent record when continuity is present, a single-thread deep read when one thing dominates, a direct confrontation when he is dodging. Do not run the same open–insight–question shape every time.

Hard rules:
- You are speaking directly to the man who wrote the entry. Address him as "you" in every sentence — never "he", "the man", "the user", never prose that describes him as if reporting to a third party. Any context or pattern notes you receive about him, restate in direct address when you use them.
- Respond only to what was actually written. Every sentence must connect to something specific in his entry.
- Write in flowing prose. No headers, no bullets, no labels, no numbered lists.
- Never mention any philosopher, thinker, tradition, or framework by name. The insight must stand on its own.
- Never use: "you've got this", "healing journey", "be kind to yourself", "proud of you", "validate", "sit with", "amazing", "warrior."
- No hedging. Cut "perhaps", "it seems", "you might want to consider."
- Do not moralize. Do not lecture. Speak to him like an equal.
- If — and only if — you close with a question, wrap that single closing question inline in <closing_question>...</closing_question> tags, exactly once. The question still reads as part of your prose; the tags are markers for downstream processing only. If you close with a statement or directive, use no tags anywhere. Never tag a mid-response question.
${lengthRules}
- Every sentence must earn its place. If a sentence restates his entry, restates you, or exists to reach a length, cut it and go deeper on what remains. Length comes from substance — another specific engaged, an implication drawn out, a pattern traced further — never from stretching a thought.${behavioralContextBlock}${trustCalibrationBlock}${memoryBlock}${normalizedModule === 'journal' ? JOURNAL_DEPTH_DIRECTIVE : ''}${evasionBlock}${lengthBlock}`;
}

// Split the assembled system prompt into a STABLE cacheable prefix and a DYNAMIC
// (per-user/per-session) suffix, for Anthropic prompt caching. Output is byte-
// equivalent to buildSystemPrompt: stable + dynamic === buildSystemPrompt(...).
//
// The dynamic tail (behavioral context + trust calibration + memory + the journal
// depth directive) is reconstructed from the SAME single-source helpers that
// build it, then sliced off the end of the full prompt. The endsWith guard means
// any drift degrades safely to "not cacheable" rather than corrupting the prompt.
//
// `cacheable` is false for templates that interpolate per-user data MID-prompt
// (the extraction prompts) — their prefix is not user-identical, so we never put
// a cache breakpoint on it. Returns { stable, dynamic, cacheable }.
function buildSystemPromptBlocks(moduleName, tone, behavioralContext, entryCount, memoryBlocks, evasion, entryWords) {
  const full = buildSystemPrompt(moduleName, tone, behavioralContext, entryCount, memoryBlocks, evasion, entryWords);
  const normalizedModule = (moduleName || '').toLowerCase().replace(/[^a-z]/g, '');
  const count = typeof entryCount === "number" ? entryCount : null;

  // Templates that embed per-user data (active targets, archetype) inside the
  // body — never cache; send as a plain string, byte-identical to today.
  const PER_USER_TEMPLATES = new Set([
    "killlistextraction", "killintentionsuggest", "targetframingcritique", "relapsedetection",
  ]);
  if (PER_USER_TEMPLATES.has(normalizedModule)) {
    return { stable: full, dynamic: "", cacheable: false };
  }

  // Fully-static templates: the whole prompt is the stable prefix, no dynamic tail.
  const STATIC_TEMPLATES = new Set(["morningbrief", "entryclassification", "lessonextraction"]);
  if (STATIC_TEMPLATES.has(normalizedModule)) {
    return { stable: full, dynamic: "", cacheable: true };
  }

  // Main Oracle persona (journal / killlist / relapse / hardlessons / default)
  // and the emergency prompt append a per-user/per-session tail.
  const behavioralContextBlock = buildBehavioralContextBlock(behavioralContext, count);
  const trustCalibrationBlock = buildTrustCalibrationBlock(count);
  const isEmergency = normalizedModule === "emergency";
  const memoryBlock = isEmergency ? "" : memory.buildMemoryBlock(memoryBlocks);
  const depthDirective = normalizedModule === "journal" ? JOURNAL_DEPTH_DIRECTIVE : "";
  // Per-entry, so these belong in the uncached suffix — putting either in the
  // stable prefix would invalidate the shared cache on every different entry.
  const evasionBlock = buildEvasionCalibrationBlock(evasion);
  const lengthBlock = buildLengthDirectiveBlock(normalizedModule, entryWords);

  const dynamic = isEmergency
    ? `${behavioralContextBlock}${trustCalibrationBlock}${evasionBlock}`
    : `${behavioralContextBlock}${trustCalibrationBlock}${memoryBlock}${depthDirective}${evasionBlock}${lengthBlock}`;

  if (dynamic && full.endsWith(dynamic)) {
    return { stable: full.slice(0, full.length - dynamic.length), dynamic, cacheable: true };
  }
  // No per-user/per-session tail this call (or a guard mismatch) → the whole
  // prompt is stable. Still cacheable as a single prefix.
  return { stable: full, dynamic: "", cacheable: true };
}

const DRIVER_LABELS = {
  addiction: "breaking an addiction or compulsive pattern",
  loss: "processing a loss, betrayal, or painful experience",
  clarity: "building mental clarity and discipline",
  elimination: "eliminating behaviors that are costing him",
  becoming: "becoming someone specific — not just fixing problems",
};

const STYLE_INSTRUCTIONS = {
  ruthless: "He chose ruthless feedback — he wants the direct version with no cushion. Still read the entry first. If the entry is a genuine win, receive it and then raise the bar. Do not manufacture softness, but do not manufacture conflict either.",
  strategic: "He chose strategic feedback — he wants to understand the decision landscape. Focus on what moves are available, what the trade-offs are, and what he should do next.",
  philosophical: "He chose philosophical feedback — he wants his assumptions examined. Challenge how he is framing the situation. Offer a different way to see it.",
  balanced: "He chose balanced feedback — be direct and honest, but match the weight of your response to what the entry actually contains. Lighter entries get lighter responses.",
};

// The follow-up turns override the persona's length and closing rules from
// the tail of a long system prompt, which the model under-weights: live
// fixtures ran 175–210 words against a 140-word rule. The shape of the reply
// is therefore restated as the last line of the user message, where it is
// read last. Keyed by promptContextKey; first readings get nothing.
const FOLLOW_UP_SHAPE = {
  oracle_pushback:
    "Shape of this reply: two paragraphs of two or three sentences each, 80–140 words in all, then the one tagged question as the final line. No third paragraph. No rhetorical questions: the tagged question is the only question mark in the reply.",
  oracle_further:
    "Shape of this reply: two paragraphs of two or three sentences each, 80–140 words in all, then the one tagged question as the final line. No third paragraph. No rhetorical questions: the tagged question is the only question mark in the reply.",
  oracle_close:
    "Shape of this reply: the VERDICT line, a blank line, one paragraph of three to five sentences (60–110 words), then the tagged commitment as the final line. No question mark anywhere: if his words were a question, restate them as a statement. In the commitment, the trigger is at most eight words and the action at most seven words.",
  oracle_landed:
    "Shape of this reply: one paragraph of two to four sentences (40–80 words) that quotes, in quotation marks, a phrase taken word for word from the ORIGINAL ENTRY section — his words, never a line from YOUR PRIOR READING — then the tagged commitment as the final line. No advice, no second paragraph, no question mark. In the commitment, the trigger is at most eight words and the action at most seven words.",
};

function buildUserPrompt(entryText, userContext, promptContextKey = null) {
  let prompt = `Entry:\n${entryText}`;

  const context = [];

  // All free-text fields below are user-authored and client-supplied — same
  // clamp + «» delimiter regime as the system-prompt side (ctxField), so they
  // read as DATA, not instructions.
  if (userContext?.focusStatement) {
    context.push(`What he's working on: ${ctxField(userContext.focusStatement)}`);
  }
  if (userContext?.primaryDriver && DRIVER_LABELS[userContext.primaryDriver]) {
    context.push(`His primary reason for being here: ${DRIVER_LABELS[userContext.primaryDriver]}`);
  }
  if (userContext?.feedbackStyle && STYLE_INSTRUCTIONS[userContext.feedbackStyle]) {
    context.push(`Feedback preference: ${STYLE_INSTRUCTIONS[userContext.feedbackStyle]}`);
  }
  // Personal-context fields captured in onboarding (and editable from
  // Settings). Forwarded only when the client populated them. The Oracle
  // should USE these — name the named situations, recognize the named
  // triggers — but only when the entry actually intersects with them.
  // Do not force-fit context that has nothing to do with what he wrote.
  if (Array.isArray(userContext?.activeSituations) && userContext.activeSituations.length) {
    const items = userContext.activeSituations.slice(0, MAX_CTX_ITEMS).map((s) => ctxField(s));
    context.push(`What he's currently navigating: ${items.join('; ')}`);
  }
  if (Array.isArray(userContext?.knownTriggers) && userContext.knownTriggers.length) {
    const items = userContext.knownTriggers.slice(0, MAX_CTX_ITEMS).map((s) => ctxField(s));
    context.push(`Times/states where he historically fails: ${items.join('; ')}`);
  }
  if (typeof userContext?.operatingContext === 'string' && userContext.operatingContext.trim()) {
    context.push(`Additional context he provided: ${ctxField(userContext.operatingContext, 500)}`);
  }
  if (Array.isArray(userContext?.recentEntries) && userContext.recentEntries.length) {
    const excerpts = userContext.recentEntries
      .slice(0, 2)
      .map((s) => ctxField(s, RECENT_ENTRY_EXCERPT_MAX_CHARS));
    context.push(`His most recent entries, newest first (use for continuity — name the through-line when this entry extends one; never quote them back verbatim): ${excerpts.join(' / ')}`);
  }

  if (context.length > 0) {
    prompt += `\n\nContext about this man:\n${context.join('\n')}`;
  }

  prompt += `\n\nRespond only to what he actually wrote. Be specific to this entry.`;
  const shape = promptContextKey ? FOLLOW_UP_SHAPE[promptContextKey] : null;
  if (shape) prompt += `\n\n${shape}`;
  return prompt;
}

// ── Positioning: banned-tone output filter ───────────────────────────────────
// The system prompts forbid therapeutic/encouragement phrasing, but prompt
// instructions are not a guarantee. This is the OUTPUT-side enforcement applied
// to every LIVE Oracle response (journal, emergency, Radar, Reckoning,
// synthesis). Same regime as functions/memory.js (themes) and the fallback path
// in src/utils/aiFeedback.js.
const BANNED_TONE_REGEX =
  /\b(proud of you|you got this|safe space|healing journey|you deserve|be gentle with yourself|everything happens for a reason)\b/gi;
function stripBannedTone(text) {
  if (typeof text !== "string") return "";
  return text
    .replace(BANNED_TONE_REGEX, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +([.,;:])/g, "$1")
    .trim();
}

const CLOSING_QUESTION_TAG_REGEX_ALL = /<closing_question>\s*([\s\S]*?)\s*<\/closing_question>/gi;

function extractClosingQuestionFromProse(prose) {
  if (typeof prose !== "string" || !prose.trim()) return null;
  const cleaned = prose.replace(/\s+/g, " ").trim();
  const sentences = cleaned
    .split(/(?<=[.!?])\s+(?=[A-Z"'‘“(])/g)
    .map((s) => s.trim())
    .filter(Boolean);
  for (let i = sentences.length - 1; i >= 0; i -= 1) {
    const candidate = sentences[i].replace(/^[\s"'‘“]+/, "").replace(/[\s"'’”]+$/, "").trim();
    if (!candidate.endsWith("?")) continue;
    if (candidate.length < 6) continue;
    if (/^or\s*[:,]/i.test(candidate)) continue;
    return candidate;
  }
  if (sentences.length === 1 && cleaned.endsWith("?") && cleaned.length >= 6 && cleaned.length < 280) {
    return cleaned;
  }
  return null;
}

// Follow-up commitment tags. The oracle_challenge turn closes on one tagged
// commitment line. Unlike the closing question, the line is removed from the
// prose entirely and returned as a structured field: the client renders it as
// its own block and prefills a Kill Contract from it. Attribute quoting is
// lenient so a smart quote in the pattern name cannot sink the commitment.
// The first tag is parsed; every tagged block is stripped from the prose. No
// heuristic recovery: an untagged line stays prose and `commitment` is null.
const COMMITMENT_TAG_REGEX = /<commitment\b([^>]*)>\s*([\s\S]*?)\s*<\/commitment>/i;
const COMMITMENT_TAG_REGEX_ALL = /<commitment\b[^>]*>\s*[\s\S]*?\s*<\/commitment>/gi;
const COMMITMENT_PATTERN_ATTR_REGEX = /pattern\s*=\s*["'“”‘’]([^"'“”‘’]*)/i;
const COMMITMENT_SHAPE_REGEX = /^When\s+(.+?),\s*I\s+will\s+(.+?)\.\s*Checked\s+by\s+(.+?)\.?$/i;
const MAX_COMMITMENT_PATTERN_CHARS = 100;

function parseCommitment(attrs, inner) {
  const line = String(inner || "").replace(/\s+/g, " ").trim();
  if (!line) return null;
  const text = stripBannedTone(line.replace(/^Commitment:\s*/i, ""));
  if (!text) return null;
  const attrMatch = String(attrs || "").match(COMMITMENT_PATTERN_ATTR_REGEX);
  const pattern = attrMatch
    ? stripBannedTone(attrMatch[1]).slice(0, MAX_COMMITMENT_PATTERN_CHARS)
    : "";
  const shape = text.match(COMMITMENT_SHAPE_REGEX);
  return {
    text,
    pattern: pattern || null,
    trigger: shape ? shape[1].trim() : null,
    action: shape ? shape[2].trim() : null,
    check: shape ? shape[3].trim() : null,
  };
}

// System-only first lines, "LABEL:value" — the DEPTH classification on journal
// readings and the VERDICT on a follow-up's closing turn. Read by the system,
// never shown to him, so the markdown the model sometimes wraps them in is
// swallowed with them.
function prefixLine(label, values) {
  return new RegExp(`^[\\s*#_>—-]*${label}:\\s*(${values.join("|")})\\b[*_.:]*\\s*`, "i");
}
const DEPTH_LINE = prefixLine("DEPTH", ["Surface", "Pattern", "Identity"]);
const VERDICT_LINE = prefixLine("VERDICT", ["answered", "evaded"]);

function liftPrefixLine(text, regex) {
  const match = text.match(regex);
  return match ? { value: match[1], rest: text.slice(match[0].length).trim() } : { value: null, rest: text };
}

function parseOracleResponse(rawText) {
  const depth = liftPrefixLine(rawText.trim(), DEPTH_LINE);
  const metacognitiveDepth = depth.value;
  const verdictLine = liftPrefixLine(depth.rest, VERDICT_LINE);
  const verdict = verdictLine.value ? verdictLine.value.toLowerCase() : null;
  let trimmed = verdictLine.rest;

  // Lift the follow-up commitment out of the prose (oracle_close turns).
  let commitment = null;
  const commitmentMatch = trimmed.match(COMMITMENT_TAG_REGEX);
  if (commitmentMatch) {
    commitment = parseCommitment(commitmentMatch[1], commitmentMatch[2]);
    trimmed = trimmed.replace(COMMITMENT_TAG_REGEX_ALL, "").trim();
  }

  // Unwrap every closing_question tag — a second one would otherwise reach
  // the UI as raw markup — keeping the last as the closing question. The
  // question text stays in the prose so the modal renders the full response.
  let closingQuestion = null;
  trimmed = trimmed.replace(CLOSING_QUESTION_TAG_REGEX_ALL, (_full, inner) => {
    const question = (inner || "").trim();
    closingQuestion = question || null;
    return question;
  }).trim();

  // Fall back to heuristic extraction when the model omitted the tags. It runs
  // beside a commitment too: the closing turn's client ignores the question,
  // and a first turn that mis-tagged a commitment still gets its question back.
  if (!closingQuestion) {
    closingQuestion = extractClosingQuestionFromProse(trimmed);
  }

  // Enforce the banned-tone ban on the live prose itself — prompt instructions
  // alone are not a guarantee (this covers Radar/Reckoning/synthesis/journal).
  return {
    feedback: stripBannedTone(trimmed),
    metacognitiveDepth,
    closingQuestion: closingQuestion ? stripBannedTone(closingQuestion) : closingQuestion,
    commitment,
    verdict,
  };
}

// Format telemetry for the follow-up arc, logged beside every call: tag counts
// from the raw text (the parsed fields include heuristic recovery), whether the
// commitment parsed into its three clauses, the prose length, and the verdict.
// Counts and a one-word enum only — never the text.
function describeResponseShape(rawText, parsed) {
  const raw = typeof rawText === "string" ? rawText : "";
  const c = parsed?.commitment;
  return {
    closingQuestionTags: (raw.match(/<closing_question>/gi) || []).length,
    commitmentTags: (raw.match(/<commitment\b/gi) || []).length,
    commitmentShaped: !!(c && c.trigger && c.action && c.check),
    proseWords: countEntryWords(parsed?.feedback),
    verdict: parsed?.verdict || null,
  };
}

// ─────────────────────────────────────────────
// Account / data deletion (right-to-erasure)
// ─────────────────────────────────────────────

// Every top-level collection that stores user-scoped documents (each carries a
// `userId` field). Kept in sync with firestore.rules / src/utils/schema.js.
const USER_DATA_COLLECTIONS = [
  "journalEntries",
  "killTargets",
  "hardLessons",
  "relapseEntries",
  "userSettings",
  "syntheses",
  "confrontations",
  "confirmedKills",
  "compassChecks",
  "emergencyLogs",
  "dailyBriefs",
  "journalEntriesArchive",
  "killTargetsArchive",
  "hardLessonsArchive",
  "relapseEntriesArchive",
];

// Delete every doc in `collectionName` owned by `uid`, in batches of 400
// (Firestore caps a write batch at 500). Pages through with a bounded query so
// a huge collection can't exhaust memory. Returns the number deleted.
async function deleteOwnedDocs(db, collectionName, uid) {
  let deleted = 0;
  for (;;) {
    const snap = await db
      .collection(collectionName)
      .where("userId", "==", uid)
      .limit(400)
      .get();
    if (snap.empty) break;
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    deleted += snap.size;
    if (snap.size < 400) break;
  }
  return deleted;
}

// eraseUserData — the actual erase + receipt logic, factored out of the
// callable so it can be exercised directly against the Firestore emulator.
// Returns a manifest of doc counts removed, per collection plus memory/profile.
async function eraseUserData(db, uid) {
  const summary = {};
  for (const collectionName of USER_DATA_COLLECTIONS) {
    summary[collectionName] = await deleteOwnedDocs(db, collectionName, uid);
  }
  // Count the doc-id-keyed + subcollection records BEFORE the recursive
  // delete removes them, so the deletion receipt reflects what was erased.
  // recursiveDelete itself returns void, so the count must be taken here.
  const memSnap = await db.collection("users").doc(uid).collection("memory").get();
  summary.memory = memSnap.size;
  const profileSnap = await db.collection("userProfiles").doc(uid).get();
  summary.userProfile = profileSnap.exists ? 1 : 0;

  // Doc-id-keyed records + any admin subcollections under the user doc
  // (_rateLimits, integrations, biometrics, memory) are removed recursively.
  await db.recursiveDelete(db.collection("userProfiles").doc(uid));
  await db.recursiveDelete(db.collection("users").doc(uid));
  // Non-content admin subcollections (_rateLimits, integrations, biometrics)
  // are purged by the recursive delete above but are not user-authored records,
  // so they carry no count. Flag their removal for completeness. The deletion
  // receipt UI renders only numeric fields, so this boolean is shown nowhere
  // but is present in the returned manifest + server log.
  summary.adminSubcollectionsPurged = true;
  return summary;
}

// eraseUserAccount — full account erasure: Firestore wipe, then Auth-record
// removal via the Admin SDK. Ordered so a failed wipe never destroys the
// credential while data remains; the wipe is idempotent, so a retry after an
// auth-deletion failure re-runs safely. Admin-side auth deletion has no
// recent-login requirement, unlike client-side deleteUser — which previously
// left an orphaned Auth record when the session went stale between the wipe
// and the receipt acknowledgment.
async function eraseUserAccount(db, auth, uid) {
  const summary = await eraseUserData(db, uid);
  await auth.deleteUser(uid);
  return summary;
}

// deleteUserData — permanently erase the caller's account: all Firestore data
// and the Firebase Auth record. Auth-gated; a user can only delete their own
// account (uid comes from the verified token, never from the client payload).
// After this resolves, nothing of the account survives server-side; the client
// only signs out locally.
exports.deleteUserData = onCall({ region: "us-central1", timeoutSeconds: 120 }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "You must be signed in to delete your account.");
  }
  const uid = request.auth.uid;
  const { getFirestore } = require("firebase-admin/firestore");
  const { getAuth } = require("firebase-admin/auth");

  let summary;
  try {
    summary = await eraseUserAccount(getFirestore(), getAuth(), uid);
  } catch (err) {
    // Never echo raw error detail to the client.
    console.error("deleteUserData failed", { uid, code: err?.code, message: err?.message });
    throw new HttpsError("internal", "Account deletion failed partway through. Please try again.");
  }

  console.log("deleteUserData complete", { uid, summary });
  // `manifest` is the deletion receipt shown to the user; `deleted` is kept as
  // a backward-compatible alias.
  return { ok: true, manifest: summary, deleted: summary, completedAt: new Date().toISOString() };
});

// ─── Long-term AI memory callables ──────────────────────────────────────────
// Server-only writers for users/{uid}/memory/*. Generation (updateMemory),
// theme edit (editMemory), receipt removal (deleteMemoryReceipt), receipts of a
// permanently deleted entry (forgetEntryInMemory), and wipe
// (wipeMemory) all run under the verified caller's uid via the Admin SDK.
// (Memory docs are also cleared automatically by deleteUserData's recursive
// delete of users/{uid}.)
exports.updateMemory = memory.updateMemory;
exports.editMemory = memory.editMemory;
exports.deleteMemoryReceipt = memory.deleteMemoryReceipt;
exports.forgetEntryInMemory = memory.forgetEntryInMemory;
exports.wipeMemory = memory.wipeMemory;

// Pure prompt-assembly helpers exported for unit testing. Not registered as
// Cloud Functions; safe to require() from a node:test harness.
exports.buildBehavioralContextBlock = buildBehavioralContextBlock;
exports.buildEvasionCalibrationBlock = buildEvasionCalibrationBlock;
exports.buildSystemPrompt = buildSystemPrompt;
exports.buildSystemPromptBlocks = buildSystemPromptBlocks;
// Dynamic response length + user-prompt assembly, exported for unit tests.
exports.lengthTierFor = lengthTierFor;
exports.buildLengthDirectiveBlock = buildLengthDirectiveBlock;
exports.buildUserPrompt = buildUserPrompt;
// Erase logic exported for emulator-backed verification of the deletion receipt.
exports.eraseUserData = eraseUserData;
// Full-erasure orchestrator (Firestore wipe + Auth record) exported so the
// wipe-before-credential ordering can be unit-tested.
exports.eraseUserAccount = eraseUserAccount;
// Canonical list of owner-scoped collections wiped on account deletion. Exported
// so the deletion-receipt test can assert every tracked collection is reported.
exports.USER_DATA_COLLECTIONS = USER_DATA_COLLECTIONS;
// Prompt-context resolver exported for unit testing the registry.
exports.resolvePromptContext = resolvePromptContext;
// Response parser exported so the banned-tone output filter can be unit-tested.
exports.parseOracleResponse = parseOracleResponse;
// Follow-up arc format telemetry and its word counter, exported for unit tests
// and the fixture runner.
exports.describeResponseShape = describeResponseShape;
exports.countEntryWords = countEntryWords;
