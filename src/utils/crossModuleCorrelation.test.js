import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  extractEvents,
  computeCorrelations,
  getCrossModuleCorrelations,
  PATTERN_TRUST_MIN_ENTRIES,
} from './crossModuleCorrelation.js';
import {
  COLLECTIONS,
  RELAPSE_FIELDS,
  RELAPSE_ENTRY_TYPES,
  KILL_TARGET_FIELDS,
  HARD_LESSON_FIELDS,
} from './schema.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const BASE = Date.UTC(2026, 0, 1, 0, 0, 0);
const iso = (dayN, hour = 10) => new Date(BASE + dayN * MS_PER_DAY + hour * 3600000).toISOString();
const dateOnly = (dayN) => new Date(BASE + dayN * MS_PER_DAY).toISOString().slice(0, 10);

const relapse = (dayN, hour = 10) => ({
  [RELAPSE_FIELDS.ENTRY_TYPE]: RELAPSE_ENTRY_TYPES.RELAPSE,
  eventOccurredAt: iso(dayN, hour),
});
const journal = (dayN, hour = 12) => ({ eventOccurredAt: iso(dayN, hour) });
// Empty hard-lesson docs: count toward the trust gate, emit no events.
const padLessons = (n) => Array.from({ length: n }, () => ({}));

const find = (correlations, a, b) =>
  correlations.find((c) => c.antecedent === a && c.consequent === b);

describe('trust gate', () => {
  it('returns insufficient-signal below the entry-count threshold', () => {
    const events = extractEvents({ relapseEntries: [relapse(0), relapse(1)] });
    const out = computeCorrelations(events, { entryCount: PATTERN_TRUST_MIN_ENTRIES - 1 });
    assert.equal(out.status, 'insufficient-signal');
    assert.deepEqual(out.correlations, []);
  });

  it('proceeds at exactly the threshold', () => {
    const out = computeCorrelations([], { entryCount: PATTERN_TRUST_MIN_ENTRIES });
    assert.equal(out.status, 'ok');
  });
});

describe('sub-day correlation (both ISO)', () => {
  it('relapse → journal within window reports hours and beats baseline', () => {
    const relapseEntries = [relapse(0), relapse(5), relapse(10)];
    const journalEntries = [journal(0, 12), journal(5, 13), journal(10, 11)];
    const hardLessons = padLessons(15); // 3 + 3 + 15 = 21
    const events = extractEvents({ relapseEntries, journalEntries, hardLessons });
    const { correlations, status } = computeCorrelations(events, { entryCount: 21 });

    assert.equal(status, 'ok');
    const c = find(correlations, 'relapse:relapse', 'journal:entry');
    assert.ok(c, 'expected a relapse→journal correlation');
    assert.equal(c.resolution, 'sub-day');
    assert.equal(c.lagDistribution.unit, 'hours');
    assert.equal(c.support, 3);
    assert.equal(c.confidence, 1);
    assert.ok(c.lift > 1, 'lift must exceed baseline');
    assert.equal(c.lagDistribution.samples, 3);
  });
});

describe('mixed-resolution correlation is capped to daily', () => {
  it('relapse (ISO) → kill-list escape (date-only) never emits hours', () => {
    const relapseEntries = [relapse(0), relapse(5), relapse(10)];
    const killTargets = [{
      status: 'active',
      createdAt: iso(0, 8),
      [KILL_TARGET_FIELDS.ESCAPES]: [{ date: dateOnly(1) }, { date: dateOnly(6) }, { date: dateOnly(11) }],
    }];
    const hardLessons = padLessons(17); // 3 + 1 + 17 = 21
    const events = extractEvents({ relapseEntries, killTargets, hardLessons });
    const { correlations } = computeCorrelations(events, { entryCount: 21 });

    const c = find(correlations, 'relapse:relapse', 'killlist:escape');
    assert.ok(c, 'expected relapse→escape correlation');
    assert.equal(c.resolution, 'daily', 'any kill-list event forces daily resolution');
    assert.equal(c.lagDistribution.unit, 'days');
    assert.equal(c.support, 3);
    // No correlation touching a kill-list event may ever report hours.
    for (const corr of correlations) {
      if (corr.antecedent.startsWith('killlist:') || corr.consequent.startsWith('killlist:')) {
        assert.equal(corr.lagDistribution.unit, 'days');
        assert.equal(corr.resolution, 'daily');
      }
    }
  });
});

