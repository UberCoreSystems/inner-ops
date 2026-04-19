import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateDailyBrief,
  getCachedDailyBrief,
  getOrGenerateDailyBrief,
  buildSourceContext,
  localDateKey,
  BriefError,
  DAILY_BRIEFS_COLLECTION,
} from './dailyBrief.js';

// ─── Fixture helpers ──────────────────────────────────────────────────────────

const daysAgo = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();

const makeReader = (collections) => async (name) => collections[name] || [];

const emptyCollections = () => ({
  journalEntries: [],
  killTargets: [],
  hardLessons: [],
  relapseEntries: [],
  blackMirrorEntries: [],
  userSettings: [],
});

// Minimal behavioral-context stub. Tests pass exactly the fields they need
// and leave the rest undefined to mirror a partial snapshot.
const makeBehavioralContext = (overrides = {}) => ({
  activeKillTargets: [],
  dominantRelapseArchetype: null,
  recentRelapseCount: 0,
  blackMirrorTrend: null,
  violatedHardLessons: [],
  journalLanguagePattern: null,
  identityDirection: null,
  totalEntryCount: 0,
  missingCollections: [],
  ...overrides,
});

// Sentinel object used to assert the generator really wrote a serverTimestamp().
const SERVER_TIMESTAMP_SENTINEL = Object.freeze({ __serverTimestamp: true });

// ─── Cache hit ────────────────────────────────────────────────────────────────

test('getOrGenerateDailyBrief: cache hit returns cached brief without generating', async () => {
  const today = localDateKey();
  const cached = {
    userId: 'u1',
    dateKey: today,
    brief: 'Cached brief text body.',
    generatedAt: SERVER_TIMESTAMP_SENTINEL,
    sourceContext: { behavioralContext: null, activeDriftSignals: [], recentViolatedRules: [], escapedTargets: [] },
  };

  let oracleCalled = false;
  let writeCalled = false;

  const result = await getOrGenerateDailyBrief('u1', new Date(), {
    readBrief: async (uid, dateKey) => {
      assert.equal(uid, 'u1');
      assert.equal(dateKey, today);
      return cached;
    },
    writeBrief: async () => { writeCalled = true; },
    callOracle: async () => { oracleCalled = true; return { data: { feedback: 'should not happen' } }; },
    getBehavioralContext: async () => { throw new Error('should not run'); },
    getActiveDriftSignals: async () => { throw new Error('should not run'); },
    readUserData: async () => { throw new Error('should not run'); },
  });

  assert.equal(result.brief, 'Cached brief text body.');
  assert.equal(oracleCalled, false, 'Oracle must not be called when cache hits');
  assert.equal(writeCalled, false, 'Cache hit must not re-write');
});

// ─── Cache miss with data present ─────────────────────────────────────────────

test('getOrGenerateDailyBrief: cache miss with data present generates, writes, returns', async () => {
  const writes = [];
  let capturedEntryText = null;

  const result = await getOrGenerateDailyBrief('u1', new Date(), {
    readBrief: async () => null,
    writeBrief: async (uid, dateKey, payload) => { writes.push({ uid, dateKey, payload }); },
    callOracle: async ({ entryText, moduleName }) => {
      capturedEntryText = entryText;
      assert.equal(moduleName, 'morning_brief');
      return { data: { feedback: 'Operational brief paragraph body.' } };
    },
    getBehavioralContext: async () => makeBehavioralContext({
      dominantRelapseArchetype: 'Avoidance drift',
      recentRelapseCount: 4,
      totalEntryCount: 120,
      activeKillTargets: [{ title: 'Doomscrolling', streak: 3, escapeCount: 2 }],
    }),
    getActiveDriftSignals: async () => [{
      type: 'archetype_frequency',
      archetype: 'The Procrastinator',
      streak: 4,
      description: 'Drift signal',
    }],
    readUserData: makeReader({
      ...emptyCollections(),
      hardLessons: [
        {
          isFinalized: true,
          ruleGoingForward: 'Do not open inbox before 10am.',
          lastViolatedAt: daysAgo(11),
        },
      ],
      killTargets: [
        {
          title: 'Doomscrolling',
          status: 'active',
          escapeData: [
            { date: daysAgo(1) },
            { date: daysAgo(3) },
            { date: daysAgo(5) },
          ],
          implementationIntention: {
            trigger: 'phone unlocks between 4pm and 5pm',
            response: 'put phone face-down for ten minutes',
          },
        },
      ],
    }),
    serverTimestamp: () => SERVER_TIMESTAMP_SENTINEL,
  });

  assert.equal(result.brief, 'Operational brief paragraph body.');
  assert.equal(writes.length, 1, 'cache miss must write exactly once');
  assert.equal(writes[0].uid, 'u1');
  assert.equal(writes[0].dateKey, localDateKey());
  assert.equal(writes[0].payload.brief, 'Operational brief paragraph body.');
  assert.equal(writes[0].payload.generatedAt, SERVER_TIMESTAMP_SENTINEL);
  assert.ok(writes[0].payload.sourceContext, 'sourceContext must be persisted for audit');

  // The serialized snapshot sent to Oracle should contain the data points that
  // the system prompt is instructed to reference.
  assert.match(capturedEntryText, /Avoidance drift/);
  assert.match(capturedEntryText, /archetype "The Procrastinator" active 4 consecutive days/);
  assert.match(capturedEntryText, /"Do not open inbox before 10am\."/);
  assert.match(capturedEntryText, /violated 11 days ago/);
  assert.match(capturedEntryText, /"Doomscrolling"/);
  assert.match(capturedEntryText, /3 escapes in last 7 days/);
  assert.match(capturedEntryText, /phone unlocks between 4pm and 5pm/);
});

