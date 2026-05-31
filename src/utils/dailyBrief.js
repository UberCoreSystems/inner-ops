/**
 * dailyBrief — Morning Brief generator and cache reader.
 *
 * The Morning Brief is a single AI-generated operator-cadence paragraph
 * shown on first open each day. One generation per calendar day. Cached
 * in Firestore under `dailyBriefs/{userId}_{YYYY-MM-DD}`. The user cannot
 * force regeneration — the same-day cache always wins. Tomorrow produces
 * a new one.
 *
 * Exports:
 *   - generateDailyBrief(userId, deps?)        — build source context,
 *                                                call Oracle, return brief.
 *   - getCachedDailyBrief(userId, date?, deps?)— read Firestore cache.
 *   - getOrGenerateDailyBrief(userId, date?, deps?) — cache-first helper.
 *
 * Timezone note: dateKey is derived from the browser's local date via
 * `new Date()`. Users who cross timezones within a 24-hour period can see
 * two briefs in that span — acceptable edge case, not worth engineering
 * against (see CLAUDE.md: "no speculative generality").
 *
 * Dependency injection: every Firestore read/write and the Oracle callable
 * are passed through `deps` with defaults. This mirrors the pattern used in
 * clarityScore.js so tests drive readers/writers/callables with in-memory
 * fixtures without ESM module-mock flags or Firebase initialization.
 */

import logger from './logger.js';
import { MS_PER_DAY, toMs } from './dateUtils.js';

// ─── Constants ────────────────────────────────────────────────────────────────

export const DAILY_BRIEFS_COLLECTION = 'dailyBriefs';

/**
 * BriefError — typed error surfaced from generateDailyBrief when the Oracle
 * Cloud Function call fails. The component catches this to render the
 * failure empty state without retrying.
 */
export class BriefError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'BriefError';
    if (cause) this.cause = cause;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Compose a YYYY-MM-DD string from the browser's local date. This is the
 * dateKey used for the Firestore document id suffix. Local-date choice is
 * deliberate: a brief is anchored to the user's morning, not UTC midnight.
 */
export function localDateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const docIdFor = (userId, dateKey) => `${userId}_${dateKey}`;

// ─── Default dependency loaders ───────────────────────────────────────────────

// Lazy so tests that inject everything never pull Firebase SDK into the
// module graph. Production callers pay a one-time dynamic-import cost.
const loadDefaults = async () => {
  const [contextMod, clarityMod, firebaseUtilsMod, profileMod, firebaseMod, firestoreMod, functionsMod] =
    await Promise.all([
      import('./getBehavioralContext.js'),
      import('./clarityScore.js'),
      import('./firebaseUtils.js'),
      import('./userProfile.js'),
      import('../firebase.js'),
      import('firebase/firestore'),
      import('firebase/functions'),
    ]);

  return {
    getBehavioralContext: contextMod.getBehavioralContext,
    getActiveDriftSignals: clarityMod.getActiveDriftSignals,
    readUserData: firebaseUtilsMod.readUserData,
    getUserProfile: profileMod.getUserProfile,
    getDb: firebaseMod.getDb,
    getAuth: firebaseMod.getAuth,
    firestore: firestoreMod,
    functions: functionsMod,
  };
};

// ─── Source context aggregation ───────────────────────────────────────────────

/**
 * Build the structured source context the Morning Brief system prompt reads.
 *
 * Fields:
 *   - behavioralContext: everything getBehavioralContext returns
 *   - activeDriftSignals: current signals from getActiveDriftSignals
 *   - recentViolatedRules: up to 3 Hard Lessons rules violated in last 14d
 *   - escapedTargets: active Kill List targets with an escape in last 7d,
 *                     with their implementation intention
 *   - activeSituations / knownTriggers: personal-context fields captured in
 *                     onboarding so the brief can reference them by name
 *                     (onboarding promises the system will do exactly this)
 *
 * Any individual source's failure is isolated — the brief should never
 * block. A failing reader yields an empty array / null for its field.
 */
