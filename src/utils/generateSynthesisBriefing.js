/**
 * generateSynthesisBriefing — Cross-module behavioral intelligence synthesis
 *
 * Aggregates behavioral signals from all 5 Inner Ops modules and generates
 * a structured briefing. Core correlation is rules-based — no LLM.
 * The confrontation question is the only LLM call.
 *
 * Cadence-enforced: user cannot generate more than once per cadence period.
 *
 * Finding 13 remediation: returns a discriminated union —
 *   { status: 'ok', briefing } on success
 *   { status: 'locked', nextEligibleAt, remainingDays } when cadence blocks
 *   { status: 'insufficient-data' } when no cross-module signal exists yet
 * Throws only for genuinely exceptional failures (missing userId, write error).
 *
 * @param {string} userId
 * @param {string} cadence - 'weekly' | 'biweekly'
 * @returns {Promise<{status:'ok',briefing:object}|{status:'locked',nextEligibleAt:string,remainingDays:number}|{status:'insufficient-data'}>}
 */
import { readUserData, writeData } from './firebaseUtils.js';
import { getFunctions, httpsCallable } from 'firebase/functions';
import logger from './logger.js';
import { getEntryTimestamp as getTimestamp } from './dateUtils.js';
import {
  COLLECTIONS,
  RELAPSE_FIELDS,
  KILL_TARGET_FIELDS,
  HARD_LESSON_FIELDS,
  BLACK_MIRROR_FIELDS,
  USER_SETTINGS_FIELDS,
} from './schema.js';
import { resolveArchetypeLabel } from './relapseTaxonomy.js';

const CADENCE_DAYS = { weekly: 7, biweekly: 14 };

// Hard write-cooldown — defeats "Generate now" spamming. Manual generations
// pass bypassCadence:true to skip the weekly/biweekly gate, but a click-storm
// must NEVER pile up duplicate docs. If a briefing was written within
// MIN_WRITE_INTERVAL_MS, return that one instead of writing again.
const MIN_WRITE_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

