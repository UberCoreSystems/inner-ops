/**
 * The Oracle follow-up arc, as stored — the one place that knows how an arc
 * snapshot from OracleModal lands on a journal entry or a confrontation doc,
 * how to read whether its question was left open, how "Sit with this" is
 * scheduled and read back, what the chip on a journal row says, and the words
 * the exchange is labeled with.
 *
 * Snapshot: { intent, pushback, reply, question, answer, close, commitment,
 * outcome }. Every turn writes the whole arc so far with the later fields
 * null, so a turn-2 write repairs a turn-1 write that failed, and a replaced
 * reading clears the exchange that answered it (the *_ARC_CLEARED patches).
 * `pushback` holds his turn-1 words under either text intent; `intent` says
 * whether they were a challenge or a direction.
 */
import { ORACLE_FIELDS, CONFRONTATION_FIELDS } from './schema.js';
import { toMs, getEntryTimestamp, MS_PER_DAY } from './dateUtils.js';

export const ARC_OUTCOME = Object.freeze({
  ANSWERED: 'answered',
  EVADED: 'evaded',
  UNANSWERED: 'unanswered',
});

// The four responses to a reading (Journal only). The two text intents run
// the arc; 'landed' is one Oracle turn; 'sit' is no call and a return date.
export const ARC_INTENT = Object.freeze({
  PUSH_BACK: 'push_back',
  GO_FURTHER: 'go_further',
  LANDED: 'landed',
  SIT: 'sit',
});

// A reading he sits with returns on the dashboard after this many days.
export const SIT_DAYS = 7;

// Product language for the exchange — one home. The section labels are used
// by the confrontation history panel; the Journal renderers show the exchange
// as one column and use only the commitment and the left line.
export const ARC_COPY = Object.freeze({
  challenge: 'Your challenge',
  reflection: 'Oracle — Reflection',
  answer: 'Your answer',
  closingRead: 'Oracle — Closing read',
  commitment: 'Commitment',
  leftUnanswered: 'Left unanswered.',
});

// The tag beside a closing read. Only a verdict gets one; a question left open
// is said in words, where it happened.
export function arcOutcomeBadge(outcome) {
  if (outcome === ARC_OUTCOME.ANSWERED) return { label: 'Answered', color: '#858585' };
  if (outcome === ARC_OUTCOME.EVADED) return { label: 'Evaded', color: '#f59e0b' };
  return null;
}

// A stored arc field: a non-empty string, else null.
export const arcText = (value) => (typeof value === 'string' && value.trim() ? value : null);
const outcomeOf = (value) => (Object.values(ARC_OUTCOME).includes(value) ? value : null);
const intentOf = (value) => (Object.values(ARC_INTENT).includes(value) ? value : null);
const sitCountOf = (doc) => Math.max(0, Math.floor(Number(doc?.[ORACLE_FIELDS.SIT_COUNT]) || 0));

function arcPatch(fields, snapshot = {}, nowIso = new Date().toISOString()) {
  const commitment = snapshot.commitment && arcText(snapshot.commitment.text) ? snapshot.commitment : null;
  return {
    [fields.FOLLOW_UP_PUSHBACK]: arcText(snapshot.pushback),
    [fields.FOLLOW_UP_REPLY]: arcText(snapshot.reply),
    [fields.FOLLOW_UP_QUESTION]: arcText(snapshot.question),
    [fields.FOLLOW_UP_ANSWER]: arcText(snapshot.answer),
    [fields.FOLLOW_UP_CLOSE]: arcText(snapshot.close),
    [fields.COMMITMENT]: commitment ? { ...commitment, createdAt: nowIso } : null,
    [fields.FOLLOW_UP_OUTCOME]: outcomeOf(snapshot.outcome),
  };
}

// A journal entry also carries the intent. Any arc write ends a pending sit
// and resets the dashboard stamp: the state that was surfaced is over, so
// whatever is left open next returns first again. The sit count is untouched.
export const journalArcPatch = (snapshot = {}, nowIso) => ({
  ...arcPatch(ORACLE_FIELDS, snapshot, nowIso),
  [ORACLE_FIELDS.FOLLOW_UP_INTENT]: intentOf(snapshot.intent),
  [ORACLE_FIELDS.SIT_UNTIL]: null,
  [ORACLE_FIELDS.FOLLOW_UP_SURFACED_AT]: null,
});
export const confrontationArcPatch = (snapshot, nowIso) => arcPatch(CONFRONTATION_FIELDS, snapshot, nowIso);

