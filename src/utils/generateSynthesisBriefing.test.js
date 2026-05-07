import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { generateSynthesisBriefing } from './generateSynthesisBriefing.js';
import {
  COLLECTIONS,
  RELAPSE_FIELDS,
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
      [COLLECTIONS.SYNTHESES]: [
        { generatedAt: new Date(now - 8 * dayMs).toISOString() },
      ],
    });
    const result = await generateSynthesisBriefing('u1', 'weekly', deps);
    assert.equal(result.status, 'ok');
    assert.ok(result.briefing);
  });

  it('runs (status ok) when no prior briefing exists', async () => {
    const deps = makeDeps({});
    const result = await generateSynthesisBriefing('u1', 'weekly', deps);
    assert.equal(result.status, 'ok');
    assert.ok(result.briefing);
  });

  it('bypassCadence:true forces generation despite recent briefing', async () => {
    const deps = {
      ...makeDeps({
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
    assert.equal(result.briefing._meta?.identityDirection, 'become-direct');
  });
});
