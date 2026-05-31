// ────────────────────────────────────────────────────────────────────────
// Inner Ops — Firestore admin helpers (out-of-tree recovery utility)
//
// Moved out of src/utils/ on 2026-05-05 because no production code path
// imports it. Use this only via direct one-off invocations (e.g., a Node
// script that imports from this file, or a temporary dynamic import inside
// a dev-only Dashboard.jsx branch). It is intentionally NOT part of the
// app bundle and the Vite build does not see it.
//
// These helpers issue UNFILTERED queries and bulk rewrite/delete operations
// across collections — never wire them into user-facing flows.
// ────────────────────────────────────────────────────────────────────────

import { collection, query, where, getDocs, updateDoc, deleteDoc } from 'firebase/firestore';
import { getDb } from '../src/firebase.js';
import logger from '../src/utils/logger.js';

async function ensureAdminAuth() {
  const { getAuth } = await import('../src/firebase.js');
  const auth = await getAuth();
  if (!auth.currentUser) {
    throw new Error('Admin helpers require an authenticated user');
  }
  return auth.currentUser;
}

// Debug function to inspect all data in Firestore for current user.
// Issues UNFILTERED queries — only callable in dev (rules will reject in prod).
export const debugInspectAllFirebaseData = async () => {
  try {
    const user = await ensureAdminAuth();
    const db = await getDb();

    logger.log("🔍 Inspecting all Firestore data for user:", user.uid);

    const collections = ['journalEntries', 'killTargets', 'hardLessons', 'relapseEntries'];
    const results = {};

    for (const collectionName of collections) {
      try {
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

        logger.log(`📊 ${collectionName}: ${results[collectionName].total} docs`);
      } catch (error) {
        logger.warn(`⚠️ Could not read ${collectionName}:`, error.message);
        results[collectionName] = { error: error.message, total: 0 };
      }
    }

    return results;
  } catch (error) {
    logger.error("❌ Debug inspection failed:", { code: error.code, name: error.name });
    throw error;
  }
};

/**
 * Safe preview of data migration - shows what will be migrated WITHOUT making changes
 */
export const previewDataMigration = async (sourceUserId, targetUserId) => {
  try {
    await ensureAdminAuth();
    const db = await getDb();
    const collections = ['journalEntries', 'killTargets', 'hardLessons', 'relapseEntries'];
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
        // Pass 3 New Finding 11 (preventive): preview only field NAMES, not
        // values, so user content doesn't leak into devtools / Sentry.
        documents: snapshot.docs.map(doc => ({
          id: doc.id,
          userId: doc.data().userId,
          fieldNames: Object.keys(doc.data()).slice(0, 6),
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
    logger.error("❌ Migration preview failed:", { code: error.code, name: error.name });
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
    await ensureAdminAuth();

    const db = await getDb();
    const collections = ['journalEntries', 'killTargets', 'hardLessons', 'relapseEntries'];
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
            code: error.code,
          });
          totalErrors++;
          logger.error(`❌ Failed to migrate ${collectionName}/${doc.id}:`, { code: error.code, name: error.name });
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
    logger.error("❌ Data migration failed:", { code: error.code, name: error.name });
    throw error;
  }
};

/**
 * Scan for duplicate document IDs and show preview
 */
export const findDuplicateDocuments = async () => {
  try {
    await ensureAdminAuth();
    const db = await getDb();
    const collections = ['journalEntries', 'killTargets', 'hardLessons', 'relapseEntries'];
    const duplicateReport = {};

    for (const collectionName of collections) {
      const collectionRef = collection(db, collectionName);
      const allDocsQuery = query(collectionRef);
      const snapshot = await getDocs(allDocsQuery);

      const idMap = {};
      const duplicates = [];

      snapshot.docs.forEach(doc => {
        const docId = doc.id;
        if (!idMap[docId]) idMap[docId] = [];
        idMap[docId].push({
          docId,
          userId: doc.data().userId,
          createdAt: doc.data().createdAt || doc.data().timestamp,
          // Pass 3 New Finding 11 (preventive): no title/entry preview.
        });
      });

      Object.entries(idMap).forEach(([docId, instances]) => {
        if (instances.length > 1) {
          duplicates.push({ docId, count: instances.length, instances });
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
      logger.warn('⚠️ DUPLICATES FOUND:', { collections: Object.keys(duplicateReport) });
    } else {
      logger.log('✅ No duplicate document IDs found!');
    }

    return {
      hasDuplicates,
      collections: duplicateReport,
      summary: `Found duplicates in ${Object.keys(duplicateReport).length} collection(s)`
    };
  } catch (error) {
    logger.error("❌ Duplicate scan failed:", { code: error.code, name: error.name });
    throw error;
  }
};

/**
 * Remove duplicate documents - keeps oldest, removes newer copies
 */
export const removeDuplicateDocuments = async () => {
  try {
    await ensureAdminAuth();
    const db = await getDb();
    const collections = ['journalEntries', 'killTargets', 'hardLessons', 'relapseEntries'];
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
        if (!idMap[docId]) idMap[docId] = [];
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

      for (const [docId, instances] of Object.entries(idMap)) {
        if (instances.length > 1) {
          instances.sort((a, b) => {
            const dateA = new Date(a.createdAt).getTime();
            const dateB = new Date(b.createdAt).getTime();
            return dateA - dateB;
          });
          for (let i = 1; i < instances.length; i++) {
            try {
              await deleteDoc(instances[i].ref);
              removalResults[collectionName].duplicatesRemoved++;
              totalRemoved++;
              logger.log(`✅ Removed duplicate: ${collectionName}/${docId} (kept oldest)`);
            } catch (error) {
              removalResults[collectionName].errors.push({ docId, code: error.code });
              totalErrors++;
              logger.error(`❌ Failed to remove duplicate ${collectionName}/${docId}:`, { code: error.code, name: error.name });
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
    logger.error("❌ Duplicate removal failed:", { code: error.code, name: error.name });
    throw error;
  }
};
