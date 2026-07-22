import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { getDb } from '../firebase';
import { generateAIFeedback } from './aiFeedback';
import composeClosureFeedback from './composeClosureFeedback';
import logger from './logger';

/**
 * Shared Kill List closure plumbing.
 *
 * Two surfaces close contracts — the Dashboard's manual quick-kill/escape
 * (KillListDashboard) and the threshold close on the Kill List page
 * (ContractClosedModal). Both need the same Oracle call and the same persisted
 * field names, and the field names are read downstream by
 * `oracleQuestionPool.js` (which harvests `oracleClosingQuestion` from
 * confirmedKills into the daily prompt pool). Keeping one implementation stops
 * the two paths from writing different shapes into the same collection.
 */

export function buildClosureEntryText(mode, title, note) {
  return mode === 'kill'
    ? `I just closed a kill contract: "${title}". What ended it: ${note}`
    : `A kill contract just broke on me: "${title}". What caught me: ${note}`;
}

/**
 * Run the Oracle over a closure. Never throws — a failed call degrades to the
 * mode-specific fallback line from composeClosureFeedback.
 *
 * @returns {Promise<{oracleResponse: string, oracleClosingQuestion: string|null,
 *   oracleProvenance: string|null, oracleFallbackReason: string|null}>}
 */
export async function runClosureOracle({ mode, title, note, pastTitles = [] }) {
  let feedback = null;
  try {
    feedback = await generateAIFeedback('killList', buildClosureEntryText(mode, title, note), pastTitles);
  } catch (err) {
    logger.error('Oracle closure response error:', err);
  }
  const { oracleResponse, oracleClosingQuestion } = composeClosureFeedback(feedback, mode);
  return {
    oracleResponse,
    oracleClosingQuestion,
    // null when the call threw outright — composeClosureFeedback then supplies
    // its own line, which is neither Claude's nor a local reading.
    oracleProvenance: feedback?.provenance ?? null,
    oracleFallbackReason: feedback?.fallbackReason ?? null,
  };
}

/**
 * Persist the Oracle line onto the closure record. Kills live in
 * `confirmedKills` (field: closureOracleResponse); escapes stay in
 * `killTargets` (field: escapeOracleResponse).
 *
 * Never throws — a persistence failure must not roll back a completed close.
 */
export async function persistClosureOracle({
  collectionName,
  docId,
  mode,
  oracleResponse,
  oracleClosingQuestion,
  oracleProvenance,
  oracleFallbackReason,
}) {
  if (!docId) return false;
  try {
    const db = await getDb();
    const ref = doc(db, collectionName, docId);
    await updateDoc(ref, {
      [mode === 'kill' ? 'closureOracleResponse' : 'escapeOracleResponse']: oracleResponse,
      ...(oracleClosingQuestion ? { oracleClosingQuestion } : {}),
      ...(oracleProvenance ? { oracleProvenance } : {}),
      ...(oracleFallbackReason ? { oracleFallbackReason } : {}),
      lastUpdated: serverTimestamp(),
    });
    return true;
  } catch (err) {
    logger.error('Error persisting Oracle closure response:', err);
    return false;
  }
}
