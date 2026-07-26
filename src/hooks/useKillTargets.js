import { useState, useEffect } from 'react';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  onSnapshot,
  doc,
  updateDoc,
  serverTimestamp
} from 'firebase/firestore';
import { getAuth, getDb } from '../firebase';
import logger from '../utils/logger';
import { localDateKey } from '../utils/dateUtils';

/**
 * Hook for ALL kill targets regardless of creation date.
 * Returns all targets for stats, but `activeTargets` filtered to active only.
 * Used by the Dashboard "Active Contracts" widget.
 */
export const useActiveKillTargets = (realtime = true) => {
  const [allTargets, setAllTargets] = useState([]);
  const [targets, setTargets] = useState([]);
  const [confirmedKills, setConfirmedKills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [retryKey, setRetryKey] = useState(0);

  // `mounted` guards every step after an await — unmount before the awaits
  // resolve must not leak the snapshot listeners or set state on a dead hook.
  useEffect(() => {
    let cleanup;
    let mounted = true;
    const setup = async () => {
      const auth = await getAuth();
      const db = await getDb();
      if (!mounted) return;
      const userId = auth.currentUser?.uid;
      if (!userId) { setLoading(false); setTargets([]); return; }

      const q = query(
        collection(db, 'killTargets'),
        where('userId', '==', userId)
      );
      // Kills are MOVED to confirmedKills, never left in killTargets with
      // status:'killed' — the killed/completion stats must read both.
      const killsQ = query(
        collection(db, 'confirmedKills'),
        where('userId', '==', userId)
      );

      const parseTargets = (snap) => {
        const fetched = snap.docs.map(d => {
          const data = d.data();
          return {
            id: d.id, ...data,
            createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : (data.createdAt || new Date()),
            lastUpdated: data.lastUpdated?.toDate ? data.lastUpdated.toDate() : (data.lastUpdated || new Date()),
            completedAt: data.completedAt?.toDate ? data.completedAt.toDate() : (data.completedAt || null),
          };
        });
        // Active targets sorted by streak then age
        const active = fetched
          .filter(t => t.status === 'active')
          .sort((a, b) => (b.streak || 0) - (a.streak || 0) || new Date(a.createdAt) - new Date(b.createdAt));
        setAllTargets(fetched);
        setTargets(active);
      };

      const parseKills = (snap) => {
        setConfirmedKills(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      };

      if (realtime) {
        const unsub = onSnapshot(q, (snap) => {
          if (!mounted) return;
          parseTargets(snap);
          setLoading(false);
          setError(null);
        }, (err) => {
          if (!mounted) return;
          setError(err.message);
          setLoading(false);
        });
        const unsubKills = onSnapshot(killsQ, (snap) => {
          if (!mounted) return;
          parseKills(snap);
        }, (err) => {
          logger.error('Confirmed kills listener error:', err);
        });
        cleanup = () => { unsub(); unsubKills(); };
      } else {
        try {
          const [snap, killsSnap] = await Promise.all([getDocs(q), getDocs(killsQ)]);
          if (!mounted) return;
          parseTargets(snap);
          parseKills(killsSnap);
        } catch (err) {
          if (mounted) setError(err.message);
        }
        if (mounted) setLoading(false);
      }
    };
    setup();
    return () => {
      mounted = false;
      cleanup?.();
    };
  }, [realtime, retryKey]);

  const refetch = () => {
    setError(null);
    setLoading(true);
    setRetryKey(k => k + 1);
  };

  // Toggle target status between different states
  const toggleTargetStatus = async (targetId, newStatus, extraFields = {}) => {
    try {
      const auth = await getAuth();
      const db = await getDb();
      if (!auth.currentUser) throw new Error('No authenticated user');
      const targetRef = doc(db, 'killTargets', targetId);
      const updateData = {
        status: newStatus,
        lastUpdated: serverTimestamp(),
        completedAt: newStatus === 'killed' ? serverTimestamp() : null,
        ...extraFields,
      };
      await updateDoc(targetRef, updateData);
      return true;
    } catch (err) {
      logger.error('Error updating target status:', err);
      throw err;
    }
  };

  // Accepts optional closure data: { note, tags }
  // A closed kill without a note is a hollow closure — the dashboard modal
  // enforces the note client-side, but the hook passes through whatever is given.
  const markAsKilled = (targetId, closure = null) => {
    if (closure && closure.note) {
      return toggleTargetStatus(targetId, 'killed', {
        closureNote: closure.note,
        closureTags: Array.isArray(closure.tags) ? closure.tags : [],
        closedAt: serverTimestamp(),
      });
    }
    return toggleTargetStatus(targetId, 'killed');
  };
  // Escape parity with the Ledger autopsy writer (KillList.jsx submitAutopsy):
  // append an escapeData entry in the same field shape and reset the streak,
  // so dashboard escapes are visible to autopsy/drift/synthesis readers.
  const markAsEscaped = (targetId, closure = null) => {
    const target = allTargets.find(t => t.id === targetId);
    if (closure && closure.note) {
      const escapeEntry = {
        date: localDateKey(),
        context: closure.note,
        rationalization: '',
        prevention: null,
        streakAtEscape: target?.streak || 0,
      };
      return toggleTargetStatus(targetId, 'escaped', {
        escapeClosureNote: closure.note,
        escapeClosureTags: Array.isArray(closure.tags) ? closure.tags : [],
        escapedAt: serverTimestamp(),
        escapeData: [...(target?.escapeData || []), escapeEntry],
        streak: 0,
      });
    }
    return toggleTargetStatus(targetId, 'escaped', { streak: 0 });
  };
  const markAsActive = (targetId) => toggleTargetStatus(targetId, 'active');

  const updateReflectionNote = async (targetId, reflectionNote) => {
    try {
      const auth = await getAuth();
      const db = await getDb();
      if (!auth.currentUser) throw new Error('No authenticated user');
      const targetRef = doc(db, 'killTargets', targetId);
      await updateDoc(targetRef, { reflectionNotes: reflectionNote.trim(), lastUpdated: serverTimestamp() });
      return true;
    } catch (err) {
      logger.error('Error updating reflection note:', err);
      throw err;
    }
  };

  const clearReflectionNote = async (targetId) => {
    try {
      const auth = await getAuth();
      const db = await getDb();
      if (!auth.currentUser) throw new Error('No authenticated user');
      const targetRef = doc(db, 'killTargets', targetId);
      await updateDoc(targetRef, { reflectionNotes: '', lastUpdated: serverTimestamp() });
      return true;
    } catch (err) {
      logger.error('Error clearing reflection note:', err);
      throw err;
    }
  };

  // Killed = archived confirmedKills + any legacy killTargets doc that still
  // carries status:'killed' from before the move-to-archive model.
  const legacyKilled = allTargets.filter(t => t.status === 'killed').length;
  const killed = confirmedKills.length + legacyKilled;
  const total = allTargets.length + confirmedKills.length;
  const stats = {
    total,
    killed,
    escaped: allTargets.filter(t => t.status === 'escaped').length,
    active: targets.length,
    completionRate: total > 0 ? (killed / total) * 100 : 0,
  };

  return {
    targets,       // active only — displayed in the widget
    allTargets,    // all statuses — for stats and patterns
    confirmedKills, // archived kills — killed/completion stats source
    loading,
    error,
    stats,
    refetch,
    toggleTargetStatus,
    markAsKilled,
    markAsEscaped,
    markAsActive,
    updateReflectionNote,
    clearReflectionNote,
  };
};

