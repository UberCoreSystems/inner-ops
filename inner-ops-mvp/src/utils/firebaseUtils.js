
import { doc, setDoc, collection, query, where, getDocs, updateDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../firebase.js';

export const writeData = async (collectionName, data) => {
  const user = auth.currentUser;
  if (!user) {
    throw new Error("User not authenticated");
  }

  try {
    const payload = {
      ...data,
      userId: user.uid,
      timestamp: serverTimestamp()
    };

    const docRef = await addDoc(collection(db, collectionName), payload);
    console.log("✅ Data written successfully to", collectionName);
    return { id: docRef.id, ...payload };
  } catch (error) {
    console.error("❌ Firestore write error:", error);
    throw error;
  }
};

export const updateData = async (collectionName, docId, data) => {
  const user = auth.currentUser;
  if (!user) {
    throw new Error("User not authenticated");
  }

  try {
    await updateDoc(doc(db, collectionName, docId), {
      ...data,
      userId: user.uid,
      lastUpdated: serverTimestamp()
    });
    console.log("✅ Data updated successfully in", collectionName);
    return { id: docId, ...data };
  } catch (error) {
    console.error("❌ Firestore update error:", error);
    throw error;
  }
};

export const readUserData = async (collectionName) => {
  const user = auth.currentUser;
  if (!user) {
    console.log("User not authenticated");
    return [];
  }

  try {
    const colRef = collection(db, collectionName);
    const q = query(colRef, where("userId", "==", user.uid));
    const querySnapshot = await getDocs(q);
    
    const data = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().timestamp?.toDate?.() || new Date()
    }));

    data.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    console.log("✅ Data read successfully from", collectionName);
    return data;
  } catch (error) {
    console.error("❌ Firestore read error:", error);
    return [];
  }
};

export const readData = readUserData;
