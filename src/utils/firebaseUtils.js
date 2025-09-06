import { doc, setDoc, collection, query, where, getDocs, updateDoc, addDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db, enableAnonymousAuth, enableDevMode, getCurrentUserOrMock } from '../firebase.js';

// Development mode flag - set to false to use real authentication and preserve user data
const DEV_MODE = false; // Set to true only for testing without real user accounts

// Log environment variables for debugging
console.log("🔍 Environment Check:");
console.log("API Key:", import.meta.env.VITE_FIREBASE_API_KEY ? "✅ Present" : "❌ Missing");
console.log("Project ID:", import.meta.env.VITE_FIREBASE_PROJECT_ID);
console.log("Auth Domain:", import.meta.env.VITE_FIREBASE_AUTH_DOMAIN);
console.log("App ID:", import.meta.env.VITE_FIREBASE_APP_ID ? "✅ Present" : "❌ Missing");

// Helper function to ensure user is authenticated (with fallbacks)
const ensureAuthenticated = async () => {
  if (auth.currentUser) {
    return auth.currentUser;
  }

  if (DEV_MODE) {
    console.log("🚧 DEV MODE: Attempting anonymous authentication...");
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
    // In production mode, require proper authentication
    console.error("❌ User must be authenticated to access data");
    throw new Error("Please sign in to continue using the app");
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

export const deleteData = async (collectionName, docId) => {
  try {
    const user = await ensureAuthenticated();
    
    await deleteDoc(doc(db, collectionName, docId));
    console.log("✅ Data deleted successfully from", collectionName, "for doc:", docId);
    return { id: docId, deleted: true };
  } catch (error) {
    console.error("❌ Firestore delete error:", error);
    if (error.code === 'permission-denied') {
      console.error("💡 Hint: Check your Firestore security rules for delete permissions.");
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

// Write user data (for collections like arrays of entries)
export const writeUserData = async (collectionName, dataArray) => {
  try {
    const user = await ensureAuthenticated();
    console.log(`📝 Writing user data collection: ${collectionName} with ${Array.isArray(dataArray) ? dataArray.length : 1} items`);
    
    if (Array.isArray(dataArray)) {
      // Write each item in the array as a separate document
      const writePromises = dataArray.map(item => {
        const payload = {
          ...item,
          userId: user.uid,
          timestamp: item.timestamp || serverTimestamp(),
          isAnonymous: user.isAnonymous || false
        };
        return addDoc(collection(db, collectionName), payload);
      });
      
      const results = await Promise.all(writePromises);
      console.log(`✅ Successfully wrote ${results.length} documents to ${collectionName}`);
      return results.map((docRef, index) => ({
        id: docRef.id,
        ...dataArray[index]
      }));
    } else {
      // Single object - write as one document
      return await writeData(collectionName, dataArray);
    }
  } catch (error) {
    console.error(`❌ Failed to write user data to ${collectionName}:`, error);
    throw error;
  }
};

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

// Firebase connection test
export const testFirebaseConnection = async () => {
  try {
    console.log("🔥 Testing Firebase connection...");
    
    // Test 1: Check if we can get current user
    const currentUser = auth.currentUser;
    console.log("Current user:", currentUser ? currentUser.uid : "None");
    
    // Test 2: Try to enable anonymous auth
    let testUser;
    try {
      testUser = await ensureAuthenticated();
      console.log("✅ Authentication successful:", testUser.uid);
    } catch (authError) {
      console.error("❌ Authentication failed:", authError);
      return {
        success: false,
        error: "Authentication failed",
        details: authError.message
      };
    }
    
    // Test 3: Try to read data
    try {
      const testData = await readUserData('test-connection');
      console.log("✅ Read test successful, found", testData.length, "documents");
    } catch (readError) {
      console.error("❌ Read test failed:", readError);
      return {
        success: false,
        error: "Read operation failed",
        details: readError.message
      };
    }
    
    // Test 4: Try to write data
    try {
      const writeResult = await writeData('test-connection', {
        message: "Connection test",
        timestamp: new Date().toISOString()
      });
      console.log("✅ Write test successful:", writeResult.id);
    } catch (writeError) {
      console.error("❌ Write test failed:", writeError);
      return {
        success: false,
        error: "Write operation failed",
        details: writeError.message
      };
    }
    
    return {
      success: true,
      message: "All Firebase operations working correctly",
      userId: testUser.uid
    };
    
  } catch (error) {
    console.error("❌ Firebase connection test failed:", error);
    return {
      success: false,
      error: "Connection test failed",
      details: error.message
    };
  }
};
