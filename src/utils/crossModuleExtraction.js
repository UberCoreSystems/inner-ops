import logger from './logger';
import { getBehavioralContext } from './getBehavioralContext';

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

// Confirm-handler helpers — shared by Journal page and Quick Entry modal.
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
