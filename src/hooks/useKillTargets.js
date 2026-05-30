import { useState, useEffect, useCallback } from 'react';
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

/**
 * Custom hook to retrieve kill targets for the current date
 * @param {Date} targetDate - Optional date to query (defaults to today)
 * @param {boolean} realtime - Whether to use real-time updates (default: false)
 * @returns {object} { targets, loading, error, refetch }
 */
export const useKillTargetsForDate = (targetDate = null, realtime = false) => {
  const [targets, setTargets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Use provided date or default to today in YYYY-MM-DD format
  const queryDateString = targetDate 
    ? targetDate.toISOString().split('T')[0]
    : new Date().toISOString().split('T')[0];

  // Finding 16 remediation: fetchTargets is wrapped in useCallback with an
  // explicit dep (queryDateString). The fetch effect and the manual refetch
  // path both now reference a stable, correctly-updating closure.
  const fetchTargets = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const auth = await getAuth();
      const db = await getDb();

      if (!auth.currentUser) {
        logger.warn("No authenticated user for kill targets query");
        setTargets([]);
        return;
      }

      // Simple query - just userId and targetDate (no orderBy to avoid composite index requirement)
      const q = query(
        collection(db, 'killTargets'),
        where('userId', '==', auth.currentUser.uid),
        where('targetDate', '==', queryDateString)
      );

      const querySnapshot = await getDocs(q);
      const fetchedTargets = querySnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          // Handle both Firebase Timestamp objects and regular dates
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : (data.createdAt || new Date()),
          lastUpdated: data.lastUpdated?.toDate ? data.lastUpdated.toDate() : (data.lastUpdated || new Date()),
          completedAt: data.completedAt?.toDate ? data.completedAt.toDate() : (data.completedAt || null)
        };
      });

      // Sort by priority and creation time
      fetchedTargets.sort((a, b) => {
        // First sort by priority
        if (a.priority !== b.priority) {
          const priorityOrder = { high: 3, medium: 2, low: 1 };
          return (priorityOrder[b.priority] || 1) - (priorityOrder[a.priority] || 1);
        }
        // Then by creation time (newest first)
        return new Date(b.createdAt) - new Date(a.createdAt);
      });

      setTargets(fetchedTargets);
      logger.log(`✅ Loaded ${fetchedTargets.length} kill targets for ${queryDateString}`);

    } catch (err) {
      logger.error("Error fetching kill targets:", err);
      setError(err.message || 'Failed to fetch kill targets');
      setTargets([]);
    } finally {
      setLoading(false);
    }
  }, [queryDateString]);

  // Setup real-time listener or one-time fetch
  useEffect(() => {
    let cleanup;
    const setupListener = async () => {
      const auth = await getAuth();
      const db = await getDb();
      const userId = auth.currentUser?.uid;
      
      if (!userId) {
        setLoading(false);
        setTargets([]);
        return;
      }

      if (realtime) {
        // Real-time listener with simple query (no orderBy to avoid composite index requirement)
        const q = query(
          collection(db, 'killTargets'),
          where('userId', '==', userId),
          where('targetDate', '==', queryDateString)
        );

        const unsubscribe = onSnapshot(
          q,
          (querySnapshot) => {
            const fetchedTargets = querySnapshot.docs.map(doc => {
              const data = doc.data();
              return {
                id: doc.id,
                ...data,
                // Handle both Firebase Timestamp objects and regular dates
                createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : (data.createdAt || new Date()),
                lastUpdated: data.lastUpdated?.toDate ? data.lastUpdated.toDate() : (data.lastUpdated || new Date()),
                completedAt: data.completedAt?.toDate ? data.completedAt.toDate() : (data.completedAt || null)
              };
            });

            // Sort by priority and creation time
            fetchedTargets.sort((a, b) => {
              if (a.priority !== b.priority) {
                const priorityOrder = { high: 3, medium: 2, low: 1 };
                return (priorityOrder[b.priority] || 1) - (priorityOrder[a.priority] || 1);
              }
              return new Date(b.createdAt) - new Date(a.createdAt);
            });

            setTargets(fetchedTargets);
            setLoading(false);
            setError(null);
            logger.log(`🔄 Real-time update: ${fetchedTargets.length} kill targets`);
          },
          (err) => {
            logger.error("Real-time listener error:", err);
            setError(err.message || 'Real-time update failed');
            setLoading(false);
          }
        );

        cleanup = () => unsubscribe();
      } else {
        // One-time fetch
        await fetchTargets();
      }
    };

    setupListener().catch(err => {
      logger.error("Setup listener error:", err);
      setLoading(false);
    });

    return () => cleanup?.();
  }, [queryDateString, realtime, fetchTargets]);

  // Manual refetch function
  const refetch = () => {
    if (!realtime) {
      fetchTargets();
    }
  };

  // Toggle target status between different states
  const toggleTargetStatus = async (targetId, newStatus) => {
    try {
      const auth = await getAuth();
      const db = await getDb();
      
      if (!auth.currentUser) {
        throw new Error('No authenticated user');
      }

      const targetRef = doc(db, 'killTargets', targetId);
      const updateData = {
        status: newStatus,
        lastUpdated: serverTimestamp()
      };

      // Add completion timestamp if status is 'killed'
      if (newStatus === 'killed') {
        updateData.completedAt = serverTimestamp();
      } else {
        // Remove completion timestamp for other statuses
        updateData.completedAt = null;
      }

      await updateDoc(targetRef, updateData);
      logger.log(`✅ Target status updated to: ${newStatus}`);

      // If not using real-time updates, manually refetch
      if (!realtime) {
        refetch();
      }

      return true;
    } catch (error) {
      logger.error('Error updating target status:', error);
      throw error;
    }
  };

  // Quick toggle between killed/escaped/active
  const quickToggleStatus = async (targetId, currentStatus) => {
    const statusCycle = {
      'active': 'killed',
      'killed': 'escaped', 
      'escaped': 'active'
    };
    
    const newStatus = statusCycle[currentStatus] || 'active';
    return await toggleTargetStatus(targetId, newStatus);
  };

  // Set target as killed
  const markAsKilled = async (targetId) => {
    return await toggleTargetStatus(targetId, 'killed');
  };

  // Set target as escaped
  const markAsEscaped = async (targetId) => {
    return await toggleTargetStatus(targetId, 'escaped');
  };

  // Set target as active
  const markAsActive = async (targetId) => {
    return await toggleTargetStatus(targetId, 'active');
  };

  // Update reflection notes for a target
  const updateReflectionNote = async (targetId, reflectionNote) => {
    try {
      const auth = await getAuth();
      const db = await getDb();
      
      if (!auth.currentUser) {
        throw new Error('No authenticated user');
      }

      const targetRef = doc(db, 'killTargets', targetId);
      const updateData = {
        reflectionNotes: reflectionNote.trim(),
        lastUpdated: serverTimestamp()
      };

      await updateDoc(targetRef, updateData);
      logger.log(`✅ Reflection note updated for target: ${targetId}`);

      // If not using real-time updates, manually refetch
      if (!realtime) {
        refetch();
      }

      return true;
    } catch (error) {
      logger.error('Error updating reflection note:', error);
      throw error;
    }
  };

  // Clear reflection notes for a target
  const clearReflectionNote = async (targetId) => {
    try {
      const auth = await getAuth();
      const db = await getDb();
      
      if (!auth.currentUser) {
        throw new Error('No authenticated user');
      }

      const targetRef = doc(db, 'killTargets', targetId);
      const updateData = {
        reflectionNotes: '',
        lastUpdated: serverTimestamp()
      };

      await updateDoc(targetRef, updateData);
      logger.log(`✅ Reflection note cleared for target: ${targetId}`);

      // If not using real-time updates, manually refetch
      if (!realtime) {
        refetch();
      }

      return true;
    } catch (error) {
      logger.error('Error clearing reflection note:', error);
      throw error;
    }
  };

  // Computed statistics
  const stats = {
    total: targets.length,
    killed: targets.filter(t => t.status === 'killed').length,
    escaped: targets.filter(t => t.status === 'escaped').length,
    active: targets.filter(t => t.status === 'active').length,
    pending: targets.filter(t => !t.status || t.status === 'pending').length,
    highPriority: targets.filter(t => t.priority === 'high').length,
    mediumPriority: targets.filter(t => t.priority === 'medium').length,
    lowPriority: targets.filter(t => t.priority === 'low').length,
    completionRate: targets.length > 0 ? (targets.filter(t => t.status === 'killed').length / targets.length) * 100 : 0
  };

  return {
    targets,
    loading,
    error,
    refetch,
    stats,
    // Status toggle functions
    toggleTargetStatus,
    quickToggleStatus,
    markAsKilled,
    markAsEscaped,
    markAsActive,
    // Reflection note functions
    updateReflectionNote,
    clearReflectionNote
  };
};