export async function generateSynthesisBriefing(userId, cadence = 'weekly', options = {}) {
  if (!userId) throw new Error('userId required');

  const cadenceDays = CADENCE_DAYS[cadence] ?? 7;

  // Tests inject `options.readUserData` / `options.writeData` to drive
  // readers/writers with in-memory fixtures, mirroring the pattern in
  // dailyBrief.js and clarityScore.js. Production callers omit them.
  const reader = options.readUserData || readUserData;
  const writer = options.writeData || writeData;

  // --- Cadence check ---
  // Auto-generate path enforces the cadence so users don't drown in briefings.
  // Manual on-demand path passes { bypassCadence: true } to skip this gate —
  // Oracle CF's 20/day rate limit is the effective cap.
  const syntheses = await reader(COLLECTIONS.SYNTHESES).catch(() => []);
  const sorted = (syntheses || []).sort((a, b) => new Date(b.generatedAt) - new Date(a.generatedAt));
  const lastBriefing = sorted[0];

  if (!options.bypassCadence && lastBriefing?.generatedAt) {
    const daysSinceLast = (Date.now() - new Date(lastBriefing.generatedAt).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceLast < cadenceDays) {
      const nextEligibleAt = new Date(
        new Date(lastBriefing.generatedAt).getTime() + cadenceDays * 24 * 60 * 60 * 1000
      );
      return {
        status: 'locked',
        nextEligibleAt: nextEligibleAt.toISOString(),
        remainingDays: Math.max(0, Math.ceil(cadenceDays - daysSinceLast)),
      };
    }
  }

  // Hard write-cooldown — even with bypassCadence:true, refuse to write a new
  // doc if one was created in the last MIN_WRITE_INTERVAL_MS. Return the
  // existing briefing as the "ok" result so the UI shows it without piling up
  // duplicates from a click-storm.
  if (lastBriefing?.generatedAt) {
    const msSinceLast = Date.now() - new Date(lastBriefing.generatedAt).getTime();
    if (msSinceLast >= 0 && msSinceLast < MIN_WRITE_INTERVAL_MS) {
      return { status: 'ok', briefing: lastBriefing, reused: true };
    }
  }

  // --- Pull data from all 5 modules + user settings ---
  const [relapseEntries, killTargets, hardLessons, blackMirrorEntries, journalEntries, userSettings] = await Promise.all([
    reader(COLLECTIONS.RELAPSE_ENTRIES).catch(() => []),
    reader(COLLECTIONS.KILL_TARGETS).catch(() => []),
    reader(COLLECTIONS.HARD_LESSONS).catch(() => []),
    reader(COLLECTIONS.BLACK_MIRROR_ENTRIES).catch(() => []),
    reader(COLLECTIONS.JOURNAL_ENTRIES).catch(() => []),
    reader(COLLECTIONS.USER_SETTINGS).catch(() => []),
  ]);

  // Cold-start gate: synthesis is a cross-module read. With no active target,
  // no finalized rule, and no relapse entry, convergence has nothing to land on
  // and the briefing reads generic. Mirrors the manual-path `hasCrossModuleData`
  // check in SynthesisBriefing.jsx so auto and manual paths agree on the bar.
  // Returning before generateConfrontationQuestion also avoids a billed Oracle
  // call for users with no signal.
  const hasActiveTarget = (killTargets || []).some(t => t[KILL_TARGET_FIELDS.STATUS] === 'active');
  const hasFinalizedRule = (hardLessons || []).some(l => l[HARD_LESSON_FIELDS.IS_FINALIZED]);
  const hasRelapseEntry = (relapseEntries || []).length > 0;
  if (!hasActiveTarget && !hasFinalizedRule && !hasRelapseEntry) {
    return { status: 'insufficient-data' };
  }

  // BER-137: identity direction
  const identityDirection = (userSettings || [])[0]?.[USER_SETTINGS_FIELDS.IDENTITY_DIRECTION] || null;

  const now = Date.now();
  const windowMs28 = 28 * 24 * 60 * 60 * 1000;
  const windowMs14 = 14 * 24 * 60 * 60 * 1000;

  // --- Relapse: archetype frequencies (last 28d) ---
  const recentRelapses = (relapseEntries || []).filter(e => now - getTimestamp(e) < windowMs28);
  const archetypeCounts = {};
  recentRelapses.forEach(e => {
    const archetype = e[RELAPSE_FIELDS.ARCHETYPE];
    if (archetype) archetypeCounts[archetype] = (archetypeCounts[archetype] || 0) + 1;
  });
  // UXR-002 Spec 4: resolve to behavioral-descriptor label for all downstream
  // consumers (convergence copy, Oracle confrontation prompt). The ID is
  // already captured in `archetypeCounts` keys if needed.
  const dominantArchetypeId = Object.entries(archetypeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  const dominantArchetype = dominantArchetypeId ? resolveArchetypeLabel(dominantArchetypeId) : null;
  const recentRelapseCount = recentRelapses.length;

  // --- Kill List: active targets, escape patterns ---
  const activeTargets = (killTargets || []).filter(t => t[KILL_TARGET_FIELDS.STATUS] === 'active');
  const highEscapeTargets = activeTargets.filter(t => (t[KILL_TARGET_FIELDS.ESCAPES] || []).length >= 3);
  const totalEscapes28d = (killTargets || []).reduce((sum, t) => {
    const recent = (t[KILL_TARGET_FIELDS.ESCAPES] || []).filter(e => e.date && now - new Date(e.date).getTime() < windowMs28);
    return sum + recent.length;
  }, 0);

  // --- Hard Lessons: violated finalized rules ---
  const violatedRules = (hardLessons || [])
    .filter(l => l[HARD_LESSON_FIELDS.IS_VIOLATION] && l[HARD_LESSON_FIELDS.RULE])
    .map(l => ({ rule: l[HARD_LESSON_FIELDS.RULE], source: 'Hard Lessons' }));

  const finalizedRules = (hardLessons || [])
    .filter(l => l[HARD_LESSON_FIELDS.IS_FINALIZED] && l[HARD_LESSON_FIELDS.RULE])
    .map(l => l[HARD_LESSON_FIELDS.RULE]);

  // --- Journal: cadence signal (entries per week in 28d window) ---
  // Mood labels were retired (Spec 3, UXR-002). Language is the signal;
  // dominant-mood reads are gone. Replace with a cheap cadence proxy so
  // downstream logic that cared about "journal activity" still has a read.
  const recentJournals = (journalEntries || []).filter(e => now - getTimestamp(e) < windowMs28);
  const journalEntriesPerWeek = Number((recentJournals.length / 4).toFixed(1));

  // --- Black Mirror: trend over 4 weeks (BER-149: incorporates violatedRules) ---
  let signalDelta = 'stable';
  if ((blackMirrorEntries || []).length >= 4) {
    const bmSorted = [...blackMirrorEntries].sort((a, b) => getTimestamp(b) - getTimestamp(a));
    const recent2 = bmSorted.slice(0, 2).map(e => e[BLACK_MIRROR_FIELDS.INDEX] || 0);
    const older2 = bmSorted.slice(2, 4).map(e => e[BLACK_MIRROR_FIELDS.INDEX] || 0);
    const recentAvg = recent2.reduce((s, v) => s + v, 0) / 2;
    const olderAvg = older2.reduce((s, v) => s + v, 0) / 2;
    if (recentRelapseCount === 0 && totalEscapes28d <= 1 && recentAvg < olderAvg * 0.9 && violatedRules.length === 0) signalDelta = 'improving';
    else if (recentRelapseCount >= 3 || totalEscapes28d >= 5 || recentAvg > olderAvg * 1.2 || violatedRules.length >= 2) signalDelta = 'deteriorating';
  } else {
    // Fallback without Black Mirror data
    if (recentRelapseCount >= 3 || totalEscapes28d >= 5 || violatedRules.length >= 2) signalDelta = 'deteriorating';
    else if (recentRelapseCount === 0 && activeTargets.some(t => t.streak > 14) && violatedRules.length === 0) signalDelta = 'improving';
  }

  // --- Convergence Point (cross-module pattern, rules-based) ---
  const convergencePoint = deriveConvergencePoint({
    dominantArchetype, highEscapeTargets, violatedRules, finalizedRules, recentRelapseCount, signalDelta
  });

  // BER-137: signal delta note on identity direction alignment
  const signalDeltaNote = identityDirection && signalDelta === 'deteriorating'
    ? `Behavioral patterns are moving against the stated identity direction: "${identityDirection}".`
    : identityDirection && signalDelta === 'improving'
      ? `Behavioral patterns are consistent with the stated identity direction: "${identityDirection}".`
      : null;

  // --- Confrontation Question (LLM, strict prompt) ---
  const confrontationQuestion = await generateConfrontationQuestion({
    convergencePoint, violatedRules, finalizedRules, dominantArchetype, signalDelta,
    recentRelapseCount, activeTargetCount: activeTargets.length, highEscapeTargets,
    identityDirection, journalEntriesPerWeek,
  });

  // Manual on-demand generations do NOT set isNew. The SynthesisGuard force-
  // redirects to /dashboard while isNew is true, which is the desired UX for
  // surprise auto-generated briefings but breaks navigation when the user
  // just pressed "Generate now" — they are already looking at the briefing.
  const isManualTrigger = !!options.bypassCadence;
  const briefing = {
    userId,
    generatedAt: new Date().toISOString(),
    cadencePeriod: cadence,
    isNew: !isManualTrigger,
    readAt: isManualTrigger ? new Date().toISOString() : null,
    convergencePoint,
    violatedRules,
    signalDelta,
    signalDeltaNote,
    confrontationQuestion,
    // Renamed from `_meta` to `meta` so the Vite terser `mangle.properties:
    // /^_/` config (vite.config.js) doesn't rewrite the key on the way into
    // Firestore — leading-underscore properties get mangled in prod, which
    // silently corrupts the stored field name.
    meta: {
      recentRelapseCount,
      dominantArchetype,
      journalEntriesPerWeek,
      activeTargetCount: activeTargets.length,
      highEscapeTargetCount: highEscapeTargets.length,
      finalizedRuleCount: finalizedRules.length,
      identityDirection,
    },
  };

  // Capture the doc id so the page can target it for read-marking and delete.
  const written = await writer(COLLECTIONS.SYNTHESES, briefing);
  const briefingWithId = written?.id ? { ...briefing, id: written.id } : briefing;
  return { status: 'ok', briefing: briefingWithId };
}

function deriveConvergencePoint({ dominantArchetype, highEscapeTargets, violatedRules, finalizedRules, recentRelapseCount, signalDelta }) {
  const signals = [];

  if (dominantArchetype && recentRelapseCount >= 2) {
    signals.push(`${dominantArchetype} archetype active across ${recentRelapseCount} recent relapse entries`);
  }
  if (highEscapeTargets.length >= 2) {
    const names = highEscapeTargets.slice(0, 2).map(t => t.title).join(', ');
    signals.push(`Repeated escape on Ledger targets (${names})`);
  }
  if (violatedRules.length > 0) {
    signals.push(`${violatedRules.length} finalized rule${violatedRules.length > 1 ? 's' : ''} violated`);
  } else if (finalizedRules.length > 0 && (recentRelapseCount >= 2 || highEscapeTargets.length >= 1)) {
    signals.push(`Behavioral drift active against ${finalizedRules.length} committed rule${finalizedRules.length > 1 ? 's' : ''}`);
  }

  if (signals.length === 0) {
    return signalDelta === 'improving'
      ? 'No dominant negative convergence pattern detected this period.'
      : 'Behavioral data spread across modules without a single dominant pattern.';
  }

  return signals.join('. ') + '.';
}

async function generateConfrontationQuestion(data) {
  const dataStr = [
    data.convergencePoint && `Pattern: ${data.convergencePoint}`,
    data.dominantArchetype && `Relapse archetype: ${data.dominantArchetype} (${data.recentRelapseCount} entries)`,
    data.violatedRules.length > 0 && `Violated rules: ${data.violatedRules.map(r => r.rule).join('; ')}`,
    data.finalizedRules?.length > 0 && `Committed behavioral rules: ${data.finalizedRules.join('; ')}`,
    data.signalDelta && `Signal trend: ${data.signalDelta}`,
    typeof data.journalEntriesPerWeek === 'number' && `Journal cadence (28d avg): ${data.journalEntriesPerWeek} entries/week`,
    data.highEscapeTargets.length > 0 && `Ledger repeated failures: ${data.highEscapeTargets.map(t => t.title).join(', ')}`,
    data.identityDirection && `User's stated identity direction: "${data.identityDirection}"`,
  ].filter(Boolean).join('\n');

  try {
    const functions = getFunctions();
    const oracleFn = httpsCallable(functions, 'oracle', { timeout: 20000 });
    const result = await oracleFn({
      entryText: dataStr,
      moduleName: 'synthesis',
      userContext: {},
      tone: 'stoic',
      // Finding 3 remediation: server-side prompt template lookup.
      promptContextKey: 'synthesis_confrontation',
    });
    const q = result.data?.feedback?.trim();
    if (q) return q.endsWith('?') ? q : q + '?';
  } catch (err) {
    logger.warn('Oracle unavailable for synthesis confrontation question:', err?.message);
  }

  // Local fallback — pick from data-grounded templates
  return buildFallbackQuestion(data);
}

function buildFallbackQuestion({ dominantArchetype, violatedRules, highEscapeTargets, signalDelta, recentRelapseCount }) {
  // Pass 2 Finding 10 remediation: extract first-element accesses into named
  // locals with explicit defaults so a future branch addition can't trip on a
  // null highEscapeTargets[0] / violatedRules[0] reference.
  const safeViolatedRules = Array.isArray(violatedRules) ? violatedRules : [];
  const safeHighEscapeTargets = Array.isArray(highEscapeTargets) ? highEscapeTargets : [];
  const firstViolatedRule = safeViolatedRules[0]?.rule ?? null;
  const firstHighEscape = safeHighEscapeTargets[0] ?? null;
  const firstHighEscapeTitle = firstHighEscape?.title ?? null;
  const firstHighEscapeCount = firstHighEscape?.escapeData?.length ?? 0;

  if (firstViolatedRule) {
    return `You wrote the rule "${firstViolatedRule}" — what made you believe this time would be different?`;
  }
  if (dominantArchetype && recentRelapseCount >= 2) {
    return `${dominantArchetype} has appeared ${recentRelapseCount} times this period — what environment, relationship, or internal state is sustaining it?`;
  }
  if (firstHighEscapeTitle) {
    return `"${firstHighEscapeTitle}" has been escaped ${firstHighEscapeCount} times — what specific condition would have to change for the outcome to be different?`;
  }
  if (signalDelta === 'deteriorating') {
    return 'The trend across modules is deteriorating — what specific decision in the last 14 days set this in motion?';
  }
  return 'What pattern in your behavior this period are you most reluctant to name precisely?';
}
