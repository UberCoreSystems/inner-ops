/**
 * confrontationCriteria.js — BER-200: Oracle Reactance Architecture
 *
 * User-sourced confrontation criteria. Users define their own trigger conditions
 * at onboarding; the Oracle checks these before generating output. When triggered,
 * the Oracle presents the data pattern and the user's own pre-committed question.
 *
 * Storage: criteria are persisted in Firestore userProfiles (via userProfile util).
 * Trigger check: run against raw relapseEntries per criterion.
 */

import { saveUserProfile, getUserProfile } from './userProfile';
import { readUserData } from './firebaseUtils';
import { getAuth as getFirebaseAuth } from 'firebase/auth';

// Must stay in sync with relapseSelves in RelapseRadar.jsx
export const RELAPSE_ARCHETYPES = [
  'The Addict',
  'The Victim',
  'The Procrastinator',
  'The Pessimist',
  'The Perfectionist',
  'The People-Pleaser',
  'The Imposter',
  'The Self-Saboteur',
];

/**
 * Persist confrontation criteria to the user's Firestore profile.
 * @param {Array} criteria
 */
export async function saveConfrontationCriteria(criteria) {
  await saveUserProfile({ confrontationCriteria: criteria });
}

/**
 * Load confrontation criteria from the user's Firestore profile.
 * Returns [] when none are defined.
 * @returns {Promise<Array>}
 */
export async function getConfrontationCriteria() {
  const profile = await getUserProfile();
  return Array.isArray(profile?.confrontationCriteria) ? profile.confrontationCriteria : [];
}

/**
 * Check criteria array against raw relapse entries (synchronous).
 * Returns the first triggered criterion with match metadata, or null.
 *
 * @param {Array} criteria  — saved criterion objects
 * @param {Array} relapseEntries — raw Firestore relapseEntries for this user
 * @returns {{ criterion: object, matchCount: number, dataSummary: string } | null}
 */
export function checkTriggeredCriteria(criteria, relapseEntries) {
  if (!Array.isArray(criteria) || criteria.length === 0) return null;
  if (!Array.isArray(relapseEntries)) return null;

  const now = Date.now();

  for (const criterion of criteria) {
    const { archetypeName, threshold, periodDays, question } = criterion;
    if (!archetypeName || !threshold || !question) continue;

    const windowMs = (periodDays || 30) * 24 * 60 * 60 * 1000;

    const matchCount = relapseEntries.filter((e) => {
      if (e.selectedSelf !== archetypeName) return false;
      const ts = e.createdAt?.toDate?.()?.getTime() ?? e.timestamp ?? 0;
      return (now - ts) < windowMs;
    }).length;

    if (matchCount >= threshold) {
      const period = periodDays || 30;
      const dataSummary = `${matchCount} ${archetypeName} relapse${matchCount !== 1 ? 's' : ''} in the last ${period} day${period !== 1 ? 's' : ''}`;
      return { criterion, matchCount, dataSummary };
    }
  }

  return null;
}

/**
 * Full async resolution: fetch profile criteria + relapse entries, return triggered
 * criterion or null. Called inside generateAIFeedback and OracleModal.
 *
 * @param {string} uid — Firebase Auth uid
 * @returns {Promise<{ criterion: object, matchCount: number, dataSummary: string } | null>}
 */
export async function resolveTriggeredCriterion(uid) {
  if (!uid) return null;
  try {
    const [criteria, relapseEntries] = await Promise.all([
      getConfrontationCriteria(),
      readUserData('relapseEntries').catch(() => []),
    ]);
    return checkTriggeredCriteria(criteria, relapseEntries || []);
  } catch {
    return null;
  }
}

/**
 * Convenience wrapper — resolves uid from Firebase Auth, then delegates to
 * resolveTriggeredCriterion. Returns null silently on any failure.
 *
 * @returns {Promise<{ criterion: object, matchCount: number, dataSummary: string } | null>}
 */
export async function resolveTriggeredCriterionForCurrentUser() {
  try {
    const auth = getFirebaseAuth();
    const uid = auth.currentUser?.uid;
    return resolveTriggeredCriterion(uid);
  } catch {
    return null;
  }
}