/**
 * Hook for ALL kill targets regardless of creation date.
 * Returns all targets for stats, but `activeTargets` filtered to active only.
 * Used by the Dashboard "Active Contracts" widget.
 */
export const useActiveKillTargets = (realtime = true) => {
  const [allTargets, setAllTargets] = useState([]);
  const [targets, setTargets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let cleanup;
    const setup = async () => {
      const auth = await getAuth();
      const db = await getDb();
      const userId = auth.currentUser?.uid;
      if (!userId) { setLoading(false); setTargets([]); return; }

      const q = query(
        collection(db, 'killTargets'),
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

      if (realtime) {
        const unsub = onSnapshot(q, (snap) => {
          parseTargets(snap);
          setLoading(false);
          setError(null);
        }, (err) => { setError(err.message); setLoading(false); });
        cleanup = () => unsub();
      } else {
        try {
          const snap = await getDocs(q);
          parseTargets(snap);
        } catch (err) { setError(err.message); }
        setLoading(false);
      }
    };
    setup();
    return () => cleanup?.();
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
  const markAsEscaped = (targetId, closure = null) => {
    if (closure && closure.note) {
      return toggleTargetStatus(targetId, 'escaped', {
        escapeClosureNote: closure.note,
        escapeClosureTags: Array.isArray(closure.tags) ? closure.tags : [],
        escapedAt: serverTimestamp(),
      });
    }
    return toggleTargetStatus(targetId, 'escaped');
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

  const stats = {
    total: allTargets.length,
    killed: allTargets.filter(t => t.status === 'killed').length,
    escaped: allTargets.filter(t => t.status === 'escaped').length,
    active: targets.length,
    completionRate: allTargets.length > 0
      ? (allTargets.filter(t => t.status === 'killed').length / allTargets.length) * 100
      : 0,
  };

  return {
    targets,       // active only — displayed in the widget
    allTargets,    // all statuses — for stats and patterns
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

