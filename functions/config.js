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

// Rate limiting: max Oracle calls per user per day.
exports.DAILY_LIMIT = intFromEnv("ORACLE_DAILY_LIMIT", 20);

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
