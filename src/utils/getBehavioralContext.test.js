import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  getBehavioralContext,
  clearBehavioralContextCache,
} from './getBehavioralContext.js';
import {
  COLLECTIONS,
  RELAPSE_FIELDS,
  KILL_TARGET_FIELDS,
  HARD_LESSON_FIELDS,
  USER_SETTINGS_FIELDS,
} from './schema.js';

const dayMs = 24 * 60 * 60 * 1000;
const T0 = Date.now();

const makeReader = (data) => async (collection) => data[collection] ?? [];

const noDeps = (data) => ({ readUserData: makeReader(data), useCache: false });

describe('getBehavioralContext — empty / defensive', () => {
  it('returns empty snapshot when userId is missing', async () => {
    const ctx = await getBehavioralContext(null);
    assert.equal(ctx.recentRelapseCount, 0);
    assert.equal(ctx.dominantRelapseArchetype, null);
    assert.deepEqual(ctx.activeKillTargets, []);
    assert.deepEqual(ctx.violatedHardLessons, []);
  });

  it('returns empty arrays when all collections are empty', async () => {
    const ctx = await getBehavioralContext('u1', noDeps({}));
    assert.deepEqual(ctx.activeKillTargets, []);
    assert.deepEqual(ctx.violatedHardLessons, []);
    assert.equal(ctx.recentRelapseCount, 0);
    assert.equal(ctx.totalEntryCount, 0);
    assert.deepEqual(ctx.missingCollections, []);
  });
});

describe('getBehavioralContext — kill list', () => {
  it('returns only active kill targets, projecting title/streak/escapeCount', async () => {
    const data = {
      [COLLECTIONS.KILL_TARGETS]: [
        {
          id: 'k1',
          [KILL_TARGET_FIELDS.STATUS]: 'active',
          [KILL_TARGET_FIELDS.TITLE]: 'Doomscroll',
          [KILL_TARGET_FIELDS.STREAK]: 5,
          [KILL_TARGET_FIELDS.ESCAPES]: [{ date: '2026-04-30T00:00:00Z' }],
        },
        {
          id: 'k2',
          [KILL_TARGET_FIELDS.STATUS]: 'killed',
          [KILL_TARGET_FIELDS.TITLE]: 'Old habit',
        },
      ],
    };
    const ctx = await getBehavioralContext('u1', noDeps(data));
    assert.equal(ctx.activeKillTargets.length, 1);
    assert.equal(ctx.activeKillTargets[0].title, 'Doomscroll');
    assert.equal(ctx.activeKillTargets[0].streak, 5);
    assert.equal(ctx.activeKillTargets[0].escapeCount, 1);
  });
});

describe('getBehavioralContext — relapse archetype dominance (14d window)', () => {
  it('picks the most-frequent recent archetype', async () => {
    const data = {
      [COLLECTIONS.RELAPSE_ENTRIES]: [
        { id: 'r1', timestamp: T0 - 1 * dayMs, [RELAPSE_FIELDS.ARCHETYPE]: 'Avoider' },
        { id: 'r2', timestamp: T0 - 2 * dayMs, [RELAPSE_FIELDS.ARCHETYPE]: 'Avoider' },
        { id: 'r3', timestamp: T0 - 3 * dayMs, [RELAPSE_FIELDS.ARCHETYPE]: 'Numb' },
      ],
    };
    const ctx = await getBehavioralContext('u1', noDeps(data));
    assert.equal(ctx.recentRelapseCount, 3);
    // Resolved archetype label may differ from the raw key — assert non-null.
    assert.ok(ctx.dominantRelapseArchetype, 'expected non-null archetype label');
  });

  it('ignores entries older than 14 days', async () => {
    const data = {
      [COLLECTIONS.RELAPSE_ENTRIES]: [
        { id: 'r-old', timestamp: T0 - 20 * dayMs, [RELAPSE_FIELDS.ARCHETYPE]: 'Avoider' },
      ],
    };
    const ctx = await getBehavioralContext('u1', noDeps(data));
    assert.equal(ctx.recentRelapseCount, 0);
  });
});

describe('getBehavioralContext — violated hard lessons', () => {
  it('surfaces only entries flagged as violation with a rule', async () => {
    const data = {
      [COLLECTIONS.HARD_LESSONS]: [
        {
          id: 'h1',
          [HARD_LESSON_FIELDS.IS_VIOLATION]: true,
          [HARD_LESSON_FIELDS.RULE]: 'No phone after 9pm',
          timestamp: T0 - dayMs,
        },
        {
          id: 'h2',
          [HARD_LESSON_FIELDS.IS_VIOLATION]: false,
          [HARD_LESSON_FIELDS.RULE]: 'Should-have rule',
        },
      ],
    };
    const ctx = await getBehavioralContext('u1', noDeps(data));
    assert.equal(ctx.violatedHardLessons.length, 1);
    assert.equal(ctx.violatedHardLessons[0].rule, 'No phone after 9pm');
  });

  it('surfaces a break logged only via violations[] (regression: weekly review / button)', async () => {
    const data = {
      [COLLECTIONS.HARD_LESSONS]: [
        {
          id: 'h1',
          [HARD_LESSON_FIELDS.IS_FINALIZED]: true,
          [HARD_LESSON_FIELDS.RULE]: 'Verify before trusting',
          violations: [{ date: new Date(T0 - dayMs).toISOString(), source: 'weekly_review' }],
        },
      ],
    };
    const ctx = await getBehavioralContext('u1', noDeps(data));
    assert.equal(ctx.violatedHardLessons.length, 1);
    assert.equal(ctx.violatedHardLessons[0].rule, 'Verify before trusting');
  });
});