// ─── Cache miss with empty sourceContext ──────────────────────────────────────

test('generateDailyBrief: cache miss with empty sourceContext still generates', async () => {
  let capturedEntryText = null;

  const result = await generateDailyBrief('u1', {
    readBrief: async () => null,
    writeBrief: async () => {},
    callOracle: async ({ entryText, moduleName }) => {
      capturedEntryText = entryText;
      assert.equal(moduleName, 'morning_brief');
      return { data: { feedback: 'Record still forming. Most recent activity noted.' } };
    },
    getBehavioralContext: async () => makeBehavioralContext(),
    getActiveDriftSignals: async () => [],
    readUserData: makeReader(emptyCollections()),
    serverTimestamp: () => SERVER_TIMESTAMP_SENTINEL,
  });

  assert.equal(result.brief, 'Record still forming. Most recent activity noted.');
  // Empty snapshot must still carry the SNAPSHOT header — the no-filler policy
  // is enforced by the server-side system prompt, not by refusing to generate.
  assert.match(capturedEntryText, /SNAPSHOT/);
  assert.match(capturedEntryText, /record still forming/i);
});

// ─── Firestore write failure is non-fatal ─────────────────────────────────────

test('generateDailyBrief: Firestore write failure does not throw — returns in-memory brief', async () => {
  const result = await generateDailyBrief('u1', {
    readBrief: async () => null,
    writeBrief: async () => { throw new Error('firestore unavailable'); },
    callOracle: async () => ({ data: { feedback: 'In-memory brief body text.' } }),
    getBehavioralContext: async () => makeBehavioralContext(),
    getActiveDriftSignals: async () => [],
    readUserData: makeReader(emptyCollections()),
    serverTimestamp: () => SERVER_TIMESTAMP_SENTINEL,
  });

  assert.equal(result.brief, 'In-memory brief body text.', 'caller still receives the generated brief');
  assert.equal(result.userId, 'u1');
  assert.ok(result.dateKey);
});

// ─── Oracle failure surfaces as typed rejected promise ────────────────────────

test('generateDailyBrief: Oracle failure surfaces as rejected promise with BriefError', async () => {
  await assert.rejects(
    () => generateDailyBrief('u1', {
      readBrief: async () => null,
      writeBrief: async () => {},
      callOracle: async () => { throw new Error('resource-exhausted'); },
      getBehavioralContext: async () => makeBehavioralContext(),
      getActiveDriftSignals: async () => [],
      readUserData: makeReader(emptyCollections()),
      serverTimestamp: () => SERVER_TIMESTAMP_SENTINEL,
    }),
    (err) => {
      assert.ok(err instanceof BriefError, 'must be a BriefError instance');
      assert.match(err.message, /Oracle call failed/);
      assert.ok(err.cause, 'cause is preserved for debugging');
      return true;
    }
  );
});

test('generateDailyBrief: Oracle empty response surfaces as BriefError', async () => {
  await assert.rejects(
    () => generateDailyBrief('u1', {
      readBrief: async () => null,
      writeBrief: async () => {},
      callOracle: async () => ({ data: { feedback: '   ' } }),
      getBehavioralContext: async () => makeBehavioralContext(),
      getActiveDriftSignals: async () => [],
      readUserData: makeReader(emptyCollections()),
      serverTimestamp: () => SERVER_TIMESTAMP_SENTINEL,
    }),
    (err) => {
      assert.ok(err instanceof BriefError);
      assert.match(err.message, /empty/i);
      return true;
    }
  );
});

// ─── buildSourceContext specifics ─────────────────────────────────────────────