export async function buildSourceContext(userId, deps = {}) {
  const loadedDefaults = (!deps.getBehavioralContext || !deps.getActiveDriftSignals || !deps.readUserData)
    ? await loadDefaults()
    : null;

  const getBehavioralContextFn = deps.getBehavioralContext || loadedDefaults.getBehavioralContext;
  const getActiveDriftSignalsFn = deps.getActiveDriftSignals || loadedDefaults.getActiveDriftSignals;
  const readUserData = deps.readUserData || loadedDefaults.readUserData;
  // Profile read is optional: tests that inject the three core readers skip
  // loadDefaults entirely and don't provide getUserProfile, so guard for it.
  const getUserProfileFn = deps.getUserProfile || loadedDefaults?.getUserProfile || null;

  const now = Date.now();
  const window14 = 14 * MS_PER_DAY;
  const window7 = 7 * MS_PER_DAY;

  // Each source is wrapped so a single failure doesn't nuke the brief.
  const behavioralContext = await getBehavioralContextFn(userId).catch((err) => {
    logger.warn('dailyBrief: behavioralContext fetch failed', err?.message);
    return null;
  });

  const activeDriftSignals = await getActiveDriftSignalsFn(userId, {
    readUserData,
  }).then((res) => (Array.isArray(res) ? res : res?.signals || []))
    .catch((err) => {
      logger.warn('dailyBrief: activeDriftSignals fetch failed', err?.message);
      return [];
    });

  // Recent violated rules (last 14d). Reuses the hardLessons collection.
  let recentViolatedRules = [];
  try {
    const hardLessons = (await readUserData('hardLessons')) || [];
    const finalized = hardLessons.filter(
      (l) => l.isFinalized === true && (l.ruleGoingForward || '').trim().length > 0
    );
    const violationEvents = [];
    finalized.forEach((lesson) => {
      const rule = lesson.ruleGoingForward;
      const violations = Array.isArray(lesson.violations) ? lesson.violations : [];
      violations.forEach((v) => {
        const ts = toMs(v?.date || v?.timestamp || v);
        if (ts && now - ts <= window14) violationEvents.push({ rule, violatedAt: ts });
      });
      const lastTs = toMs(lesson.lastViolatedAt);
      if (lastTs && now - lastTs <= window14) {
        violationEvents.push({ rule, violatedAt: lastTs });
      }
    });
    // De-dupe by rule text, keep the most recent timestamp per rule, take top 3.
    const latestByRule = new Map();
    violationEvents.forEach((v) => {
      const prev = latestByRule.get(v.rule);
      if (!prev || prev.violatedAt < v.violatedAt) latestByRule.set(v.rule, v);
    });
    recentViolatedRules = [...latestByRule.values()]
      .sort((a, b) => b.violatedAt - a.violatedAt)
      .slice(0, 3)
      .map((v) => ({
        rule: v.rule,
        daysAgo: Math.max(0, Math.floor((now - v.violatedAt) / MS_PER_DAY)),
      }));
  } catch (err) {
    logger.warn('dailyBrief: recentViolatedRules fetch failed', err?.message);
    recentViolatedRules = [];
  }

  // Active Kill targets with an escape in last 7d, plus their implementation
  // intention. Sorted by recency of last escape.
  let escapedTargets = [];
  try {
    const killTargets = (await readUserData('killTargets')) || [];
    escapedTargets = killTargets
      .filter((t) => t.status === 'active')
      .map((t) => {
        const escapes = Array.isArray(t.escapeData) ? t.escapeData : [];
        const recentEscapes = escapes.filter((e) => {
          const ts = toMs(e?.date);
          return ts && now - ts <= window7;
        });
        if (recentEscapes.length === 0) return null;
        const lastEscapeMs = recentEscapes.reduce((m, e) => Math.max(m, toMs(e.date)), 0);
        return {
          title: t.title || '',
          escapeCountLast7d: recentEscapes.length,
          lastEscapeDaysAgo: Math.max(0, Math.floor((now - lastEscapeMs) / MS_PER_DAY)),
          implementationIntention: t.implementationIntention?.trigger
            ? {
                trigger: t.implementationIntention.trigger,
                response: t.implementationIntention.response || '',
              }
            : null,
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.lastEscapeDaysAgo - b.lastEscapeDaysAgo);
  } catch (err) {
    logger.warn('dailyBrief: escapedTargets fetch failed', err?.message);
    escapedTargets = [];
  }

  // Personal context from the user profile (set during onboarding / Settings).
  // Optional and best-effort — a failure here must never block the brief.
  let activeSituations = [];
  let knownTriggers = [];
  if (typeof getUserProfileFn === 'function') {
    try {
      const profile = await getUserProfileFn();
      activeSituations = Array.isArray(profile?.activeSituations) ? profile.activeSituations.filter(Boolean) : [];
      knownTriggers = Array.isArray(profile?.knownTriggers) ? profile.knownTriggers.filter(Boolean) : [];
    } catch (err) {
      logger.warn('dailyBrief: user profile fetch failed', err?.message);
    }
  }

  return {
    behavioralContext: behavioralContext || null,
    activeDriftSignals,
    recentViolatedRules,
    escapedTargets,
    activeSituations,
    knownTriggers,
  };
}

// ─── Oracle call ──────────────────────────────────────────────────────────────

/**
 * Serialize the source context into a compact, LLM-readable payload.
 * The structure is deliberately verbose/labeled so Claude reads it as data,
 * not as narrative to mimic.
 */
function serializeSourceContext(ctx) {
  const lines = [];
  const bc = ctx.behavioralContext || {};

  if (bc.identityDirection) {
    lines.push(`Identity direction: "${bc.identityDirection}"`);
  }
  if (typeof bc.totalEntryCount === 'number' && bc.totalEntryCount > 0) {
    lines.push(`Total behavioral entries logged: ${bc.totalEntryCount}`);
  }
  if (bc.dominantRelapseArchetype) {
    lines.push(`Dominant relapse archetype (14d): ${bc.dominantRelapseArchetype}`);
  }
  if (typeof bc.recentRelapseCount === 'number' && bc.recentRelapseCount > 0) {
    lines.push(`Relapse entries (14d): ${bc.recentRelapseCount}`);
  }
  if (bc.journalLanguagePattern) {
    lines.push(`Recent journal language pattern: ${bc.journalLanguagePattern}`);
  }

  if (Array.isArray(ctx.activeDriftSignals) && ctx.activeDriftSignals.length > 0) {
    lines.push('Active drift signals:');
    ctx.activeDriftSignals.forEach((s) => {
      if (s.type === 'archetype_frequency') {
        lines.push(`  - archetype "${s.archetype}" active ${s.streak} consecutive days`);
      } else if (s.type === 'precursor_pattern') {
        lines.push(`  - precursor "${s.condition}" present across ${s.streak} consecutive days of relapses`);
      } else if (s.type === 'correlated_escape') {
        lines.push(`  - kill list escape + relapse within 48h on target "${s.targetTitle}"`);
      } else if (s.type === 'life_transition') {
        lines.push(`  - routine disruption across ${s.streak} consecutive days`);
      } else {
        lines.push(`  - ${s.description || s.type}`);
      }
    });
  }

  if (Array.isArray(ctx.recentViolatedRules) && ctx.recentViolatedRules.length > 0) {
    lines.push('Hard Lessons rules violated (last 14d):');
    ctx.recentViolatedRules.forEach((r) => {
      lines.push(`  - "${r.rule}" — violated ${r.daysAgo} day${r.daysAgo === 1 ? '' : 's'} ago`);
    });
  }

  if (Array.isArray(ctx.escapedTargets) && ctx.escapedTargets.length > 0) {
    lines.push('Active Kill List targets with escapes (last 7d):');
    ctx.escapedTargets.forEach((t) => {
      const intent = t.implementationIntention
        ? ` — implementation intention: when "${t.implementationIntention.trigger}" then "${t.implementationIntention.response}"`
        : '';
      lines.push(
        `  - "${t.title}" — ${t.escapeCountLast7d} escape${t.escapeCountLast7d === 1 ? '' : 's'} in last 7 days (last ${t.lastEscapeDaysAgo} day${t.lastEscapeDaysAgo === 1 ? '' : 's'} ago)${intent}`
      );
    });
  }

  if (Array.isArray(ctx.activeSituations) && ctx.activeSituations.length > 0) {
    lines.push(`Currently navigating: ${ctx.activeSituations.join('; ')}`);
  }

  if (Array.isArray(ctx.knownTriggers) && ctx.knownTriggers.length > 0) {
    lines.push(`Known failure points: ${ctx.knownTriggers.join('; ')}`);
  }

  if (Array.isArray(bc.activeKillTargets) && bc.activeKillTargets.length > 0 && ctx.escapedTargets.length === 0) {
    // Surface active targets only when there are no recent escapes — otherwise
    // the escapedTargets block already carries the most relevant targets.
    lines.push('Active Kill List targets (no escapes in last 7d):');
    bc.activeKillTargets.slice(0, 5).forEach((t) => {
      lines.push(`  - "${t.title}" (streak: ${t.streak}, total escapes: ${t.escapeCount})`);
    });
  }

  if (lines.length === 0) {
    return 'SNAPSHOT: record still forming. No active drift signals, no violated rules, no recent escapes. The user has produced little to no data yet.';
  }

  return `SNAPSHOT:\n${lines.join('\n')}`;
}

/**
 * Invoke the Oracle Cloud Function with moduleName='morning_brief'.
 * The server-side prompt registry composes the system prompt. Client sends
 * only the serialized snapshot as entryText.
 *
 * Throws BriefError on failure so the component catches a typed error.
 */
async function callOracleForBrief(serializedContext, callOracleFn) {
  try {
    const result = await callOracleFn({
      entryText: serializedContext,
      moduleName: 'morning_brief',
      userContext: {},
      tone: 'stoic',
    });
    const text = (result?.data?.feedback || '').trim();
    if (!text) {
      throw new BriefError('Oracle returned empty brief text.');
    }
    return text;
  } catch (err) {
    if (err instanceof BriefError) throw err;
    throw new BriefError(`Oracle call failed: ${err?.message || 'unknown error'}`, err);
  }
}

// ─── Firestore I/O ────────────────────────────────────────────────────────────

/**
 * Read the cached brief document for (userId, dateKey). Returns the stored
 * object (minus Firestore metadata) or null when no document exists.
 *
 * Injected deps: { getDb, firestore } — test-friendly shape mirroring the
 * modular Firebase SDK.
 */
export async function getCachedDailyBrief(userId, date = new Date(), deps = {}) {
  if (!userId) return null;
  const dateKey = typeof date === 'string' ? date : localDateKey(date);

  // Fast-path injected reader (used by tests): a single function that maps
  // (userId, dateKey) → stored object or null. Keeps the test surface minimal
  // without requiring the modular Firestore SDK shape.
  if (typeof deps.readBrief === 'function') {
    try {
      return (await deps.readBrief(userId, dateKey)) || null;
    } catch (err) {
      logger.warn('dailyBrief: cached brief read failed', err?.message);
      return null;
    }
  }

  try {
    const loaded = (!deps.getDb || !deps.firestore) ? await loadDefaults() : null;
    const getDb = deps.getDb || loaded.getDb;
    const firestore = deps.firestore || loaded.firestore;
    const db = await getDb();
    const ref = firestore.doc(db, DAILY_BRIEFS_COLLECTION, docIdFor(userId, dateKey));
    const snap = await firestore.getDoc(ref);
    if (!snap.exists()) return null;
    return snap.data();
  } catch (err) {
    logger.warn('dailyBrief: cached brief read failed', err?.message);
    return null;
  }
}

async function writeDailyBrief(userId, dateKey, payload, deps = {}) {
  // Fast-path injected writer (used by tests).
  if (typeof deps.writeBrief === 'function') {
    await deps.writeBrief(userId, dateKey, payload);
    return;
  }

  const loaded = (!deps.getDb || !deps.firestore) ? await loadDefaults() : null;
  const getDb = deps.getDb || loaded.getDb;
  const firestore = deps.firestore || loaded.firestore;
  const db = await getDb();
  const ref = firestore.doc(db, DAILY_BRIEFS_COLLECTION, docIdFor(userId, dateKey));
  await firestore.setDoc(ref, payload);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * generateDailyBrief — build the source context, call Oracle, write the cache.
 *
 * Always returns a brief object when Oracle succeeds, even if the Firestore
 * write fails (the write failure is logged but never rethrown — the caller
 * receives the generated brief in-memory and can decide what to do).
 *
 * Throws BriefError when the Oracle call fails.
 *
 * @param {string} userId
 * @param {object} deps — test-injectable dependencies
 * @returns {Promise<{ brief: string, generatedAt: object, sourceContext: object, dateKey: string }>}
 */
export async function generateDailyBrief(userId, deps = {}) {
  if (!userId) throw new BriefError('generateDailyBrief: userId is required');

  const sourceContext = await buildSourceContext(userId, deps);
  const serialized = serializeSourceContext(sourceContext);

  // Oracle caller: either injected (test), or constructed from the Firebase
  // Functions SDK using the modular `httpsCallable` export.
  let callOracleFn = deps.callOracle;
  if (!callOracleFn) {
    const loaded = await loadDefaults();
    const functions = loaded.functions.getFunctions();
    callOracleFn = loaded.functions.httpsCallable(functions, 'oracle', { timeout: 30000 });
  }

  const brief = await callOracleForBrief(serialized, callOracleFn);

  // serverTimestamp is provided by deps when tests inject a fake, otherwise
  // by the Firestore SDK. Fall back to a plain Date when neither is present
  // so the in-memory return shape is still useful.
  let generatedAt;
  try {
    if (deps.serverTimestamp) {
      generatedAt = deps.serverTimestamp();
    } else {
      const { serverTimestamp } = await import('firebase/firestore');
      generatedAt = serverTimestamp();
    }
  } catch {
    generatedAt = new Date();
  }

  const dateKey = localDateKey(deps.now ? deps.now() : new Date());
  const payload = {
    userId,
    dateKey,
    brief,
    generatedAt,
    sourceContext,
  };

  // Write failure must not throw — caller can still render the brief.
  try {
    await writeDailyBrief(userId, dateKey, payload, deps);
  } catch (err) {
    logger.warn('dailyBrief: cache write failed (non-fatal)', err?.message);
  }

  return payload;
}

/**
 * getOrGenerateDailyBrief — cache-first. Reads the cache for today; if absent,
 * generates (which also writes) and returns the brief. Never regenerates on
 * the same calendar day — the same-day cache always wins.
 */
export async function getOrGenerateDailyBrief(userId, date = new Date(), deps = {}) {
  if (!userId) throw new BriefError('getOrGenerateDailyBrief: userId is required');
  const dateKey = typeof date === 'string' ? date : localDateKey(date);

  const cached = await getCachedDailyBrief(userId, dateKey, deps);
  if (cached && cached.brief) return cached;

  return generateDailyBrief(userId, { ...deps, now: deps.now || (() => (typeof date === 'string' ? new Date(`${date}T12:00:00`) : date)) });
}
