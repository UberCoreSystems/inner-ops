import logger from './logger.js';
import { getBehavioralContext } from './getBehavioralContext.js';

// Module-scoped per-session dedupe. Keys are short content fingerprints so
// two identical entry submissions in one session run the Oracle classifier
// only once. `forceRefresh` bypasses the cache for the per-entry "Reconsider"
// flow.
const sessionDedupe = new Set();

function hashEntryText(text) {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

function parseExtraction(result, label) {
  if (!result?.data?.feedback) {
    logger.log(`[CrossModuleExtraction] ${label}: no data.feedback on response`);
    return null;
  }
  const raw = result.data.feedback.trim();
  if (raw === 'null' || raw === '') {
    logger.log(`[CrossModuleExtraction] ${label}: Oracle returned null (no signal detected)`);
    return null;
  }
  try {
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    const parsed = JSON.parse(cleaned);
    logger.log(`[CrossModuleExtraction] ${label}: parsed OK`, parsed);
    return parsed;
  } catch (err) {
    logger.warn(`[CrossModuleExtraction] ${label}: JSON parse FAILED`, { raw: raw.slice(0, 200), err: err?.message });
    return null;
  }
}

const EMPTY_RESULTS = { killList: null, relapseRadar: null, hardLesson: null };

const EXTRACTOR_MAP = {
  hardlesson:    { module: 'lessonExtraction',    label: 'lessonExtraction',    key: 'hardLesson' },
  generalledger: { module: 'killListExtraction',  label: 'killListExtraction',  key: 'killList' },
  signal:        { module: 'relapseDetection',    label: 'relapseDetection',    key: 'relapseRadar' },
};

/**
 * Classify a journal entry via the Oracle, then conditionally run only the
 * extractors the classifier flags as warranted. Replaces the prior fire-all-
 * three-in-parallel approach so that wins, neutral logs, and reflections do
 * not surface false-positive Hard Lesson / Ledger / Signal cards.
 *
 * Returns one of:
 *   - null — dedupe-skipped without forceRefresh (caller treats as no-op).
 *   - { status, killList, relapseRadar, hardLesson, classification } where
 *     `status` is one of:
 *       'extracted' — classifier ran, at least one extractor produced a result.
 *       'empty'     — classifier ran successfully, returned a valid empty
 *                     extractions array.
 *       'failed'    — classifier returned null, malformed JSON, threw, or the
 *                     outer flow caught an unexpected error.
 *     `classification` is the raw classifier payload (may be null on failure).
 */
export async function classifyAndExtract(entryText, { tone = 'stoic', forceRefresh = false } = {}) {
  logger.log('[CrossModuleExtraction] start', {
    entryTextLength: (entryText || '').length,
    preview: (entryText || '').slice(0, 80),
    forceRefresh,
  });
  const fp = hashEntryText(entryText || '');
  if (!forceRefresh && sessionDedupe.has(fp)) {
    logger.log('[CrossModuleExtraction] SKIP — dedupe (already attempted this session)', { fp });
    return null;
  }
  sessionDedupe.add(fp);

  try {
    const { getFunctions, httpsCallable } = await import('firebase/functions');
    const functions = getFunctions();
    const oracleFn = httpsCallable(functions, 'oracle', { timeout: 30000 });

    const { getAuth } = await import('firebase/auth');
    const uid = getAuth().currentUser?.uid;
    logger.log('[CrossModuleExtraction] auth uid present:', !!uid);

    const behavioralContext = await getBehavioralContext(uid).catch((err) => {
      logger.warn('[CrossModuleExtraction] behavioralContext fetch failed:', err?.message);
      return null;
    });

    const buildCall = (moduleName) => oracleFn({
      entryText,
      moduleName,
      userContext: {},
      tone,
      behavioralContext,
    }).catch((err) => {
      logger.error(`[CrossModuleExtraction] ${moduleName} CF call FAILED:`, err?.code, err?.message);
      return null;
    });

    // Step 1 — classify
    logger.log('[CrossModuleExtraction] firing classifier (entryClassification)');
    const classifyResult = await buildCall('entryClassification');
    const classification = parseExtraction(classifyResult, 'entryClassification');

    // Decide which extractors to run. A null/malformed classifier response is
    // a FAILURE, not an empty result — surfaced to the caller so the UI can
    // distinguish "Oracle saw nothing" from "Oracle never ran."
    const classifierOk = !!(classification && Array.isArray(classification.extractions));
    let toRun = [];
    if (classifierOk) {
      toRun = classification.extractions
        .map((e) => String(e || '').toLowerCase())
        .filter((e) => Object.prototype.hasOwnProperty.call(EXTRACTOR_MAP, e));
    } else {
      logger.warn('[CrossModuleExtraction] classifier failed or unparseable — returning status=failed');
    }

    logger.log('[CrossModuleExtraction] classification', {
      primary: classification?.primary || null,
      extractions: toRun,
      reasoning: classification?.reasoning || null,
    });

    if (!classifierOk) {
      return { status: 'failed', ...EMPTY_RESULTS, classification };
    }

    if (toRun.length === 0) {
      return { status: 'empty', ...EMPTY_RESULTS, classification };
    }

    // Step 2 — run only the warranted extractors in parallel
    const calls = toRun.map((e) => {
      const cfg = EXTRACTOR_MAP[e];
      return buildCall(cfg.module).then((r) => ({ key: cfg.key, parsed: parseExtraction(r, cfg.label) }));
    });

    const results = { ...EMPTY_RESULTS };
    const settled = await Promise.all(calls);
    settled.forEach(({ key, parsed }) => { results[key] = parsed; });

    logger.log('[CrossModuleExtraction] results', {
      hasKill: !!results.killList,
      hasRelapse: !!results.relapseRadar,
      hasHardLesson: !!results.hardLesson,
    });

    const anySignal = !!(results.killList || results.relapseRadar || results.hardLesson);
    return {
      status: anySignal ? 'extracted' : 'empty',
      ...results,
      classification,
    };
  } catch (err) {
    logger.error('[CrossModuleExtraction] unexpected error in extraction flow:', err?.message, err);
    return { status: 'failed', ...EMPTY_RESULTS, classification: null };
  }
}

/**
 * Normalize a `classifyAndExtract` result into a Firestore-friendly payload
 * suitable for persisting on a journal entry document. Strips out `null`
 * prefill slots so the stored object only carries actionable data.
 *
 *   { status, primary, extractions, reasoning, classifiedAt, prefills }
 *
 * `prefills` is keyed by the badge identity used by the UI:
 *   killList, hardLesson, relapseRadar
 *
 * Returns a `{ status: 'failed' }` shell for null / unrecognized input so the
 * caller can write a failure marker and let the backfill retry later.
 */
export function buildClassificationPayload(results) {
  const classifiedAt = new Date().toISOString();
  if (!results || typeof results !== 'object') {
    return { status: 'failed', classifiedAt };
  }

  const base = {
    status: results.status || 'failed',
    primary: results.classification?.primary || null,
    extractions: Array.isArray(results.classification?.extractions)
      ? results.classification.extractions
      : [],
    reasoning: results.classification?.reasoning || null,
    classifiedAt,
  };

  if (results.status !== 'extracted') {
    return base;
  }

  const prefills = {};
  if (results.killList)     prefills.killList     = results.killList;
  if (results.hardLesson)   prefills.hardLesson   = results.hardLesson;
  if (results.relapseRadar) prefills.relapseRadar = results.relapseRadar;

  return Object.keys(prefills).length > 0 ? { ...base, prefills } : base;
}

/**
 * Direct Hard-Lesson extractor used by the in-page "Ask Oracle to Extract Lesson
 * & Rule" button on the HardLessons form. Skips the classifier step (we already
 * know the user is on a Hard Lesson) and skips the session dedupe (an explicit
 * button click must always re-run). Returns the parsed `hardLesson` object on
 * success, or `null` when the description is too sparse or the Oracle response
 * is unparseable / empty.
 */
export async function extractHardLessonDirect(text, { tone = 'stoic' } = {}) {
  const trimmed = String(text || '').trim();
  if (trimmed.length < 30) return null;

  try {
    const { getFunctions, httpsCallable } = await import('firebase/functions');
    const functions = getFunctions();
    const oracleFn = httpsCallable(functions, 'oracle', { timeout: 30000 });

    const { getAuth } = await import('firebase/auth');
    const uid = getAuth().currentUser?.uid;

    const behavioralContext = await getBehavioralContext(uid).catch((err) => {
      logger.warn('[extractHardLessonDirect] behavioralContext fetch failed:', err?.message);
      return null;
    });

    const result = await oracleFn({
      entryText: trimmed,
      moduleName: 'lessonExtraction',
      userContext: {},
      tone,
      behavioralContext,
    }).catch((err) => {
      logger.error('[extractHardLessonDirect] CF call FAILED:', err?.code, err?.message);
      return null;
    });

    return parseExtraction(result, 'lessonExtraction');
  } catch (err) {
    logger.error('[extractHardLessonDirect] unexpected error:', err?.message, err);
    return null;
  }
}

/**
 * Pure shaper for the Oracle's implementation-intention suggestion payload.
 * Takes the parsed `{ suggestions: [{ when, iWill }] }` object and returns a
 * clean `{ when, iWill }[]`: trims, truncates each clause to `maxLen` (the
 * When/I-Will field cap), drops entries missing either half, de-dupes, and
 * caps the count. Defensive against malformed Oracle output — always an array.
 * Firebase-free so it can be unit-tested directly.
 */
export function normalizeIntentionSuggestions(parsed, maxLen = 50, cap = 6) {
  const list = Array.isArray(parsed?.suggestions) ? parsed.suggestions : [];
  const out = [];
  const seen = new Set();
  for (const item of list) {
    const when = String(item?.when ?? '').trim().slice(0, maxLen);
    const iWill = String(item?.iWill ?? '').trim().slice(0, maxLen);
    if (!when || !iWill) continue;
    const key = `${when.toLowerCase()}|${iWill.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ when, iWill });
    if (out.length >= cap) break;
  }
  return out;
}

/**
 * Ask the Oracle for personalized implementation-intention drafts for a Kill
 * Contract. Mirrors extractHardLessonDirect: explicit user action, no session
 * dedupe, behavioralContext-grounded. Returns a normalized `{ when, iWill }[]`
 * (each clause ≤50 chars) or `[]` on empty/failure so the caller falls back to
 * the instant category seed deck.
 */
export async function suggestImplementationIntentions(targetTitle, categoryLabel, context, { tone = 'stoic' } = {}) {
  const title = String(targetTitle || '').trim();
  if (!title) return [];

  try {
    const { getFunctions, httpsCallable } = await import('firebase/functions');
    const functions = getFunctions();
    const oracleFn = httpsCallable(functions, 'oracle', { timeout: 30000 });

    const { getAuth } = await import('firebase/auth');
    const uid = getAuth().currentUser?.uid;

    const behavioralContext = await getBehavioralContext(uid).catch((err) => {
      logger.warn('[suggestImplementationIntentions] behavioralContext fetch failed:', err?.message);
      return null;
    });

    const ctx = String(context || '').trim();
    const entryText = `Target: "${title}". Category: ${categoryLabel || 'unspecified'}. Context: ${ctx || 'none'}.`;

    const result = await oracleFn({
      entryText,
      moduleName: 'killIntentionSuggest',
      userContext: {},
      tone,
      behavioralContext,
    }).catch((err) => {
      logger.error('[suggestImplementationIntentions] CF call FAILED:', err?.code, err?.message);
      return null;
    });

    return normalizeIntentionSuggestions(parseExtraction(result, 'killIntentionSuggest'));
  } catch (err) {
    logger.error('[suggestImplementationIntentions] unexpected error:', err?.message, err);
    return [];
  }
}

// Valid General Ledger category values (mirrors killListCategories.js). A
// redirect suggestion with any other category is coerced to 'other'.
const REDIRECT_CATEGORIES = new Set([
  'bad-habit', 'negative-thought', 'addiction', 'toxic-behavior', 'fear', 'procrastination', 'other',
]);

/**
 * Pure shaper for the Oracle's target-framing critique payload. Takes the
 * parsed `{ verdict, critique, suggestions }` object and returns a clean
 * critique object, or `null` when the input is null/undefined (caller treats
 * that as "couldn't evaluate" and fails open). A verdict that is not 'redirect'
 * — or a 'redirect' with no usable suggestions — collapses to a sound verdict
 * so the gate never interrupts with nothing actionable. Each suggestion is
 * validated: title + why required, title capped, category coerced to the
 * Ledger enum, de-duped by title, capped to `cap`. Firebase-free for testing.
 */
export function normalizeRedirectCritique(parsed, cap = 3) {
  if (parsed == null) return null;

  const sound = { verdict: 'sound', critique: '', suggestions: [] };
  if (parsed.verdict !== 'redirect') return sound;

  const list = Array.isArray(parsed.suggestions) ? parsed.suggestions : [];
  const out = [];
  const seen = new Set();
  for (const item of list) {
    const title = String(item?.title ?? '').trim().slice(0, 100);
    const why = String(item?.why ?? '').trim();
    if (!title || !why) continue;
    const key = title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const rawCategory = String(item?.category ?? '').trim();
    const category = REDIRECT_CATEGORIES.has(rawCategory) ? rawCategory : 'other';
    out.push({ title, category, why });
    if (out.length >= cap) break;
  }

  if (out.length === 0) return sound;
  return { verdict: 'redirect', critique: String(parsed.critique ?? '').trim(), suggestions: out };
}

/**
 * Ask the Oracle to pressure-test the framing of a named Kill Contract target.
 * Mirrors suggestImplementationIntentions: explicit user action, no session
 * dedupe, behavioralContext-grounded. Returns a normalized critique object
 * (`{ verdict, critique, suggestions }`) or `null` on empty/failure so the
 * caller fails open and saves the contract without interruption.
 */
export async function critiqueTargetFraming(targetTitle, categoryLabel, context, { tone = 'stoic' } = {}) {
  const title = String(targetTitle || '').trim();
  if (!title) return null;

  try {
    const { getFunctions, httpsCallable } = await import('firebase/functions');
    const functions = getFunctions();
    const oracleFn = httpsCallable(functions, 'oracle', { timeout: 30000 });

    const { getAuth } = await import('firebase/auth');
    const uid = getAuth().currentUser?.uid;

    const behavioralContext = await getBehavioralContext(uid).catch((err) => {
      logger.warn('[critiqueTargetFraming] behavioralContext fetch failed:', err?.message);
      return null;
    });

    const ctx = String(context || '').trim();
    const entryText = `Target: "${title}". Category: ${categoryLabel || 'unspecified'}. Context: ${ctx || 'none'}.`;

    const result = await oracleFn({
      entryText,
      moduleName: 'targetFramingCritique',
      userContext: {},
      tone,
      behavioralContext,
    }).catch((err) => {
      logger.error('[critiqueTargetFraming] CF call FAILED:', err?.code, err?.message);
      return null;
    });

    return normalizeRedirectCritique(parseExtraction(result, 'targetFramingCritique'));
  } catch (err) {
    logger.error('[critiqueTargetFraming] unexpected error:', err?.message, err);
    return null;
  }
}

// Confirm-handler helpers — shared by Journal page and Today's Reflection modal.
// Each stashes a prefill payload under the destination module's expected
// sessionStorage key. The caller is responsible for navigation.

export function stashKillListExtraction(extraction) {
  try {
    sessionStorage.setItem('kl_extraction_prefill', JSON.stringify(extraction));
  } catch { /* ignore storage errors */ }
}

export function stashRelapseExtraction(extraction) {
  try {
    sessionStorage.setItem('relapse_extraction_prefill', JSON.stringify(extraction));
  } catch { /* ignore storage errors */ }
}

export function stashHardLessonExtraction(extraction, sourceEntryId) {
  try {
    sessionStorage.setItem('hl_bridge_prefill', JSON.stringify({
      eventCategory: extraction.suggestedCategory || '',
      eventDescription: extraction.eventDescription || '',
      myAssumption: extraction.myAssumption || '',
      signalIgnored: extraction.signalIgnored || '',
      costs: Array.isArray(extraction.suggestedCosts) ? extraction.suggestedCosts : [],
      costDescription: extraction.costDescription || '',
      extractedLesson: extraction.extractedLesson || '',
      ruleGoingForward: extraction.ruleGoingForward || '',
      ...(sourceEntryId ? { sourceJournalId: sourceEntryId } : {}),
      isOracleExtracted: true,
    }));
  } catch { /* ignore storage errors */ }
}