test('buildSourceContext: recent violated rules are de-duped and capped at 3', async () => {
  const collections = emptyCollections();
  collections.hardLessons = [
    { isFinalized: true, ruleGoingForward: 'Rule A', violations: [{ date: daysAgo(2) }, { date: daysAgo(9) }] },
    { isFinalized: true, ruleGoingForward: 'Rule B', lastViolatedAt: daysAgo(5) },
    { isFinalized: true, ruleGoingForward: 'Rule C', violations: [{ date: daysAgo(1) }] },
    { isFinalized: true, ruleGoingForward: 'Rule D', violations: [{ date: daysAgo(3) }] },
    { isFinalized: true, ruleGoingForward: 'Rule E', violations: [{ date: daysAgo(100) }] }, // outside 14d
    { isFinalized: false, ruleGoingForward: 'Draft', violations: [{ date: daysAgo(1) }] },    // draft excluded
  ];
  const ctx = await buildSourceContext('u1', {
    getBehavioralContext: async () => makeBehavioralContext(),
    getActiveDriftSignals: async () => [],
    readUserData: makeReader(collections),
  });
  assert.equal(ctx.recentViolatedRules.length, 3, 'capped at 3');
  const rules = ctx.recentViolatedRules.map(r => r.rule);
  assert.ok(rules.includes('Rule C'));
  assert.ok(rules.includes('Rule D'));
  assert.ok(!rules.includes('Rule E'), 'out-of-window rule excluded');
  assert.ok(!rules.includes('Draft'), 'draft rule excluded');
});

test('buildSourceContext: escapedTargets filter to active targets with 7d escape window', async () => {
  const collections = emptyCollections();
  collections.killTargets = [
    {
      title: 'Target With Recent Escape',
      status: 'active',
      escapeData: [{ date: daysAgo(2) }, { date: daysAgo(30) }],
      implementationIntention: { trigger: 'T', response: 'R' },
    },
    {
      title: 'Target Too Old',
      status: 'active',
      escapeData: [{ date: daysAgo(20) }],
    },
    {
      title: 'Inactive Target',
      status: 'killed',
      escapeData: [{ date: daysAgo(1) }],
    },
  ];
  const ctx = await buildSourceContext('u1', {
    getBehavioralContext: async () => makeBehavioralContext(),
    getActiveDriftSignals: async () => [],
    readUserData: makeReader(collections),
  });
  assert.equal(ctx.escapedTargets.length, 1);
  assert.equal(ctx.escapedTargets[0].title, 'Target With Recent Escape');
  assert.equal(ctx.escapedTargets[0].escapeCountLast7d, 1, 'only the escape in window counts');
  assert.equal(ctx.escapedTargets[0].implementationIntention.trigger, 'T');
});

test('buildSourceContext: individual reader failure does not throw', async () => {
  const ctx = await buildSourceContext('u1', {
    getBehavioralContext: async () => { throw new Error('bc down'); },
    getActiveDriftSignals: async () => { throw new Error('drift down'); },
    readUserData: async () => { throw new Error('firestore down'); },
  });
  assert.equal(ctx.behavioralContext, null);
  assert.deepEqual(ctx.activeDriftSignals, []);
  assert.deepEqual(ctx.recentViolatedRules, []);
  assert.deepEqual(ctx.escapedTargets, []);
});

// ─── localDateKey ─────────────────────────────────────────────────────────────

test('localDateKey: produces YYYY-MM-DD from a Date object', () => {
  const d = new Date(2026, 3, 16); // April is month index 3
  assert.equal(localDateKey(d), '2026-04-16');
});

test('localDateKey: pads single-digit month and day', () => {
  const d = new Date(2026, 0, 3); // January 3
  assert.equal(localDateKey(d), '2026-01-03');
});

// ─── getCachedDailyBrief ──────────────────────────────────────────────────────

test('getCachedDailyBrief: returns null when no document exists', async () => {
  const result = await getCachedDailyBrief('u1', new Date(), {
    readBrief: async () => null,
  });
  assert.equal(result, null);
});

test('getCachedDailyBrief: returns stored document when present', async () => {
  const stored = { userId: 'u1', dateKey: '2026-04-16', brief: 'Hello world.', sourceContext: {} };
  const result = await getCachedDailyBrief('u1', '2026-04-16', {
    readBrief: async () => stored,
  });
  assert.deepEqual(result, stored);
});

test('getCachedDailyBrief: failure returns null rather than throwing', async () => {
  const result = await getCachedDailyBrief('u1', new Date(), {
    readBrief: async () => { throw new Error('perm-denied'); },
  });
  assert.equal(result, null);
});

// ─── Constants sanity ─────────────────────────────────────────────────────────

test('DAILY_BRIEFS_COLLECTION is named exactly "dailyBriefs"', () => {
  assert.equal(DAILY_BRIEFS_COLLECTION, 'dailyBriefs');
});
