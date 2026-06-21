/**
 * crossModuleCorrelation — pure-data temporal lead/lag engine.
 *
 * Mirrors getBehavioralContext: an async reader/normalizer (getCrossModule-
 * Correlations) wrapping a deterministic pure core (computeCorrelations), with
 * `deps.readUserData` injection for tests. No UI, no side effects in the core.
 *
 * It answers one question: does event-type A tend to precede event-type B
 * within a window W more often than B's own base rate would predict?
 *
 * RESOLUTION DISCIPLINE (non-negotiable):
 *   - Relapse / Journal / Hard Lessons events carry ISO datetimes → sub-day.
 *   - Kill List events (escape / check-in / created / killed) are DAY-resolution
 *     only and are forced to 'daily' regardless of how they were stored.
 *   - A correlation is sub-day ONLY when BOTH events are sub-day. Any pair that
 *     touches a Kill List event is therefore daily — never hour-level precision.
 *
 * TRUST GATE: below ~21 total entries there is not enough behavioral record to
 * support pattern claims, so the engine returns status:'insufficient-signal'
 * and emits nothing. The threshold is the shared PATTERN_TRUST_MIN_ENTRIES
 * constant in schema.js (BER-194), also consumed by aiFeedback.
 */

import { readUserData } from './firebaseUtils.js';
import logger from './logger.js';
import {
  COLLECTIONS,
  RELAPSE_FIELDS,
  RELAPSE_ENTRY_TYPES,
  KILL_TARGET_FIELDS,
  HARD_LESSON_FIELDS,
  PATTERN_TRUST_MIN_ENTRIES,
} from './schema.js';
import { getEntryTimestamp, toMs, MS_PER_DAY } from './dateUtils.js';

// Trust gate is the single shared constant in schema.js (BER-194). Re-exported
// here so engine consumers can import it alongside the engine.
export { PATTERN_TRUST_MIN_ENTRIES };
export const DEFAULT_WINDOW_DAYS = 3;
export const DEFAULT_MIN_SUPPORT = 3;

const MS_PER_HOUR = 60 * 60 * 1000;

// A full ISO datetime carries a time component ("T..:..": sub-day). A bare
// YYYY-MM-DD (or a Date/Timestamp we can't prove carries intraday precision)
// is day-resolution. Numbers (ms) are treated as sub-day instants.
function isSubDayValue(value) {
  if (value == null) return false;
  if (typeof value === 'number') return true;
  if (typeof value === 'string') return /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value);
  return false; // Firestore Timestamp / Date — not proven intraday here
}

const dayIndexOf = (tMs) => Math.floor(tMs / MS_PER_DAY);

function makeEvent(type, rawValue, { forceDaily = false } = {}, fallbackMs = 0) {
  const tMs = toMs(rawValue) || fallbackMs;
  if (!tMs) return null;
  const resolution = !forceDaily && isSubDayValue(rawValue) ? 'sub-day' : 'daily';
  return { type, tMs, dayIndex: dayIndexOf(tMs), resolution };
}

/**
 * Normalize raw module docs into a flat, time-sorted event list.
 * Pure — no reads.
 */
