/**
 * Hard Lessons draft model — pure helpers shared by the page and the form.
 *
 * A draft needs only the event. Finalizing ("locking") needs every field. The
 * Oracle may fill the forensic fields (marked in `oracleFilled`) but never the
 * lesson or the rule: its versions ride `oracleSuggestion` until the user takes
 * them. A break the user links from a lesson is recorded on the matched rule's
 * own `violations[]` — the shape every reader in ruleState.js already counts.
 */
import { localDateKey, toMs } from './dateUtils.js';

export const EVENT_CATEGORIES = Object.freeze([
  { value: 'relationship_misjudgment', label: 'Relationship misjudgment' },
  { value: 'leadership_error', label: 'Leadership error' },
  { value: 'boundary_failure', label: 'Boundary failure' },
  { value: 'overconfidence', label: 'Overconfidence' },
  { value: 'underestimation', label: 'Underestimation' },
  { value: 'ignored_intuition', label: 'Ignored intuition' },
  { value: 'physiological_misread', label: 'Physiological misread' },
  { value: 'trust_without_verification', label: 'Trust without verification' },
  { value: 'other', label: 'Other' },
]);

export const COST_CATEGORIES = Object.freeze([
  { value: 'emotional', label: 'Emotional' },
  { value: 'financial', label: 'Financial' },
  { value: 'relational', label: 'Relational' },
  { value: 'physical', label: 'Physical' },
  { value: 'professional', label: 'Professional' },
  { value: 'time', label: 'Time / opportunity' },
]);

const CATEGORY_VALUES = new Set(EVENT_CATEGORIES.map(c => c.value));
const COST_VALUES = new Set(COST_CATEGORIES.map(c => c.value));

export const categoryLabel = (value) => EVENT_CATEGORIES.find(c => c.value === value)?.label || '';
export const costLabel = (value) => COST_CATEGORIES.find(c => c.value === value)?.label || value;

// Form order. Event first: capture is the event; the rest is analysis.
export const FINALIZE_FIELDS = Object.freeze([
  'eventDescription',
  'eventCategory',
  'myAssumption',
  'signalIgnored',
  'costs',
  'costDescription',
  'extractedLesson',
  'ruleGoingForward',
]);

export const FIELD_LABELS = Object.freeze({
  eventDescription: 'The event',
  eventCategory: 'Category',
  myAssumption: 'My assumption',
  signalIgnored: 'The signal I ignored',
  costs: 'Cost type',
  costDescription: 'The cost',
  extractedLesson: 'The lesson',
  ruleGoingForward: 'The rule going forward',
});

const SOURCE_KEYS = ['sourceSignalId', 'sourceJournalId', 'sourceKillTargetId'];

const str = (v) => (typeof v === 'string' ? v : '');
const trimmed = (v) => str(v).trim();

export const emptyDraft = () => ({
  eventCategory: '',
  eventDescription: '',
  myAssumption: '',
  signalIgnored: '',
  costs: [],
  costDescription: '',
  extractedLesson: '',
  ruleGoingForward: '',
  oracleFilled: [],
  oracleSuggestion: null,
  isOracleExtracted: false,
});

export const canSaveDraft = (draft) => trimmed(draft?.eventDescription).length > 0;

export function missingForFinalize(draft) {
  return FINALIZE_FIELDS.filter((key) => {
    if (key === 'costs') return !(Array.isArray(draft?.costs) && draft.costs.length > 0);
    return !trimmed(draft?.[key]);
  });
}

const validCosts = (costs) =>
  Array.isArray(costs) ? [...new Set(costs.filter(c => COST_VALUES.has(c)))] : [];

const normalizeSuggestion = (lesson, rule) => {
  const extractedLesson = trimmed(lesson);
  const ruleGoingForward = trimmed(rule);
  return extractedLesson || ruleGoingForward ? { extractedLesson, ruleGoingForward } : null;
};

const copySources = (from) => {
  const out = {};
  for (const key of SOURCE_KEYS) if (trimmed(from?.[key])) out[key] = from[key];
  return out;
};

/** Which bridge a draft came through, derived from the ids it carries. */
export function lessonSource(draft) {
  if (draft?.sourceSignalId) return 'signal';
  if (draft?.sourceJournalId) return 'journal';
  if (draft?.sourceKillTargetId) return 'ledger';
  return 'direct';
}

/**
 * Normalize an `hl_bridge_prefill` payload (Signal, Journal or Ledger) into a
 * draft. The Journal payload is Oracle output: its lesson and rule become a
 * suggestion, everything else it filled is marked as the Oracle's.
 */
