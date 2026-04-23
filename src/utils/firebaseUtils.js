import { doc, setDoc, collection, query, where, getDocs, onSnapshot, updateDoc, addDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { getAuth, getDb } from '../firebase.js';
import logger from './logger.js';

// Pass 2 Finding 18 remediation: removed the hardcoded `DEV_MODE` boolean
// and its unreachable branches. The anonymous-auth and mock-user paths in
// `firebase.js` (`enableAnonymousAuth`, `enableDevMode`) remain available
// for emulator work, but are no longer wired into production reads/writes.

const normalizeDocTimestamp = (docData) => {
  if (docData.timestamp?.toDate) return docData.timestamp.toDate();
  if (docData.createdAt?.toDate) return docData.createdAt.toDate();
  if (typeof docData.createdAt === 'string') return new Date(docData.createdAt);
  if (typeof docData.timestamp === 'string') return new Date(docData.timestamp);
  return new Date();
};

// Mapping of collection names to localStorage keys
const LOCALSTORAGE_KEYS = {
  'journalEntries': 'inner_ops_journal_entries',
  'killTargets': 'inner_ops_kill_targets',
  'hardLessons': 'inner_ops_hard_lessons',
  'blackMirrorEntries': 'inner_ops_black_mirror_entries',
  'relapseEntries': 'inner_ops_relapse_entries'
};

// Finding 9: boot-time env diagnostics removed — firebase.js throws on
// missing config, which is a clearer failure mode than a log line.

// Helper function to ensure user is authenticated.
// Pass 2 Finding 18 remediation: simplified — no DEV_MODE bypass branch.
const ensureAuthenticated = async () => {
  const auth = await getAuth();
  if (auth.currentUser) {
    return auth.currentUser;
  }
  logger.error("❌ User must be authenticated to access data");
  throw new Error("Please sign in to continue using the app");
};

// Get data from localStorage as fallback
const getLocalStorageFallback = (collectionName) => {
  try {
    const lsKey = LOCALSTORAGE_KEYS[collectionName];
    if (!lsKey) {
      return [];
    }

    const data = localStorage.getItem(lsKey);
    if (!data) {
      return [];
    }

    const parsed = JSON.parse(data);
    const entries = Array.isArray(parsed) ? parsed : [];
    
    logger.log(`💾 Retrieved ${entries.length} entries from localStorage for ${collectionName}`);
    
    // Sort by date descending
    return entries.sort((a, b) => {
      const dateA = new Date(a.createdAt || a.timestamp || 0);
      const dateB = new Date(b.createdAt || b.timestamp || 0);
      return dateB - dateA;
    });
  } catch (error) {
    logger.warn(`⚠️ Could not read from localStorage for ${collectionName}:`, error.message);
    return [];
  }
};

// Finding 8 remediation: callers that write sensitive data (emergency logs,
// crisis reflections) can pass `{ sensitive: true }` as a third argument so
// payload fields are never logged. The `sensitive` marker itself is not
// persisted — it only controls local telemetry.
export const writeData = async (collectionName, data, options = {}) => {
  try {
    const user = await ensureAuthenticated();
    const db = await getDb();

    const payload = {
      ...data,
      userId: user.uid,
      timestamp: serverTimestamp(),
      isAnonymous: user.isAnonymous || false
    };

    const docRef = await addDoc(collection(db, collectionName), payload);
    if (options.sensitive) {
      logger.log("✅ Data written to", collectionName, "with ID:", docRef.id, "(payload suppressed — sensitive)");
    } else {
      logger.log("✅ Data written successfully to", collectionName, "with ID:", docRef.id);
    }
    return { id: docRef.id, ...payload };
  } catch (error) {
    // Pass 2 Finding 12 remediation: even non-sensitive writes can carry user
    // content in the echoed-back error message, which Sentry breadcrumbs
    // capture. Always log the scrubbed shape; never the raw error object.
    logger.error("❌ Firestore write error:", {
      code: error.code,
      name: error.name,
      message: typeof error.message === 'string' ? error.message.slice(0, 200) : undefined,
    });
    if (error.code === 'permission-denied') {
      logger.error("💡 Hint: Check your Firestore security rules. You may need to allow reads/writes for testing.");
    }
    throw error;
  }
};

export const updateData = async (collectionName, docId, data) => {
  try {
    const user = await ensureAuthenticated();
    const db = await getDb();

    const updatePayload = {
      ...data,
      userId: user.uid,
      lastUpdated: serverTimestamp(),
      isAnonymous: user.isAnonymous || false
    };

    await updateDoc(doc(db, collectionName, docId), updatePayload);
    logger.log("✅ Data updated successfully in", collectionName, "for doc:", docId);
    return { id: docId, ...updatePayload };
  } catch (error) {
    logger.error("❌ Firestore update error:", error);
    if (error.code === 'permission-denied') {
      logger.error("💡 Hint: Check your Firestore security rules for update permissions.");
    }
    throw error;
  }
};

export const deleteData = async (collectionName, docId) => {
  try {
    const user = await ensureAuthenticated();
    const db = await getDb();
    
    await deleteDoc(doc(db, collectionName, docId));
    logger.log("✅ Data deleted successfully from", collectionName, "for doc:", docId);
    return { id: docId, deleted: true };
  } catch (error) {
    logger.error("❌ Firestore delete error:", error);
    if (error.code === 'permission-denied') {
      logger.error("💡 Hint: Check your Firestore security rules for delete permissions.");
    }
    throw error;
  }
};

export const readUserData = async (collectionName, requireAuth = false) => {
  try {
    const auth = await getAuth();
    const db = await getDb();
    let user = auth.currentUser;

    if (!user && requireAuth) {
      logger.error("❌ User not authenticated and auth is required");
      return [];
    }

    if (!user) {
      logger.warn("⚠️ User not authenticated - blocking Firestore read to prevent data leakage");
      return [];
    }

    const colRef = collection(db, collectionName);
    let data = [];

    // STEP 1: Re-validate auth before the async query to guard against logout
    // between the initial check and query execution.
    const currentUser = auth.currentUser;
    if (!currentUser) {
      logger.warn("⚠️ User logged out before Firestore query executed");
      return [];
    }
    logger.log("🔍 Reading user-scoped data for user:", currentUser.uid);
    const userScopedQuery = query(colRef, where("userId", "==", currentUser.uid));
    const userScopedSnapshot = await getDocs(userScopedQuery);

    data = userScopedSnapshot.docs.map(doc => {
        const docData = doc.data();
        const createdAt = normalizeDocTimestamp(docData);
        return {
          id: doc.id,
          ...docData,
          createdAt,
          timestamp: createdAt,
        };
    });

    logger.log(`✅ User-scoped query returned ${data.length} documents`);

    data.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    logger.log("✅ Data read successfully from", collectionName, "- found", data.length, "documents");
    
    return data;
  } catch (error) {
    logger.error("❌ Firestore read error:", error);
    if (error.code === 'permission-denied' || error.code?.startsWith('auth/')) {
      // Auth-related failures must surface to callers — do not return empty data silently.
      // Callers are responsible for showing error state or redirecting to login.
      throw error;
    }
    return [];
  }
};

export const readData = readUserData;

// Subscribe to real-time updates for a user-scoped collection.
// Calls `callback(data)` immediately on first snapshot and on every change.
// Returns a Promise that resolves to an unsubscribe function.
export const subscribeToUserData = async (collectionName, callback) => {
  try {
    const auth = await getAuth();
    const db = await getDb();
    const user = auth.currentUser;

    if (!user) {
      logger.warn("⚠️ User not authenticated - cannot subscribe to Firestore data");
      callback([]);
      return () => {};
    }

    const colRef = collection(db, collectionName);
    const q = query(colRef, where("userId", "==", user.uid));

    // Finding 15 remediation: the error callback MUST invoke the unsubscribe
    // handle before returning — otherwise a permission-denied error leaves
    // the listener alive and the reference leaks on remount (notable under
    // React Strict Mode double-mount).
    let unsubscribe = () => {};
    let torndown = false;
    const safeUnsubscribe = () => {
      if (torndown) return;
      torndown = true;
      try { unsubscribe(); } catch (err) { logger.warn('listener teardown failed', err?.message); }
    };

    unsubscribe = onSnapshot(q, (snapshot) => {
      if (torndown) return;
      const data = snapshot.docs.map(docSnap => {
        const docData = docSnap.data();
        const createdAt = normalizeDocTimestamp(docData);
        return {
          id: docSnap.id,
          ...docData,
          createdAt,
          timestamp: createdAt,
        };
      });
      data.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      callback(data);
    }, (error) => {
      logger.error(`❌ Firestore subscription error for ${collectionName}:`, error);
      safeUnsubscribe();
    });

    return safeUnsubscribe;
  } catch (error) {
    logger.error(`❌ Failed to set up subscription for ${collectionName}:`, error);
    callback([]);
    return () => {};
  }
};

// Write user data (for collections like arrays of entries)
export const writeUserData = async (collectionName, dataArray) => {
  try {
    const user = await ensureAuthenticated();
    const db = await getDb();
    logger.log(`📝 Writing user data collection: ${collectionName} with ${Array.isArray(dataArray) ? dataArray.length : 1} items`);
    
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
      logger.log(`✅ Successfully wrote ${results.length} documents to ${collectionName}`);
      return results.map((docRef, index) => ({
        id: docRef.id,
        ...dataArray[index]
      }));
    } else {
      // Single object - write as one document
      return await writeData(collectionName, dataArray);
    }
  } catch (error) {
    logger.error(`❌ Failed to write user data to ${collectionName}:`, error);
    throw error;
  }
};


// Pass 3 New Finding 6 remediation: admin/migration/duplicate helpers
// previously in this file have been moved to ./firebaseAdmin.js so they
// no longer ship in the production bundle by default. Dashboard.jsx
// dynamically imports them inside an `import.meta.env.DEV` branch.