export function extractEvents({
  killTargets = [],
  relapseEntries = [],
  hardLessons = [],
  journalEntries = [],
} = {}) {
  const events = [];

  // --- Relapse Radar: signal vs relapse, ISO event time (eventOccurredAt) ---
  for (const e of relapseEntries) {
    const isRelapse = e?.[RELAPSE_FIELDS.ENTRY_TYPE] === RELAPSE_ENTRY_TYPES.RELAPSE;
    const type = isRelapse ? 'relapse:relapse' : 'relapse:signal';
    const ev = makeEvent(type, e?.eventOccurredAt, {}, getEntryTimestamp(e));
    if (ev) events.push(ev);
  }

  // --- Journaling: one event per entry, ISO event time ---
  for (const e of journalEntries) {
    const ev = makeEvent('journal:entry', e?.eventOccurredAt, {}, getEntryTimestamp(e));
    if (ev) events.push(ev);
  }

  // --- Hard Lessons: one event per logged violation (date, ISO) ---
  for (const l of hardLessons) {
    const violations = l?.[HARD_LESSON_FIELDS.VIOLATIONS];
    if (Array.isArray(violations) && violations.length) {
      for (const v of violations) {
        const ev = makeEvent('hardlesson:violation', v?.date);
        if (ev) events.push(ev);
      }
    } else if (l?.[HARD_LESSON_FIELDS.IS_VIOLATION]) {
      // Legacy doc with no violations[] array — fall back to lastViolatedAt,
      // then the doc's own timestamp.
      const ev = makeEvent(
        'hardlesson:violation',
        l?.[HARD_LESSON_FIELDS.LAST_VIOLATED_AT],
        {},
        getEntryTimestamp(l),
      );
      if (ev) events.push(ev);
    }
  }

  // --- Kill List: state changes / escapes / check-ins. ALWAYS daily. ---
  for (const t of killTargets) {
    const createdEv = makeEvent('killlist:created', t?.createdAt, { forceDaily: true });
    if (createdEv) events.push(createdEv);

    if (t?.[KILL_TARGET_FIELDS.STATUS] === 'killed') {
      const killedEv = makeEvent('killlist:killed', t?.killedAt, { forceDaily: true }, getEntryTimestamp(t));
      if (killedEv) events.push(killedEv);
    }

    const escapes = t?.[KILL_TARGET_FIELDS.ESCAPES];
    if (Array.isArray(escapes)) {
      for (const x of escapes) {
        const ev = makeEvent('killlist:escape', x?.date, { forceDaily: true });
        if (ev) events.push(ev);
      }
    }

    const checkIns = t?.checkIns;
    if (Array.isArray(checkIns)) {
      for (const c of checkIns) {
        const type = c?.held === false ? 'killlist:checkin_broke' : 'killlist:checkin_held';
        const ev = makeEvent(type, c?.date, { forceDaily: true });
        if (ev) events.push(ev);
      }
    }
  }

  // Stable order: time, then type — makes the whole pipeline deterministic.
  events.sort((a, b) => a.tMs - b.tMs || (a.type < b.type ? -1 : a.type > b.type ? 1 : 0));
  return events;
}