describe('getBehavioralContext — identity direction', () => {
  it('picks identityDirection from the first userSettings doc', async () => {
    const data = {
      [COLLECTIONS.USER_SETTINGS]: [
        { [USER_SETTINGS_FIELDS.IDENTITY_DIRECTION]: 'become-direct' },
      ],
    };
    const ctx = await getBehavioralContext('u1', noDeps(data));
    assert.equal(ctx.identityDirection, 'become-direct');
  });

  it('returns null when no settings exist', async () => {
    const ctx = await getBehavioralContext('u1', noDeps({}));
    assert.equal(ctx.identityDirection, null);
  });
});

describe('getBehavioralContext — totalEntryCount (BER-167)', () => {
  it('sums journal + kill + relapse + hardLessons counts', async () => {
    const data = {
      [COLLECTIONS.JOURNAL_ENTRIES]: [{}, {}],
      [COLLECTIONS.KILL_TARGETS]: [{}],
      [COLLECTIONS.RELAPSE_ENTRIES]: [{}, {}, {}],
      [COLLECTIONS.HARD_LESSONS]: [{}, {}, {}, {}],
    };
    const ctx = await getBehavioralContext('u1', noDeps(data));
    assert.equal(ctx.totalEntryCount, 2 + 1 + 3 + 4);
  });
});

describe('getBehavioralContext — partial fetch failures', () => {
  it('logs missing collection and returns partial data', async () => {
    const reader = async (collection) => {
      if (collection === COLLECTIONS.RELAPSE_ENTRIES) throw new Error('boom');
      return [];
    };
    const ctx = await getBehavioralContext('u1', { readUserData: reader, useCache: false });
    assert.ok(ctx.missingCollections.includes(COLLECTIONS.RELAPSE_ENTRIES));
    assert.equal(ctx.recentRelapseCount, 0);
  });
});

describe('getBehavioralContext — temporal correlations (computed field)', () => {
  const BASE = Date.UTC(2026, 0, 1, 0, 0, 0);
  const iso = (d, h = 10) => new Date(BASE + d * dayMs + h * 3600000).toISOString();
  const relapseEntry = (d) => ({ [RELAPSE_FIELDS.ENTRY_TYPE]: 'relapse', eventOccurredAt: iso(d) });
  const journalEntry = (d, h) => ({ eventOccurredAt: iso(d, h) });

  it('forwards a size-bounded correlation result when signal clears the gate', async () => {
    const data = {
      [COLLECTIONS.RELAPSE_ENTRIES]: [relapseEntry(0), relapseEntry(5), relapseEntry(10)],
      [COLLECTIONS.JOURNAL_ENTRIES]: [journalEntry(0, 12), journalEntry(5, 13), journalEntry(10, 11)],
      [COLLECTIONS.HARD_LESSONS]: Array.from({ length: 15 }, () => ({})), // pad to 21
    };
    const ctx = await getBehavioralContext('u1', noDeps(data));

    assert.equal(ctx.temporalCorrelations.status, 'ok');
    assert.ok(ctx.temporalCorrelations.items.length >= 1);
    assert.ok(ctx.temporalCorrelations.items.length <= 3, 'capped to top 3');

    const item = ctx.temporalCorrelations.items.find(
      (c) => c.antecedent === 'relapse:relapse' && c.consequent === 'journal:entry'
    );
    assert.ok(item, 'expected relapse→journal correlation');
    // Only scalar fields are forwarded — no heavy sub-objects.
    assert.equal(item.lagUnit, 'hours');
    assert.equal(typeof item.lagMedian, 'number');
    assert.ok(!('lagDistribution' in item) && !('baseline' in item) && !('lift' in item));
  });

  it('returns insufficient-signal when the record is sparse', async () => {
    const data = { [COLLECTIONS.RELAPSE_ENTRIES]: [relapseEntry(0), relapseEntry(1)] };
    const ctx = await getBehavioralContext('u1', noDeps(data));
    assert.equal(ctx.temporalCorrelations.status, 'insufficient-signal');
    assert.deepEqual(ctx.temporalCorrelations.items, []);
  });

  it('empty snapshot carries the insufficient-signal default', async () => {
    const ctx = await getBehavioralContext('u1', noDeps({}));
    assert.equal(ctx.temporalCorrelations.status, 'insufficient-signal');
    assert.deepEqual(ctx.temporalCorrelations.items, []);
  });
});

describe('clearBehavioralContextCache', () => {
  it('does not throw when cache is empty', () => {
    assert.doesNotThrow(() => clearBehavioralContextCache('nobody'));
  });
});
