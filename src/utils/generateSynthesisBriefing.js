/**
 * generateSynthesisBriefing — Cross-module behavioral intelligence synthesis
 *
 * Aggregates behavioral signals from all 5 Inner Ops modules and generates
 * a structured briefing. Core correlation is rules-based — no LLM.
 * The confrontation question is the only LLM call.
 *
 * Cadence-enforced: user cannot generate more than once per cadence period.
 *
 * @param {string} userId
 * @param {string} cadence - 'weekly' | 'biweekly'
 * @returns {Promise<SynthesisBriefing>}
 * @throws {string} 'CADENCE_LOCK:<ISO date>' if within cadence period
 */
import { readUserData, writeData } from './firebaseUtils';
import { getFunctions, httpsCallable } from 'firebase/functions';
import logger from './logger';

const CADENCE_DAYS = { weekly: 7, biweekly: 14 };

const getTimestamp = (entry) =>
  entry?.createdAt?.toDate?.()?.getTime() ?? entry?.timestamp ?? 0;

export async function generateSynthesisBriefing(userId, cadence = 'weekly') {
  if (!userId) throw new Error('userId required');

  const cadenceDays = CADENCE_DAYS[cadence] ?? 7;

  // --- Cadence check ---
  const syntheses = await readUserData('syntheses').catch(() => []);
  const sorted = (syntheses || []).sort((a, b) => new Date(b.generatedAt) - new Date(a.generatedAt));
  const lastBriefing = sorted[0];

  if (lastBriefing?.generatedAt) {
    const daysSinceLast = (Date.now() - new Date(lastBriefing.generatedAt).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceLast < cadenceDays) {
      const nextAt = new Date(new Date(lastBriefing.generatedAt).getTime() + cadenceDays * 24 * 60 * 60 * 1000);
      throw new Error(`CADENCE_LOCK:${nextAt.toISOString()}`);
    }
  }

  // --- Pull data from all 5 modules ---
  const [relapseEntries, killTargets, hardLessons, blackMirrorEntries, journalEntries] = await Promise.all([
    readUserData('relapseEntries').catch(() => []),
    readUserData('killTargets').catch(() => []),
    readUserData('hardLessons').catch(() => []),
    readUserData('blackMirrorEntries').catch(() => []),
    readUserData('journalEntries').catch(() => []),
  ]);

  const now = Date.now();
  const windowMs28 = 28 * 24 * 60 * 60 * 1000;
  const windowMs14 = 14 * 24 * 60 * 60 * 1000;

  // --- Relapse: archetype frequencies (last 28d) ---
  const recentRelapses = (relapseEntries || []).filter(e => now - getTimestamp(e) < windowMs28);
  const archetypeCounts = {};
  recentRelapses.forEach(e => {
    if (e.selectedSelf) archetypeCounts[e.selectedSelf] = (archetypeCounts[e.selectedSelf] || 0) + 1;
  });
  const dominantArchetype = Object.entries(archetypeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  const recentRelapseCount = recentRelapses.length;

  // --- Kill List: active targets, escape patterns ---
  const activeTargets = (killTargets || []).filter(t => t.status === 'active');
  const highEscapeTargets = activeTargets.filter(t => (t.escapeData || []).length >= 3);
  const totalEscapes28d = (killTargets || []).reduce((sum, t) => {
    const recent = (t.escapeData || []).filter(e => e.date && now - new Date(e.date).getTime() < windowMs28);
    return sum + recent.length;
  }, 0);

  // --- Hard Lessons: violated finalized rules ---
  const violatedRules = (hardLessons || [])
    .filter(l => l.isRuleViolation && l.ruleGoingForward)
    .map(l => ({ rule: l.ruleGoingForward, source: 'Hard Lessons' }));

  const finalizedRules = (hardLessons || [])
    .filter(l => l.isFinalized && l.ruleGoingForward)
    .map(l => l.ruleGoingForward);

  // --- Black Mirror: trend over 4 weeks ---
  let signalDelta = 'stable';
  if ((blackMirrorEntries || []).length >= 4) {
    const bmSorted = [...blackMirrorEntries].sort((a, b) => getTimestamp(b) - getTimestamp(a));
    const recent2 = bmSorted.slice(0, 2).map(e => e.phonePickups || e.screenTime || 0);
    const older2 = bmSorted.slice(2, 4).map(e => e.phonePickups || e.screenTime || 0);
    const recentAvg = recent2.reduce((s, v) => s + v, 0) / 2;
    const olderAvg = older2.reduce((s, v) => s + v, 0) / 2;
    if (recentRelapseCount === 0 && totalEscapes28d <= 1 && recentAvg < olderAvg * 0.9) signalDelta = 'improving';
    else if (recentRelapseCount >= 3 || totalEscapes28d >= 5 || recentAvg > olderAvg * 1.2) signalDelta = 'deteriorating';
  } else {
    // Fallback without Black Mirror data
    if (recentRelapseCount >= 3 || totalEscapes28d >= 5) signalDelta = 'deteriorating';
    else if (recentRelapseCount === 0 && activeTargets.some(t => t.streak > 14)) signalDelta = 'improving';
  }

  // --- Journal: dominant mood ---
  const recentJournals = (journalEntries || []).filter(e => now - getTimestamp(e) < windowMs28);
  const moodCounts = {};
  recentJournals.forEach(e => {
    const mood = e.mood || e.selectedMood;
    if (mood) moodCounts[mood] = (moodCounts[mood] || 0) + 1;
  });
  const dominantMood = Object.entries(moodCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  // --- Convergence Point (cross-module pattern, rules-based) ---
  const convergencePoint = deriveConvergencePoint({
    dominantArchetype, highEscapeTargets, violatedRules, dominantMood, recentRelapseCount, signalDelta
  });

  // --- Confrontation Question (LLM, strict prompt) ---
  const confrontationQuestion = await generateConfrontationQuestion({
    convergencePoint, violatedRules, dominantArchetype, signalDelta, dominantMood,
    recentRelapseCount, activeTargetCount: activeTargets.length, highEscapeTargets,
  });

  const briefing = {
    userId,
    generatedAt: new Date().toISOString(),
    cadencePeriod: cadence,
    convergencePoint,
    violatedRules,
    signalDelta,
    confrontationQuestion,
    _meta: {
      recentRelapseCount,
      dominantArchetype,
      dominantMood,
      activeTargetCount: activeTargets.length,
      highEscapeTargetCount: highEscapeTargets.length,
      finalizedRuleCount: finalizedRules.length,
    },
  };

  await writeData('syntheses', briefing);
  return briefing;
}

function deriveConvergencePoint({ dominantArchetype, highEscapeTargets, violatedRules, dominantMood, recentRelapseCount, signalDelta }) {
  const signals = [];

  if (dominantArchetype && recentRelapseCount >= 2) {
    signals.push(`${dominantArchetype} archetype active across ${recentRelapseCount} recent relapse entries`);
  }
  if (highEscapeTargets.length >= 2) {
    const names = highEscapeTargets.slice(0, 2).map(t => t.title).join(', ');
    signals.push(`Repeated escape on Kill List targets (${names})`);
  }
  if (violatedRules.length > 0) {
    signals.push(`${violatedRules.length} finalized rule${violatedRules.length > 1 ? 's' : ''} violated`);
  }
  if (dominantMood && ['anxious', 'low', 'frustrated', 'foggy', 'numb'].some(m => dominantMood.toLowerCase().includes(m))) {
    signals.push(`Journal mood pattern: ${dominantMood} dominant`);
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
    data.signalDelta && `Signal trend: ${data.signalDelta}`,
    data.dominantMood && `Journal mood: ${data.dominantMood}`,
    data.highEscapeTargets.length > 0 && `Kill List repeated failures: ${data.highEscapeTargets.map(t => t.title).join(', ')}`,
  ].filter(Boolean).join('\n');

  const systemPrompt = `You generate one confrontation question. Rules:\n- One question only. No preamble, no context, no explanation.\n- Derived directly from the data provided. No invented patterns.\n- Not answerable with yes/no. Requires honest reflection.\n- No advisory language, no suggestions, no affirmations, no motivational framing.\n- Uncomfortable, specific, unflinching.`;

  try {
    const functions = getFunctions();
    const oracleFn = httpsCallable(functions, 'oracle', { timeout: 20000 });
    const result = await oracleFn({
      entryText: dataStr,
      moduleName: 'synthesis',
      userContext: {},
      tone: 'stoic',
      customSystemPrompt: systemPrompt,
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
  if (violatedRules.length > 0) {
    return `You wrote the rule "${violatedRules[0].rule}" — what made you believe this time would be different?`;
  }
  if (dominantArchetype && recentRelapseCount >= 2) {
    return `${dominantArchetype} has appeared ${recentRelapseCount} times this period — what environment, relationship, or internal state is sustaining it?`;
  }
  if (highEscapeTargets.length > 0) {
    return `"${highEscapeTargets[0].title}" has been escaped ${highEscapeTargets[0].escapeData?.length || 0} times — what specific condition would have to change for the outcome to be different?`;
  }
  if (signalDelta === 'deteriorating') {
    return 'The trend across modules is deteriorating — what specific decision in the last 14 days set this in motion?';
  }
  return 'What pattern in your behavior this period are you most reluctant to name precisely?';
}
