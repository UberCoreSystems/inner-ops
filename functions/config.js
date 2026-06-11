/**
 * Cloud Functions configuration constants.
 *
 * Each constant accepts an env-var override so calibration can change without
 * a code deploy. To override in Firebase Functions, set the environment
 * variable on the function (or via Firebase Functions params for v2). When
 * unset, the safe default below is used.
 */

const intFromEnv = (name, fallback) => {
  const raw = process.env[name];
  if (raw == null || raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
};

// BER-167: Oracle trust calibration — behavioral record density threshold.
// Below this count the Oracle uses a discrepancy-pointing frame instead of
// archetype/pattern confrontation. Trigger is entry count, not calendar time.
exports.TRUST_THRESHOLD = intFromEnv("ORACLE_TRUST_THRESHOLD", 21);

// Input hard caps — reject oversize payloads before touching the LLM.
exports.MAX_ENTRY_TEXT_CHARS = intFromEnv("ORACLE_MAX_ENTRY_TEXT_CHARS", 20000);
exports.MAX_USER_RESPONSE_CHARS = intFromEnv("ORACLE_MAX_USER_RESPONSE_CHARS", 8000);
exports.MAX_FEEDBACK_CHARS = intFromEnv("ORACLE_MAX_FEEDBACK_CHARS", 8000);
exports.MAX_REACTANCE_SUMMARY_CHARS = intFromEnv("ORACLE_MAX_REACTANCE_SUMMARY_CHARS", 500);
exports.MAX_REACTANCE_QUESTION_CHARS = intFromEnv("ORACLE_MAX_REACTANCE_QUESTION_CHARS", 300);

// ─── Long-term AI memory ────────────────────────────────────────────────
// Separate daily cap for memory-updater Haiku calls — kept OFF the Oracle
// pool so memory generation never drains the user's feedback budget. One
// finalized entry ≈ 1 module update (+ at most 1 global refresh), so this
// bounds abuse without throttling normal use.
exports.MEMORY_DAILY_LIMIT = intFromEnv("MEMORY_DAILY_LIMIT", 80);
// Receipt + content caps (mirror src/utils/memoryConstants.js).
exports.MEMORY_MAX_RECEIPTS = intFromEnv("MEMORY_MAX_RECEIPTS", 5);
exports.MEMORY_RECEIPT_MAX_WORDS = intFromEnv("MEMORY_RECEIPT_MAX_WORDS", 25);
exports.MEMORY_MODULE_CONTENT_MAX_CHARS = intFromEnv("MEMORY_MODULE_CONTENT_MAX_CHARS", 3200); // ≈800 tokens
exports.MEMORY_GLOBAL_CONTENT_MAX_CHARS = intFromEnv("MEMORY_GLOBAL_CONTENT_MAX_CHARS", 4800); // ≈1,200 tokens
// Global refresh debounce — rebuild `global` only if its last refresh is older
// than this. Time-based (no counter state); bounds cost to ≤4 refreshes/day.
exports.MEMORY_GLOBAL_REFRESH_HOURS = intFromEnv("MEMORY_GLOBAL_REFRESH_HOURS", 6);
// Hard cap on injected memory characters per Oracle call (≤ ~2,000 input tokens).
exports.MEMORY_INJECTION_MAX_CHARS = intFromEnv("MEMORY_INJECTION_MAX_CHARS", 8000);
// Idempotency: cap on remembered processed-entry keys (FIFO).
exports.MEMORY_PROCESSED_IDS_CAP = intFromEnv("MEMORY_PROCESSED_IDS_CAP", 50);
// Memory doc schema version.
exports.MEMORY_SCHEMA_VERSION = 1;
