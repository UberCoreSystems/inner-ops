import { db, auth } from '../firebase';
import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';

// 📝 Create a new journal entry using current user
export const createJournalEntry = async (text) => {
  const user = auth.currentUser;
  if (!user) throw new Error('User not authenticated');

  try {
    const docRef = await addDoc(collection(db, 'journalEntries'), {
      userId: user.uid,
      text,
      createdAt: serverTimestamp(),
    });
    return { success: true, id: docRef.id };
  } catch (err) {
    console.error('🔥 Error creating journal entry:', err.message);
    return { success: false, error: err.message };
  }
};

// 📚 Get all journal entries for the current user
export const getJournalEntries = async () => {
  const user = auth.currentUser;
  if (!user) throw new Error('User not authenticated');

  try {
    const q = query(
      collection(db, 'journalEntries'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (err) {
    console.error('🔥 Error fetching journal entries:', err.message);
    return [];
  }
};
