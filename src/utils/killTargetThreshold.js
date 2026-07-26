// Read-time resolver for a contract's kill threshold (consecutive held days).
// Historic docs used a three-tier difficulty field (surface/deep/core) and an
// older priority field before the numeric consecutiveDaysRequired existed —
// map both here so nothing needs a Firestore migration. Single source of
// truth shared by the Ledger page (kill logic) and every card that displays
// the "Kill requires N days" copy, so display can never disagree with the
// threshold the kill actually fires on.
export const LEGACY_DIFFICULTY_TO_DAYS = { surface: 21, deep: 30, core: 60 };
export const LEGACY_PRIORITY_TO_DAYS = { high: 60, medium: 30, low: 21 };
export const MIN_DAYS_REQUIRED = 21;

export const getConsecutiveDaysRequired = (target) => {
  const raw = Number(target?.consecutiveDaysRequired);
  if (Number.isFinite(raw) && raw >= MIN_DAYS_REQUIRED) return Math.floor(raw);
  if (target?.difficulty && LEGACY_DIFFICULTY_TO_DAYS[target.difficulty]) {
    return LEGACY_DIFFICULTY_TO_DAYS[target.difficulty];
  }
  if (target?.priority && LEGACY_PRIORITY_TO_DAYS[target.priority]) {
    return LEGACY_PRIORITY_TO_DAYS[target.priority];
  }
  return 30;
};