// A replaced reading clears everything that answered it, the intent and any
// pending sit included.
export const JOURNAL_ARC_CLEARED = Object.freeze(journalArcPatch());
export const CONFRONTATION_ARC_CLEARED = Object.freeze(arcPatch(CONFRONTATION_FIELDS));

/**
 * Whether the arc's question is still open: he left it (outcome 'unanswered'),
 * or the tab closed before anything else was written (a question, no answer,
 * no outcome). Pass CONFRONTATION_FIELDS to read a confrontation doc.
 */
export function isQuestionUnanswered(doc, fields = ORACLE_FIELDS) {
  if (!doc || !arcText(doc[fields.FOLLOW_UP_QUESTION])) return false;
  const outcome = doc[fields.FOLLOW_UP_OUTCOME];
  if (outcome === ARC_OUTCOME.UNANSWERED) return true;
  if (outcome) return false;
  return !arcText(doc[fields.FOLLOW_UP_ANSWER]);
}

// ── Sit with this ───────────────────────────────────────────────────────────

// The sit a tap records now: one more than the entry carries, due in SIT_DAYS.
export function nextSit(doc, now = new Date()) {
  return {
    count: sitCountOf(doc) + 1,
    until: new Date(toMs(now) + SIT_DAYS * MS_PER_DAY).toISOString(),
  };
}

// No call. Records the deferral, clears any exchange (none exists at idle;
// the invariant holds anyway), and resets the dashboard stamp so the reading
// returns first once its date arrives.
export function journalSitPatch(doc, now = new Date()) {
  const sit = nextSit(doc, now);
  return {
    ...arcPatch(ORACLE_FIELDS),
    [ORACLE_FIELDS.FOLLOW_UP_INTENT]: ARC_INTENT.SIT,
    [ORACLE_FIELDS.SIT_UNTIL]: sit.until,
    [ORACLE_FIELDS.SIT_COUNT]: sit.count,
    [ORACLE_FIELDS.FOLLOW_UP_SURFACED_AT]: null,
  };
}

// The sit on record, or null when he is not sitting with this reading.
export function sitRecordOf(doc) {
  if (doc?.[ORACLE_FIELDS.FOLLOW_UP_INTENT] !== ARC_INTENT.SIT) return null;
  return { count: Math.max(1, sitCountOf(doc)), until: doc[ORACLE_FIELDS.SIT_UNTIL] || null };
}

// 'pending' while the return date is ahead, 'due' once it arrives — a sit
// with no usable date is due now, never stuck hidden — null when not sitting.
export function sitStateOf(doc, now = new Date()) {
  const sit = sitRecordOf(doc);
  if (!sit) return null;
  return toMs(sit.until) > toMs(now) ? 'pending' : 'due';
}

const formatSitDate = (iso) => {
  const ms = toMs(iso);
  return ms ? new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : null;
};
const ORDINALS = ['', 'first', 'second', 'third', 'fourth', 'fifth'];
const ordinal = (n) => ORDINALS[n] || `${n}th`;
const timesWord = (n) => (n === 1 ? 'once' : n === 2 ? 'twice' : n === 3 ? 'three times' : `${n} times`);

// Where he sat with the reading. Deliberate, not avoidance: it says what
// happens next and nothing else.
export function sitLine({ count, until } = {}) {
  const date = formatSitDate(until);
  const back = date ? ` It comes back on the dashboard on ${date}.` : '';
  return count > 1 ? `Sitting with it a ${ordinal(count)} time.${back}` : `Sitting with it.${back}`;
}

// Above the choices when the reading returns. He sat with it SIT_DAYS before
// its return date.
export function setAsideLine({ count, until } = {}) {
  const ms = toMs(until);
  const date = ms ? formatSitDate(ms - SIT_DAYS * MS_PER_DAY) : null;
  if (count > 1) return `Set aside ${timesWord(count)}${date ? `, last on ${date}` : ''}.`;
  return `Set aside${date ? ` on ${date}` : ''}.`;
}

