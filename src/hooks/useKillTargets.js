import { useState, useEffect } from 'react';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  onSnapshot,
  orderBy,
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

  const fetchTargets = async () => {
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
  };

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
  }, [queryDateString, realtime]);

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
 * Hook specifically for today's kill targets
 * @param {boolean} realtime - Whether to use real-time updates
 * @returns {object} { targets, loading, error, refetch, stats }
 */
export const useTodaysKillTargets = (realtime = false) => {
  return useKillTargetsForDate(new Date(), realtime);
};

/**
 * Hook for this week's kill targets
 * @param {boolean} realtime - Whether to use real-time updates
 * @returns {object} { targets, loading, error, refetch, stats }
 */
export const useThisWeeksKillTargets = (realtime = false) => {
  const [weekTargets, setWeekTargets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchWeekTargets = async () => {
    try {
      setLoading(true);
      setError(null);

      const auth = await getAuth();
      const db = await getDb();

      if (!auth.currentUser) {
        setWeekTargets([]);
        return;
      }

      // Get start and end of current week
      const today = new Date();
      const startOfWeek = new Date(today);
      startOfWeek.setDate(today.getDate() - today.getDay()); // Start of week (Sunday)
      startOfWeek.setHours(0, 0, 0, 0);
      
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 7); // End of week

      const q = query(
        collection(db, 'killTargets'),
        where('userId', '==', auth.currentUser.uid),
        where('targetDate', '>=', startOfWeek),
        where('targetDate', '<', endOfWeek),
        orderBy('targetDate', 'desc'),
        orderBy('createdAt', 'desc')
      );

      const querySnapshot = await getDocs(q);
      const fetchedTargets = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        targetDate: doc.data().targetDate?.toDate() || new Date(),
        createdAt: doc.data().createdAt?.toDate() || new Date(),
        completedAt: doc.data().completedAt?.toDate() || null
      }));

      setWeekTargets(fetchedTargets);
      logger.log(`✅ Loaded ${fetchedTargets.length} kill targets for this week`);

    } catch (err) {
      logger.error("Error fetching week targets:", err);
      setError(err.message || 'Failed to fetch week targets');
      setWeekTargets([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const checkAndFetch = async () => {
      const auth = await getAuth();
      if (auth.currentUser) {
        fetchWeekTargets();
      } else {
        setLoading(false);
        setWeekTargets([]);
      }
    };
    checkAndFetch();
  }, []);

  const refetch = () => fetchWeekTargets();

  const stats = {
    total: weekTargets.length,
    killed: weekTargets.filter(t => t.status === 'killed').length,
    escaped: weekTargets.filter(t => t.status === 'escaped').length,
    active: weekTargets.filter(t => t.status === 'active').length,
    completionRate: weekTargets.length > 0 ? (weekTargets.filter(t => t.status === 'killed').length / weekTargets.length) * 100 : 0
  };

  return {
    targets: weekTargets,
    loading,
    error,
    refetch,
    stats
  };
};