export function lessonFromPrefill(prefill) {
  const draft = emptyDraft();
  if (!prefill || typeof prefill !== 'object') return draft;
  Object.assign(draft, copySources(prefill));
  draft.eventDescription = trimmed(prefill.eventDescription);

  if (prefill.isOracleExtracted) {
    draft.isOracleExtracted = true;
    const filled = [];
    if (draft.eventDescription) filled.push('eventDescription');
    if (CATEGORY_VALUES.has(prefill.eventCategory)) {
      draft.eventCategory = prefill.eventCategory;
      filled.push('eventCategory');
    }
    for (const key of ['myAssumption', 'signalIgnored', 'costDescription']) {
      const v = trimmed(prefill[key]);
      if (v) { draft[key] = v; filled.push(key); }
    }
    const costs = validCosts(prefill.costs);
    if (costs.length) { draft.costs = costs; filled.push('costs'); }
    draft.oracleFilled = filled;
    draft.oracleSuggestion = normalizeSuggestion(prefill.extractedLesson, prefill.ruleGoingForward);
  }
  return draft;
}

/** Draft shape for an existing lesson doc being edited. */
export function draftFromLesson(lesson) {
  const draft = emptyDraft();
  for (const key of FINALIZE_FIELDS) {
    if (key === 'costs') draft.costs = validCosts(lesson?.costs);
    else draft[key] = str(lesson?.[key]);
  }
  draft.oracleFilled = Array.isArray(lesson?.oracleFilled) ? lesson.oracleFilled.filter(k => typeof k === 'string') : [];
  draft.oracleSuggestion = lesson?.oracleSuggestion
    ? normalizeSuggestion(lesson.oracleSuggestion.extractedLesson, lesson.oracleSuggestion.ruleGoingForward)
    : null;
  draft.isOracleExtracted = !!lesson?.isOracleExtracted;
  Object.assign(draft, copySources(lesson));
  return draft;
}

/** Apply a user edit. Any edited field stops being the Oracle's. */
export function applyEdit(draft, patch) {
  const edited = new Set(Object.keys(patch || {}));
  return {
    ...draft,
    ...patch,
    oracleFilled: (draft?.oracleFilled || []).filter(k => !edited.has(k)),
  };
}

/** Take the Oracle's version of the lesson or the rule into the field. */
export function takeSuggestion(draft, field) {
  const text = trimmed(draft?.oracleSuggestion?.[field]);
  if (!text || (field !== 'extractedLesson' && field !== 'ruleGoingForward')) return draft;
  const filled = new Set(draft.oracleFilled || []);
  filled.add(field);
  return { ...draft, [field]: text, oracleFilled: [...filled] };
}

/**
 * Fold an Oracle extraction into a draft. Fills a forensic field only when it
 * is empty or still the Oracle's own text; never touches the event, the lesson
 * or the rule; replaces the lesson/rule suggestion.
 */
export function mergeExtraction(draft, extraction) {
  if (!extraction || typeof extraction !== 'object') return draft;
  const next = { ...draft };
  const filled = new Set(draft?.oracleFilled || []);
  const open = (key) => filled.has(key) || (key === 'costs' ? !(draft?.costs || []).length : !trimmed(draft?.[key]));

  if (open('eventCategory') && CATEGORY_VALUES.has(extraction.suggestedCategory)) {
    next.eventCategory = extraction.suggestedCategory;
    filled.add('eventCategory');
  }
  for (const key of ['myAssumption', 'signalIgnored', 'costDescription']) {
    const v = trimmed(extraction[key]);
    if (v && open(key)) { next[key] = v; filled.add(key); }
  }
  const costs = validCosts(extraction.suggestedCosts);
  if (costs.length && open('costs')) { next.costs = costs; filled.add('costs'); }

  next.oracleFilled = [...filled];
  next.oracleSuggestion = normalizeSuggestion(extraction.extractedLesson, extraction.ruleGoingForward) || draft?.oracleSuggestion || null;
  next.isOracleExtracted = true;
  return next;
}

/**
 * The Firestore payload for a save. A whitelist: legacy `isRuleViolation` /
 * `violatedRuleId`, `id`, `timestamp` and every other server- or path-managed
 * key stay out, so an update never rewrites them (updateDoc merges).
 */
export function buildLessonPayload(draft, { finalize = false, nowIso = new Date().toISOString() } = {}) {
  const payload = {
    eventCategory: CATEGORY_VALUES.has(draft?.eventCategory) ? draft.eventCategory : '',
    eventDescription: trimmed(draft?.eventDescription),
    myAssumption: trimmed(draft?.myAssumption),
    signalIgnored: trimmed(draft?.signalIgnored),
    costs: validCosts(draft?.costs),
    costDescription: trimmed(draft?.costDescription),
    extractedLesson: trimmed(draft?.extractedLesson),
    ruleGoingForward: trimmed(draft?.ruleGoingForward),
    oracleFilled: Array.isArray(draft?.oracleFilled) ? [...new Set(draft.oracleFilled)] : [],
    oracleSuggestion: finalize ? null : (draft?.oracleSuggestion || null),
    isOracleExtracted: !!draft?.isOracleExtracted,
    isFinalized: !!finalize,
    finalizedAt: finalize ? nowIso : null,
    ...copySources(draft),
  };
  return payload;
}

const draftComparable = (draft) => JSON.stringify(buildLessonPayload(draft, { nowIso: '' }));
export const draftsEqual = (a, b) => draftComparable(a) === draftComparable(b);

// ── Rule match ─────────────────────────────────────────────────────────────

