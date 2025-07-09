import { doc, setDoc, collection, query, where, getDocs, updateDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db, enableAnonymousAuth, enableDevMode, getCurrentUserOrMock } from '../firebase.js';

// Development mode flag - set to true to bypass auth for testing
const DEV_MODE = true; // Set to false for production

// Helper function to ensure user is authenticated (with fallbacks)
const ensureAuthenticated = async () => {
  if (auth.currentUser) {
    return auth.currentUser;
  }

  if (DEV_MODE) {
    console.log("� DEV MODE: Attempting anonymous authentication...");
    try {
      const user = await enableAnonymousAuth();
      console.log("✅ Anonymous authentication successful:", user.uid);
      return user;
    } catch (error) {
      if (error.code === 'auth/admin-restricted-operation') {
        console.warn("⚠️ Anonymous auth disabled, using mock user for testing");
        return enableDevMode();
      }
      throw error;
    }
  } else {
    throw new Error("Authentication required but user not authenticated");
  }
};

export const writeData = async (collectionName, data) => {
  try {
    const user = await ensureAuthenticated();
    
    const payload = {
      ...data,
      userId: user.uid,
      timestamp: serverTimestamp(),
      isAnonymous: user.isAnonymous || false
    };

    const docRef = await addDoc(collection(db, collectionName), payload);
    console.log("✅ Data written successfully to", collectionName, "with ID:", docRef.id);
    return { id: docRef.id, ...payload };
  } catch (error) {
    console.error("❌ Firestore write error:", error);
    if (error.code === 'permission-denied') {
      console.error("💡 Hint: Check your Firestore security rules. You may need to allow reads/writes for testing.");
    }
    throw error;
  }
};

export const updateData = async (collectionName, docId, data) => {
  try {
    const user = await ensureAuthenticated();

    const updatePayload = {
      ...data,
      userId: user.uid,
      lastUpdated: serverTimestamp(),
      isAnonymous: user.isAnonymous || false
    };

    await updateDoc(doc(db, collectionName, docId), updatePayload);
    console.log("✅ Data updated successfully in", collectionName, "for doc:", docId);
    return { id: docId, ...updatePayload };
  } catch (error) {
    console.error("❌ Firestore update error:", error);
    if (error.code === 'permission-denied') {
      console.error("💡 Hint: Check your Firestore security rules for update permissions.");
    }
    throw error;
  }
};

export const readUserData = async (collectionName, requireAuth = false) => {
  try {
    let user = auth.currentUser;
    
    if (!user && !requireAuth) {
      // Try to get anonymous auth for read operations
      try {
        user = await ensureAuthenticated();
      } catch (error) {
        console.warn("⚠️ Could not authenticate for read operation, attempting without auth:", error.message);
      }
    } else if (!user && requireAuth) {
      console.error("❌ User not authenticated and auth is required");
      return [];
    }

    const colRef = collection(db, collectionName);
    let q;
    
    if (user) {
      // Filter by userId if we have an authenticated user
      q = query(colRef, where("userId", "==", user.uid));
      console.log("🔍 Reading data for user:", user.uid);
    } else {
      // Read all documents if no auth (for testing purposes)
      q = query(colRef);
      console.log("🔍 Reading all documents (no auth filter)");
    }
    
    const querySnapshot = await getDocs(q);
    
    const data = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().timestamp?.toDate?.() || new Date()
    }));

    data.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    console.log("✅ Data read successfully from", collectionName, "- found", data.length, "documents");
    return data;
  } catch (error) {
    console.error("❌ Firestore read error:", error);
    if (error.code === 'permission-denied') {
      console.error("💡 Hint: Check your Firestore security rules. You may need to allow reads for anonymous users or update the rules for testing.");
    }
    return [];
  }
};

// Simple read function for testing (no auth required)
export const readTestData = async (collectionName) => {
  try {
    console.log("🧪 Reading test data from", collectionName, "(no auth required)");
    const colRef = collection(db, collectionName);
    const querySnapshot = await getDocs(colRef);
    
    const data = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().timestamp?.toDate?.() || new Date()
    }));

    console.log("✅ Test data read successfully:", data.length, "documents");
    return data;
  } catch (error) {
    console.error("❌ Test data read error:", error);
    return [];
  }
};

export const readData = readUserData;

// Simple write test that doesn't require any authentication
export const writeTestDataNoAuth = async (collectionName, data) => {
  try {
    console.log("🧪 Writing test data without authentication to", collectionName);
    
    const testPayload = {
      ...data,
      timestamp: serverTimestamp(),
      testMode: true,
      noAuth: true,
      createdAt: new Date().toISOString()
    };

    const docRef = await addDoc(collection(db, collectionName), testPayload);
    console.log("✅ No-auth test data written successfully:", docRef.id);
    return { id: docRef.id, ...testPayload };
  } catch (error) {
    console.error("❌ No-auth test write failed:", error);
    if (error.code === 'permission-denied') {
      console.error("💡 Hint: Firestore rules may require authentication. Check your rules for the collection:", collectionName);
    }
    throw error;
  }
};
