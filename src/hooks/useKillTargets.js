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
import { db, auth } from '../firebase';

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

      if (!auth.currentUser) {
        console.warn("No authenticated user for kill targets query");
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
      const fetchedTargets = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate() || new Date(),
        lastUpdated: doc.data().lastUpdated?.toDate() || new Date(),
        completedAt: doc.data().completedAt?.toDate() || null
      }));

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
      console.log(`✅ Loaded ${fetchedTargets.length} kill targets for ${queryDateString}`);

    } catch (err) {
      console.error("Error fetching kill targets:", err);
      setError(err.message || 'Failed to fetch kill targets');
      setTargets([]);
    } finally {
      setLoading(false);
    }
  };

  // Setup real-time listener or one-time fetch
  useEffect(() => {
    if (!auth.currentUser) {
      setLoading(false);
      setTargets([]);
      return;
    }

    if (realtime) {
      // Real-time listener with simple query (no orderBy to avoid composite index requirement)
      const q = query(
        collection(db, 'killTargets'),
        where('userId', '==', auth.currentUser.uid),
        where('targetDate', '==', queryDateString)
      );

      const unsubscribe = onSnapshot(
        q,
        (querySnapshot) => {
          const fetchedTargets = querySnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            createdAt: doc.data().createdAt?.toDate() || new Date(),
            lastUpdated: doc.data().lastUpdated?.toDate() || new Date(),
            completedAt: doc.data().completedAt?.toDate() || null
          }));

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
          console.log(`🔄 Real-time update: ${fetchedTargets.length} kill targets`);
        },
        (err) => {
          console.error("Real-time listener error:", err);
          setError(err.message || 'Real-time update failed');
          setLoading(false);
        }
      );

      return () => unsubscribe();
    } else {
      // One-time fetch
      fetchTargets();
    }
  }, [auth.currentUser, queryDateString, realtime]);

  // Manual refetch function
  const refetch = () => {
    if (!realtime) {
      fetchTargets();
    }
  };

  // Toggle target status between different states
  const toggleTargetStatus = async (targetId, newStatus) => {
    try {
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
      console.log(`✅ Target status updated to: ${newStatus}`);

      // If not using real-time updates, manually refetch
      if (!realtime) {
        refetch();
      }

      return true;
    } catch (error) {
      console.error('Error updating target status:', error);
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
      if (!auth.currentUser) {
        throw new Error('No authenticated user');
      }

      const targetRef = doc(db, 'killTargets', targetId);
      const updateData = {
        reflectionNotes: reflectionNote.trim(),
        lastUpdated: serverTimestamp()
      };

      await updateDoc(targetRef, updateData);
      console.log(`✅ Reflection note updated for target: ${targetId}`);

      // If not using real-time updates, manually refetch
      if (!realtime) {
        refetch();
      }

      return true;
    } catch (error) {
      console.error('Error updating reflection note:', error);
      throw error;
    }
  };

  // Clear reflection notes for a target
  const clearReflectionNote = async (targetId) => {
    try {
      if (!auth.currentUser) {
        throw new Error('No authenticated user');
      }

      const targetRef = doc(db, 'killTargets', targetId);
      const updateData = {
        reflectionNotes: '',
        lastUpdated: serverTimestamp()
      };

      await updateDoc(targetRef, updateData);
      console.log(`✅ Reflection note cleared for target: ${targetId}`);

      // If not using real-time updates, manually refetch
      if (!realtime) {
        refetch();
      }

      return true;
    } catch (error) {
      console.error('Error clearing reflection note:', error);
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
      console.log(`✅ Loaded ${fetchedTargets.length} kill targets for this week`);

    } catch (err) {
      console.error("Error fetching week targets:", err);
      setError(err.message || 'Failed to fetch week targets');
      setWeekTargets([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (auth.currentUser) {
      fetchWeekTargets();
    } else {
      setLoading(false);
      setWeekTargets([]);
    }
  }, [auth.currentUser]);

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