const tokenize = (text) =>
  String(text || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 3);

/**
 * Token-overlap match of an event against the user's finalized rules. Only
 * rules finalized before `beforeMs` are offered (a rule cannot be broken by an
 * event it was written after), and never the lesson itself.
 */
export function findMatchingRule(description, lessons, { beforeMs = Infinity, excludeId = null } = {}) {
  const descTokens = new Set(tokenize(description));
  if (descTokens.size < 3) return null;
  let bestMatch = null;
  let bestScore = 0;
  for (const l of Array.isArray(lessons) ? lessons : []) {
    if (!l?.isFinalized || !trimmed(l.ruleGoingForward)) continue;
    if (excludeId && l.id === excludeId) continue;
    const finalizedMs = toMs(l.finalizedAt) || toMs(l.createdAt);
    if (finalizedMs && finalizedMs >= beforeMs) continue;
    const ruleSet = new Set(tokenize(`${l.ruleGoingForward} ${l.extractedLesson || ''}`));
    let intersection = 0;
    descTokens.forEach(t => { if (ruleSet.has(t)) intersection++; });
    const score = intersection / Math.max(descTokens.size, ruleSet.size, 1);
    if (score > bestScore) { bestScore = score; bestMatch = l; }
  }
  return bestScore >= 0.12 ? bestMatch : null;
}

/** The rule this lesson already recorded a break on, if any. */
export function findLinkedRule(lessons, lessonId) {
  if (!lessonId) return null;
  return (Array.isArray(lessons) ? lessons : []).find(l =>
    Array.isArray(l?.violations) && l.violations.some(v => v?.lessonId === lessonId)
  ) || null;
}

// ── Breaks linked from a lesson ───────────────────────────────────────────

const breakDate = (v) => v?.date || v?.timestamp || null;
const isOpenBreak = (v) => !v?.resolvedAt && !trimmed(v?.note);

/**
 * Update for a rule when the user says this lesson broke it. If the rule
 * already holds an open break dated today, the lesson attaches to it (one
 * event, not two); otherwise a new break is appended. Null when already linked.
 */
export function linkLessonBreak(rule, lessonId, nowIso = new Date().toISOString()) {
  if (!rule || !lessonId) return null;
  const violations = Array.isArray(rule.violations) ? rule.violations : [];
  if (violations.some(v => v?.lessonId === lessonId)) return null;
  const today = localDateKey(nowIso);
  let idx = -1;
  violations.forEach((v, i) => {
    const d = breakDate(v);
    if (d && localDateKey(d) === today && isOpenBreak(v) && !v?.lessonId) idx = i;
  });
  if (idx >= 0) {
    return { violations: violations.map((v, i) => (i === idx ? { ...v, lessonId } : v)) };
  }
  return {
    violations: [...violations, { date: nowIso, source: 'lesson', lessonId }],
    lastViolatedAt: nowIso,
  };
}

/**
 * Close the break a lesson linked, using the lesson as its after-action
 * review. Only an open break, and only from text the user wrote: Synthesis
 * quotes `cause` as the user's own words, so Oracle-filled text never lands
 * there — such a break stays open for the after-action review instead.
 */
export function closeLessonBreak(rule, lessonId, lesson, nowIso = new Date().toISOString()) {
  if (!rule || !lessonId) return null;
  const violations = Array.isArray(rule.violations) ? rule.violations : [];
  const idx = violations.findIndex(v => v?.lessonId === lessonId);
  if (idx < 0 || !isOpenBreak(violations[idx])) return null;
  const oracle = new Set(lesson?.oracleFilled || []);
  const userText = (key) => (oracle.has(key) ? '' : trimmed(lesson?.[key]));
  const cause = userText('signalIgnored') || userText('myAssumption');
  const correction = userText('ruleGoingForward');
  if (!cause || !correction) return null;
  return {
    violations: violations.map((v, i) => (i === idx ? { ...v, cause, correction, resolvedAt: nowIso } : v)),
  };
}

// ── Unsaved form, kept on this device ──────────────────────────────────────
// localStorage can throw (Safari private mode, blocked storage); every
// accessor swallows and fails toward "nothing stored".

const localKey = (uid) => `inner_ops_hl_draft_${uid}`;

export function readLocalDraft(uid) {
  if (!uid) return null;
  try {
    const raw = globalThis.localStorage?.getItem(localKey(uid));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !parsed.draft) return null;
    return { draft: { ...emptyDraft(), ...parsed.draft }, editingId: parsed.editingId || null, savedAt: parsed.savedAt || null };
  } catch {
    return null;
  }
}

export function writeLocalDraft(uid, { draft, editingId = null }) {
  if (!uid || !draft) return;
  try {
    globalThis.localStorage?.setItem(localKey(uid), JSON.stringify({ draft, editingId, savedAt: new Date().toISOString() }));
  } catch { /* noop */ }
}

export function clearLocalDraft(uid) {
  if (!uid) return;
  try {
    globalThis.localStorage?.removeItem(localKey(uid));
  } catch { /* noop */ }
}
