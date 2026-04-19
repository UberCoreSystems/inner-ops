import { doc, setDoc, getDoc } from 'firebase/firestore';
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
