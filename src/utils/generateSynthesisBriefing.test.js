import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { generateSynthesisBriefing, assembleReckoning } from './generateSynthesisBriefing.js';
import {
  COLLECTIONS,
  RELAPSE_FIELDS,
  RELAPSE_ENTRY_TYPES,
  KILL_TARGET_FIELDS,
  HARD_LESSON_FIELDS,
  USER_SETTINGS_FIELDS,
} from './schema.js';

const dayMs = 24 * 60 * 60 * 1000;
const now = Date.now();

const makeReader = (data) => async (collection) => data[collection] ?? [];

const makeDeps = (data, writeSpy = null) => ({
  readUserData: makeReader(data),
  writeData: writeSpy ?? (async () => {}),
});

// Minimum cross-module fixture: one relapse entry satisfies the
// insufficient-data gate so cadence/bypass tests can exercise their
// own paths without tripping the cold-start check.
const minCrossModuleData = () => ({
  [COLLECTIONS.RELAPSE_ENTRIES]: [
    { id: 'r-seed', timestamp: now - dayMs, [RELAPSE_FIELDS.ARCHETYPE]: 'Avoider' },
  ],
});

describe('generateSynthesisBriefing — preconditions', () => {
  it('throws when userId is missing', async () => {
    await assert.rejects(
      () => generateSynthesisBriefing(null, 'weekly'),
      /userId required/
    );
  });
});

describe('generateSynthesisBriefing — cadence enforcement', () => {
  it('returns locked when last weekly briefing was 2 days ago', async () => {
    const deps = makeDeps({
      [COLLECTIONS.SYNTHESES]: [
        { generatedAt: new Date(now - 2 * dayMs).toISOString() },
      ],
    });
    const result = await generateSynthesisBriefing('u1', 'weekly', deps);
    assert.equal(result.status, 'locked');
    assert.ok(result.nextEligibleAt);
    assert.ok(result.remainingDays > 0);
  });

  it('returns locked when last biweekly briefing was 7 days ago', async () => {
    const deps = makeDeps({
      [COLLECTIONS.SYNTHESES]: [
        { generatedAt: new Date(now - 7 * dayMs).toISOString() },
      ],
    });
    const result = await generateSynthesisBriefing('u1', 'biweekly', deps);
    assert.equal(result.status, 'locked');
    assert.ok(result.remainingDays > 0);
  });

  it('runs (status ok) when last weekly briefing was 8 days ago', async () => {
    const deps = makeDeps({
      ...minCrossModuleData(),
      [COLLECTIONS.SYNTHESES]: [
        { generatedAt: new Date(now - 8 * dayMs).toISOString() },
      ],
    });
    const result = await generateSynthesisBriefing('u1', 'weekly', deps);
    assert.equal(result.status, 'ok');
    assert.ok(result.briefing);
  });

  it('runs (status ok) when no prior briefing exists', async () => {
    const deps = makeDeps(minCrossModuleData());
    const result = await generateSynthesisBriefing('u1', 'weekly', deps);
    assert.equal(result.status, 'ok');
    assert.ok(result.briefing);
  });

  it('bypassCadence:true forces generation despite recent briefing', async () => {
    const deps = {
      ...makeDeps({
        ...minCrossModuleData(),
        [COLLECTIONS.SYNTHESES]: [
          { generatedAt: new Date(now - dayMs).toISOString() },
        ],
      }),
      bypassCadence: true,
    };
    const result = await generateSynthesisBriefing('u1', 'weekly', deps);
    assert.equal(result.status, 'ok');
  });
});

describe('generateSynthesisBriefing — cold-start gate', () => {
  it('returns insufficient-data when no active target, finalized rule, or relapse entry exists', async () => {
    let written = null;
    const writeSpy = async (collection, doc) => { written = { collection, doc }; };
    const deps = makeDeps({}, writeSpy);
    const result = await generateSynthesisBriefing('u1', 'weekly', deps);
    assert.equal(result.status, 'insufficient-data');
    assert.equal(written, null, 'no briefing is written for cold-start users');
  });

  it('returns insufficient-data even with bypassCadence when no cross-module signal exists', async () => {
    let written = null;
    const writeSpy = async (collection, doc) => { written = { collection, doc }; };
    const deps = {
      ...makeDeps({}, writeSpy),
      // Note: bypassCadence is passed via options, so we pass it on a separate call below.
    };
    const result = await generateSynthesisBriefing('u1', 'weekly', { ...deps, bypassCadence: true });
    assert.equal(result.status, 'insufficient-data');
    assert.equal(written, null);
  });

  it('returns insufficient-data when only journal entries exist (journal is not cross-module signal)', async () => {
    const deps = makeDeps({
      [COLLECTIONS.JOURNAL_ENTRIES]: [
        { id: 'j1', timestamp: now - dayMs, text: 'first entry' },
      ],
    });
    const result = await generateSynthesisBriefing('u1', 'weekly', deps);
    assert.equal(result.status, 'insufficient-data');
  });
});