// Median of a numeric array (sorted copy). Empty → 0.
function median(nums) {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// Build a lag histogram + summary at the pair's resolution. Sub-day → hours;
// daily → whole days. Lags are A→nearest-following-B, one sample per qualifying A.
function buildLagDistribution(lagsMs, resolution) {
  if (resolution === 'sub-day') {
    const hours = lagsMs.map((ms) => ms / MS_PER_HOUR);
    const histo = new Map();
    for (const h of hours) {
      const bucket = Math.floor(h); // 1-hour buckets
      histo.set(bucket, (histo.get(bucket) || 0) + 1);
    }
    return {
      unit: 'hours',
      samples: hours.length,
      min: hours.length ? Math.min(...hours) : 0,
      median: median(hours),
      max: hours.length ? Math.max(...hours) : 0,
      histogram: [...histo.entries()].sort((a, b) => a[0] - b[0]).map(([bucket, count]) => ({ bucket, count })),
    };
  }
  // daily
  const days = lagsMs.map((ms) => Math.round(ms / MS_PER_DAY));
  const histo = new Map();
  for (const d of days) histo.set(d, (histo.get(d) || 0) + 1);
  return {
    unit: 'days',
    samples: days.length,
    min: days.length ? Math.min(...days) : 0,
    median: median(days),
    max: days.length ? Math.max(...days) : 0,
    histogram: [...histo.entries()].sort((a, b) => a[0] - b[0]).map(([bucket, count]) => ({ bucket, count })),
  };
}

/**
 * Deterministic correlation core. Pure.
 *
 * @param {Event[]} events
 * @param {Object}  opts
 * @param {number}  opts.entryCount  total docs across the four modules (trust gate)
 * @param {number}  [opts.windowDays=DEFAULT_WINDOW_DAYS]
 * @param {number}  [opts.minSupport=DEFAULT_MIN_SUPPORT]
 * @param {number}  [opts.minEntries=PATTERN_TRUST_MIN_ENTRIES]
 * @returns {{correlations: Array, status: 'ok'|'insufficient-signal'}}
 */
export function computeCorrelations(events, opts = {}) {
  const {
    entryCount = 0,
    windowDays = DEFAULT_WINDOW_DAYS,
    minSupport = DEFAULT_MIN_SUPPORT,
    minEntries = PATTERN_TRUST_MIN_ENTRIES,
  } = opts;

  if (entryCount < minEntries) {
    return { correlations: [], status: 'insufficient-signal' };
  }

  const sorted = [...events].sort(
    (a, b) => a.tMs - b.tMs || (a.type < b.type ? -1 : a.type > b.type ? 1 : 0),
  );
  if (sorted.length < 2) return { correlations: [], status: 'ok' };

  // Group events by type; compute the observation span once.
  const byType = new Map();
  for (const ev of sorted) {
    if (!byType.has(ev.type)) byType.set(ev.type, []);
    byType.get(ev.type).push(ev);
  }
  const spanMs = Math.max(MS_PER_DAY, sorted[sorted.length - 1].tMs - sorted[0].tMs);
  const windowMs = windowDays * MS_PER_DAY;

  const types = [...byType.keys()].sort();
  const correlations = [];

  for (const a of types) {
    const aEvents = byType.get(a);
    for (const b of types) {
      if (a === b) continue;
      const bEvents = byType.get(b);
      const countB = bEvents.length;
      if (!countB) continue;

      // A pair is sub-day only when BOTH types are entirely sub-day. Any daily
      // event in either type forces the whole correlation to daily resolution.
      const aSubDay = aEvents.every((e) => e.resolution === 'sub-day');
      const bSubDay = bEvents.every((e) => e.resolution === 'sub-day');
      const resolution = aSubDay && bSubDay ? 'sub-day' : 'daily';

      // For each A occurrence, find the nearest B strictly after it within W.
      const lagsMs = [];
      for (const aEv of aEvents) {
        let best = null;
        for (const bEv of bEvents) {
          const lag = bEv.tMs - aEv.tMs;
          if (lag > 0 && lag <= windowMs) {
            if (best === null || lag < best) best = lag;
          }
        }
        if (best !== null) lagsMs.push(best);
      }

      const support = lagsMs.length;
      if (support < minSupport) continue;

      const confidence = support / aEvents.length;
      // Baseline: expected probability that at least one B falls in a random
      // window W, from B's base rate over the observation span.
      const baseline = Math.min(1, (countB * windowMs) / spanMs);
      if (baseline <= 0) continue;
      const lift = confidence / baseline;
      if (lift <= 1) continue; // must beat baseline to be a real lead/lag signal

      correlations.push({
        antecedent: a,
        consequent: b,
        lagDistribution: buildLagDistribution(lagsMs, resolution),
        support,
        confidence,
        baseline,
        lift,
        resolution,
      });
    }
  }

  // Deterministic ordering: strongest lift first, then support, then names.
  correlations.sort(
    (x, y) =>
      y.lift - x.lift ||
      y.support - x.support ||
      (x.antecedent < y.antecedent ? -1 : x.antecedent > y.antecedent ? 1 : 0) ||
      (x.consequent < y.consequent ? -1 : x.consequent > y.consequent ? 1 : 0),
  );

  return { correlations, status: 'ok' };
}

/**
 * Async entry point. Reads every module via readUserData (or deps.readUserData
 * in tests), normalizes, and runs the deterministic core. Returns the empty
 * 'insufficient-signal' shape on any read failure rather than throwing.
 */
export async function getCrossModuleCorrelations(userId, deps = {}) {
  if (!userId) return { correlations: [], status: 'insufficient-signal' };
  const reader = deps.readUserData || readUserData;

  try {
    const load = (name) =>
      reader(name).catch((err) => {
        logger.warn('cross-module correlation fetch failed', { collection: name, err: err?.message });
        return [];
      });

    const [killTargets, relapseEntries, hardLessons, journalEntries] = await Promise.all([
      load(COLLECTIONS.KILL_TARGETS),
      load(COLLECTIONS.RELAPSE_ENTRIES),
      load(COLLECTIONS.HARD_LESSONS),
      load(COLLECTIONS.JOURNAL_ENTRIES),
    ]);

    const entryCount =
      (killTargets || []).length +
      (relapseEntries || []).length +
      (hardLessons || []).length +
      (journalEntries || []).length;

    const events = extractEvents({ killTargets, relapseEntries, hardLessons, journalEntries });
    return computeCorrelations(events, {
      entryCount,
      windowDays: deps.windowDays ?? DEFAULT_WINDOW_DAYS,
      minSupport: deps.minSupport ?? DEFAULT_MIN_SUPPORT,
    });
  } catch (err) {
    logger.warn('cross-module correlation build failed', err?.message);
    return { correlations: [], status: 'insufficient-signal' };
  }
}