// In the entry detail, once a sit was resolved by a response.
export const sitBeforeLine = (count) => `Set aside ${timesWord(count)} before responding.`;

// ── The chip ────────────────────────────────────────────────────────────────

const LEGACY_REACTION_LABELS = Object.freeze({
  landed: 'Landed',
  disagree: 'Disagreed',
  sit: 'Sitting',
  missed: 'Missed',
});
const INTENT_LABELS = Object.freeze({
  [ARC_INTENT.PUSH_BACK]: 'Pushed back',
  [ARC_INTENT.GO_FURTHER]: 'Went further',
  [ARC_INTENT.LANDED]: 'It landed',
  [ARC_INTENT.SIT]: 'Sitting with it',
});

/**
 * The chip on a journal row and its detail: the intent plus its outcome —
 * "Pushed back · evaded", "It landed · contracted", "Sitting with it · ×2".
 * An entry with a legacy reaction and no intent keeps the old chip. Returns
 * { label, tone } or null; tone is 'neutral' | 'evaded' | 'contracted', or
 * the legacy reaction id.
 */
export function arcChipLabel(entry) {
  if (!entry) return null;
  const intent = intentOf(entry[ORACLE_FIELDS.FOLLOW_UP_INTENT]);
  if (!intent) {
    const reaction = entry.oracleReaction;
    const legacy = LEGACY_REACTION_LABELS[reaction];
    return legacy ? { label: legacy, tone: reaction } : null;
  }
  const base = INTENT_LABELS[intent];
  if (intent === ARC_INTENT.SIT) {
    const count = sitCountOf(entry);
    return { label: count > 1 ? `${base} · ×${count}` : base, tone: 'neutral' };
  }
  if (intent === ARC_INTENT.LANDED) {
    return entry[ORACLE_FIELDS.COMMITMENT]?.contractId
      ? { label: `${base} · contracted`, tone: 'contracted' }
      : { label: base, tone: 'neutral' };
  }
  const outcome = entry[ORACLE_FIELDS.FOLLOW_UP_OUTCOME];
  if (outcome === ARC_OUTCOME.EVADED) return { label: `${base} · evaded`, tone: 'evaded' };
  if (outcome === ARC_OUTCOME.ANSWERED) return { label: `${base} · answered`, tone: 'neutral' };
  if (isQuestionUnanswered(entry)) return { label: `${base} · left`, tone: 'neutral' };
  return { label: base, tone: 'neutral' };
}

// ── The pattern ─────────────────────────────────────────────────────────────

/**
 * How he responds to readings over a window: counts per current intent,
 * accepted readings that became Kill Contracts, sits that came back and got a
 * response, sits deferred more than once. Read by the Oracle's behavioral
 * context (30d) and by Synthesis (28d). Null when no entry in the window
 * carries an intent, so nothing is injected. Counts only — never his words.
 */
export function summarizeReadingResponses(entries, { windowDays = 30, now = Date.now() } = {}) {
  const nowMs = toMs(now) || Date.now();
  const windowMs = windowDays * MS_PER_DAY;
  const out = {
    windowDays,
    pushBack: 0,
    goFurther: 0,
    landed: 0,
    sit: 0,
    landedContracted: 0,
    sitsReturnedResolved: 0,
    sitsDeferredAgain: 0,
    total: 0,
  };
  for (const entry of Array.isArray(entries) ? entries : []) {
    const intent = intentOf(entry?.[ORACLE_FIELDS.FOLLOW_UP_INTENT]);
    if (!intent) continue;
    const age = nowMs - getEntryTimestamp(entry);
    if (!(age >= 0 && age <= windowMs)) continue;
    const sits = sitCountOf(entry);
    if (intent === ARC_INTENT.PUSH_BACK) out.pushBack += 1;
    else if (intent === ARC_INTENT.GO_FURTHER) out.goFurther += 1;
    else if (intent === ARC_INTENT.LANDED) {
      out.landed += 1;
      if (entry[ORACLE_FIELDS.COMMITMENT]?.contractId) out.landedContracted += 1;
    } else {
      out.sit += 1;
      if (sits >= 2) out.sitsDeferredAgain += 1;
    }
    if (intent !== ARC_INTENT.SIT && sits > 0) out.sitsReturnedResolved += 1;
    out.total += 1;
  }
  return out.total > 0 ? out : null;
}
