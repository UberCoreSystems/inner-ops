import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { authService } from '../utils/authService';
import { writeData, updateData, deleteData, subscribeToUserData } from '../utils/firebaseUtils';
import { generateAIFeedback } from '../utils/aiFeedback';
import OracleModal from '../components/OracleModal';
import { debounce } from '../utils/debounce';
import VirtualizedList from '../components/VirtualizedList';
import { KillCelebration } from '../components/Confetti';
import ouraToast from '../utils/toast';
import { SkeletonList, SkeletonKillTarget } from '../components/SkeletonLoader';
import logger from '../utils/logger';

// Stable icon definitions to avoid recreating objects on every render
const CATEGORY_ICONS = {
  'bad-habit': (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </svg>
  ),
  'negative-thought': (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M8 12h8M8 8h8M8 16h4" opacity="0.6" />
    </svg>
  ),
  'addiction': (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
    </svg>
  ),
  'toxic-behavior': (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2L2 22h20L12 2z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <circle cx="12" cy="17" r="1" fill="currentColor" stroke="none" />
    </svg>
  ),
  'fear': (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" opacity="0.5" />
      <circle cx="12" cy="12" r="2" opacity="0.3" />
    </svg>
  ),
  'procrastination': (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  ),
  'other': (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" opacity="0.5" />
      <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
    </svg>
  ),
};

const DIFFICULTY_TIERS = [
  { value: 'surface', label: 'Surface', description: 'Quick fix — 7 day streak to kill', streakToKill: 7, points: 10, color: 'text-[#22c55e]', bgColor: 'bg-[#22c55e]/10', borderColor: 'border-[#22c55e]/30', icon: '🌱' },
  { value: 'deep', label: 'Deep', description: 'Ingrained pattern — 21 day streak', streakToKill: 21, points: 25, color: 'text-[#f59e0b]', bgColor: 'bg-[#f59e0b]/10', borderColor: 'border-[#f59e0b]/30', icon: '⚡' },
  { value: 'core', label: 'Core', description: 'Identity-level — 60 day streak', streakToKill: 60, points: 50, color: 'text-[#ef4444]', bgColor: 'bg-[#ef4444]/10', borderColor: 'border-[#ef4444]/40', icon: '🔥' },
];

// Legacy priority → difficulty mapping for existing targets
const PRIORITY_TO_DIFFICULTY = { high: 'core', medium: 'deep', low: 'surface' };
const getDifficulty = (target) => target.difficulty || PRIORITY_TO_DIFFICULTY[target.priority] || 'deep';
const getTier = (target) => DIFFICULTY_TIERS.find(t => t.value === getDifficulty(target)) || DIFFICULTY_TIERS[1];
const getStreakToKill = (target) => getTier(target).streakToKill;

const MILESTONES = [3, 7, 14, 30, 60, 90];
const todayKey = () => new Date().toISOString().split('T')[0];

const CATEGORIES = [
  { value: 'bad-habit', label: 'Bad Habit', color: 'text-[#ef4444]', bgColor: 'bg-[#ef4444]/10' },
  { value: 'negative-thought', label: 'Negative Thought', color: 'text-[#a855f7]', bgColor: 'bg-[#a855f7]/10' },
  { value: 'addiction', label: 'Addiction', color: 'text-[#f59e0b]', bgColor: 'bg-[#f59e0b]/10' },
  { value: 'toxic-behavior', label: 'Toxic Behavior', color: 'text-[#eab308]', bgColor: 'bg-[#eab308]/10' },
  { value: 'fear', label: 'Fear/Anxiety', color: 'text-[#4da6ff]', bgColor: 'bg-[#4da6ff]/10' },
  { value: 'procrastination', label: 'Procrastination', color: 'text-[#22c55e]', bgColor: 'bg-[#22c55e]/10' },
  { value: 'other', label: 'Other', color: 'text-[#8a8a8a]', bgColor: 'bg-[#8a8a8a]/10' }
];

