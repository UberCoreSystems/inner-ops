/**
 * Per-call token + cost telemetry for every Anthropic call (Oracle, follow-up,
 * and the Haiku memory-compression calls). MEASURE-ONLY: this module never
 * touches prompt content or model behavior — it reads the `usage` object off a
 * completed response and records token counts + a derived cost.
 *
 * Privacy: records ONLY uid + metadata + token counts + derived cost. NEVER
 * entry text, prompt content, or any user words.
 *
 * Storage (server-only, mirrors the _rateLimits pattern — Admin SDK writes,
 * all client access denied by firestore.rules):
 *   users/{uid}/_usage/{autoId}          — one row per call (source of truth)
 *   users/{uid}/_usageRollups/{YYYY-MM}  — per-uid monthly rollup (atomic incr)
 * Both are purged automatically by deleteUserData's recursiveDelete(users/{uid}).
 *
 * Tokens are the source of truth; cost is DERIVED from the editable RATES below
 * so a past month can be re-priced by recomputing from the stored token counts.
 */

const { getFirestore, FieldValue } = require("firebase-admin/firestore");

// ── Editable rate card — USD per 1,000,000 tokens (as of June 2026) ──────────
// To re-rate, change these and recompute costUSD from stored token counts.
const RATES = {
  "claude-sonnet-4-6": { in: 3, out: 15 },
  "claude-haiku-4-5": { in: 1, out: 5 },
};
// Cache read is billed at ~10% of the input rate; cache write at 1.25x input.
const CACHE_READ_MULT = 0.1;
const CACHE_WRITE_MULT = 1.25;

const USAGE_COLLECTION = "_usage";
const USAGE_ROLLUP_COLLECTION = "_usageRollups";

function monthKey(now = new Date()) {
  return now.toISOString().slice(0, 7); // YYYY-MM (UTC)
}

/**
 * Derive cost in USD from token counts. The Anthropic usage object reports
 * input_tokens, cache_creation_input_tokens, and cache_read_input_tokens as
 * NON-overlapping buckets (total input = their sum), so each is priced
 * separately with no double-count. Unknown model → cost 0 (counts still log).
 */
function computeCostUSD(model, { input = 0, output = 0, cacheWrite = 0, cacheRead = 0 }) {
  const rate = RATES[model];
  if (!rate) return 0;
  const perToken = (perMillion) => perMillion / 1_000_000;
  const cost =
    input * perToken(rate.in) +
    output * perToken(rate.out) +
    cacheWrite * perToken(rate.in) * CACHE_WRITE_MULT +
    cacheRead * perToken(rate.in) * CACHE_READ_MULT;
  // Round to 6 decimals — sub-micro-dollar precision is noise.
  return Math.round(cost * 1e6) / 1e6;
}

// Coerce a usage field (number | null | undefined) to a non-negative integer.
function n(value) {
  const x = Number(value);
  return Number.isFinite(x) && x > 0 ? Math.floor(x) : 0;
}

/**
 * Write one usage row + bump the monthly rollup in a single atomic batch.
 * Async; callers should NOT await this in the request path — use logUsage().
 */
async function recordUsage({ uid, model, callType, usage }) {
  if (!uid) return;
  const input = n(usage?.input_tokens);
  const output = n(usage?.output_tokens);
  const cacheWrite = n(usage?.cache_creation_input_tokens);
  const cacheRead = n(usage?.cache_read_input_tokens);
  const costUSD = computeCostUSD(model, { input, output, cacheWrite, cacheRead });

  const db = getFirestore();
  const month = monthKey();
  const batch = db.batch();

  const rowRef = db.collection("users").doc(uid).collection(USAGE_COLLECTION).doc();
  batch.set(rowRef, {
    uid,
    model: model || null,
    callType: callType || null,
    timestamp: FieldValue.serverTimestamp(),
    inputTokens: input,
    outputTokens: output,
    cacheCreationInputTokens: cacheWrite,
    cacheReadInputTokens: cacheRead,
    costUSD,
  });

  const rollupRef = db
    .collection("users")
    .doc(uid)
    .collection(USAGE_ROLLUP_COLLECTION)
    .doc(month);
  batch.set(
    rollupRef,
    {
      uid,
      month,
      inputTokens: FieldValue.increment(input),
      outputTokens: FieldValue.increment(output),
      cacheCreationInputTokens: FieldValue.increment(cacheWrite),
      cacheReadInputTokens: FieldValue.increment(cacheRead),
      costUSD: FieldValue.increment(costUSD),
      callCount: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  await batch.commit();
}

/**
 * Fire-and-forget usage logging. Returns immediately; the write completes out
 * of band so it adds no latency to the user's response, and any failure is
 * swallowed so telemetry can never break the Oracle call.
 *
 * Caveat: in a serverless runtime an un-awaited write can occasionally be lost
 * if the instance is frozen right after the response is sent. That is the
 * accepted trade for "non-blocking" — this is best-effort cost telemetry, not
 * billing of record (token counts on each row remain the source of truth).
 */
function logUsage({ uid, model, callType, usage }) {
  try {
    recordUsage({ uid, model, callType, usage }).catch((error) => {
      console.error("usage.log.error", { name: error?.name });
    });
  } catch (error) {
    console.error("usage.log.error", { name: error?.name });
  }
}

module.exports = {
  RATES,
  CACHE_READ_MULT,
  CACHE_WRITE_MULT,
  USAGE_COLLECTION,
  USAGE_ROLLUP_COLLECTION,
  monthKey,
  computeCostUSD,
  recordUsage,
  logUsage,
};
