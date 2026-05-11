import { doc, setDoc, getDoc, onSnapshot } from 'firebase/firestore';
import { getDb, getAuth } from '../firebase.js';

export const saveUserProfile = async (profile) => {
  const auth = await getAuth();
  const user = auth.currentUser;
  if (!user) throw new Error('Not authenticated');
  const db = await getDb();
  await setDoc(doc(db, 'userProfiles', user.uid), {
    ...profile,
    updatedAt: new Date().toISOString(),
  }, { merge: true });
};

export const getUserProfile = async () => {
  try {
    const auth = await getAuth();
    const user = auth.currentUser;
    if (!user) return null;
    const db = await getDb();
    const snap = await getDoc(doc(db, 'userProfiles', user.uid));
    return snap.exists() ? snap.data() : null;
  } catch {
    return null;
  }
};

/**
 * Realtime listener on the current user's userProfiles doc. The callback
 * fires once with the initial value and again on every update (including
 * the wizard's onboardingCompletedAt write). Returns a Promise that
 * resolves to an unsubscribe function.
 *
 * Why a doc-level listener (not collection): userProfiles uses the
 * doc-id-as-uid pattern, so the existing collection-level
 * `subscribeToUserData` does not apply.
 */
export const subscribeUserProfile = async (callback) => {
  const auth = await getAuth();
  const user = auth.currentUser;
  if (!user) {
    callback(null);
    return () => {};
  }
  const db = await getDb();
  const ref = doc(db, 'userProfiles', user.uid);
  return onSnapshot(
    ref,
    (snap) => callback(snap.exists() ? snap.data() : null),
    () => callback(null),
  );
};
