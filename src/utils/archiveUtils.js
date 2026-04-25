import { doc, setDoc, deleteDoc, collection, query, where, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { getAuth, getDb } from '../firebase.js';
import logger from './logger.js';

// Parallel-collection archive pattern. Each active collection has a sibling
// `{name}Archive` that stores documents user-initiated-archive moves here.
// Restore reverses the move; deleteArchivedEntry is a hard delete with no
// undo (the archive IS the undo surface).

const archiveNameFor = (collectionName) => `${collectionName}Archive`;

const ensureAuthenticated = async () => {
  const auth = await getAuth();
  if (!auth.currentUser) {
    throw new Error('Please sign in to continue using the app');
  }
  return auth.currentUser;
};

// Copy entry into `{collectionName}Archive` at the SAME document id, then
// delete from the active collection. Keeping the id stable makes restore
// trivial and keeps any cross-module references that point at this id from
// silently breaking if the user restores.
export const archiveEntry = async (collectionName, entry) => {
  if (!entry?.id) {
    throw new Error('archiveEntry requires an entry with an id');
  }
  const user = await ensureAuthenticated();
  const db = await getDb();

  const { id, createdAt: _createdAt, timestamp: _timestamp, ...rest } = entry;
  const archivePayload = {
    ...rest,
    userId: user.uid,
    archivedAt: new Date().toISOString(),
    timestamp: serverTimestamp(),
  };

  const archiveRef = doc(db, archiveNameFor(collectionName), id);
  await setDoc(archiveRef, archivePayload);
  await deleteDoc(doc(db, collectionName, id));
  logger.log(`📦 Archived ${collectionName}/${id} → ${archiveNameFor(collectionName)}/${id}`);
  return { id, ...archivePayload };
};

// Restore inverse of archiveEntry: copy back into active collection, strip
// `archivedAt`, delete from archive.
//
// Failure handling: if the archive delete fails AFTER the active write
// succeeds, the document exists in both collections. Real-time listeners
// reconcile by showing both lists; the user sees the entry restored. We log
// a warning and surface a soft toast on the consumer side rather than
// throwing, so partial-success isn't reported as total failure.
export const restoreEntry = async (collectionName, archivedEntry) => {
  if (!archivedEntry?.id) {
    throw new Error('restoreEntry requires an archived entry with an id');
  }
  const user = await ensureAuthenticated();
  const db = await getDb();

  const { id, archivedAt: _archivedAt, createdAt: _createdAt, timestamp: _timestamp, ...rest } = archivedEntry;
  const restorePayload = {
    ...rest,
    userId: user.uid,
    timestamp: serverTimestamp(),
  };

  const activeRef = doc(db, collectionName, id);
  // Step 1: write to active collection. If this throws the consumer's catch
  // block fires and nothing has been mutated.
  await setDoc(activeRef, restorePayload);

  // Step 2: best-effort delete from archive. If this fails, the doc lingers
  // in archive but the restore is functionally complete (entry visible in
  // active list). Returning success here matches user intent.
  try {
    await deleteDoc(doc(db, archiveNameFor(collectionName), id));
  } catch (deleteError) {
    logger.warn(`♻️  Archive delete failed after restore — doc lives in both collections`, {
      id,
      collection: collectionName,
      code: deleteError?.code,
    });
  }

  logger.log(`♻️  Restored ${archiveNameFor(collectionName)}/${id} → ${collectionName}/${id}`);
  return { id, ...restorePayload };
};

// Hard delete from archive. No undo.
export const deleteArchivedEntry = async (collectionName, archivedEntry) => {
  if (!archivedEntry?.id) {
    throw new Error('deleteArchivedEntry requires an archived entry with an id');
  }
  await ensureAuthenticated();
  const db = await getDb();
  await deleteDoc(doc(db, archiveNameFor(collectionName), archivedEntry.id));
  logger.log(`🗑️  Permanently deleted ${archiveNameFor(collectionName)}/${archivedEntry.id}`);
  return { id: archivedEntry.id, deleted: true };
};

// Real-time subscription to an archive collection. Mirrors subscribeToUserData.
export const subscribeToArchive = async (collectionName, callback) => {
  try {
    const auth = await getAuth();
    const db = await getDb();
    const user = auth.currentUser;
    if (!user) {
      callback([]);
      return () => {};
    }

    const colRef = collection(db, archiveNameFor(collectionName));
    const q = query(colRef, where('userId', '==', user.uid));

    let unsubscribe = () => {};
    let torndown = false;
    const safeUnsubscribe = () => {
      if (torndown) return;
      torndown = true;
      try { unsubscribe(); } catch (err) { logger.warn('archive listener teardown failed', err?.message); }
    };

    unsubscribe = onSnapshot(q, (snapshot) => {
      if (torndown) return;
      const data = snapshot.docs.map(docSnap => {
        const docData = docSnap.data();
        const archivedAt = docData.archivedAt
          ? (typeof docData.archivedAt === 'string' ? new Date(docData.archivedAt) : docData.archivedAt)
          : new Date();
        return {
          id: docSnap.id,
          ...docData,
          archivedAt,
        };
      });
      data.sort((a, b) => new Date(b.archivedAt) - new Date(a.archivedAt));
      callback(data);
    }, (error) => {
      logger.error(`❌ Archive subscription error for ${archiveNameFor(collectionName)}:`, error);
      safeUnsubscribe();
    });

    return safeUnsubscribe;
  } catch (error) {
    logger.error(`❌ Failed to subscribe to archive ${archiveNameFor(collectionName)}:`, error);
    callback([]);
    return () => {};
  }
};