describe('minimum support floor', () => {
  it('does not emit a pair below minSupport', () => {
    const relapseEntries = [relapse(0), relapse(5)];
    const journalEntries = [journal(0, 12), journal(5, 13)];
    const hardLessons = padLessons(17); // 2 + 2 + 17 = 21
    const events = extractEvents({ relapseEntries, journalEntries, hardLessons });
    const { correlations, status } = computeCorrelations(events, { entryCount: 21, minSupport: 3 });

    assert.equal(status, 'ok');
    assert.equal(find(correlations, 'relapse:relapse', 'journal:entry'), undefined);
  });
});

describe('baseline guard', () => {
  it('drops an A→B whose confidence does not beat B base rate', () => {
    // Journal every day → B base rate saturates → lift <= 1.
    const journalEntries = Array.from({ length: 20 }, (_, d) => journal(d, 12));
    const relapseEntries = [relapse(2), relapse(8), relapse(14)];
    const events = extractEvents({ relapseEntries, journalEntries });
    const { correlations } = computeCorrelations(events, { entryCount: 23 });

    assert.equal(
      find(correlations, 'relapse:relapse', 'journal:entry'),
      undefined,
      'a B that happens constantly is not a real consequent',
    );
  });
});

describe('determinism', () => {
  it('produces identical output across runs', () => {
    const relapseEntries = [relapse(0), relapse(5), relapse(10)];
    const journalEntries = [journal(0, 12), journal(5, 13), journal(10, 11)];
    const hardLessons = padLessons(15);
    const events = extractEvents({ relapseEntries, journalEntries, hardLessons });
    const a = computeCorrelations(events, { entryCount: 21 });
    const b = computeCorrelations(events, { entryCount: 21 });
    assert.deepEqual(a, b);
  });
});

describe('extractEvents normalization', () => {
  it('tags ISO event times sub-day and date-only kill-list events daily', () => {
    const events = extractEvents({
      relapseEntries: [relapse(3, 9)],
      killTargets: [{ status: 'active', createdAt: iso(0), [KILL_TARGET_FIELDS.ESCAPES]: [{ date: dateOnly(4) }] }],
    });

    const r = events.find((e) => e.type === 'relapse:relapse');
    assert.equal(r.resolution, 'sub-day');

    const escape = events.find((e) => e.type === 'killlist:escape');
    assert.equal(escape.resolution, 'daily');
    assert.equal(escape.dayIndex, Math.floor((BASE + 4 * MS_PER_DAY) / MS_PER_DAY));

    // createdAt is a full ISO datetime but kill-list is forced daily anyway.
    const created = events.find((e) => e.type === 'killlist:created');
    assert.equal(created.resolution, 'daily');
  });

  it('extracts one event per hard-lesson violation and supports the legacy flag', () => {
    const events = extractEvents({
      hardLessons: [
        { [HARD_LESSON_FIELDS.VIOLATIONS]: [{ date: iso(1) }, { date: iso(2) }] },
        { [HARD_LESSON_FIELDS.IS_VIOLATION]: true, [HARD_LESSON_FIELDS.LAST_VIOLATED_AT]: iso(3) },
      ],
    });
    const violations = events.filter((e) => e.type === 'hardlesson:violation');
    assert.equal(violations.length, 3);
  });
});

describe('getCrossModuleCorrelations — reader wiring', () => {
  const makeReader = (data) => async (collection) => data[collection] ?? [];

  it('reads via deps.readUserData and surfaces correlations', async () => {
    const data = {
      [COLLECTIONS.RELAPSE_ENTRIES]: [relapse(0), relapse(5), relapse(10)],
      [COLLECTIONS.JOURNAL_ENTRIES]: [journal(0, 12), journal(5, 13), journal(10, 11)],
      [COLLECTIONS.HARD_LESSONS]: padLessons(15),
    };
    const out = await getCrossModuleCorrelations('u1', { readUserData: makeReader(data) });
    assert.equal(out.status, 'ok');
    assert.ok(find(out.correlations, 'relapse:relapse', 'journal:entry'));
  });

  it('returns insufficient-signal when the record is sparse', async () => {
    const data = { [COLLECTIONS.RELAPSE_ENTRIES]: [relapse(0), relapse(1)] };
    const out = await getCrossModuleCorrelations('u1', { readUserData: makeReader(data) });
    assert.equal(out.status, 'insufficient-signal');
    assert.deepEqual(out.correlations, []);
  });

  it('returns insufficient-signal for a missing userId', async () => {
    const out = await getCrossModuleCorrelations(null);
    assert.equal(out.status, 'insufficient-signal');
  });
});
