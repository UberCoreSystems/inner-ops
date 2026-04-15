import { doc, setDoc, collection, query, where, getDocs, onSnapshot, updateDoc, addDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { enableAnonymousAuth, enableDevMode, getCurrentUserOrMock, getAuth, getDb } from '../firebase.js';
import logger from './logger';

// Development mode flag - set to false to use real authentication and preserve user data
const DEV_MODE = false; // Set to true only for testing without real user accounts

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

// Helper function to ensure user is authenticated (with fallbacks)
const ensureAuthenticated = async () => {
  const auth = await getAuth();
  if (auth.currentUser) {
    return auth.currentUser;
  }

  if (DEV_MODE) {
    logger.log("🚧 DEV MODE: Attempting anonymous authentication...");
    try {
      const user = await enableAnonymousAuth();
      logger.log("✅ Anonymous authentication successful:", user.uid);
      return user;
    } catch (error) {
      if (error.code === 'auth/admin-restricted-operation') {
        logger.warn("⚠️ Anonymous auth disabled, using mock user for testing");
        return enableDevMode();
      }
      throw error;
    }
  } else {
    // In production mode, require proper authentication
    logger.error("❌ User must be authenticated to access data");
    throw new Error("Please sign in to continue using the app");
  }
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
    // Finding 8: on error, scrub known sensitive free-form fields before logging.
    const safeMeta = options.sensitive
      ? { code: error.code, name: error.name }
      : error;
    logger.error("❌ Firestore write error:", safeMeta);
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

// Debug function to inspect all data in Firestore for current user
export const debugInspectAllFirebaseData = async () => {
  try {
    const user = await ensureAuthenticated();
    const db = await getDb();
    
    logger.log("🔍 Inspecting all Firestore data for user:", user.uid);
    
    const collections = ['journalEntries', 'killTargets', 'hardLessons', 'blackMirrorEntries', 'relapseEntries'];
    const results = {};
    
    for (const collectionName of collections) {
      try {
        // Query ALL documents in collection (no filters)
        const colRef = collection(db, collectionName);
        const allDocsQuery = query(colRef);
        const allDocsSnapshot = await getDocs(allDocsQuery);
        
        const allDocs = allDocsSnapshot.docs.map(doc => ({
          id: doc.id,
          userId: doc.data().userId,
          hasUserId: !!doc.data().userId,
          createdAt: doc.data().createdAt || doc.data().timestamp,
          ...doc.data()
        }));
        
        // Count by userId
        const byUserId = {};
        allDocs.forEach(doc => {
          const uid = doc.userId || 'NO_USER_ID';
          byUserId[uid] = (byUserId[uid] || 0) + 1;
        });
        
        results[collectionName] = {
          total: allDocsSnapshot.docs.length,
          byUserId: byUserId,
          currentUserCount: allDocs.filter(d => !d.userId || d.userId === user.uid).length,
          samples: allDocs.slice(0, 2).map(d => ({
            id: d.id,
            userId: d.userId,
            hasUserId: d.hasUserId,
            createdAt: d.createdAt
          }))
        };
        
        logger.log(`📊 ${collectionName}:`, results[collectionName]);
      } catch (error) {
        logger.warn(`⚠️ Could not read ${collectionName}:`, error.message);
        results[collectionName] = { error: error.message, total: 0 };
      }
    }
    
    return results;
  } catch (error) {
    logger.error("❌ Debug inspection failed:", error);
    throw error;
  }
};

/**
 * Safe preview of data migration - shows what will be migrated WITHOUT making changes
 */
export const previewDataMigration = async (sourceUserId, targetUserId) => {
  try {
    const db = await getDb();
    const collections = ['journalEntries', 'killTargets', 'hardLessons', 'blackMirrorEntries', 'relapseEntries'];
    const preview = {};
    let totalDocuments = 0;

    for (const collectionName of collections) {
      const collectionRef = collection(db, collectionName);
      const q = query(collectionRef, where('userId', '==', sourceUserId));
      const snapshot = await getDocs(q);

      const docCount = snapshot.size;
      totalDocuments += docCount;

      preview[collectionName] = {
        count: docCount,
        documents: snapshot.docs.map(doc => ({
          id: doc.id,
          userId: doc.data().userId,
          preview: Object.keys(doc.data()).slice(0, 3).reduce((acc, key) => {
            acc[key] = doc.data()[key];
            return acc;
          }, {})
        }))
      };
    }

    return {
      sourceUserId,
      targetUserId,
      totalDocuments,
      summary: preview,
      confirmation: `⚠️ PREVIEW: Will migrate ${totalDocuments} documents from "${sourceUserId}" to "${targetUserId}". Review above before confirming!`
    };
  } catch (error) {
    logger.error("❌ Migration preview failed:", error);
    throw error;
  }
};

/**
 * Execute safe data migration - moves documents from source userId to target userId
 */
export const executeDataMigration = async (sourceUserId, targetUserId) => {
  try {
    if (!sourceUserId || !targetUserId) {
      throw new Error('Both sourceUserId and targetUserId are required');
    }

    if (sourceUserId === targetUserId) {
      throw new Error('Source and target userIds must be different');
    }

    const db = await getDb();
    const collections = ['journalEntries', 'killTargets', 'hardLessons', 'blackMirrorEntries', 'relapseEntries'];
    const migrationResults = {};
    let totalMigrated = 0;
    let totalErrors = 0;

    for (const collectionName of collections) {
      const collectionRef = collection(db, collectionName);
      const q = query(collectionRef, where('userId', '==', sourceUserId));
      const snapshot = await getDocs(q);

      migrationResults[collectionName] = {
        attempted: snapshot.size,
        succeeded: 0,
        failed: 0,
        errors: []
      };

      for (const doc of snapshot.docs) {
        try {
          await updateDoc(doc.ref, { userId: targetUserId });
          migrationResults[collectionName].succeeded++;
          totalMigrated++;
        } catch (error) {
          migrationResults[collectionName].failed++;
          migrationResults[collectionName].errors.push({
            docId: doc.id,
            error: error.message
          });
          totalErrors++;
          logger.error(`❌ Failed to migrate ${collectionName}/${doc.id}:`, error);
        }
      }
    }

    logger.log(`✅ Migration complete: ${totalMigrated} documents migrated, ${totalErrors} errors`);

    return {
      sourceUserId,
      targetUserId,
      totalMigrated,
      totalErrors,
      details: migrationResults,
      status: totalErrors === 0 ? '✅ MIGRATION COMPLETE' : '⚠️ MIGRATION COMPLETED WITH ERRORS'
    };
  } catch (error) {
    logger.error("❌ Data migration failed:", error);
    throw error;
  }
};

/**
 * Scan for duplicate document IDs and show preview
 */
export const findDuplicateDocuments = async () => {
  try {
    const db = await getDb();
    const collections = ['journalEntries', 'killTargets', 'hardLessons', 'blackMirrorEntries', 'relapseEntries'];
    const duplicateReport = {};

    for (const collectionName of collections) {
      const collectionRef = collection(db, collectionName);
      const allDocsQuery = query(collectionRef);
      const snapshot = await getDocs(allDocsQuery);

      const idMap = {};
      const duplicates = [];

      snapshot.docs.forEach(doc => {
        const docId = doc.id;
        if (!idMap[docId]) {
          idMap[docId] = [];
        }
        idMap[docId].push({
          docId,
          userId: doc.data().userId,
          createdAt: doc.data().createdAt || doc.data().timestamp,
          title: doc.data().title || doc.data().entry || 'N/A'
        });
      });

      // Find duplicates
      Object.entries(idMap).forEach(([docId, instances]) => {
        if (instances.length > 1) {
          duplicates.push({
            docId,
            count: instances.length,
            instances
          });
        }
      });

      if (duplicates.length > 0) {
        duplicateReport[collectionName] = {
          duplicateCount: duplicates.length,
          totalAffectedIds: duplicates.length,
          duplicates
        };
      }
    }

    const hasDuplicates = Object.keys(duplicateReport).length > 0;
    
    if (hasDuplicates) {
      logger.warn('⚠️ DUPLICATES FOUND:', duplicateReport);
    } else {
      logger.log('✅ No duplicate document IDs found!');
    }

    return {
      hasDuplicates,
      collections: duplicateReport,
      summary: `Found duplicates in ${Object.keys(duplicateReport).length} collection(s)`
    };
  } catch (error) {
    logger.error("❌ Duplicate scan failed:", error);
    throw error;
  }
};

/**
 * Remove duplicate documents - keeps oldest, removes newer copies
 */
export const removeDuplicateDocuments = async () => {
  try {
    const db = await getDb();
    const collections = ['journalEntries', 'killTargets', 'hardLessons', 'blackMirrorEntries', 'relapseEntries'];
    const removalResults = {};
    let totalRemoved = 0;
    let totalErrors = 0;

    for (const collectionName of collections) {
      const collectionRef = collection(db, collectionName);
      const allDocsQuery = query(collectionRef);
      const snapshot = await getDocs(allDocsQuery);

      const idMap = {};

      snapshot.docs.forEach(doc => {
        const docId = doc.id;
        if (!idMap[docId]) {
          idMap[docId] = [];
        }
        idMap[docId].push({
          ref: doc.ref,
          data: doc.data(),
          createdAt: doc.data().createdAt || doc.data().timestamp || '0'
        });
      });

      removalResults[collectionName] = {
        duplicatesRemoved: 0,
        errors: []
      };

      // For each duplicate ID, keep oldest and remove rest
      for (const [docId, instances] of Object.entries(idMap)) {
        if (instances.length > 1) {
          // Sort by createdAt - keep first (oldest), remove rest
          instances.sort((a, b) => {
            const dateA = new Date(a.createdAt).getTime();
            const dateB = new Date(b.createdAt).getTime();
            return dateA - dateB;
          });

          // Remove all but first
          for (let i = 1; i < instances.length; i++) {
            try {
              await deleteDoc(instances[i].ref);
              removalResults[collectionName].duplicatesRemoved++;
              totalRemoved++;
              logger.log(`✅ Removed duplicate: ${collectionName}/${docId} (kept oldest)`);
            } catch (error) {
              removalResults[collectionName].errors.push({
                docId,
                error: error.message
              });
              totalErrors++;
              logger.error(`❌ Failed to remove duplicate ${collectionName}/${docId}:`, error);
            }
          }
        }
      }
    }

    return {
      totalRemoved,
      totalErrors,
      details: removalResults,
      status: totalErrors === 0 ? '✅ CLEANUP COMPLETE' : '⚠️ CLEANUP COMPLETED WITH ERRORS'
    };
  } catch (error) {
    logger.error("❌ Duplicate removal failed:", error);
    throw error;
  }
};
