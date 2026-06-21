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
import { getViolatedRules } from './ruleState.js';
import {
  COLLECTIONS,
  RELAPSE_FIELDS,
  RELAPSE_ENTRY_TYPES,
  KILL_TARGET_FIELDS,
  HARD_LESSON_FIELDS,
  USER_SETTINGS_FIELDS,
} from './schema.js';
import { resolveArchetypeLabel } from './relapseTaxonomy.js';
import { deriveLanguagePattern } from './getBehavioralContext.js';

const CADENCE_DAYS = { weekly: 7, biweekly: 14 };

// The Reckoning looks back over a fixed period when laying stated commitments
// against documented behavior. Matches the synthesis 28-day analysis window.
const RECKONING_PERIOD_DAYS = 28;
const RECKONING_QUOTE_MAX_CHARS = 200;

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

  // The Reckoning is a mode of this engine, not a parallel one. It shares the
  // reads, the cold-start gate, and the write-cooldown — but its cadence and
  // cooldown are scoped to its own doc type so a recent synthesis never blocks
  // (or is returned in place of) a reckoning, and vice-versa.
  const mode = options.mode === 'reckoning' ? 'reckoning' : 'synthesis';

  // --- Cadence check ---
  // Auto-generate path enforces the cadence so users don't drown in briefings.
  // Manual on-demand path passes { bypassCadence: true } to skip this gate —
  // Oracle CF's 20/day rate limit is the effective cap.
  const syntheses = await reader(COLLECTIONS.SYNTHESES).catch(() => []);
  const sorted = (syntheses || [])
    // Untyped legacy docs are synthesis briefings.
    .filter((d) => (d.type || 'synthesis') === mode)
    .sort((a, b) => new Date(b.generatedAt) - new Date(a.generatedAt));
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

  // --- Pull data from all modules + user settings ---
  const [relapseEntries, killTargets, hardLessons, journalEntries, userSettings] = await Promise.all([
    reader(COLLECTIONS.RELAPSE_ENTRIES).catch(() => []),
    reader(COLLECTIONS.KILL_TARGETS).catch(() => []),
    reader(COLLECTIONS.HARD_LESSONS).catch(() => []),
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

  // --- The Reckoning (mode branch) ---
  // Lay stated commitments against documented behavior and name the
  // contradictions. Returns insufficient-data when nothing contradicts.
  if (mode === 'reckoning') {
    return await generateReckoning({
      userId, cadence, options, writer,
      killTargets, hardLessons, relapseEntries, journalEntries, identityDirection,
    });
  }

  const now = Date.now();
  const windowMs28 = 28 * 24 * 60 * 60 * 1000;

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

  // --- Hard Lessons: violated finalized rules (last 28d) ---
  // Unified read: violations[] breaks (button / weekly review) and legacy
  // isRuleViolation docs both count. See ruleState.js.
  const violatedRules = getViolatedRules(hardLessons, { windowDays: 28, now })
    .map(r => ({ rule: r.rule, source: 'Hard Lessons' }));

  const finalizedRules = (hardLessons || [])
    .filter(l => l[HARD_LESSON_FIELDS.IS_FINALIZED] && l[HARD_LESSON_FIELDS.RULE])
    .map(l => l[HARD_LESSON_FIELDS.RULE]);

  // --- Journal: cadence signal (entries per week in 28d window) ---
  // Mood labels were retired (Spec 3, UXR-002). Language is the signal;
  // dominant-mood reads are gone. Replace with a cheap cadence proxy so
  // downstream logic that cared about "journal activity" still has a read.
  const recentJournals = (journalEntries || []).filter(e => now - getTimestamp(e) < windowMs28);
  const journalEntriesPerWeek = Number((recentJournals.length / 4).toFixed(1));

  // --- Signal Delta: trend from relapse / escape / rule-violation data ---
  let signalDelta = 'stable';
  if (recentRelapseCount >= 3 || totalEscapes28d >= 5 || violatedRules.length >= 2) signalDelta = 'deteriorating';
  else if (recentRelapseCount === 0 && activeTargets.some(t => t.streak > 14) && violatedRules.length === 0) signalDelta = 'improving';

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

  // Manual on-demand generations do NOT set isNew. isNew drives the unread
  // surfaces — the Dashboard's synthesis banner and the app-wide
  // synthesis-ready banner — which are the right nudge for a surprise auto-
  // generated briefing but pointless right after the user pressed "Generate
  // now" (they are already looking at the briefing).
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
    const oracleFn = httpsCallable(functions, 'oracle', { timeout: 30000 });
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

// ─────────────────────────────────────────────────────────────────────────
// The Reckoning
// ─────────────────────────────────────────────────────────────────────────

// A receipt quote is a verbatim substring of the real event text (trimmed +
// truncated). Returns null when there is nothing to quote — the event id +
// date still anchor the contradiction, so we never fabricate a quote.
function verbatimQuote(value) {
  if (typeof value !== 'string') return null;
  const s = value.replace(/\s+/g, ' ').trim();
  if (!s) return null;
  return s.slice(0, RECKONING_QUOTE_MAX_CHARS);
}

/**
 * Rules-based contradiction assembly. Every contradiction traces to a real
 * event id (or a doc-id#subevent@date locator); contradictions with no real
 * evidence are dropped. journalLanguagePattern drift is attached as context,
 * NOT as a contradiction (it is aggregate and cannot trace to one event).
 */
export function assembleReckoning({
  killTargets = [],
  hardLessons = [],
  relapseEntries = [],
  journalEntries = [],
  now = Date.now(),
  periodDays = RECKONING_PERIOD_DAYS,
}) {
  const windowMs = periodDays * 24 * 60 * 60 * 1000;
  const inPeriod = (ms) => Number.isFinite(ms) && ms > 0 && now - ms >= 0 && now - ms <= windowMs;
  const contradictions = [];

  // Stated commitment: eliminate an active Kill List target.
  // Contradicted by: escapes logged against it this period.
  for (const t of killTargets) {
    if (t[KILL_TARGET_FIELDS.STATUS] !== 'active') continue;
    const escapes = (t[KILL_TARGET_FIELDS.ESCAPES] || []).filter(
      (e) => e?.date && inPeriod(new Date(e.date).getTime())
    );
    if (escapes.length === 0 || !t.id) continue;
    contradictions.push({
      type: 'escape_vs_kill',
      commitment: { kind: 'killTarget', id: t.id, text: t[KILL_TARGET_FIELDS.TITLE] || 'an unnamed target' },
      evidence: escapes.map((e) => ({
        collection: COLLECTIONS.KILL_TARGETS,
        eventId: `${t.id}#escape@${e.date}`,
        date: e.date,
        kind: 'escape',
        quote: verbatimQuote(e.context) || verbatimQuote(e.rationalization),
      })),
    });
  }

  // Stated commitment: a finalized Hard Lessons rule.
  // Contradicted by: violations logged against it this period.
  for (const l of hardLessons) {
    if (!l[HARD_LESSON_FIELDS.IS_FINALIZED] || !l[HARD_LESSON_FIELDS.RULE] || !l.id) continue;
    const violations = (l[HARD_LESSON_FIELDS.VIOLATIONS] || []).filter(
      (v) => v?.date && inPeriod(new Date(v.date).getTime())
    );
    if (violations.length === 0) continue;
    contradictions.push({
      type: 'violation_vs_rule',
      commitment: { kind: 'hardLesson', id: l.id, text: l[HARD_LESSON_FIELDS.RULE] },
      evidence: violations.map((v) => ({
        collection: COLLECTIONS.HARD_LESSONS,
        eventId: `${l.id}#violation@${v.date}`,
        date: v.date,
        kind: 'violation',
        quote: verbatimQuote(v.note) || verbatimQuote(v.cause),
      })),
    });
  }

  // Standing commitment contradicted by actual relapse events this period.
  // Anchored to a real commitment (the one already most-contradicted, else the
  // first finalized rule / active target) so both sides carry real ids.
  const relapses = (relapseEntries || []).filter((e) => {
    if (e?.[RELAPSE_FIELDS.ENTRY_TYPE] !== RELAPSE_ENTRY_TYPES.RELAPSE) return false;
    const ms = e.eventOccurredAt ? new Date(e.eventOccurredAt).getTime() : getTimestamp(e);
    return inPeriod(ms);
  });
  if (relapses.length > 0) {
    const standing = pickStandingCommitment(contradictions, killTargets, hardLessons);
    if (standing) {
      const evidence = relapses
        .filter((r) => r.id)
        .map((r) => ({
          collection: COLLECTIONS.RELAPSE_ENTRIES,
          eventId: r.id,
          date: r.eventOccurredAt || new Date(getTimestamp(r)).toISOString(),
          kind: 'relapse',
          quote: verbatimQuote(r[RELAPSE_FIELDS.REFLECTION]),
        }));
      if (evidence.length > 0) {
        contradictions.push({ type: 'relapse_vs_commitment', commitment: standing, evidence });
      }
    }
  }

  // Defensive: never emit a contradiction without at least one real event id.
  const cleaned = contradictions
    .map((c) => ({ ...c, evidence: c.evidence.filter((ev) => ev.eventId) }))
    .filter((c) => c.evidence.length > 0);

  // journalLanguagePattern drift — recent half vs earlier half of the period.
  const halfMs = windowMs / 2;
  const ageOf = (e) => now - getTimestamp(e);
  const recentJournals = (journalEntries || []).filter((e) => { const a = ageOf(e); return a >= 0 && a <= halfMs; });
  const earlierJournals = (journalEntries || []).filter((e) => { const a = ageOf(e); return a > halfMs && a <= windowMs; });
  const recent = deriveLanguagePattern(recentJournals);
  const earlier = deriveLanguagePattern(earlierJournals);
  const languageDrift = recent || earlier ? { recent, earlier } : null;

  return { contradictions: cleaned, languageDrift };
}

function pickStandingCommitment(contradictions, killTargets, hardLessons) {
  const mostContradicted = [...contradictions].sort((a, b) => b.evidence.length - a.evidence.length)[0];
  if (mostContradicted) return mostContradicted.commitment;
  const rule = (hardLessons || []).find((l) => l[HARD_LESSON_FIELDS.IS_FINALIZED] && l[HARD_LESSON_FIELDS.RULE] && l.id);
  if (rule) return { kind: 'hardLesson', id: rule.id, text: rule[HARD_LESSON_FIELDS.RULE] };
  const target = (killTargets || []).find((t) => t[KILL_TARGET_FIELDS.STATUS] === 'active' && t.id);
  if (target) return { kind: 'killTarget', id: target.id, text: target[KILL_TARGET_FIELDS.TITLE] || 'an unnamed target' };
  return null;
}

function buildReckoningEntryText({ contradictions, languageDrift, identityDirection }) {
  const lines = ['THE RECKONING — stated commitments vs documented behavior this period.'];
  contradictions.forEach((c, i) => {
    const head =
      c.commitment.kind === 'killTarget'
        ? `Commitment: eliminate "${c.commitment.text}".`
        : c.commitment.kind === 'hardLesson'
          ? `Committed rule: "${c.commitment.text}".`
          : `Standing commitment: "${c.commitment.text}".`;
    const ev = c.evidence
      .map((e) => {
        const d = (e.date || '').slice(0, 10);
        const q = e.quote ? ` — "${e.quote}"` : '';
        return `   • ${e.kind} on ${d}${q}`;
      })
      .join('\n');
    lines.push(`${i + 1}. ${head} Contradicted by ${c.evidence.length} logged event(s):\n${ev}`);
  });
  if (languageDrift?.recent) {
    lines.push(`Journal language now: ${languageDrift.recent}${languageDrift.earlier ? `; earlier this period: ${languageDrift.earlier}` : ''}.`);
  }
  if (identityDirection) lines.push(`Stated identity direction: "${identityDirection}".`);
  return lines.join('\n');
}

function buildFallbackReckoning({ contradictions }) {
  const parts = contradictions.slice(0, 3).map((c) => {
    const n = c.evidence.length;
    const dates = c.evidence.slice(0, 3).map((e) => (e.date || '').slice(0, 10)).join(', ');
    if (c.commitment.kind === 'killTarget') {
      return `You committed to eliminate "${c.commitment.text}". It escaped ${n} time${n > 1 ? 's' : ''} this period (${dates}).`;
    }
    if (c.commitment.kind === 'hardLesson') {
      return `You wrote the rule "${c.commitment.text}". You broke it ${n} time${n > 1 ? 's' : ''} this period (${dates}).`;
    }
    return `You logged ${n} relapse${n > 1 ? 's' : ''} this period (${dates}) against your standing commitment.`;
  });
  return `${parts.join(' ')} Word and act diverged. Name the decision that allowed it.`;
}

async function generateReckoningConfrontation(data) {
  const entryText = buildReckoningEntryText(data);
  try {
    const functions = getFunctions();
    const oracleFn = httpsCallable(functions, 'oracle', { timeout: 30000 });
    const result = await oracleFn({
      entryText,
      moduleName: 'synthesis',
      userContext: {},
      tone: 'stoic',
      promptContextKey: 'reckoning_confrontation',
      promptContextParams: { contradictionCount: data.contradictions.length },
    });
    const t = result.data?.feedback?.trim();
    if (t) return t;
  } catch (err) {
    logger.warn('Oracle unavailable for reckoning confrontation:', err?.message);
  }
  return buildFallbackReckoning(data);
}

async function generateReckoning({
  userId, cadence, options, writer,
  killTargets, hardLessons, relapseEntries, journalEntries, identityDirection,
}) {
  const now = Date.now();
  const { contradictions, languageDrift } = assembleReckoning({
    killTargets, hardLessons, relapseEntries, journalEntries, now, periodDays: RECKONING_PERIOD_DAYS,
  });

  // Nothing contradicts the stated commitments → no reckoning, no billed call.
  if (contradictions.length === 0) return { status: 'insufficient-data' };

  const reckoningConfrontation = await generateReckoningConfrontation({
    contradictions, languageDrift, identityDirection,
  });

  const isManualTrigger = !!options.bypassCadence;
  const startMs = now - RECKONING_PERIOD_DAYS * 24 * 60 * 60 * 1000;
  const doc = {
    userId,
    type: 'reckoning',
    generatedAt: new Date(now).toISOString(),
    cadencePeriod: cadence,
    period: {
      start: new Date(startMs).toISOString(),
      end: new Date(now).toISOString(),
      days: RECKONING_PERIOD_DAYS,
    },
    isNew: !isManualTrigger,
    readAt: isManualTrigger ? new Date(now).toISOString() : null,
    contradictions,
    languageDrift,
    reckoningConfrontation,
    meta: {
      contradictionCount: contradictions.length,
      commitmentCount: new Set(contradictions.map((c) => c.commitment.id).filter(Boolean)).size,
      evidenceCount: contradictions.reduce((s, c) => s + c.evidence.length, 0),
      identityDirection,
    },
  };

  const written = await writer(COLLECTIONS.SYNTHESES, doc);
  const docWithId = written?.id ? { ...doc, id: written.id } : doc;
  return { status: 'ok', briefing: docWithId };
}