const KillList = () => {
  const [targets, setTargets] = useState([]);
  const [newTarget, setNewTarget] = useState('');
  const [newTargetCategory, setNewTargetCategory] = useState('bad-habit');
  const [newTargetDifficulty, setNewTargetDifficulty] = useState('deep');
  const [autopsyTarget, setAutopsyTarget] = useState(null);
  const [autopsyData, setAutopsyData] = useState({ context: '', rationalization: '', prevention: '' });
  const [editingTarget, setEditingTarget] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [showSkeleton, setShowSkeleton] = useState(false);
  const [oracleModal, setOracleModal] = useState({ isOpen: false, content: '', isLoading: false });
  const [filterStatus, setFilterStatus] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const targetsRef = useRef([]);
  const pendingTargetDeletes = useRef(new Map());
  const newTargetInputRef = useRef(null);
  
  // Celebration state
  const [celebration, setCelebration] = useState({ show: false, targetName: '' });
  
  // Reflection notes state
  const [reflectionNotes, setReflectionNotes] = useState({});
  const [showReflection, setShowReflection] = useState({});
  const [updatingReflection, setUpdatingReflection] = useState({});
  const [user, setUser] = useState(null);

  const categories = useMemo(() => CATEGORIES, []);
  const categoryIcons = useMemo(() => CATEGORY_ICONS, []);

  // Delay showing skeleton to prevent flicker
  useEffect(() => {
    const skeletonTimer = setTimeout(() => {
      if (loading) {
        setShowSkeleton(true);
      }
    }, 250);

    return () => clearTimeout(skeletonTimer);
  }, [loading]);

  // Keep skeleton visible briefly once shown to avoid blink on completion
  useEffect(() => {
    let dwellTimer;
    if (!loading && showSkeleton) {
      dwellTimer = setTimeout(() => setShowSkeleton(false), 300);
    }
    return () => clearTimeout(dwellTimer);
  }, [loading, showSkeleton]);

  // Keep an up-to-date reference for functions that should stay memoized
  useEffect(() => {
    targetsRef.current = targets;
  }, [targets]);

  // Subscribe to auth state so we don't miss a late Firebase Auth resolution
  useEffect(() => {
    const unsubscribe = authService.onAuthStateChanged((currentUser) => {
      setUser(currentUser);
      logger.log("👤 KillList: Current user:", currentUser?.uid);
    });
    return unsubscribe;
  }, []);

  // Get today's date in YYYY-MM-DD format
  const getTodaysDate = () => {
    return new Date().toISOString().split('T')[0];
  };

  // Set up real-time Firestore listener when user changes
  useEffect(() => {
    if (!user) return;

    let unsubscribe = null;
    let mounted = true;

    setLoading(true);
    setLoadError(false);
    logger.log("📡 KillList: Subscribing to kill targets for user:", user.uid);

    subscribeToUserData('killTargets', (data) => {
      if (!mounted) return;
      logger.log(`📋 KillList: Received ${data.length} kill targets from snapshot`);
      setTargets(data);
      setLoading(false);
    }).then((unsub) => {
      if (mounted) {
        unsubscribe = unsub;
      } else {
        unsub();
      }
    }).catch((error) => {
      if (!mounted) return;
      logger.error('❌ KillList: Subscription error:', error);
      setLoadError(true);
      setLoading(false);
    });

    return () => {
      mounted = false;
      if (unsubscribe) unsubscribe();
    };
  }, [user]);

  const addTarget = async () => {
    if (!newTarget.trim() || loading) return;

    setLoading(true);
    logger.log("🎯 Adding new kill target:", newTarget.trim());
    
    try {
      const tier = DIFFICULTY_TIERS.find(t => t.value === newTargetDifficulty) || DIFFICULTY_TIERS[1];
      const targetData = {
        title: newTarget.trim(),
        description: `Eliminate this ${categories.find(c => c.value === newTargetCategory)?.label.split(' ').slice(1).join(' ') || 'target'}`,
        category: newTargetCategory,
        difficulty: newTargetDifficulty,
        status: 'active',
        streak: 0,
        longestStreak: 0,
        checkIns: [],
        lastCheckIn: null,
        milestonesReached: [],
        escapeData: [],
        targetDate: getTodaysDate(),
        createdAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        reflectionNotes: ''
      };

      logger.log("📝 Target data to save:", targetData);

      // Use writeData from firebaseUtils for consistent saving
      const savedTarget = await writeData('killTargets', targetData);
      logger.log('✅ Kill target saved successfully:', savedTarget.id);
      
      // Update local state immediately for better UX
      setTargets(prev => [savedTarget, ...prev]);
      
      ouraToast.success('Target added to Kill List');
      
      setNewTarget('');
      setNewTargetCategory('bad-habit');
      setNewTargetDifficulty('deep');

      // Generate Oracle feedback
      setOracleModal({ isOpen: true, content: '', isLoading: true });

      try {
        const categoryLabel = categories.find(c => c.value === targetData.category)?.label || targetData.category;
        const entryText = `I've just named a new target to eliminate: "${targetData.title}" — a ${categoryLabel}. I'm making a contract with myself to kill this pattern. I've been tolerating this long enough and I'm declaring it as something I will eliminate. This is kill contract number ${targetsRef.current.length + 1}.`;
        const feedback = await generateAIFeedback('killList', entryText, targetsRef.current.slice(-3).map(t => t.title));

        setOracleModal({ isOpen: true, content: feedback, isLoading: false });
      } catch (error) {
        logger.error('Oracle feedback error:', error);
        setOracleModal({ 
          isOpen: true, 
          content: "The Oracle's wisdom flows through ancient channels. Your contract has been sealed in the ethereal realm. Pursue your target with unwavering focus.", 
          isLoading: false 
        });
      }
    } catch (error) {
      logger.error('❌ Error adding target:', error);
      ouraToast.error('Failed to save kill target');
    } finally {
      setLoading(false);
    }
  };

  // Daily check-in: "Held the line" or "It got me"
  const dailyCheckIn = useCallback(async (targetId, held, note = '') => {
    try {
      const target = targetsRef.current.find(t => t.id === targetId);
      if (!target) return;
      const today = todayKey();
      if (target.lastCheckIn === today) {
        ouraToast.info('Already checked in on this target today');
        return;
      }

      const currentStreak = target.streak || 0;
      const newStreak = held ? currentStreak + 1 : 0;
      const longestStreak = Math.max(target.longestStreak || 0, newStreak);
      const newCheckIn = { date: today, held, ...(note ? { note } : {}) };
      const checkIns = [...(target.checkIns || []), newCheckIn];
      const tier = getTier(target);

      // Check for milestone
      const milestonesReached = [...(target.milestonesReached || [])];
      const hitMilestone = held && MILESTONES.includes(newStreak) && !milestonesReached.includes(newStreak);
      if (hitMilestone) milestonesReached.push(newStreak);

      // Check for kill (streak reached threshold)
      const isKill = held && newStreak >= tier.streakToKill;

      const targetUpdate = {
        streak: newStreak,
        longestStreak,
        checkIns,
        lastCheckIn: today,
        milestonesReached,
        lastUpdated: new Date(),
      };

      if (isKill) {
        targetUpdate.status = 'killed';
        targetUpdate.completedAt = new Date();
      }

      await updateData('killTargets', targetId, targetUpdate);

      // Update local state
      setTargets(prev => prev.map(t =>
        t.id === targetId ? { ...t, ...targetUpdate } : t
      ));

      if (isKill) {
        // Kill celebration
        ouraToast.achievement(`Target eliminated: ${target.title} — ${newStreak} day streak`);
        setCelebration({ show: true, targetName: target.title });
        setTimeout(() => setCelebration({ show: false, targetName: '' }), 3000);

        setOracleModal({ isOpen: true, content: '', isLoading: true });
        try {
          const killedCount = targetsRef.current.filter(t => t.status === 'killed').length + 1;
          const categoryLabel = categories.find(c => c.value === target.category)?.label || target.category;
          const completionText = `I killed it. "${target.title}" — a ${categoryLabel} (${tier.label} difficulty). ${newStreak} consecutive days holding the line. That's ${killedCount} confirmed kills. This one took real consistency.`;
          const feedback = await generateAIFeedback('killList', completionText, []);
          setOracleModal({ isOpen: true, content: feedback, isLoading: false });
        } catch { setOracleModal({ isOpen: true, content: 'Target eliminated. The Oracle acknowledges your consistency.', isLoading: false }); }
      } else if (hitMilestone) {
        // Milestone Oracle feedback
        ouraToast.success(`${newStreak}-day milestone on "${target.title}"`);
        setOracleModal({ isOpen: true, content: '', isLoading: true });
        try {
          const milestoneText = `I've held the line against "${target.title}" for ${newStreak} consecutive days. This is a ${tier.label.toLowerCase()} pattern (${tier.streakToKill} days to kill). ${newStreak === 3 ? 'Just getting started.' : newStreak < 14 ? 'Building momentum.' : newStreak < 30 ? 'Deep into the fight now.' : 'This is becoming part of who I am.'} ${target.escapeData?.length ? `I've escaped ${target.escapeData.length} time${target.escapeData.length > 1 ? 's' : ''} before.` : ''}`;
          const feedback = await generateAIFeedback('killList', milestoneText, []);
          setOracleModal({ isOpen: true, content: feedback, isLoading: false });
        } catch { setOracleModal({ isOpen: true, content: 'Milestone reached. The Oracle marks your progress. Hold the line.', isLoading: false }); }
      } else if (held) {
        ouraToast.success(`Day ${newStreak} — streak continues`);
      } else {
        // Streak broken — open autopsy
        setAutopsyTarget(target);
        ouraToast.warning(`Streak reset on "${target.title}"`);
      }

    } catch (error) {
      logger.error('Error during check-in:', error);
    }
  }, [categories]);

  // Submit escape autopsy
  const submitAutopsy = useCallback(async () => {
    if (!autopsyTarget) return;
    const { context, rationalization, prevention } = autopsyData;
    if (!context.trim() || !rationalization.trim()) {
      ouraToast.warning('Fill in what happened and what you told yourself');
      return;
    }

    try {
      const newEscapeEntry = {
        date: todayKey(),
        context: context.trim(),
        rationalization: rationalization.trim(),
        prevention: prevention.trim() || null,
        streakAtEscape: autopsyTarget.streak || 0,
      };
      const escapeData = [...(autopsyTarget.escapeData || []), newEscapeEntry];

      await updateData('killTargets', autopsyTarget.id, {
        escapeData,
        status: 'escaped',
        escapedAt: new Date(),
        lastUpdated: new Date(),
      });

      setTargets(prev => prev.map(t =>
        t.id === autopsyTarget.id ? { ...t, escapeData, status: 'escaped', escapedAt: new Date() } : t
      ));

      // Oracle feedback on escape
      setOracleModal({ isOpen: true, content: '', isLoading: true });
      try {
        const escapeText = `"${autopsyTarget.title}" got me today. I was on a ${autopsyTarget.streak || 0}-day streak. What happened: ${context.trim()}. What I told myself: ${rationalization.trim()}.${prevention.trim() ? ` What would have stopped it: ${prevention.trim()}.` : ''} This is escape number ${escapeData.length}.`;
        const feedback = await generateAIFeedback('killList', escapeText, []);
        setOracleModal({ isOpen: true, content: feedback, isLoading: false });
      } catch { setOracleModal({ isOpen: true, content: 'The pattern survived this round. The autopsy is captured — use it next time.', isLoading: false }); }

      setAutopsyTarget(null);
      setAutopsyData({ context: '', rationalization: '', prevention: '' });
      ouraToast.success('Escape autopsy recorded');
    } catch (error) {
      logger.error('Error saving autopsy:', error);
      ouraToast.error('Failed to save autopsy');
    }
  }, [autopsyTarget, autopsyData]);

  const deleteTarget = useCallback(async (targetId) => {
    const targetToDelete = targetsRef.current.find(t => t.id === targetId);
    const targetIndex = targetsRef.current.findIndex(t => t.id === targetId);

    if (!targetToDelete) return;

    if (!window.confirm('Delete this target? You can undo within 5 seconds.')) {
      return;
    }

    logger.log("🗑️ KillList: Deleting target:", targetId);

    setTargets(prev => prev.filter(target => target.id !== targetId));

    const existingPending = pendingTargetDeletes.current.get(targetId);
    if (existingPending) {
      clearTimeout(existingPending.timeoutId);
      pendingTargetDeletes.current.delete(targetId);
    }

    const undoDelete = () => {
      const pending = pendingTargetDeletes.current.get(targetId);
      if (!pending) return;

      clearTimeout(pending.timeoutId);
      pendingTargetDeletes.current.delete(targetId);

      setTargets(prev => {
        if (prev.some(target => target.id === targetId)) return prev;
        const next = [...prev];
        const insertIndex = Math.min(pending.index, next.length);
        next.splice(insertIndex, 0, pending.target);
        return next;
      });

      ouraToast.dismiss(pending.toastId);
      ouraToast.success('Deletion undone');
    };

    const toastId = ouraToast.warning(
      <div className="flex items-center gap-3">
        <span>Target removed</span>
        <button
          onClick={undoDelete}
          className="px-2 py-1 text-xs rounded-md border border-white/20 text-white hover:bg-white/10 transition-colors"
        >
          Undo
        </button>
      </div>,
      { duration: 5000 }
    );

    const timeoutId = setTimeout(async () => {
      try {
        await deleteData('killTargets', targetId);
        logger.log('✅ KillList: Target deleted successfully');
      } catch (error) {
        logger.error('❌ KillList: Error deleting target:', error);
        setTargets(prev => {
          if (prev.some(target => target.id === targetId)) return prev;
          const next = [...prev];
          const insertIndex = Math.min(targetIndex, next.length);
          next.splice(insertIndex, 0, targetToDelete);
          return next;
        });
        ouraToast.error('Failed to delete target');
      } finally {
        pendingTargetDeletes.current.delete(targetId);
      }
    }, 5000);

    pendingTargetDeletes.current.set(targetId, { timeoutId, target: targetToDelete, index: targetIndex, toastId });
  }, []);

  const markAsEscaped = useCallback((targetId) => {
    // Always opens autopsy flow — status update happens in submitAutopsy()
    const target = targetsRef.current.find(t => t.id === targetId);
    if (target) {
      setAutopsyTarget(target);
    }
  }, []);

  const reactivateTarget = useCallback(async (targetId) => {
    try {
      logger.log("🎯 KillList: Reactivating escaped target:", targetId);
      
      const targetUpdate = {
        status: 'active',
        reactivatedAt: new Date(),
        lastUpdated: new Date()
      };

      await updateData('killTargets', targetId, targetUpdate);
      logger.log("✅ KillList: Target reactivated successfully");
      
      ouraToast.success('Target reactivated');

      // Update local state immediately
      setTargets(prev => prev.map(target => 
        target.id === targetId 
          ? { ...target, ...targetUpdate }
          : target
      ));
    } catch (error) {
      logger.error('❌ KillList: Error reactivating target:', error);
      ouraToast.error('Failed to reactivate target');
    }
  }, []);

  const startEditing = useCallback((target) => {
    setEditingTarget(target.id);
    setEditValue(target.title);
  }, []);

  const saveEdit = useCallback(async () => {
    if (!editValue.trim()) return;

    try {
      logger.log("✏️ KillList: Saving edit for target:", editingTarget);
      await updateData('killTargets', editingTarget, {
        title: editValue.trim(),
        lastUpdated: new Date()
      });

      // Update local state immediately
      setTargets(prev => prev.map(target => 
        target.id === editingTarget 
          ? { ...target, title: editValue.trim(), lastUpdated: new Date() }
          : target
      ));

      setEditingTarget(null);
      setEditValue('');
      ouraToast.success('Target updated');
      logger.log("✅ KillList: Target title updated successfully");
    } catch (error) {
      logger.error('❌ KillList: Error updating target:', error);
      ouraToast.error('Failed to update target');
    }
  }, [editValue, editingTarget]);

  const cancelEdit = useCallback(() => {
    setEditingTarget(null);
    setEditValue('');
  }, []);

  // Reflection notes functions
  const saveReflectionNote = useCallback(async (targetId) => {
    const notes = reflectionNotes[targetId];
    if (!notes || notes.trim() === '') return;

    setUpdatingReflection(prev => ({ ...prev, [targetId]: true }));

    try {
      await updateData('killTargets', targetId, {
        reflectionNotes: notes.trim(),
        lastUpdated: new Date()
      });

      ouraToast.success('Reflection notes saved');
      logger.log(`✅ Reflection notes saved for target: ${targetId}`);
    } catch (error) {
      logger.error("Error saving reflection notes:", error);
      ouraToast.error('Failed to save reflection notes');
    } finally {
      setUpdatingReflection(prev => ({ ...prev, [targetId]: false }));
    }
  }, [reflectionNotes]);

  const clearReflectionNote = useCallback(async (targetId) => {
    setUpdatingReflection(prev => ({ ...prev, [targetId]: true }));

    try {
      await updateData('killTargets', targetId, {
        reflectionNotes: '',
        lastUpdated: new Date()
      });

      setReflectionNotes(prev => ({ ...prev, [targetId]: '' }));
      ouraToast.success('Reflection notes cleared');
      logger.log(`✅ Reflection notes cleared for target: ${targetId}`);
    } catch (error) {
      logger.error("Error clearing reflection notes:", error);
      ouraToast.error('Failed to clear reflection notes');
    } finally {
      setUpdatingReflection(prev => ({ ...prev, [targetId]: false }));
    }
  }, []);

  // Initialize reflection notes when targets load
  useEffect(() => {
    const notes = {};
    targets.forEach(target => {
      if (target.reflectionNotes) {
        notes[target.id] = target.reflectionNotes;
      }
    });
    setReflectionNotes(notes);
  }, [targets]);

  const filteredTargets = useMemo(() => {
    const statusFiltered = (() => {
      switch (filterStatus) {
        case 'active':
          return targets.filter(target => target.status === 'active');
        case 'completed':
          return targets.filter(target => target.status === 'killed');
        case 'escaped':
          return targets.filter(target => target.status === 'escaped');
        default:
          return targets;
      }
    })();

    const normalizedQuery = searchQuery.trim().toLowerCase();
    if (!normalizedQuery) return statusFiltered;

    return statusFiltered.filter((target) => {
      const categoryLabel = categories.find(c => c.value === target.category)?.label || '';
      const haystack = [
        target.title,
        target.description,
        target.reflectionNotes,
        target.status,
        target.priority,
        categoryLabel
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes(normalizedQuery);
    });
  }, [targets, filterStatus, searchQuery, categories]);

  const stats = useMemo(() => {
    const total = targets.length;
    const completed = targets.filter(t => t.status === 'killed').length;
    const active = targets.filter(t => t.status === 'active').length;
    const escaped = targets.filter(t => t.status === 'escaped').length;
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

    // Average streak at kill
    const killedTargets = targets.filter(t => t.status === 'killed' && (t.streak || t.longestStreak));
    const avgStreakToKill = killedTargets.length > 0
      ? Math.round(killedTargets.reduce((sum, t) => sum + (t.streak || t.longestStreak || 0), 0) / killedTargets.length)
      : null;

    // Category distribution
    const catCounts = {};
    targets.forEach(t => {
      if (t.category) catCounts[t.category] = (catCounts[t.category] || 0) + 1;
    });
    const categoryDist = Object.entries(catCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([cat, count]) => ({ cat, count }));

    // Difficulty distribution
    const diffCounts = { surface: 0, deep: 0, core: 0 };
    targets.forEach(t => {
      const d = getDifficulty(t);
      diffCounts[d] = (diffCounts[d] || 0) + 1;
    });

    return { total, completed, active, escaped, completionRate, avgStreakToKill, categoryDist, diffCounts };
  }, [targets]);

  const getStreakColor = (streak, target) => {
    const threshold = getStreakToKill(target);
    const pct = streak / threshold;
    if (pct >= 1) return '#22c55e';
    if (pct >= 0.5) return '#f59e0b';
    if (pct >= 0.2) return '#4da6ff';
    return '#ef4444';
  };

  const renderTargetItem = useCallback(({ item: target, index }) => {
    const category = categories.find(c => c.value === target.category) || categories[0];
    const tier = getTier(target);
    const streak = target.streak || 0;
    const threshold = tier.streakToKill;
    const daysActive = Math.floor((Date.now() - new Date(target.createdAt).getTime()) / 86400000);
    const checkedInToday = target.lastCheckIn === todayKey();
    const latestEscape = target.escapeData?.length ? target.escapeData[target.escapeData.length - 1] : null;
    
    return (
      <div key={target.id} className="oura-card p-5 hover:border-[#2a2a2a] transition-all duration-300">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1 min-w-0">
            {editingTarget === target.id ? (
              <div className="flex gap-2 mb-2">
                <input type="text" value={editValue} onChange={(e) => setEditValue(e.target.value)} className="flex-1 bg-[#0a0a0a] text-white p-2 rounded-xl border border-[#1a1a1a] focus:border-[#ef4444] focus:outline-none text-sm" autoFocus />
                <button onClick={saveEdit} className="px-3 py-2 bg-[#22c55e]/10 text-[#22c55e] rounded-xl text-xs">Save</button>
                <button onClick={cancelEdit} className="px-3 py-2 bg-[#1a1a1a] text-[#5a5a5a] rounded-xl text-xs">Cancel</button>
              </div>
            ) : (
              <>
                <h3 className={`font-medium ${target.status === 'killed' ? 'line-through text-[#5a5a5a]' : 'text-white'}`}>
                  {target.title}
                </h3>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className={`text-xs px-2 py-0.5 rounded-lg ${tier.color} ${tier.bgColor}`}>
                    {tier.icon} {tier.label}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-lg ${category.color} ${category.bgColor}`}>
                    {category.label}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-lg uppercase font-medium ${
                    target.status === 'killed' ? 'bg-[#22c55e]/10 text-[#22c55e]' :
                    target.status === 'escaped' ? 'bg-[#ef4444]/10 text-[#ef4444]' :
                    'bg-[#f59e0b]/10 text-[#f59e0b]'
                  }`}>
                    {target.status}
                  </span>
                  <span className="text-[#3a3a3a] text-xs">Day {daysActive}</span>
                </div>
              </>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-1.5 shrink-0 ml-3">
            {editingTarget !== target.id && (
              <>
                <button onClick={() => startEditing(target)} className="w-7 h-7 flex items-center justify-center rounded-lg bg-[#1a1a1a] text-[#5a5a5a] hover:text-white text-xs transition-colors">
                  ✏️
                </button>
                {target.status === 'escaped' && (
                  <button onClick={() => reactivateTarget(target.id)} className="w-7 h-7 flex items-center justify-center rounded-lg bg-[#a855f7]/10 text-[#a855f7] hover:bg-[#a855f7]/20 text-xs transition-colors" title="Reactivate">
                    🎯
                  </button>
                )}
                <button onClick={() => deleteTarget(target.id)} className="w-7 h-7 flex items-center justify-center rounded-lg bg-[#ef4444]/10 text-[#ef4444] hover:bg-[#ef4444]/20 text-xs transition-colors">
                  🗑️
                </button>
              </>
            )}
          </div>
        </div>

        {editingTarget !== target.id && (
          <div className="space-y-3">
            {/* Streak progress bar */}
            <div className="flex items-center gap-3">
              <div className="flex-1 bg-[#1a1a1a] rounded-full h-2 overflow-hidden">
                <div
                  className="h-2 rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.min(100, (streak / threshold) * 100)}%`,
                    backgroundColor: getStreakColor(streak, target),
                  }}
                />
              </div>
              <span className="text-xs text-[#5a5a5a] shrink-0 tabular-nums">{streak} / {threshold}d</span>
            </div>

            {/* Streak hero + milestone badges */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-2xl font-light tabular-nums" style={{ color: getStreakColor(streak, target) }}>
                  {streak}
                </span>
                <span className="text-[#5a5a5a] text-xs">day streak</span>
                {target.longestStreak > 0 && target.longestStreak > streak && (
                  <span className="text-[#2a2a2a] text-xs">best: {target.longestStreak}</span>
                )}
              </div>
              {/* Milestone dots */}
              {(target.milestonesReached || []).length > 0 && (
                <div className="flex items-center gap-1">
                  {MILESTONES.filter(m => m <= threshold).map(m => (
                    <div
                      key={m}
                      className={`w-2 h-2 rounded-full ${(target.milestonesReached || []).includes(m) ? '' : 'bg-[#1a1a1a]'}`}
                      style={(target.milestonesReached || []).includes(m) ? { backgroundColor: getStreakColor(streak, target) } : undefined}
                      title={`${m}-day milestone`}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Daily check-in buttons (active targets only, once per day) */}
            {target.status === 'active' && !checkedInToday && (
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => dailyCheckIn(target.id, true)}
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-[#22c55e]/10 text-[#22c55e] border border-[#22c55e]/20 hover:bg-[#22c55e]/20 transition-all"
                >
                  Held the line
                </button>
                <button
                  onClick={() => dailyCheckIn(target.id, false)}
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-[#ef4444]/10 text-[#ef4444] border border-[#ef4444]/20 hover:bg-[#ef4444]/20 transition-all"
                >
                  It got me
                </button>
              </div>
            )}

            {/* Already checked in today */}
            {target.status === 'active' && checkedInToday && (
              <div className="text-center py-2 text-[#3a3a3a] text-xs">
                Checked in today
              </div>
            )}

            {/* Killed status */}
            {target.status === 'killed' && (
              <div className="text-center p-3 bg-[#22c55e]/5 border border-[#22c55e]/20 rounded-xl">
                <span className="text-[#22c55e] text-sm font-medium">TARGET ELIMINATED</span>
                <span className="text-[#5a5a5a] text-xs ml-2">{streak}-day streak</span>
              </div>
            )}

            {/* Escaped — show latest autopsy if exists */}
            {target.status === 'escaped' && (
              <div className="p-3 bg-[#ef4444]/5 border border-[#ef4444]/20 rounded-xl space-y-2">
                <span className="text-[#ef4444] text-xs font-medium uppercase tracking-widest">Escaped</span>
                {latestEscape && (
                  <div className="text-[#5a5a5a] text-xs space-y-1">
                    <p><span className="text-[#8a8a8a]">What happened:</span> {latestEscape.context}</p>
                    <p><span className="text-[#8a8a8a]">Told myself:</span> {latestEscape.rationalization}</p>
                    {latestEscape.prevention && <p><span className="text-[#8a8a8a]">Would have stopped it:</span> {latestEscape.prevention}</p>}
                  </div>
                )}
              </div>
            )}

            {/* Escape count */}
            {(target.escapeData || []).length > 0 && target.status !== 'escaped' && (
              <div className="text-[#3a3a3a] text-xs">
                {target.escapeData.length} escape{target.escapeData.length > 1 ? 's' : ''} recorded
              </div>
            )}
          </div>
        )}
      </div>
    );
    }, [editingTarget, editValue, startEditing, saveEdit, cancelEdit, deleteTarget, markAsEscaped, reactivateTarget, dailyCheckIn, categories, categoryIcons,
      reflectionNotes, showReflection, updatingReflection, saveReflectionNote, clearReflectionNote]);

  return (
    <div className="min-h-screen bg-black">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Oura-style Header */}
        <header className="mb-10 animate-fade-in-up">
          <p className="text-[#5a5a5a] text-sm uppercase tracking-widest mb-2">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
          <h1 className="text-3xl font-bold text-white mb-2">Kill List</h1>
          <p className="text-[#8a8a8a]">Eliminate negative patterns and destructive habits</p>
        </header>

        {/* Stats */}
        <section className="mb-10 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
          <h3 className="text-[#5a5a5a] text-xs uppercase tracking-widest mb-4">Your Progress</h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="oura-card p-5 text-center">
              <div className="text-3xl font-bold text-white oura-score">{stats.total}</div>
              <div className="text-xs text-[#8a8a8a] mt-2 uppercase tracking-wider">Total Contracts</div>
            </div>
            <div className="oura-card p-5 text-center">
              <div className="text-3xl font-bold text-[#4da6ff] oura-score">{stats.active}</div>
              <div className="text-xs text-[#8a8a8a] mt-2 uppercase tracking-wider">Active</div>
            </div>
            <div className="oura-card p-5 text-center">
              <div className="text-3xl font-bold text-[#22c55e] oura-score">{stats.completed}</div>
              <div className="text-xs text-[#8a8a8a] mt-2 uppercase tracking-wider">Killed</div>
            </div>
            <div className="oura-card p-5 text-center">
              <div className="text-3xl font-bold text-[#f59e0b] oura-score">{stats.escaped}</div>
              <div className="text-xs text-[#8a8a8a] mt-2 uppercase tracking-wider">Escaped</div>
            </div>
            <div className="oura-card p-5 text-center">
              <div className="text-3xl font-bold text-[#00d4aa] oura-score">{stats.completionRate}%</div>
              <div className="text-xs text-[#8a8a8a] mt-2 uppercase tracking-wider">Success Rate</div>
            </div>
          </div>

          {/* Completion metrics row */}
          {targets.length >= 3 && (
            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Category distribution */}
              <div>
                <div className="text-[#5a5a5a] text-xs uppercase tracking-widest mb-3">By Category</div>
                <div className="space-y-2">
                  {stats.categoryDist.map(({ cat, count }) => {
                    const catDef = CATEGORIES.find(c => c.value === cat);
                    const pct = Math.round((count / stats.total) * 100);
                    return (
                      <div key={cat} className="flex items-center gap-3">
                        <div className={`text-xs w-28 shrink-0 truncate ${catDef?.color ?? 'text-[#8a8a8a]'}`}>{catDef?.label ?? cat}</div>
                        <div className="flex-1 bg-[#1a1a1a] rounded-full h-1.5 overflow-hidden">
                          <div
                            className="h-1.5 rounded-full transition-all duration-500"
                            style={{ width: `${pct}%`, backgroundColor: catDef?.color?.match(/#[0-9a-fA-F]{6}/)?.[0] ?? '#8a8a8a' }}
                          />
                        </div>
                        <div className="text-[#5a5a5a] text-xs w-4 text-right shrink-0">{count}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Avg streak to kill */}
              <div className="flex flex-col justify-center">
                <div className="text-[#5a5a5a] text-xs uppercase tracking-widest mb-2">Avg Streak to Kill</div>
                {stats.avgStreakToKill !== null ? (
                  <div>
                    <span className={`text-4xl font-light tabular-nums ${stats.avgStreakToKill <= 7 ? 'text-[#22c55e]' : stats.avgStreakToKill <= 21 ? 'text-[#f59e0b]' : 'text-[#ef4444]'}`}>
                      {stats.avgStreakToKill}
                    </span>
                    <span className="text-[#5a5a5a] text-sm ml-2">days</span>
                    <div className="text-[#5a5a5a] text-xs mt-1">across {targets.filter(t => t.status === 'killed').length} confirmed kills</div>
                  </div>
                ) : (
                  <div className="text-[#3a3a3a] text-sm">No kills recorded yet</div>
                )}
              </div>
            </div>
          )}

          {/* Kill Patterns — strategic intelligence (3+ killed targets required) */}
          {targets.filter(t => t.status === 'killed').length >= 3 && (() => {
            const killed = targets.filter(t => t.status === 'killed');
            const allEscapes = targets.flatMap(t => (t.escapeData || []));

            // Category win rate
            const catStats = {};
            targets.forEach(t => {
              if (!t.category) return;
              if (!catStats[t.category]) catStats[t.category] = { kills: 0, escapes: 0 };
              if (t.status === 'killed') catStats[t.category].kills++;
              const escCount = (t.escapeData || []).length;
              catStats[t.category].escapes += escCount;
            });

            // Most common escape day
            const escapeDays = [0,0,0,0,0,0,0]; // Sun-Sat
            allEscapes.forEach(e => {
              if (e.date) escapeDays[new Date(e.date).getDay()]++;
            });
            const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
            const peakEscapeDay = escapeDays.some(d => d > 0)
              ? dayNames[escapeDays.indexOf(Math.max(...escapeDays))]
              : null;

            // Avg streak by difficulty
            const diffStreaks = { surface: [], deep: [], core: [] };
            killed.forEach(t => {
              const d = getDifficulty(t);
              diffStreaks[d]?.push(t.streak || t.longestStreak || 0);
            });
            const avgStreak = (arr) => arr.length ? Math.round(arr.reduce((a,b) => a+b, 0) / arr.length) : null;

            return (
              <div className="mt-6 oura-card p-5 animate-fade-in-up">
                <h3 className="text-xs text-[#5a5a5a] uppercase tracking-widest mb-4">Kill Patterns</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  {/* Category win rates */}
                  <div>
                    <div className="text-[#3a3a3a] text-xs uppercase tracking-widest mb-2">By Category</div>
                    {Object.entries(catStats).sort((a,b) => b[1].kills - a[1].kills).slice(0, 4).map(([cat, s]) => {
                      const catDef = CATEGORIES.find(c => c.value === cat);
                      return (
                        <div key={cat} className="flex items-center justify-between py-1">
                          <span className={`text-xs ${catDef?.color || 'text-[#5a5a5a]'}`}>{catDef?.label || cat}</span>
                          <span className="text-[#5a5a5a] text-xs tabular-nums">{s.kills}K / {s.escapes}E</span>
                        </div>
                      );
                    })}
                  </div>
                  {/* Streaks by difficulty + escape day */}
                  <div>
                    <div className="text-[#3a3a3a] text-xs uppercase tracking-widest mb-2">Avg Streak to Kill</div>
                    {['surface', 'deep', 'core'].map(d => {
                      const avg = avgStreak(diffStreaks[d]);
                      const tier = DIFFICULTY_TIERS.find(t => t.value === d);
                      return avg !== null ? (
                        <div key={d} className="flex items-center justify-between py-1">
                          <span className={`text-xs ${tier?.color || 'text-[#5a5a5a]'}`}>{tier?.label || d}</span>
                          <span className="text-[#5a5a5a] text-xs tabular-nums">{avg} days</span>
                        </div>
                      ) : null;
                    })}
                    {peakEscapeDay && (
                      <div className="mt-3 pt-3 border-t border-[#1a1a1a]">
                        <span className="text-[#3a3a3a] text-xs">Peak escape day: </span>
                        <span className="text-[#ef4444] text-xs font-medium">{peakEscapeDay}</span>
                      </div>
                    )}
                    {allEscapes.length > 0 && (
                      <div className="mt-1">
                        <span className="text-[#3a3a3a] text-xs">Total escapes: </span>
                        <span className="text-[#5a5a5a] text-xs tabular-nums">{allEscapes.length}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}
        </section>

        {/* Add New Target */}
        <section className="mb-10 animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
          <div className="oura-card p-6">
            <h2 className="text-white font-semibold mb-6 text-lg">Add New Kill Contract</h2>
            <div className="space-y-6">
              {/* Target Name Input */}
              <div>
                <label className="block text-[#8a8a8a] text-sm uppercase tracking-wider mb-3">
                  Target Name
                </label>
                <input
                  ref={newTargetInputRef}
                  type="text"
                  value={newTarget}
                  onChange={(e) => setNewTarget(e.target.value)}
                  placeholder="What negative pattern will you eliminate?"
                  className="w-full bg-[#0a0a0a] text-white p-4 rounded-2xl border border-[#1a1a1a] focus:border-[#ef4444] focus:outline-none transition-colors"
                  onKeyPress={(e) => e.key === 'Enter' && addTarget()}
                />
              </div>

              {/* Category Dropdown */}
              <div>
                <label className="block text-[#8a8a8a] text-sm uppercase tracking-wider mb-3">
                  Category
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {categories.map((category) => (
                    <button
                      key={category.value}
                      type="button"
                      onClick={() => setNewTargetCategory(category.value)}
                      className={`p-3 rounded-xl border transition-all duration-200 flex items-center gap-2 text-sm ${
                        newTargetCategory === category.value
                          ? `${category.bgColor} ${category.color} border-current`
                          : 'bg-[#0a0a0a] text-[#5a5a5a] border-[#1a1a1a] hover:border-[#2a2a2a] hover:text-[#8a8a8a]'
                      }`}
                    >
                      <span className={newTargetCategory === category.value ? category.color : 'text-[#5a5a5a]'}>
                        {categoryIcons[category.value]}
                      </span>
                      <span className="truncate">{category.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Difficulty Tier */}
              <div>
                <label className="block text-[#8a8a8a] text-sm uppercase tracking-wider mb-3">
                  Difficulty
                </label>
                <div className="grid grid-cols-3 gap-3">
                  {DIFFICULTY_TIERS.map((d) => (
                    <button
                      key={d.value}
                      type="button"
                      onClick={() => setNewTargetDifficulty(d.value)}
                      className={`p-4 rounded-xl border transition-all duration-200 flex flex-col items-center gap-2 ${
                        newTargetDifficulty === d.value
                          ? `${d.bgColor} ${d.color} ${d.borderColor} border-2 scale-105`
                          : 'bg-[#0a0a0a] text-[#5a5a5a] border-[#1a1a1a] hover:border-[#2a2a2a] hover:text-[#8a8a8a]'
                      }`}
                    >
                      <span className="text-2xl">{d.icon}</span>
                      <span className="text-sm font-medium">{d.label}</span>
                      <span className="text-xs opacity-70">{d.description}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Submit Button */}
              <div className="flex justify-end">
                <button
                  onClick={addTarget}
                  disabled={loading || !newTarget.trim()}
                  className="px-8 py-3 bg-[#ef4444] text-white rounded-2xl hover:bg-[#dc2626] disabled:bg-[#1a1a1a] disabled:text-[#5a5a5a] transition-all duration-300 font-medium"
                >
                  {loading ? 'Adding Contract...' : 'Add Kill Contract'}
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Filter Tabs */}
        <section className="mb-6 animate-fade-in-up" style={{ animationDelay: '0.3s' }}>
          <div className="flex flex-col gap-4">
            <div className="relative">
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search contracts, notes, or categories..."
                className="w-full px-4 py-3 bg-[#0a0a0a] text-white rounded-2xl border border-[#1a1a1a] focus:border-[#ef4444] focus:outline-none transition-colors"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#5a5a5a] hover:text-white text-sm"
                >
                  Clear
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
            {[
              { key: 'all', label: 'All Contracts', count: stats.total },
              { key: 'active', label: 'Active', count: stats.active },
              { key: 'completed', label: 'Killed', count: stats.completed },
              { key: 'escaped', label: 'Escaped', count: stats.escaped }
            ].map(({ key, label, count }) => (
              <button
                key={key}
                onClick={() => setFilterStatus(key)}
                className={`px-5 py-2.5 rounded-2xl font-medium transition-all duration-300 text-sm ${
                  filterStatus === key
                    ? 'bg-[#ef4444] text-white scale-105'
                    : 'bg-[#0a0a0a] text-[#8a8a8a] hover:bg-[#1a1a1a] border border-[#1a1a1a]'
                }`}
              >
                {label} ({count})
              </button>
            ))}
            </div>
          </div>
        </section>

        {/* Targets List */}
        <div className="relative">
          <div className={`fade-pane ${showSkeleton ? 'visible' : 'hidden'}`}>
            <SkeletonList count={4} ItemComponent={SkeletonKillTarget} />
          </div>

          <div className={`fade-pane ${showSkeleton ? 'hidden' : 'visible'}`}>
            {loadError ? (
              <div className="oura-card p-12 text-center animate-fade-in-up">
                <p className="text-[#ef4444] mb-4 text-sm">Failed to load kill targets. Please check your connection.</p>
                <button
                  onClick={loadTargets}
                  className="px-5 py-2.5 bg-[#ef4444]/10 text-[#ef4444] border border-[#ef4444]/30 rounded-xl hover:bg-[#ef4444]/20 transition-colors text-sm font-medium"
                >
                  Retry
                </button>
              </div>
            ) : filteredTargets.length > 0 ? (
              <VirtualizedList
                items={filteredTargets}
                renderItem={renderTargetItem}
                itemHeight={220}
                maxHeight={600}
              />
            ) : (
              <div className="oura-card p-12 text-center animate-fade-in-up" style={{ animationDelay: '0.4s' }}>
                <div className="text-6xl mb-4 opacity-30">🎯</div>
                <h3 className="text-xl font-semibold text-[#8a8a8a] mb-2">
                  {searchQuery.trim()
                    ? `No matches for “${searchQuery.trim()}”`
                    : (filterStatus === 'completed' ? 'No completed contracts yet' :
                      filterStatus === 'active' ? 'No active contracts' :
                      'No kill contracts yet')}
                </h3>
                <p className="text-[#5a5a5a] text-sm mb-6">
                  {searchQuery.trim()
                    ? 'Try a different keyword or clear the search.'
                    : (filterStatus === 'all' ? 'Add your first contract to begin eliminating negative patterns' :
                      filterStatus === 'active' ? 'All your contracts have been completed!' :
                      'Complete some contracts to see them here')}
                </p>
                {searchQuery.trim() ? (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="px-6 py-2 bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white border border-[#1a1a1a] rounded-lg transition-all duration-300 font-medium text-sm"
                  >
                    Clear Search
                  </button>
                ) : filterStatus === 'completed' ? (
                  <button
                    onClick={() => setFilterStatus('active')}
                    className="px-6 py-2 bg-[#0a0a0a] hover:bg-[#1a1a1a] text-white border border-[#1a1a1a] rounded-lg transition-all duration-300 font-medium text-sm"
                  >
                    View Active Contracts
                  </button>
                ) : (
                  <button
                    onClick={() => newTargetInputRef.current?.focus()}
                    className="px-6 py-2 bg-[#ef4444] hover:bg-[#dc2626] text-white rounded-lg transition-all duration-300 font-medium text-sm"
                  >
                    {filterStatus === 'active' ? 'Create New Target' : 'Add Your First Target'}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Escape Autopsy Modal */}
        {autopsyTarget && (
          <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center z-50 p-4">
            <div className="bg-black border border-[#1a1a1a] rounded-2xl max-w-lg w-full p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-white font-medium">Escape Autopsy: {autopsyTarget.title}</h3>
                <button onClick={() => { setAutopsyTarget(null); setAutopsyData({ context: '', rationalization: '', prevention: '' }); }} className="text-[#3a3a3a] hover:text-white transition-colors">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M18 6L6 18M6 6l12 12" /></svg>
                </button>
              </div>
              <p className="text-[#5a5a5a] text-sm mb-5">Streak was {autopsyTarget.streak || 0} days. Capture what happened so the pattern becomes visible.</p>
              <div className="space-y-4">
                <div>
                  <label className="text-[#8a8a8a] text-xs uppercase tracking-widest mb-2 block">What was happening right before?</label>
                  <textarea value={autopsyData.context} onChange={(e) => setAutopsyData(prev => ({ ...prev, context: e.target.value }))} rows={2} className="w-full p-3 bg-[#0a0a0a] text-white rounded-xl border border-[#1a1a1a] focus:border-[#ef4444] focus:outline-none resize-none text-sm placeholder-[#2a2a2a]" placeholder="The environment, state of mind, time of day..." />
                </div>
                <div>
                  <label className="text-[#8a8a8a] text-xs uppercase tracking-widest mb-2 block">What did you tell yourself?</label>
                  <textarea value={autopsyData.rationalization} onChange={(e) => setAutopsyData(prev => ({ ...prev, rationalization: e.target.value }))} rows={2} className="w-full p-3 bg-[#0a0a0a] text-white rounded-xl border border-[#1a1a1a] focus:border-[#ef4444] focus:outline-none resize-none text-sm placeholder-[#2a2a2a]" placeholder="The rationalization that made it feel okay..." />
                </div>
                <div>
                  <label className="text-[#8a8a8a] text-xs uppercase tracking-widest mb-2 block">What would have stopped it? <span className="text-[#3a3a3a]">(optional)</span></label>
                  <input type="text" value={autopsyData.prevention} onChange={(e) => setAutopsyData(prev => ({ ...prev, prevention: e.target.value }))} className="w-full p-3 bg-[#0a0a0a] text-white rounded-xl border border-[#1a1a1a] focus:border-[#ef4444] focus:outline-none text-sm placeholder-[#2a2a2a]" placeholder="One thing that would have changed the outcome..." />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={submitAutopsy} disabled={!autopsyData.context.trim() || !autopsyData.rationalization.trim()} className="flex-1 py-3 bg-[#ef4444] hover:bg-[#dc2626] disabled:bg-[#1a1a1a] disabled:text-[#5a5a5a] text-white rounded-xl font-medium text-sm transition-all">
                  Record Autopsy
                </button>
                <button onClick={() => { setAutopsyTarget(null); setAutopsyData({ context: '', rationalization: '', prevention: '' }); }} className="px-6 py-3 bg-[#1a1a1a] text-[#5a5a5a] hover:text-white rounded-xl text-sm transition-colors">
                  Skip
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Oracle Modal */}
        <OracleModal
          isOpen={oracleModal.isOpen}
          onClose={() => setOracleModal({ isOpen: false, content: '', isLoading: false })}
          content={oracleModal.content}
          isLoading={oracleModal.isLoading}
        />
        
        {/* Kill Celebration Animation */}
        <KillCelebration 
          show={celebration.show} 
          targetName={celebration.targetName}
          onComplete={() => setCelebration({ show: false, targetName: '' })}
        />
      </div>
    </div>
  );
};

export default KillList;