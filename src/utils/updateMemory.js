/**
 * Long-term AI memory — client bindings.
 *
 * Thin wrappers over the server-only memory callables plus a 5-min cached read
 * for the UI surface ("The Record"). The Oracle's own memory injection is done
 * SERVER-SIDE (functions/index.js) — this file never feeds memory into feedback;
 * it only triggers updates and reads docs for display/editing.
 */

import { getFunctions, httpsCallable } from 'firebase/functions';
import { getAuth } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { getDb } from '../firebase.js';
import { MEMORY_DOC_IDS, isMemoryModule } from './memoryConstants.js';
import logger from './logger.js';

const callable = (name, opts = {}) => httpsCallable(getFunctions(), name, { timeout: 30000, ...opts });

/**
 * Fire-and-forget memory update after a finalized entry. NEVER awaited by the
 * save flow and NEVER throws to the caller — a failed memory update must not
 * block or error the user's entry save.
 *
 * @param {'journal'|'killList'|'hardLessons'|'relapse'} module
 * @param {string} entryId  id of the just-saved source entry
 */
export const updateMemory = (module, entryId) => {
  if (!isMemoryModule(module) || !entryId) return Promise.resolve();
  return callable('updateMemory')({ module, entryId })
    .catch((err) => { logger.warn('updateMemory failed (non-blocking)', { module, err: err?.message }); });
};

// ── UI-facing callables ──────────────────────────────────────────────────────
export const editMemoryContent = (module, content) =>
  callable('editMemory')({ module, content }).then((r) => { clearMemoryCache(); return r.data; });

export const deleteMemoryReceipt = (module, quote) =>
  callable('deleteMemoryReceipt')({ module, quote }).then((r) => { clearMemoryCache(); return r.data; });

export const wipeMemory = (module) =>
  callable('wipeMemory')({ module }).then((r) => { clearMemoryCache(); return r.data; });

// ── Cached read for The Record (mirrors getBehavioralContext's 5-min cache) ──
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000;
const now = () => Date.now();

export const clearMemoryCache = () => cache.clear();

/**
 * Read all five memory docs for the signed-in user. Returns
 * { global, journal, killList, hardLessons, relapse } with null for missing docs.
 */
export const readMemoryDocs = async ({ useCache = true } = {}) => {
  const auth = getAuth();
  const uid = auth.currentUser?.uid;
  if (!uid) return {};

  const cacheKey = `memory_${uid}`;
  if (useCache) {
    const cached = cache.get(cacheKey);
    if (cached && now() - cached.at < CACHE_TTL) return cached.value;
  }

  const db = await getDb();
  const entries = await Promise.all(
    MEMORY_DOC_IDS.map(async (id) => {
      try {
        const snap = await getDoc(doc(db, 'users', uid, 'memory', id));
        return [id, snap.exists() ? snap.data() : null];
      } catch (err) {
        logger.warn('readMemoryDocs: doc read failed', { id, err: err?.message });
        return [id, null];
      }
    })
  );
  const value = Object.fromEntries(entries);
  cache.set(cacheKey, { at: now(), value });
  return value;
};