describe('generateSynthesisBriefing — briefing payload shape', () => {
  it('writes a briefing doc and returns it under .briefing', async () => {
    let written = null;
    const writeSpy = async (collection, doc) => {
      written = { collection, doc };
    };
    const deps = makeDeps(
      {
        [COLLECTIONS.RELAPSE_ENTRIES]: [
          { id: 'r1', timestamp: now - dayMs, [RELAPSE_FIELDS.ARCHETYPE]: 'Avoider' },
        ],
        [COLLECTIONS.HARD_LESSONS]: [
          {
            id: 'h1',
            [HARD_LESSON_FIELDS.IS_VIOLATION]: true,
            [HARD_LESSON_FIELDS.RULE]: 'No phone after 9pm',
            timestamp: now - 2 * dayMs,
          },
        ],
        [COLLECTIONS.USER_SETTINGS]: [
          { [USER_SETTINGS_FIELDS.IDENTITY_DIRECTION]: 'become-direct' },
        ],
      },
      writeSpy
    );
    const result = await generateSynthesisBriefing('u1', 'weekly', deps);
    assert.equal(result.status, 'ok');
    assert.equal(written.collection, COLLECTIONS.SYNTHESES);
    assert.ok(written.doc.generatedAt, 'briefing has generatedAt');
    assert.ok(typeof written.doc.confrontationQuestion === 'string');
    assert.equal(result.briefing.meta?.identityDirection, 'become-direct');
  });

  it('counts a break logged only via violations[] as a violated rule (regression)', async () => {
    const deps = makeDeps(
      {
        [COLLECTIONS.RELAPSE_ENTRIES]: [
          { id: 'r1', timestamp: now - dayMs, [RELAPSE_FIELDS.ARCHETYPE]: 'Avoider' },
        ],
        [COLLECTIONS.HARD_LESSONS]: [
          {
            id: 'h1',
            [HARD_LESSON_FIELDS.IS_FINALIZED]: true,
            [HARD_LESSON_FIELDS.RULE]: 'Verify before trusting',
            violations: [{ date: new Date(now - 2 * dayMs).toISOString(), source: 'weekly_review' }],
          },
        ],
      },
      async () => {}
    );
    const result = await generateSynthesisBriefing('u1', 'weekly', deps);
    assert.equal(result.status, 'ok');
    assert.equal(result.briefing.violatedRules.length, 1);
    assert.equal(result.briefing.violatedRules[0].rule, 'Verify before trusting');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// The Reckoning
// ─────────────────────────────────────────────────────────────────────────

const recentISO = new Date(now - 3 * dayMs).toISOString();

// Stated commitments contradicted by real, dated events this period.
const reckoningData = () => ({
  [COLLECTIONS.KILL_TARGETS]: [
    {
      id: 'k1',
      [KILL_TARGET_FIELDS.STATUS]: 'active',
      [KILL_TARGET_FIELDS.TITLE]: 'Doomscroll',
      [KILL_TARGET_FIELDS.ESCAPES]: [{ date: recentISO, context: 'late night, bored' }],
    },
  ],
  [COLLECTIONS.HARD_LESSONS]: [
    {
      id: 'h1',
      [HARD_LESSON_FIELDS.IS_FINALIZED]: true,
      [HARD_LESSON_FIELDS.RULE]: 'No phone after 11pm',
      [HARD_LESSON_FIELDS.VIOLATIONS]: [{ date: recentISO, note: 'scrolled until 1am' }],
    },
  ],
  [COLLECTIONS.RELAPSE_ENTRIES]: [
    {
      id: 'r1',
      [RELAPSE_FIELDS.ENTRY_TYPE]: RELAPSE_ENTRY_TYPES.RELAPSE,
      eventOccurredAt: recentISO,
      [RELAPSE_FIELDS.REFLECTION]: 'told myself one more time',
    },
  ],
});

describe('assembleReckoning — contradictions trace to real event ids', () => {
  it('links each commitment to its contradicting events', () => {
    const { contradictions } = assembleReckoning({ ...reckoningData(), now });

    const escape = contradictions.find((c) => c.type === 'escape_vs_kill');
    assert.ok(escape, 'expected an escape-vs-kill contradiction');
    assert.equal(escape.commitment.id, 'k1');
    assert.equal(escape.evidence[0].eventId, `k1#escape@${recentISO}`);
    assert.equal(escape.evidence[0].quote, 'late night, bored');

    const violation = contradictions.find((c) => c.type === 'violation_vs_rule');
    assert.ok(violation);
    assert.equal(violation.evidence[0].eventId, `h1#violation@${recentISO}`);

    const relapse = contradictions.find((c) => c.type === 'relapse_vs_commitment');
    assert.ok(relapse);
    assert.equal(relapse.evidence[0].eventId, 'r1');
    assert.equal(relapse.commitment.id ? true : false, true);

    // Every contradiction carries at least one real event id (no fabrication).
    for (const c of contradictions) {
      assert.ok(c.evidence.length > 0);
      for (const ev of c.evidence) assert.ok(ev.eventId, 'evidence must carry a real id');
    }
  });

  it('every quote is a verbatim substring of the source text', () => {
    const data = reckoningData();
    const { contradictions } = assembleReckoning({ ...data, now });
    const escape = contradictions.find((c) => c.type === 'escape_vs_kill');
    const sourceContext = data[COLLECTIONS.KILL_TARGETS][0][KILL_TARGET_FIELDS.ESCAPES][0].context;
    assert.ok(sourceContext.includes(escape.evidence[0].quote));
  });

  it('drops escapes/violations outside the period', () => {
    const oldISO = new Date(now - 60 * dayMs).toISOString();
    const { contradictions } = assembleReckoning({
      killTargets: [{
        id: 'k1', [KILL_TARGET_FIELDS.STATUS]: 'active', [KILL_TARGET_FIELDS.TITLE]: 'X',
        [KILL_TARGET_FIELDS.ESCAPES]: [{ date: oldISO }],
      }],
      now,
    });
    assert.equal(contradictions.length, 0, 'stale events do not contradict');
  });
});

describe('generateSynthesisBriefing — reckoning mode', () => {
  it('writes a type:reckoning confrontation document', async () => {
    let written = null;
    const writeSpy = async (_c, doc) => { written = doc; return { id: 'rk1' }; };
    const result = await generateSynthesisBriefing('u1', 'weekly', {
      readUserData: makeReader(reckoningData()),
      writeData: writeSpy,
      mode: 'reckoning',
      bypassCadence: true,
    });
    assert.equal(result.status, 'ok');
    assert.equal(written.type, 'reckoning');
    assert.ok(written.contradictions.length >= 2);
    assert.ok(typeof written.reckoningConfrontation === 'string' && written.reckoningConfrontation.length > 0);
    assert.equal(written.meta.contradictionCount, written.contradictions.length);
  });

  it('returns insufficient-data when nothing contradicts the commitments', async () => {
    let writes = 0;
    const writeSpy = async () => { writes += 1; return { id: 'x' }; };
    const data = {
      [COLLECTIONS.KILL_TARGETS]: [{ id: 'k1', [KILL_TARGET_FIELDS.STATUS]: 'active', [KILL_TARGET_FIELDS.TITLE]: 'X' }],
      [COLLECTIONS.HARD_LESSONS]: [{ id: 'h1', [HARD_LESSON_FIELDS.IS_FINALIZED]: true, [HARD_LESSON_FIELDS.RULE]: 'R' }],
    };
    const result = await generateSynthesisBriefing('u1', 'weekly', {
      readUserData: makeReader(data), writeData: writeSpy, mode: 'reckoning', bypassCadence: true,
    });
    assert.equal(result.status, 'insufficient-data');
    assert.equal(writes, 0, 'no document written and no billed call');
  });

  it('type-scoped cooldown: a recent synthesis does not block a reckoning', async () => {
    let written = null;
    const writeSpy = async (_c, doc) => { written = doc; return { id: 'rk2' }; };
    const data = {
      ...reckoningData(),
      // a synthesis written 2 minutes ago — would trip the 1h cooldown if shared
      [COLLECTIONS.SYNTHESES]: [{ type: 'synthesis', generatedAt: new Date(now - 2 * 60 * 1000).toISOString() }],
    };
    const result = await generateSynthesisBriefing('u1', 'weekly', {
      readUserData: makeReader(data), writeData: writeSpy, mode: 'reckoning', bypassCadence: true,
    });
    assert.equal(result.status, 'ok');
    assert.equal(written.type, 'reckoning');
  });
});
