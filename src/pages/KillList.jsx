import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { authService } from '../utils/authService';
import { writeData, updateData, deleteData, subscribeToUserData } from '../utils/firebaseUtils';
import { archiveEntry, restoreEntry, deleteArchivedEntry, subscribeToArchive } from '../utils/archiveUtils';
import { redirectIfAuthLost } from '../utils/authErrorHandler';
import { generateAIFeedback } from '../utils/aiFeedback';
import { getCachedTotalEntryCount } from '../utils/getBehavioralContext';
import OracleModal from '../components/OracleModal';
import ArchiveToggle from '../components/ArchiveToggle';
import { AppIcon } from '../components/AppIcons';
import { debounce } from '../utils/debounce';
import VirtualizedList from '../components/VirtualizedList';
import ouraToast from '../utils/toast';
import { SkeletonList, SkeletonKillTarget } from '../components/SkeletonLoader';
import logger from '../utils/logger';
import KillListBackfillCard from '../components/KillListBackfillCard';

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

// BER-134: Autopsy pattern aggregation for targets with 3+ escapes
const STOP_WORDS = new Set(['i','the','a','an','was','it','in','to','of','and','my','me','at','just','this','that','when','if','is','not','but','had','did','would','could','were','felt','feel','so','do','be','have','by','from','what','they','we','he','she','then','about','on','with','very','really']);

function aggregateAutopsyPatterns(escapeData) {
  if (!escapeData || escapeData.length < 3) return null;

  function topToken(strings) {
    const counts = {};
    strings.forEach(s => {
      if (!s) return;
      s.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).forEach(w => {
        if (w.length > 3 && !STOP_WORDS.has(w)) counts[w] = (counts[w] || 0) + 1;
      });
    });
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    return top ? top[0] : null;
  }

  const contexts = escapeData.map(e => e.context).filter(Boolean);
  const rationalizations = escapeData.map(e => e.rationalization).filter(Boolean);
  const preventionCount = escapeData.filter(e => e.prevention).length;
  // If any prior escape had a prevention plan and there was a subsequent escape, it wasn't executed
  const prevPlanNotExecuted = escapeData.slice(0, -1).some(e => e.prevention) && escapeData.length > 1;

  return {
    dominantContextTheme: topToken(contexts),
    dominantRationalizationTheme: topToken(rationalizations),
    preventionPlanCount: preventionCount,
    prevPlanNotExecuted,
    escapeCount: escapeData.length,
  };
}

// Read-time shim for consecutiveDaysRequired — historic docs used a three-tier
// difficulty field (surface/deep/core) and an older priority field. Map both to
// the numeric field so nothing needs a Firestore migration.
const LEGACY_DIFFICULTY_TO_DAYS = { surface: 21, deep: 30, core: 60 };
const LEGACY_PRIORITY_TO_DAYS = { high: 60, medium: 30, low: 21 };
const MIN_DAYS_REQUIRED = 21;
const getConsecutiveDaysRequired = (target) => {
  const raw = Number(target?.consecutiveDaysRequired);
  if (Number.isFinite(raw) && raw >= MIN_DAYS_REQUIRED) return Math.floor(raw);
  if (target?.difficulty && LEGACY_DIFFICULTY_TO_DAYS[target.difficulty]) {
    return LEGACY_DIFFICULTY_TO_DAYS[target.difficulty];
  }
  if (target?.priority && LEGACY_PRIORITY_TO_DAYS[target.priority]) {
    return LEGACY_PRIORITY_TO_DAYS[target.priority];
  }
  return 30;
};

const todayKey = () => new Date().toISOString().split('T')[0];

// Parse a YYYY-MM-DD string or ISO-like createdAt value into a YYYY-MM-DD string.
// Returns null for unparseable inputs.
const toDateKey = (value) => {
  if (!value) return null;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  try {
    const d = value?.toDate ? value.toDate() : new Date(value);
    if (isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  } catch {
    return null;
  }
};

// Calendar days between two YYYY-MM-DD strings. Positive when `to` is after `from`.
const daysBetweenKeys = (fromKey, toKey) => {
  if (!fromKey || !toKey) return 0;
  const from = new Date(`${fromKey}T12:00:00Z`).getTime();
  const to = new Date(`${toKey}T12:00:00Z`).getTime();
  return Math.round((to - from) / 86400000);
};

// Compute the list of YYYY-MM-DD strings that were "missed" since the last
// meaningful date, up to and including today. Returns [] if no gap ≥ 2.
const computeMissedDates = (target) => {
  const today = todayKey();
  const lastCheckInKey = toDateKey(target?.lastCheckIn);
  const createdKey = toDateKey(target?.createdAt);
  const anchor = lastCheckInKey || createdKey;
  if (!anchor) return [];
  const gap = daysBetweenKeys(anchor, today);
  if (gap < 2) return [];
  const dates = [];
  for (let i = 1; i <= gap; i++) {
    const d = new Date(`${anchor}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
};

const CATEGORIES = [
  { value: 'bad-habit', label: 'Bad Habit', color: 'text-[#ababab]', bgColor: 'bg-[#1a1a1a]' },
  { value: 'negative-thought', label: 'Negative Thought', color: 'text-[#ababab]', bgColor: 'bg-[#1a1a1a]' },
  { value: 'addiction', label: 'Addiction', color: 'text-[#ababab]', bgColor: 'bg-[#1a1a1a]' },
  { value: 'toxic-behavior', label: 'Toxic Behavior', color: 'text-[#ababab]', bgColor: 'bg-[#1a1a1a]' },
  { value: 'fear', label: 'Fear/Anxiety', color: 'text-[#ababab]', bgColor: 'bg-[#1a1a1a]' },
  { value: 'procrastination', label: 'Procrastination', color: 'text-[#ababab]', bgColor: 'bg-[#1a1a1a]' },
  { value: 'other', label: 'Other', color: 'text-[#ababab]', bgColor: 'bg-[#1a1a1a]' }
];

const KillList = () => {
  const [targets, setTargets] = useState([]);
  const [newTarget, setNewTarget] = useState('');
  const [newTargetCategory, setNewTargetCategory] = useState('bad-habit');
  const [newTargetDays, setNewTargetDays] = useState(30);
  const [autopsyTarget, setAutopsyTarget] = useState(null);
  const [autopsyData, setAutopsyData] = useState({ context: '', rationalization: '', prevention: '', intentionActivated: '', intentionFailReason: '', eventDate: '' });
  const [backfillBusy, setBackfillBusy] = useState({});
  const [backfillDismissed, setBackfillDismissed] = useState(() => {
    // rehydrate same-day dismissals from sessionStorage
    const all = {};
    try {
      const todayK = new Date().toISOString().split('T')[0];
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key && key.startsWith(`kl_backfill_dismissed_`) && key.endsWith(`_${todayK}`)) {
          const targetId = key.slice('kl_backfill_dismissed_'.length, -1 - todayK.length);
          all[targetId] = true;
        }
      }
    } catch { /* sessionStorage unavailable — fine */ }
    return all;
  });
  const [editingTarget, setEditingTarget] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [confirmedKills, setConfirmedKills] = useState([]);
  const [view, setView] = useState('active');
  const [archivedTargets, setArchivedTargets] = useState([]);
  const [requestingOracleForKillId, setRequestingOracleForKillId] = useState(null);
  const [showSkeleton, setShowSkeleton] = useState(false);
  const [oracleModal, setOracleModal] = useState({ isOpen: false, content: '', isLoading: false, entryCount: null });
  const [filterStatus, setFilterStatus] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const targetsRef = useRef([]);
  const skipNextSnapshot = useRef(false);
  const addingTargetRef = useRef(false);
  const newTargetInputRef = useRef(null);
  

  // AVE circuit breaker prompt — shown after autopsy, before Oracle
  const [avePrompt, setAvePrompt] = useState(false);
  
  // Reflection notes state
  const [reflectionNotes, setReflectionNotes] = useState({});
  const [showReflection, setShowReflection] = useState({});
  const [updatingReflection, setUpdatingReflection] = useState({});
  const [user, setUser] = useState(null);

  // Implementation intentions (BER-126)
  const [newIntention, setNewIntention] = useState({ trigger: '', response: '' });

  // BER-134: track expanded autopsy pattern panels per target
  const [showAutopsyPattern, setShowAutopsyPattern] = useState({});

  // BER-136: capture Oracle entry text for regen
  const oracleEntryTextRef = useRef('');
  const [showIntention, setShowIntention] = useState({});
  const [reviseTarget, setReviseTarget] = useState(null);
  const [reviseIntention, setReviseIntention] = useState({ trigger: '', response: '' });

  const categories = CATEGORIES;
  const categoryIcons = CATEGORY_ICONS;

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

  // Read journal cross-module extraction pre-fill on mount (set by Journal.jsx on confirm)
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('kl_extraction_prefill');
      if (!raw) return;
      sessionStorage.removeItem('kl_extraction_prefill');
      const data = JSON.parse(raw);
      if (data.targetTitle) setNewTarget(data.targetTitle);
      if (data.suggestedCategory) {
        const EXTRACTION_CATEGORY_MAP = {
          addiction: 'addiction',
          compulsion: 'addiction',
          avoidance: 'fear',
          time_sink: 'procrastination',
          relationship_pattern: 'toxic-behavior',
          digital: 'bad-habit',
          emotional_pattern: 'negative-thought',
          other: 'other',
        };
        const mapped = EXTRACTION_CATEGORY_MAP[data.suggestedCategory];
        if (mapped) setNewTargetCategory(mapped);
      }
      setTimeout(() => newTargetInputRef.current?.focus(), 150);
    } catch (err) {
      logger.warn('KillList: failed to parse kl_extraction_prefill from sessionStorage', err?.message);
    }
  }, []);

  const loadTargets = () => setRetryKey(k => k + 1);

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
      if (skipNextSnapshot.current) {
        skipNextSnapshot.current = false;
        return;
      }
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
  }, [user, retryKey]);

  // Subscribe to confirmed kills archive
  useEffect(() => {
    if (!user) return;

    let unsubscribe = null;
    let mounted = true;

    subscribeToUserData('confirmedKills', (data) => {
      if (!mounted) return;
      const sorted = [...data].sort((a, b) => {
        const aTime = a.killedAt?.toDate ? a.killedAt.toDate().getTime() : new Date(a.killedAt || 0).getTime();
        const bTime = b.killedAt?.toDate ? b.killedAt.toDate().getTime() : new Date(b.killedAt || 0).getTime();
        return bTime - aTime;
      });
      setConfirmedKills(sorted);
    }).then((unsub) => {
      if (mounted) unsubscribe = unsub;
      else unsub();
    }).catch((error) => {
      logger.error('❌ KillList: Confirmed kills subscription error:', error);
    });

    return () => {
      mounted = false;
      if (unsubscribe) unsubscribe();
    };
  }, [user]);

  // Subscribe to archived kill targets
  useEffect(() => {
    if (!user) return;
    let unsubscribe = null;
    let mounted = true;
    subscribeToArchive('killTargets', (data) => {
      if (mounted) setArchivedTargets(data);
    }).then(u => {
      if (mounted) unsubscribe = u;
      else try { u(); } catch {}
    });
    return () => {
      mounted = false;
      if (unsubscribe) try { unsubscribe(); } catch {}
    };
  }, [user]);

  const addTarget = async () => {
    if (!newTarget.trim() || submitting) return;
    if (addingTargetRef.current) return;
    if (newIntention.trigger.trim().length < 20 || newIntention.response.trim().length < 20) {
      ouraToast.warning('Implementation intention required — both fields need at least 20 characters');
      return;
    }

    addingTargetRef.current = true;
    setSubmitting(true);
    logger.log("🎯 Adding new kill target:", newTarget.trim());

    let savedTarget = null;
    let targetData = null;

    try {
      const days = Math.max(MIN_DAYS_REQUIRED, Math.floor(Number(newTargetDays) || 30));
      targetData = {
        title: newTarget.trim(),
        description: `Eliminate this ${categories.find(c => c.value === newTargetCategory)?.label || 'target'}`,
        category: newTargetCategory,
        consecutiveDaysRequired: days,
        status: 'active',
        streak: 0,
        longestStreak: 0,
        totalTrackedDays: 0,
        implementationIntention: { trigger: newIntention.trigger.trim(), response: newIntention.response.trim() },
        checkIns: [],
        lastCheckIn: null,
        escapeData: [],
        targetDate: getTodaysDate(),
        createdAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        reflectionNotes: ''
      };

      logger.log("📝 Target data to save:", targetData);

      // Write to Firestore
      savedTarget = await writeData('killTargets', targetData);
      logger.log('✅ Kill target saved successfully:', savedTarget.id);

      // Update local state immediately for better UX; suppress the concurrent
      // real-time snapshot to prevent it from overwriting the optimistic state.
      skipNextSnapshot.current = true;
      setTargets(prev => [savedTarget, ...prev]);

      ouraToast.success('Target added to the Ledger');

      setNewTarget('');
      setNewTargetCategory('bad-habit');
      setNewTargetDays(30);
      setNewIntention({ trigger: '', response: '' });
    } catch (error) {
      logger.error('❌ Error adding target:', error);
      if (redirectIfAuthLost(error)) return;
      ouraToast.error('Failed to save kill target');
    } finally {
      // IMPORTANT: release the submit guard as soon as the write settles —
      // Oracle generation runs after this and must not gate the button.
      setSubmitting(false);
      addingTargetRef.current = false;
    }

    // Oracle feedback is post-write UX. Run it detached from the submit
    // guard so a hung Claude proxy can never freeze the Add Contract button.
    if (savedTarget && targetData) {
      setOracleModal({ isOpen: true, content: '', isLoading: true, entryCount: null });
      try {
        const categoryLabel = categories.find(c => c.value === targetData.category)?.label || targetData.category;
        const entryText = `I've just named a new target to eliminate: "${targetData.title}" — a ${categoryLabel}. I'm making a contract with myself to kill this pattern. I've been tolerating this long enough and I'm declaring it as something I will eliminate. This is kill contract number ${targetsRef.current.length + 1}.`;
        const { text: feedback } = await generateAIFeedback('killList', entryText, targetsRef.current.slice(-3).map(t => t.title));
        setOracleModal({ isOpen: true, content: feedback, isLoading: false, entryCount: getCachedTotalEntryCount() });
      } catch (error) {
        logger.error('Oracle feedback error:', error);
        setOracleModal({
          isOpen: true,
          content: "Oracle unavailable. Target added.",
          isLoading: false,
          entryCount: null,
        });
      }
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
      const newTotalTrackedDays = (target.totalTrackedDays || 0) + 1;
      const newCheckIn = { date: today, held, ...(note ? { note } : {}) };
      const checkIns = [...(target.checkIns || []), newCheckIn];
      const threshold = getConsecutiveDaysRequired(target);

      // Check for kill (streak reached threshold)
      const isKill = held && newStreak >= threshold;

      const targetUpdate = {
        streak: newStreak,
        longestStreak,
        totalTrackedDays: newTotalTrackedDays,
        checkIns,
        lastCheckIn: today,
        lastUpdated: new Date(),
      };

      if (isKill) {
        const killedAt = new Date();
        const createdAtMs = target.createdAt?.toDate
          ? target.createdAt.toDate().getTime()
          : new Date(target.createdAt || 0).getTime();
        const rawDuration = Math.floor((killedAt.getTime() - createdAtMs) / (1000 * 60 * 60 * 24));
        const activeDuration = isNaN(rawDuration) || rawDuration < 0 ? 0 : rawDuration;

        const { id: _removeId, ...targetFields } = target;
        await writeData('confirmedKills', { ...targetFields, ...targetUpdate, killedAt, activeDuration });
        await deleteData('killTargets', targetId);

        setTargets(prev => prev.filter(t => t.id !== targetId));
        ouraToast.success('Target killed. Record updated.');
      } else {
        await updateData('killTargets', targetId, targetUpdate);
        setTargets(prev => prev.map(t => t.id === targetId ? { ...t, ...targetUpdate } : t));

        if (held) {
          ouraToast.success(`Day ${newStreak} held.`);
        } else {
          // Streak broken — open autopsy
          setAutopsyTarget(target);
          ouraToast.warning(`Streak reset on "${target.title}"`);
        }
      }

    } catch (error) {
      logger.error('Error during check-in:', error);
      if (redirectIfAuthLost(error)) return;
      ouraToast.error('Check-in failed. Please try again.');
    }
  }, [categories]);

  // Submit escape autopsy
  const submitAutopsy = useCallback(async () => {
    if (!autopsyTarget) return;
    const { context, rationalization, prevention, intentionActivated, intentionFailReason, eventDate } = autopsyData;
    const hasIntention = !!autopsyTarget.implementationIntention?.trigger;
    if (!context.trim() || !rationalization.trim()) {
      ouraToast.warning('Fill in what happened and what you told yourself');
      return;
    }
    if (hasIntention && !intentionActivated) {
      ouraToast.warning('Specify whether your implementation intention activated');
      return;
    }
    if (hasIntention && intentionActivated !== 'yes' && !intentionFailReason.trim()) {
      ouraToast.warning('Explain why the implementation intention did not activate');
      return;
    }

    try {
      const escapeDate = eventDate || todayKey();
      const isBackfilledEscape = escapeDate !== todayKey();
      const newEscapeEntry = {
        date: escapeDate,
        context: context.trim(),
        rationalization: rationalization.trim(),
        prevention: prevention.trim() || null,
        streakAtEscape: autopsyTarget.streak || 0,
        ...(isBackfilledEscape ? { backfilled: true } : {}),
        ...(hasIntention ? { intentionActivated, intentionFailReason: intentionActivated !== 'yes' ? intentionFailReason.trim() : null } : {}),
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

      // Close autopsy form, show AVE prompt
      const capturedTarget = autopsyTarget;
      setAutopsyTarget(null);
      setAutopsyData({ context: '', rationalization: '', prevention: '', intentionActivated: '', intentionFailReason: '', eventDate: '' });
      ouraToast.success('Escape autopsy recorded');

      // Build Oracle context — include intention result when present
      const intentionContext = hasIntention
        ? ` Implementation intention status: ${intentionActivated}${intentionActivated !== 'yes' ? ` — reason it did not activate: ${intentionFailReason.trim()}` : ''}.`
        : '';

      // BER-134: inject aggregated autopsy patterns for targets with 3+ escapes
      const autopsyPatterns = aggregateAutopsyPatterns(escapeData);
      const autopsyPatternContext = autopsyPatterns
        ? ` AGGREGATE PATTERN (${autopsyPatterns.escapeCount} escapes): dominant context theme = "${autopsyPatterns.dominantContextTheme}"; dominant rationalization theme = "${autopsyPatterns.dominantRationalizationTheme}".${autopsyPatterns.prevPlanNotExecuted ? ' The user has filed prevention plans in prior autopsies that were not executed — call this out directly.' : ''} Address the pattern, not just this escape.`
        : '';

      // Start Oracle fetch in parallel with AVE prompt display
      const escapeText = `"${capturedTarget.title}" got me today. I was on a ${capturedTarget.streak || 0}-day streak. What happened: ${context.trim()}. What I told myself: ${rationalization.trim()}.${prevention.trim() ? ` What would have stopped it: ${prevention.trim()}.` : ''}${intentionContext}${autopsyPatternContext} This is escape number ${escapeData.length}.`;
      oracleEntryTextRef.current = escapeText;
      const oracleFetchPromise = generateAIFeedback('killList', escapeText, []).then(r => r.text).catch(() => null);

      // Show AVE circuit breaker — 3-second minimum lock before Oracle
      setAvePrompt(true);
      setTimeout(async () => {
        setAvePrompt(false);
        setOracleModal({ isOpen: true, content: '', isLoading: true, entryCount: null });
        try {
          const feedback = await oracleFetchPromise;
          setOracleModal({ isOpen: true, content: feedback || 'The pattern survived this round. The autopsy is captured — use it next time.', isLoading: false, entryCount: getCachedTotalEntryCount() });
        } catch {
          setOracleModal({ isOpen: true, content: 'The pattern survived this round. The autopsy is captured — use it next time.', isLoading: false, entryCount: null });
        }
      }, 3000);

    } catch (error) {
      logger.error('Error saving autopsy:', error);
      if (redirectIfAuthLost(error)) return;
      ouraToast.error('Failed to save autopsy');
    }
  }, [autopsyTarget, autopsyData]);

  // Backfill: batch-append N held check-ins from a list of dates.
  // Reuses the kill-threshold archive path from dailyCheckIn.
  const handleBackfillAllHeld = useCallback(async (target, missedDates) => {
    if (!target || !missedDates?.length) return;
    setBackfillBusy(prev => ({ ...prev, [target.id]: true }));
    try {
      const today = todayKey();
      const newCheckIns = missedDates.map(date => ({ date, held: true, backfilled: true }));
      const checkIns = [...(target.checkIns || []), ...newCheckIns];
      const newStreak = (target.streak || 0) + missedDates.length;
      const longestStreak = Math.max(target.longestStreak || 0, newStreak);
      const newTotalTrackedDays = (target.totalTrackedDays || 0) + missedDates.length;
      const threshold = getConsecutiveDaysRequired(target);
      const isKill = newStreak >= threshold;

      const targetUpdate = {
        streak: newStreak,
        longestStreak,
        totalTrackedDays: newTotalTrackedDays,
        checkIns,
        lastCheckIn: today,
        lastUpdated: new Date(),
      };

      if (isKill) {
        const killedAt = new Date();
        const createdAtMs = target.createdAt?.toDate
          ? target.createdAt.toDate().getTime()
          : new Date(target.createdAt || 0).getTime();
        const rawDuration = Math.floor((killedAt.getTime() - createdAtMs) / 86400000);
        const activeDuration = isNaN(rawDuration) || rawDuration < 0 ? 0 : rawDuration;
        const { id: _removeId, ...targetFields } = target;
        await writeData('confirmedKills', { ...targetFields, ...targetUpdate, killedAt, activeDuration });
        await deleteData('killTargets', target.id);
        setTargets(prev => prev.filter(t => t.id !== target.id));
        ouraToast.success(`Target killed. ${missedDates.length} day${missedDates.length !== 1 ? 's' : ''} reconciled.`);
      } else {
        await updateData('killTargets', target.id, targetUpdate);
        setTargets(prev => prev.map(t => t.id === target.id ? { ...t, ...targetUpdate } : t));
        ouraToast.success(`${missedDates.length} day${missedDates.length !== 1 ? 's' : ''} reconciled. Day ${newStreak} held.`);
      }
    } catch (error) {
      logger.error('Error during backfill all-held:', error);
      ouraToast.error('Failed to reconcile days');
    } finally {
      setBackfillBusy(prev => ({ ...prev, [target.id]: false }));
    }
  }, []);

  // Backfill: open the autopsy modal with eventDate pre-set to the picked day.
  // Any days before the picked escape day in the gap are treated as held and
  // appended to checkIns before the autopsy runs, so the streakAtEscape reflects
  // the true consecutive-held count.
  const handleBackfillLogEscape = useCallback(async (target, missedDates, escapeDate) => {
    if (!target || !escapeDate) return;
    setBackfillBusy(prev => ({ ...prev, [target.id]: true }));
    try {
      const escapeIndex = missedDates.indexOf(escapeDate);
      if (escapeIndex === -1) {
        ouraToast.warning('Invalid escape date');
        return;
      }
      const heldBeforeEscape = missedDates.slice(0, escapeIndex);

      // Apply held-day pre-fill before opening autopsy so the displayed streak
      // and the streakAtEscape stored in the autopsy are honest.
      if (heldBeforeEscape.length > 0) {
        const newCheckIns = heldBeforeEscape.map(date => ({ date, held: true, backfilled: true }));
        const checkIns = [...(target.checkIns || []), ...newCheckIns];
        const newStreak = (target.streak || 0) + heldBeforeEscape.length;
        const longestStreak = Math.max(target.longestStreak || 0, newStreak);
        const newTotalTrackedDays = (target.totalTrackedDays || 0) + heldBeforeEscape.length;
        const preEscapeUpdate = {
          streak: newStreak,
          longestStreak,
          totalTrackedDays: newTotalTrackedDays,
          checkIns,
          lastCheckIn: heldBeforeEscape[heldBeforeEscape.length - 1],
          lastUpdated: new Date(),
        };
        await updateData('killTargets', target.id, preEscapeUpdate);
        setTargets(prev => prev.map(t => t.id === target.id ? { ...t, ...preEscapeUpdate } : t));
        // Use the updated target in autopsy so streakAtEscape is right
        setAutopsyTarget({ ...target, ...preEscapeUpdate });
      } else {
        setAutopsyTarget(target);
      }

      setAutopsyData({
        context: '',
        rationalization: '',
        prevention: '',
        intentionActivated: '',
        intentionFailReason: '',
        eventDate: escapeDate,
      });
    } catch (error) {
      logger.error('Error during backfill log-escape setup:', error);
      ouraToast.error('Failed to open autopsy');
    } finally {
      setBackfillBusy(prev => ({ ...prev, [target.id]: false }));
    }
  }, []);

  // Backfill: walk day-by-day entries. Held days append to checkIns in order;
  // first escape opens the autopsy with that eventDate and stops processing.
  // If all held and streak reaches threshold, archive as confirmed kill.
  const handleBackfillLogEach = useCallback(async (target, dayEntries) => {
    if (!target || !dayEntries?.length) return;
    setBackfillBusy(prev => ({ ...prev, [target.id]: true }));
    try {
      const heldPrefix = [];
      let firstEscape = null;
      for (const e of dayEntries) {
        if (e.held === true) {
          heldPrefix.push(e);
        } else if (e.held === false) {
          firstEscape = e;
          break;
        }
      }

      const newCheckIns = heldPrefix.map(e => ({ date: e.date, held: true, backfilled: true }));
      const checkIns = [...(target.checkIns || []), ...newCheckIns];
      const newStreak = (target.streak || 0) + heldPrefix.length;
      const longestStreak = Math.max(target.longestStreak || 0, newStreak);
      const newTotalTrackedDays = (target.totalTrackedDays || 0) + heldPrefix.length;
      const threshold = getConsecutiveDaysRequired(target);
      const isKill = !firstEscape && newStreak >= threshold;

      const lastHeldDate = heldPrefix.length ? heldPrefix[heldPrefix.length - 1].date : target.lastCheckIn;
      const preEscapeUpdate = {
        streak: newStreak,
        longestStreak,
        totalTrackedDays: newTotalTrackedDays,
        checkIns,
        lastCheckIn: lastHeldDate,
        lastUpdated: new Date(),
      };

      if (isKill) {
        const killedAt = new Date();
        const createdAtMs = target.createdAt?.toDate
          ? target.createdAt.toDate().getTime()
          : new Date(target.createdAt || 0).getTime();
        const rawDuration = Math.floor((killedAt.getTime() - createdAtMs) / 86400000);
        const activeDuration = isNaN(rawDuration) || rawDuration < 0 ? 0 : rawDuration;
        const { id: _removeId, ...targetFields } = target;
        await writeData('confirmedKills', { ...targetFields, ...preEscapeUpdate, killedAt, activeDuration });
        await deleteData('killTargets', target.id);
        setTargets(prev => prev.filter(t => t.id !== target.id));
        ouraToast.success(`Target killed. ${heldPrefix.length} day${heldPrefix.length !== 1 ? 's' : ''} reconciled.`);
        return;
      }

      if (heldPrefix.length > 0 || !firstEscape) {
        await updateData('killTargets', target.id, preEscapeUpdate);
        setTargets(prev => prev.map(t => t.id === target.id ? { ...t, ...preEscapeUpdate } : t));
      }

      if (firstEscape) {
        const updatedTarget = { ...target, ...preEscapeUpdate };
        setAutopsyTarget(updatedTarget);
        setAutopsyData({
          context: firstEscape.context || '',
          rationalization: '',
          prevention: '',
          intentionActivated: '',
          intentionFailReason: '',
          eventDate: firstEscape.date,
        });
        ouraToast.info(`Complete the autopsy for ${firstEscape.date}`);
      } else {
        ouraToast.success(`${heldPrefix.length} day${heldPrefix.length !== 1 ? 's' : ''} reconciled. Day ${newStreak} held.`);
      }
    } catch (error) {
      logger.error('Error during backfill log-each:', error);
      ouraToast.error('Failed to reconcile days');
    } finally {
      setBackfillBusy(prev => ({ ...prev, [target.id]: false }));
    }
  }, []);

  const handleBackfillDismiss = useCallback((target) => {
    try {
      sessionStorage.setItem(`kl_backfill_dismissed_${target.id}_${todayKey()}`, '1');
    } catch { /* ignore */ }
    setBackfillDismissed(prev => ({ ...prev, [target.id]: true }));
  }, []);

  const deleteTarget = useCallback(async (targetId) => {
    const target = targetsRef.current.find(t => t.id === targetId);
    const targetIndex = targetsRef.current.findIndex(t => t.id === targetId);
    if (!target) return;

    setTargets(prev => prev.filter(t => t.id !== targetId));

    try {
      await archiveEntry('killTargets', target);
      ouraToast.success('Contract archived');
    } catch (error) {
      logger.error('❌ KillList: Error archiving target:', error);
      setTargets(prev => {
        if (prev.some(t => t.id === targetId)) return prev;
        const next = [...prev];
        const insertIndex = Math.min(targetIndex, next.length);
        next.splice(insertIndex, 0, target);
        return next;
      });
      ouraToast.error('Failed to archive contract');
    }
  }, []);

  const restoreArchivedTarget = useCallback(async (archived) => {
    try {
      await restoreEntry('killTargets', archived);
      ouraToast.success('Contract restored');
    } catch (error) {
      logger.error('❌ KillList: Error restoring target:', error);
      if (redirectIfAuthLost(error)) return;
      // Real-time subscription will reconcile target list automatically.
      ouraToast.error('Failed to restore contract');
    }
  }, []);

  const permanentlyDeleteArchivedTarget = useCallback(async (archived) => {
    if (!window.confirm('Permanently delete this contract? This cannot be undone.')) return;
    try {
      await deleteArchivedEntry('killTargets', archived);
      ouraToast.success('Contract permanently deleted');
    } catch (error) {
      logger.error('❌ KillList: Error permanently deleting target:', error);
      ouraToast.error('Failed to delete contract');
    }
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

  const requestKillOracleStatement = useCallback(async (kill) => {
    setRequestingOracleForKillId(kill.id);
    setOracleModal({ isOpen: true, content: '', isLoading: true, entryCount: null });

    const categoryLabel = categories.find(c => c.value === kill.category)?.label || kill.category || '';
    const notes = kill.reflectionNotes ? ` Notes: ${kill.reflectionNotes}` : '';
    const entryText = `Killed behavior: "${kill.title}"${categoryLabel ? ` — a ${categoryLabel}` : ''}.${notes} Active for ${kill.activeDuration || 0} days before elimination.`;
    oracleEntryTextRef.current = entryText;

    try {
      const { text: feedback } = await generateAIFeedback('killList', entryText, []);
      setOracleModal({ isOpen: true, content: feedback, isLoading: false, entryCount: getCachedTotalEntryCount() });
      await updateData('confirmedKills', kill.id, { oracleStatement: feedback, oracleRequestedAt: new Date() });
      setConfirmedKills(prev => prev.map(k => k.id === kill.id ? { ...k, oracleStatement: feedback } : k));
    } catch {
      setOracleModal({ isOpen: true, content: 'Oracle unavailable.', isLoading: false, entryCount: null });
    } finally {
      setRequestingOracleForKillId(null);
    }
  }, [categories]);

  const saveRevisedIntention = useCallback(async () => {
    if (!reviseTarget) return;
    if (reviseIntention.trigger.trim().length < 20 || reviseIntention.response.trim().length < 20) {
      ouraToast.warning('Both intention fields need at least 20 characters');
      return;
    }
    try {
      const updatedIntention = { trigger: reviseIntention.trigger.trim(), response: reviseIntention.response.trim() };
      await updateData('killTargets', reviseTarget.id, { implementationIntention: updatedIntention, lastUpdated: new Date() });
      setTargets(prev => prev.map(t =>
        t.id === reviseTarget.id ? { ...t, implementationIntention: updatedIntention } : t
      ));
      setReviseTarget(null);
      setReviseIntention({ trigger: '', response: '' });
      ouraToast.success('Implementation intention revised');
    } catch (err) {
      logger.error('Error saving revised intention:', err);
      ouraToast.error('Failed to save intention');
    }
  }, [reviseTarget, reviseIntention]);

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
    const completed = confirmedKills.length;
    const active = targets.filter(t => t.status === 'active').length;
    const escaped = targets.filter(t => t.status === 'escaped').length;
    const total = completed + active + escaped;
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

    // Average streak at kill — sourced from confirmedKills archive
    const killedWithStreak = confirmedKills.filter(k => k.streak);
    const avgStreakToKill = killedWithStreak.length > 0
      ? Math.round(killedWithStreak.reduce((sum, k) => sum + k.streak, 0) / killedWithStreak.length)
      : null;

    // Category distribution — include both active/escaped targets and confirmed kills
    const catCounts = {};
    [...targets, ...confirmedKills].forEach(t => {
      if (t.category) catCounts[t.category] = (catCounts[t.category] || 0) + 1;
    });
    const categoryDist = Object.entries(catCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([cat, count]) => ({ cat, count }));

    return { total, completed, active, escaped, completionRate, avgStreakToKill, categoryDist };
  }, [targets, confirmedKills]);

  const getStreakColor = () => '#ef4444';

  const renderTargetItem = useCallback((target, index) => {
    const category = categories.find(c => c.value === target.category) || categories[0];
    const streak = target.streak || 0;
    const threshold = getConsecutiveDaysRequired(target);
    const daysActive = Math.floor((Date.now() - new Date(target.createdAt).getTime()) / 86400000);
    const checkedInToday = target.lastCheckIn === todayKey();
    const latestEscape = target.escapeData?.length ? target.escapeData[target.escapeData.length - 1] : null;
    const missedDates = target.status === 'active' ? computeMissedDates(target) : [];
    const showBackfill = missedDates.length >= 2 && !backfillDismissed[target.id];

    return (
      <React.Fragment key={target.id}>
        {showBackfill && (
          <KillListBackfillCard
            target={target}
            missedDates={missedDates}
            busy={!!backfillBusy[target.id]}
            onAllHeld={() => handleBackfillAllHeld(target, missedDates)}
            onLogEscape={(escapeDate) => handleBackfillLogEscape(target, missedDates, escapeDate)}
            onLogEach={(entries) => handleBackfillLogEach(target, entries)}
            onDismiss={() => handleBackfillDismiss(target)}
          />
        )}
      <div className="oura-card p-5 hover:border-[#2a2a2a] transition-all duration-300">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1 min-w-0">
            {editingTarget === target.id ? (
              <div className="flex gap-2 mb-2">
                <input type="text" value={editValue} onChange={(e) => setEditValue(e.target.value)} className="flex-1 bg-[#0a0a0a] text-white p-2 rounded-xl border border-[#1a1a1a] focus:border-[#ef4444] focus:outline-none text-sm" autoFocus />
                <button onClick={saveEdit} className="px-3 py-2 bg-transparent text-white border border-[#2a2a2a] rounded-xl text-xs hover:border-white hover:bg-[#1a1a1a] transition-colors">Save</button>
                <button onClick={cancelEdit} className="px-3 py-2 bg-[#1a1a1a] text-[#858585] rounded-xl text-xs">Cancel</button>
              </div>
            ) : (
              <>
                <h3 className={`font-medium ${target.status === 'killed' ? 'line-through text-[#858585]' : 'text-white'}`}>
                  {target.title}
                </h3>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className="text-xs text-[#858585] uppercase tracking-wider">
                    {category.label}
                  </span>
                  <span className="text-[#858585] text-xs">·</span>
                  <span className={`text-xs uppercase tracking-wider ${
                    target.status === 'killed' ? 'text-[#858585]' :
                    target.status === 'escaped' ? 'text-[#b45309]' :
                    'text-white'
                  }`}>
                    {target.status}
                  </span>
                  <span className="text-[#858585] text-xs">·</span>
                  <span className="text-[#858585] text-xs">Day {daysActive} · {new Date(target.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: new Date(target.createdAt).getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined })}</span>
                </div>
                <p className="text-[#858585] text-xs mt-2">
                  Kill requires {threshold} consecutive days of held execution.
                </p>
              </>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-1.5 shrink-0 ml-3">
            {editingTarget !== target.id && (
              <>
                <button onClick={() => startEditing(target)} aria-label="Edit contract" title="Edit" className="w-7 h-7 flex items-center justify-center rounded-lg text-[#858585] hover:text-white hover:bg-[#1a1a1a] transition-colors">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                </button>
                {target.status === 'escaped' && (
                  <button onClick={() => reactivateTarget(target.id)} aria-label="Reactivate contract" title="Reactivate" className="w-7 h-7 flex items-center justify-center rounded-lg text-[#858585] hover:text-white hover:bg-[#1a1a1a] transition-colors">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 12a9 9 0 1 0 3-6.7" />
                      <polyline points="3 4 3 10 9 10" />
                    </svg>
                  </button>
                )}
                <button onClick={() => deleteTarget(target.id)} aria-label="Archive contract" title="Archive" className="w-7 h-7 flex items-center justify-center rounded-lg text-[#858585] hover:text-white hover:bg-[#1a1a1a] transition-colors">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="4" rx="1" />
                    <path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8" />
                    <line x1="10" y1="12" x2="14" y2="12" />
                  </svg>
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
              <span className="text-xs text-[#858585] shrink-0 tabular-nums">{streak} / {threshold}d</span>
            </div>

            {/* 3-metric row: Current Streak · Behavioral Record · Longest Run */}
            <div className="flex items-start justify-between">
              <div className="flex gap-5">
                <div>
                  <span className="text-2xl font-light tabular-nums text-white">
                    {streak}
                  </span>
                  <div className="text-[#858585] text-xs mt-0.5">Current Streak</div>
                </div>
                <div>
                  <span className="text-2xl font-light tabular-nums text-[#ababab]">
                    {target.totalTrackedDays || 0}
                  </span>
                  <div className="text-[#858585] text-xs mt-0.5">Behavioral Record</div>
                </div>
                <div>
                  <span className="text-2xl font-light tabular-nums text-[#858585]">
                    {target.longestStreak || 0}
                  </span>
                  <div className="text-[#858585] text-xs mt-0.5">Longest Run</div>
                </div>
              </div>
            </div>

            {/* Implementation intention — collapsed by default */}
            {target.implementationIntention?.trigger && (
              <div className="border-t border-[#1a1a1a] pt-3">
                {(() => {
                  const failedIntentions = (target.escapeData || []).filter(e => e.intentionActivated && e.intentionActivated !== 'yes').length;
                  return (
                    <>
                      <button
                        onClick={() => setShowIntention(prev => ({ ...prev, [target.id]: !prev[target.id] }))}
                        className="flex items-center gap-2 text-[#858585] hover:text-[#858585] text-xs transition-colors w-full text-left"
                      >
                        <span className="uppercase tracking-widest">Implementation Intention</span>
                        <span>{showIntention[target.id] ? '▲' : '▼'}</span>
                      </button>
                      {showIntention[target.id] && (
                        <div className="mt-2 space-y-1 text-xs text-[#858585]">
                          <p><span className="text-[#858585]">When:</span> {target.implementationIntention.trigger}</p>
                          <p><span className="text-[#858585]">I will:</span> {target.implementationIntention.response}</p>
                        </div>
                      )}
                      {failedIntentions >= 3 && (
                        <div className="mt-2 p-3 bg-[#0a0a0a] border-l-2 border-[#b45309] border-t border-r border-b border-[#1a1a1a] rounded-xl">
                          <p className="text-[#b45309] text-xs mb-2">Your implementation intention has not activated in {failedIntentions} escapes. The plan needs revision, not the person.</p>
                          <button
                            onClick={() => { setReviseTarget(target); setReviseIntention({ trigger: target.implementationIntention.trigger, response: target.implementationIntention.response }); }}
                            className="text-xs px-3 py-1.5 bg-transparent text-[#b45309] border border-[#b45309]/30 rounded-lg hover:bg-[#b45309]/10 transition-colors"
                          >
                            Revise your intention
                          </button>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            )}

            {/* Daily check-in buttons (active targets only, once per day) */}
            {target.status === 'active' && !checkedInToday && (
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => dailyCheckIn(target.id, true)}
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-transparent text-white border border-[#2a2a2a] hover:border-white hover:bg-[#1a1a1a] transition-all"
                >
                  Held the line
                </button>
                <button
                  onClick={() => dailyCheckIn(target.id, false)}
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-transparent text-[#b45309] border border-[#b45309]/30 hover:bg-[#b45309]/10 transition-all"
                >
                  It got me
                </button>
              </div>
            )}

            {/* Already checked in today */}
            {target.status === 'active' && checkedInToday && (
              <div className="text-center py-2 text-[#858585] text-xs">
                Checked in today
              </div>
            )}

            {/* Killed status — show closure entry + Oracle response if captured */}
            {target.status === 'killed' && (
              <div className="p-3 bg-[#0a0a0a] border border-[#2a2a2a] rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-white text-sm font-medium uppercase tracking-wider">Target eliminated</span>
                  <span className="text-[#858585] text-xs">{streak}-day streak</span>
                </div>
                {target.closureNote && (
                  <div className="pt-2 border-t border-[#1a1a1a] space-y-2">
                    <div>
                      <div className="text-[#858585] text-[10px] uppercase tracking-widest mb-1">What ended this</div>
                      <p className="text-[#d1d1d1] text-xs leading-relaxed">{target.closureNote}</p>
                    </div>
                    {Array.isArray(target.closureTags) && target.closureTags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {target.closureTags.map(t => (
                          <span key={t} className="text-[10px] px-2 py-0.5 bg-[#1a1a1a] text-[#ababab] rounded-lg border border-[#2a2a2a]">
                            {t.replace(/_/g, ' ')}
                          </span>
                        ))}
                      </div>
                    )}
                    {target.closureOracleResponse && (
                      <div className="mt-2 pt-2 border-t border-[#a855f7]/20">
                        <div className="text-[#a855f7] text-[10px] uppercase tracking-widest mb-1">Oracle</div>
                        <p className="text-[#ababab] text-xs italic leading-relaxed">{target.closureOracleResponse}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Escaped — show latest autopsy or lightweight breach entry */}
            {target.status === 'escaped' && (
              <div className="p-3 bg-[#0a0a0a] border-l-2 border-[#b45309] border-t border-r border-b border-[#1a1a1a] rounded-xl space-y-2">
                <span className="text-[#b45309] text-xs font-medium uppercase tracking-widest">Escaped</span>
                {latestEscape && (
                  <div className="text-[#858585] text-xs space-y-1">
                    <p><span className="text-[#ababab]">What happened:</span> {latestEscape.context}</p>
                    <p><span className="text-[#ababab]">Told myself:</span> {latestEscape.rationalization}</p>
                    {latestEscape.prevention && <p><span className="text-[#ababab]">Would have stopped it:</span> {latestEscape.prevention}</p>}
                  </div>
                )}
                {target.escapeClosureNote && (
                  <div className="pt-2 border-t border-[#1a1a1a] space-y-2">
                    <div>
                      <div className="text-[#858585] text-[10px] uppercase tracking-widest mb-1">What caught you</div>
                      <p className="text-[#d1d1d1] text-xs leading-relaxed">{target.escapeClosureNote}</p>
                    </div>
                    {Array.isArray(target.escapeClosureTags) && target.escapeClosureTags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {target.escapeClosureTags.map(t => (
                          <span key={t} className="text-[10px] px-2 py-0.5 bg-[#1a1a1a] text-[#ababab] rounded-lg border border-[#2a2a2a]">
                            {t.replace(/_/g, ' ')}
                          </span>
                        ))}
                      </div>
                    )}
                    {target.escapeOracleResponse && (
                      <div className="mt-2 pt-2 border-t border-[#a855f7]/20">
                        <div className="text-[#a855f7] text-[10px] uppercase tracking-widest mb-1">Oracle</div>
                        <p className="text-[#ababab] text-xs italic leading-relaxed">{target.escapeOracleResponse}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Escape count */}
            {(target.escapeData || []).length > 0 && target.status !== 'escaped' && (
              <div className="text-[#858585] text-xs">
                {target.escapeData.length} escape{target.escapeData.length > 1 ? 's' : ''} recorded
              </div>
            )}

            {/* BER-134: Autopsy Pattern Intelligence — collapsed section after 3+ escapes */}
            {(target.escapeData || []).length >= 3 && (() => {
              const patterns = aggregateAutopsyPatterns(target.escapeData);
              if (!patterns) return null;
              const isExpanded = showAutopsyPattern[target.id];
              return (
                <div className="border border-[#1a1a1a] rounded-xl overflow-hidden">
                  <button
                    onClick={() => setShowAutopsyPattern(prev => ({ ...prev, [target.id]: !prev[target.id] }))}
                    className="w-full flex items-center justify-between px-4 py-2.5 bg-[#0a0a0a] text-left hover:bg-[#1a1a1a] transition-colors"
                  >
                    <span className="text-[#858585] text-xs uppercase tracking-widest">Autopsy Pattern ({patterns.escapeCount} escapes)</span>
                    <span className="text-[#858585] text-xs">{isExpanded ? '▲' : '▼'}</span>
                  </button>
                  {isExpanded && (
                    <div className="px-4 py-3 space-y-2 bg-[#080808]">
                      {patterns.dominantContextTheme && (
                        <div className="text-xs">
                          <span className="text-[#858585]">Context pattern: </span>
                          <span className="text-[#ababab]">"{patterns.dominantContextTheme}" appears across escapes</span>
                        </div>
                      )}
                      {patterns.dominantRationalizationTheme && (
                        <div className="text-xs">
                          <span className="text-[#858585]">Rationalization pattern: </span>
                          <span className="text-[#ababab]">"{patterns.dominantRationalizationTheme}" appears across escapes</span>
                        </div>
                      )}
                      <div className="text-xs">
                        <span className="text-[#858585]">Prevention plans filed: </span>
                        <span className="text-[#ababab]">{patterns.preventionPlanCount} of {patterns.escapeCount}</span>
                      </div>
                      {patterns.prevPlanNotExecuted && (
                        <div className="text-xs text-[#b45309]">Prevention plans filed in prior autopsies were not executed.</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* BER-131: Repeated escape bridge to Hard Lessons (3+ escapes) */}
            {(target.escapeData || []).length >= 3 && !sessionStorage.getItem(`hl_bridge_dismissed_${target.id}`) && (
              <div className="mt-3 flex items-start gap-3 px-4 py-3 bg-[#0a0a0a] border-l-2 border-[#b45309] border-t border-r border-b border-[#1a1a1a] rounded-xl">
                <div className="flex-1">
                  <p className="text-[#ababab] text-xs leading-relaxed">This pattern has repeated {target.escapeData.length} times without resolution. Document it in Hard Lessons?</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Link to="/hardlessons" onClick={() => {
                    sessionStorage.setItem('hl_bridge_prefill', JSON.stringify({ eventDescription: `${target.title} — ${target.escapeData.length} escapes recorded` }));
                  }} className="px-3 py-1.5 bg-transparent text-[#b45309] border border-[#b45309]/30 rounded-lg text-xs hover:bg-[#b45309]/10 transition-colors">Document</Link>
                  <button onClick={() => sessionStorage.setItem(`hl_bridge_dismissed_${target.id}`, '1')} className="px-3 py-1.5 bg-[#1a1a1a] text-[#858585] rounded-lg text-xs hover:text-white transition-colors">×</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      </React.Fragment>
    );
    }, [editingTarget, editValue, startEditing, saveEdit, cancelEdit, deleteTarget, markAsEscaped, reactivateTarget, dailyCheckIn, categories, categoryIcons,
      reflectionNotes, showReflection, updatingReflection, saveReflectionNote, clearReflectionNote, showIntention, setShowIntention, setReviseTarget, setReviseIntention,
      showAutopsyPattern, setShowAutopsyPattern, backfillBusy, backfillDismissed, handleBackfillAllHeld, handleBackfillLogEscape, handleBackfillLogEach, handleBackfillDismiss]);

  return (
    <div className="min-h-screen bg-black">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Oura-style Header */}
        <header className="mb-10 animate-fade-in-up">
          <p className="text-[#858585] text-sm uppercase tracking-widest mb-2">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-2xl bg-[#ef4444]/10 border border-[#ef4444]/20 flex items-center justify-center shrink-0">
              <AppIcon name="target" size={22} color="#ef4444" glow={false} />
            </div>
            <h1 className="text-3xl font-bold text-white">General Ledger</h1>
          </div>
          <div className="border-l-4 border-[#ef4444] pl-4 py-1">
            <p className="text-[#ababab]">Name what needs to die. Hold the contract.</p>
            <p className="text-[#858585] text-xs mt-2">Patterns archived → <Link to="/hardlessons" className="text-[#ababab] hover:text-white transition-colors">Hard Lessons</Link></p>
          </div>
        </header>

        {/* Stats */}
        <section className="mb-10 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
          <h3 className="text-[#858585] text-xs uppercase tracking-widest mb-4">Your Progress</h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="oura-card p-5 text-center">
              <div className="text-3xl font-light tabular-nums text-white">{stats.total}</div>
              <div className="text-xs text-[#858585] mt-2 uppercase tracking-wider">Total Contracts</div>
            </div>
            <div className="oura-card p-5 text-center">
              <div className="text-3xl font-light tabular-nums text-white">{stats.active}</div>
              <div className="text-xs text-[#858585] mt-2 uppercase tracking-wider">Active</div>
            </div>
            <div className="oura-card p-5 text-center">
              <div className="text-3xl font-light tabular-nums text-white">{stats.completed}</div>
              <div className="text-xs text-[#858585] mt-2 uppercase tracking-wider">Killed</div>
            </div>
            <div className="oura-card p-5 text-center">
              <div className="text-3xl font-light tabular-nums text-white">{stats.escaped}</div>
              <div className="text-xs text-[#858585] mt-2 uppercase tracking-wider">Escaped</div>
            </div>
            <div className="oura-card p-5 text-center">
              <div className="text-3xl font-light tabular-nums text-white">{stats.completionRate}%</div>
              <div className="text-xs text-[#858585] mt-2 uppercase tracking-wider">Success Rate</div>
            </div>
          </div>

          {/* Completion metrics row */}
          {targets.length >= 3 && (
            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Category distribution */}
              <div>
                <div className="text-[#858585] text-xs uppercase tracking-widest mb-3">By Category</div>
                <div className="space-y-2">
                  {stats.categoryDist.map(({ cat, count }) => {
                    const catDef = CATEGORIES.find(c => c.value === cat);
                    const pct = Math.round((count / stats.total) * 100);
                    return (
                      <div key={cat} className="flex items-center gap-3">
                        <div className="text-xs w-28 shrink-0 truncate text-[#ababab]">{catDef?.label ?? cat}</div>
                        <div className="flex-1 bg-[#1a1a1a] rounded-full h-1.5 overflow-hidden">
                          <div
                            className="h-1.5 rounded-full transition-all duration-500 bg-[#ef4444]"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <div className="text-[#858585] text-xs w-4 text-right shrink-0">{count}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Avg streak to kill */}
              <div className="flex flex-col justify-center">
                <div className="text-[#858585] text-xs uppercase tracking-widest mb-2">Avg Streak to Kill</div>
                {stats.avgStreakToKill !== null ? (
                  <div>
                    <span className="text-4xl font-light tabular-nums text-white">
                      {stats.avgStreakToKill}
                    </span>
                    <span className="text-[#858585] text-sm ml-2">days</span>
                    <div className="text-[#858585] text-xs mt-1">across {confirmedKills.length} confirmed kills</div>
                  </div>
                ) : (
                  <div className="text-[#858585] text-sm">No kills recorded yet</div>
                )}
              </div>
            </div>
          )}

          {/* Behavioral Record — flat chronological list of creations, escapes, kills */}
          {(() => {
            const rows = [];
            const allTargets = [...targets, ...confirmedKills];

            allTargets.forEach(t => {
              // Creation event
              const createdAtMs = t.createdAt?.toDate
                ? t.createdAt.toDate().getTime()
                : new Date(t.createdAt || 0).getTime();
              if (Number.isFinite(createdAtMs) && createdAtMs > 0) {
                rows.push({ ts: createdAtMs, type: 'created', title: t.title || 'untitled', context: '' });
              }

              // Escape events
              (t.escapeData || []).forEach(e => {
                const escapeMs = new Date(e.date || 0).getTime();
                if (!Number.isFinite(escapeMs) || escapeMs <= 0) return;
                rows.push({
                  ts: escapeMs,
                  type: 'escaped',
                  title: t.title || 'untitled',
                  context: (e.context || '').trim(),
                });
              });
            });

            // Kill events — only from confirmedKills
            confirmedKills.forEach(k => {
              const killedAtMs = k.killedAt?.toDate
                ? k.killedAt.toDate().getTime()
                : new Date(k.killedAt || 0).getTime();
              if (!Number.isFinite(killedAtMs) || killedAtMs <= 0) return;
              rows.push({ ts: killedAtMs, type: 'killed', title: k.title || 'untitled', context: '' });
            });

            rows.sort((a, b) => b.ts - a.ts);

            if (rows.length === 0) return null;

            const fmtDate = (ms) => new Date(ms).toISOString().split('T')[0];
            const truncate = (s, n = 80) => (s && s.length > n ? `${s.slice(0, n - 1)}…` : s);

            return (
              <div className="mt-6 oura-card p-5 animate-fade-in-up">
                <h3 className="text-xs text-[#858585] uppercase tracking-widest mb-4">Behavioral Record</h3>
                <div className="divide-y divide-[#1a1a1a]">
                  {rows.map((row, i) => (
                    <div key={i} className="py-2 text-xs text-[#ababab] font-mono leading-relaxed">
                      <span className="text-[#858585]">{fmtDate(row.ts)}</span>
                      <span className="text-[#858585]"> · </span>
                      <span className="text-[#ababab]">{row.type}</span>
                      <span className="text-[#858585]"> · </span>
                      <span className="text-white">{row.title}</span>
                      {row.type === 'escaped' && row.context && (
                        <>
                          <span className="text-[#858585]"> · </span>
                          <span className="text-[#858585]">{truncate(row.context)}</span>
                        </>
                      )}
                    </div>
                  ))}
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
                <label className="block text-[#ababab] text-sm uppercase tracking-wider mb-3">
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
                <label className="block text-[#ababab] text-sm uppercase tracking-wider mb-3">
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
                          ? 'bg-[#1a1a1a] text-white border-[#ef4444]'
                          : 'bg-[#0a0a0a] text-[#858585] border-[#1a1a1a] hover:border-[#2a2a2a] hover:text-[#ababab]'
                      }`}
                    >
                      <span className={newTargetCategory === category.value ? 'text-[#ef4444]' : 'text-[#858585]'}>
                        {categoryIcons[category.value]}
                      </span>
                      <span className="truncate">{category.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Consecutive days required — user names their own weight */}
              <div>
                <label className="block text-[#ababab] text-sm uppercase tracking-wider mb-3">
                  Consecutive Days Required
                </label>
                <input
                  type="number"
                  min={MIN_DAYS_REQUIRED}
                  step={1}
                  value={newTargetDays}
                  onChange={(e) => {
                    const raw = e.target.value;
                    if (raw === '') { setNewTargetDays(''); return; }
                    const n = parseInt(raw, 10);
                    setNewTargetDays(Number.isFinite(n) ? n : '');
                  }}
                  onBlur={() => {
                    const n = parseInt(newTargetDays, 10);
                    if (!Number.isFinite(n) || n < MIN_DAYS_REQUIRED) setNewTargetDays(MIN_DAYS_REQUIRED);
                  }}
                  className="w-full bg-[#0a0a0a] text-white p-4 rounded-2xl border border-[#1a1a1a] focus:border-[#ef4444] focus:outline-none transition-colors tabular-nums"
                />
                <p className="text-[#858585] text-xs mt-2">
                  Kill requires {Number.isFinite(parseInt(newTargetDays, 10)) ? Math.max(MIN_DAYS_REQUIRED, parseInt(newTargetDays, 10)) : MIN_DAYS_REQUIRED} consecutive days of held execution. Minimum {MIN_DAYS_REQUIRED}.
                </p>
              </div>

              {/* Implementation Intention — required */}
              <div className="border-t border-[#1a1a1a] pt-6">
                <label className="block text-[#ababab] text-sm uppercase tracking-wider mb-1">
                  When This Happens, I Will Do This Instead
                </label>
                <p className="text-[#858585] text-xs mb-4">Pre-decide your response to the trigger. Both fields required (min 20 chars).</p>
                <div className="space-y-4">
                  <div>
                    <label className="block text-[#858585] text-xs uppercase tracking-widest mb-2">
                      When [describe the specific triggering condition]
                    </label>
                    <textarea
                      value={newIntention.trigger}
                      onChange={(e) => setNewIntention(prev => ({ ...prev, trigger: e.target.value }))}
                      rows={2}
                      placeholder="I feel the urge to [X] after [context]..."
                      className="w-full bg-[#0a0a0a] text-white p-3 rounded-xl border border-[#1a1a1a] focus:border-[#ef4444] focus:outline-none resize-none text-sm placeholder-[#555555] transition-colors"
                    />
                    <div className={`text-xs mt-1 text-right tabular-nums ${newIntention.trigger.trim().length < 20 ? 'text-[#b45309]/70' : 'text-[#858585]'}`}>
                      {newIntention.trigger.trim().length}/20
                    </div>
                  </div>
                  <div>
                    <label className="block text-[#858585] text-xs uppercase tracking-widest mb-2">
                      I Will [describe the specific competing behavior]
                    </label>
                    <textarea
                      value={newIntention.response}
                      onChange={(e) => setNewIntention(prev => ({ ...prev, response: e.target.value }))}
                      rows={2}
                      placeholder="I will immediately [specific action] for at least [duration]..."
                      className="w-full bg-[#0a0a0a] text-white p-3 rounded-xl border border-[#1a1a1a] focus:border-[#ef4444] focus:outline-none resize-none text-sm placeholder-[#555555] transition-colors"
                    />
                    <div className={`text-xs mt-1 text-right tabular-nums ${newIntention.response.trim().length < 20 ? 'text-[#b45309]/70' : 'text-[#858585]'}`}>
                      {newIntention.response.trim().length}/20
                    </div>
                  </div>
                </div>
              </div>

              {/* Submit Button */}
              {(() => {
                const missing = [];
                if (!newTarget.trim()) missing.push('Target Name');
                if (newIntention.trigger.trim().length < 20) missing.push('When (20+ chars)');
                if (newIntention.response.trim().length < 20) missing.push('I Will (20+ chars)');
                const isDisabled = submitting || missing.length > 0;
                return (
                  <div className="flex flex-col items-end gap-2">
                    {missing.length > 0 && (
                      <div className="text-xs text-[#ababab]">
                        <span className="text-[#858585]">Missing: </span>
                        <span className="text-[#b45309]">{missing.join(' · ')}</span>
                      </div>
                    )}
                    <button
                      onClick={addTarget}
                      disabled={isDisabled}
                      className="px-8 py-3 bg-white text-black rounded-2xl hover:bg-[#d1d1d1] disabled:bg-[#1a1a1a] disabled:text-[#858585] transition-all duration-300 font-medium"
                    >
                      {submitting ? 'Adding Contract...' : 'Add Kill Contract'}
                    </button>
                  </div>
                );
              })()}
            </div>
          </div>
        </section>

        {/* Filter Tabs */}
        <section className="mb-6 animate-fade-in-up" style={{ animationDelay: '0.3s' }}>
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <ArchiveToggle
                view={view}
                onChange={setView}
                activeCount={targets.length}
                archiveCount={archivedTargets.length}
              />
            </div>
            {view === 'active' && (
            <>
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
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#858585] hover:text-white text-sm"
                >
                  Clear
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
            {[
              { key: 'all', label: 'All Contracts', count: stats.total },
              { key: 'active', label: 'Active', count: stats.active },
              { key: 'escaped', label: 'Escaped', count: stats.escaped }
            ].map(({ key, label, count }) => (
              <button
                key={key}
                onClick={() => setFilterStatus(key)}
                className={`px-5 py-2.5 rounded-2xl font-medium transition-all duration-300 text-sm ${
                  filterStatus === key
                    ? 'bg-[#1a1a1a] text-white border border-[#ef4444]'
                    : 'bg-[#0a0a0a] text-[#ababab] hover:bg-[#1a1a1a] border border-[#1a1a1a]'
                }`}
              >
                {label} ({count})
              </button>
            ))}
            </div>
            </>
            )}
          </div>
        </section>

        {view === 'archive' && (
          <div className="space-y-3 mb-8">
            {archivedTargets.length === 0 ? (
              <div className="oura-card p-10 text-center">
                <p className="text-[#858585] text-sm">No archived contracts.</p>
              </div>
            ) : archivedTargets.map(t => (
              <div key={t.id} className="oura-card p-5 opacity-75 hover:opacity-100 transition-opacity">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium truncate">{t.title}</p>
                    <p className="text-[#858585] text-xs mt-1">
                      Archived {t.archivedAt ? new Date(t.archivedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}
                      {typeof t.streak === 'number' && t.streak > 0 && <span> · Streak at archive: {t.streak}</span>}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => restoreArchivedTarget(t)}
                      className="px-3 py-1.5 text-xs rounded-lg border border-[#ef4444]/30 text-[#ef4444] hover:bg-[#ef4444]/10 transition-colors"
                    >
                      Restore
                    </button>
                    <button
                      onClick={() => permanentlyDeleteArchivedTarget(t)}
                      className="px-3 py-1.5 text-xs rounded-lg border border-[#b45309]/30 text-[#b45309] hover:bg-[#b45309]/10 transition-colors"
                    >
                      Delete permanently
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {view === 'active' && (
        <div className="relative">
          <div className={`fade-pane ${showSkeleton ? 'visible' : 'hidden'}`}>
            <SkeletonList count={4} ItemComponent={SkeletonKillTarget} />
          </div>

          <div className={`fade-pane ${showSkeleton ? 'hidden' : 'visible'}`}>
            {loadError ? (
              <div className="oura-card p-12 text-center animate-fade-in-up">
                <p className="text-[#b45309] mb-4 text-sm">Failed to load kill targets. Please check your connection.</p>
                <button
                  onClick={loadTargets}
                  className="px-5 py-2.5 bg-transparent text-[#b45309] border border-[#b45309]/30 rounded-xl hover:bg-[#b45309]/10 transition-colors text-sm font-medium"
                >
                  Retry
                </button>
              </div>
            ) : filteredTargets.length > 0 ? (
              <div>{filteredTargets.map((item, index) => renderTargetItem(item, index))}</div>
            ) : (
              <div className="oura-card p-12 text-center animate-fade-in-up" style={{ animationDelay: '0.4s' }}>
                <div className="text-6xl mb-4 opacity-30">🎯</div>
                <h3 className="text-xl font-semibold text-[#ababab] mb-2">
                  {searchQuery.trim()
                    ? `No matches for “${searchQuery.trim()}”`
                    : (filterStatus === 'completed' ? 'No completed contracts yet' :
                      filterStatus === 'active' ? 'No active contracts' :
                      'No kill contracts yet')}
                </h3>
                <p className="text-[#858585] text-sm mb-6">
                  {searchQuery.trim()
                    ? 'Try a different keyword or clear the search.'
                    : (filterStatus === 'all' ? 'Name what needs to die. No app can do this for you.' :
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
                    className="px-6 py-2 bg-white hover:bg-[#d1d1d1] text-black rounded-lg transition-all duration-300 font-medium text-sm"
                  >
                    {filterStatus === 'active' ? 'Create New Target' : 'Add Your First Target'}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
        )}

        {/* Confirmed Kills Archive */}
        {confirmedKills.length > 0 && (
          <section className="mt-12 animate-fade-in-up">
            <h3 className="text-[#858585] text-xs uppercase tracking-widest mb-4">Confirmed Kills</h3>
            <div className="space-y-3">
              {confirmedKills.map(kill => {
                const killedAtDate = kill.killedAt?.toDate ? kill.killedAt.toDate() : new Date(kill.killedAt || 0);
                const killDateStr = killedAtDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                const killThreshold = getConsecutiveDaysRequired(kill);
                const category = CATEGORIES.find(c => c.value === kill.category);
                return (
                  <div key={kill.id} className="oura-card p-5 border-[#1a1a1a]">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1 min-w-0">
                        <h4 className="text-[#ababab] font-medium line-through truncate">{kill.title}</h4>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          {category && (
                            <span className={`text-xs px-2 py-0.5 rounded-lg ${category.color} ${category.bgColor}`}>
                              {category.label}
                            </span>
                          )}
                          <span className="text-[#858585] text-xs">Killed {killDateStr}</span>
                          <span className="text-[#858585] text-xs">Tracked {kill.activeDuration ?? 0} days</span>
                        </div>
                        <p className="text-[#858585] text-xs mt-2">
                          Kill required {killThreshold} consecutive days of held execution.
                        </p>
                      </div>
                    </div>
                    {kill.oracleStatement ? (
                      <p className="text-[#858585] text-sm mt-3 leading-relaxed border-l-2 border-[#1a1a1a] pl-3">{kill.oracleStatement}</p>
                    ) : (
                      <button
                        onClick={() => requestKillOracleStatement(kill)}
                        disabled={requestingOracleForKillId === kill.id}
                        className="mt-3 text-xs text-[#858585] hover:text-[#858585] transition-colors disabled:opacity-40"
                      >
                        {requestingOracleForKillId === kill.id ? 'Requesting...' : 'Request Oracle statement'}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* AVE Circuit Breaker — static prompt between autopsy and Oracle */}
        {avePrompt && (
          <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center z-50 p-4">
            <div className="bg-black border border-[#1a1a1a] rounded-2xl max-w-md w-full p-8 text-center">
              <p className="text-white text-lg font-light leading-relaxed">
                One breach does not end the war. The autopsy is complete. Return to discipline tomorrow.
              </p>
            </div>
          </div>
        )}

        {/* Revise Implementation Intention Modal */}
        {reviseTarget && (
          <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center z-50 p-4">
            <div className="bg-black border border-[#1a1a1a] rounded-2xl max-w-lg w-full p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-white font-medium">Revise Intention: {reviseTarget.title}</h3>
                <button onClick={() => { setReviseTarget(null); setReviseIntention({ trigger: '', response: '' }); }} className="text-[#858585] hover:text-white transition-colors">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M18 6L6 18M6 6l12 12" /></svg>
                </button>
              </div>
              <p className="text-[#858585] text-sm mb-5">The plan failed. Revise the trigger or the competing behavior — not the standard.</p>
              <div className="space-y-4">
                <div>
                  <label className="text-[#ababab] text-xs uppercase tracking-widest mb-2 block">When [triggering condition]</label>
                  <textarea value={reviseIntention.trigger} onChange={(e) => setReviseIntention(prev => ({ ...prev, trigger: e.target.value }))} rows={2} className="w-full p-3 bg-[#0a0a0a] text-white rounded-xl border border-[#1a1a1a] focus:border-[#ef4444] focus:outline-none resize-none text-sm" />
                  <div className={`text-xs mt-1 text-right tabular-nums ${reviseIntention.trigger.trim().length < 20 ? 'text-[#b45309]/70' : 'text-[#858585]'}`}>{reviseIntention.trigger.trim().length}/20</div>
                </div>
                <div>
                  <label className="text-[#ababab] text-xs uppercase tracking-widest mb-2 block">I will [competing behavior]</label>
                  <textarea value={reviseIntention.response} onChange={(e) => setReviseIntention(prev => ({ ...prev, response: e.target.value }))} rows={2} className="w-full p-3 bg-[#0a0a0a] text-white rounded-xl border border-[#1a1a1a] focus:border-[#ef4444] focus:outline-none resize-none text-sm" />
                  <div className={`text-xs mt-1 text-right tabular-nums ${reviseIntention.response.trim().length < 20 ? 'text-[#b45309]/70' : 'text-[#858585]'}`}>{reviseIntention.response.trim().length}/20</div>
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={saveRevisedIntention} disabled={reviseIntention.trigger.trim().length < 20 || reviseIntention.response.trim().length < 20} className="flex-1 py-3 bg-white hover:bg-[#d1d1d1] disabled:bg-[#1a1a1a] disabled:text-[#858585] text-black rounded-xl font-medium text-sm transition-all">
                  Save Revised Intention
                </button>
                <button onClick={() => { setReviseTarget(null); setReviseIntention({ trigger: '', response: '' }); }} className="px-6 py-3 bg-[#1a1a1a] text-[#858585] hover:text-white rounded-xl text-sm transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Escape Autopsy Modal */}
        {autopsyTarget && (
          <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center z-50 p-4">
            <div className="bg-black border border-[#1a1a1a] rounded-2xl max-w-lg w-full p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-white font-medium">Escape Autopsy: {autopsyTarget.title}</h3>
                <button onClick={() => { setAutopsyTarget(null); setAutopsyData({ context: '', rationalization: '', prevention: '', intentionActivated: '', intentionFailReason: '', eventDate: '' }); }} className="text-[#858585] hover:text-white transition-colors">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M18 6L6 18M6 6l12 12" /></svg>
                </button>
              </div>
              <p className="text-[#858585] text-sm mb-5">Streak was {autopsyTarget.streak || 0} days. Capture what happened so the pattern becomes visible.</p>
              {autopsyData.eventDate && autopsyData.eventDate !== todayKey() && (
                <div className="mb-5 p-3 bg-[#0a0a0a] border-l-2 border-[#b45309] border-t border-r border-b border-[#1a1a1a] rounded-xl">
                  <p className="text-[#b45309] text-[10px] uppercase tracking-widest mb-1">Backfilled escape</p>
                  <p className="text-[#ababab] text-xs">Logging for {new Date(`${autopsyData.eventDate}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}.</p>
                </div>
              )}
              <div className="space-y-4">
                {/* Implementation intention check — only shown if target has one */}
                {autopsyTarget.implementationIntention?.trigger && (
                  <>
                    <div>
                      <label className="text-[#ababab] text-xs uppercase tracking-widest mb-2 block">Did your implementation intention activate? <span className="text-[#b45309]">*</span></label>
                      <div className="text-[#858585] text-xs mb-2 italic">{autopsyTarget.implementationIntention.trigger}</div>
                      <div className="flex gap-2">
                        {['yes', 'partially', 'no'].map(val => (
                          <button
                            key={val}
                            onClick={() => setAutopsyData(prev => ({ ...prev, intentionActivated: val, intentionFailReason: val === 'yes' ? '' : prev.intentionFailReason }))}
                            className={`flex-1 py-2 rounded-xl text-xs font-medium transition-all border ${
                              autopsyData.intentionActivated === val
                                ? val === 'yes' ? 'bg-[#1a1a1a] text-white border-white/40' : 'bg-[#1a1a1a] text-[#b45309] border-[#b45309]/40'
                                : 'bg-[#0a0a0a] text-[#858585] border-[#1a1a1a] hover:border-[#2a2a2a]'
                            }`}
                          >
                            {val.charAt(0).toUpperCase() + val.slice(1)}
                          </button>
                        ))}
                      </div>
                    </div>
                    {autopsyData.intentionActivated && autopsyData.intentionActivated !== 'yes' && (
                      <div>
                        <label className="text-[#ababab] text-xs uppercase tracking-widest mb-2 block">Why didn't it activate? <span className="text-[#b45309]">*</span></label>
                        <input
                          type="text"
                          value={autopsyData.intentionFailReason}
                          onChange={(e) => setAutopsyData(prev => ({ ...prev, intentionFailReason: e.target.value }))}
                          className="w-full p-3 bg-[#0a0a0a] text-white rounded-xl border border-[#1a1a1a] focus:border-[#ef4444] focus:outline-none text-sm placeholder-[#555555]"
                          placeholder="The trigger was present but the plan didn't fire because..."
                        />
                      </div>
                    )}
                  </>
                )}
                <div>
                  <label className="text-[#ababab] text-xs uppercase tracking-widest mb-2 block">What was happening right before?</label>
                  <textarea value={autopsyData.context} onChange={(e) => setAutopsyData(prev => ({ ...prev, context: e.target.value }))} rows={2} className="w-full p-3 bg-[#0a0a0a] text-white rounded-xl border border-[#1a1a1a] focus:border-[#ef4444] focus:outline-none resize-none text-sm placeholder-[#555555]" placeholder="The environment, state of mind, time of day..." />
                </div>
                <div>
                  <label className="text-[#ababab] text-xs uppercase tracking-widest mb-2 block">What did you tell yourself?</label>
                  <textarea value={autopsyData.rationalization} onChange={(e) => setAutopsyData(prev => ({ ...prev, rationalization: e.target.value }))} rows={2} className="w-full p-3 bg-[#0a0a0a] text-white rounded-xl border border-[#1a1a1a] focus:border-[#ef4444] focus:outline-none resize-none text-sm placeholder-[#555555]" placeholder="The rationalization that made it feel okay..." />
                </div>
                <div>
                  <label className="text-[#ababab] text-xs uppercase tracking-widest mb-2 block">What would have stopped it? <span className="text-[#858585]">(optional)</span></label>
                  <input type="text" value={autopsyData.prevention} onChange={(e) => setAutopsyData(prev => ({ ...prev, prevention: e.target.value }))} className="w-full p-3 bg-[#0a0a0a] text-white rounded-xl border border-[#1a1a1a] focus:border-[#ef4444] focus:outline-none text-sm placeholder-[#555555]" placeholder="One thing that would have changed the outcome..." />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={submitAutopsy} disabled={!autopsyData.context.trim() || !autopsyData.rationalization.trim()} className="flex-1 py-3 bg-[#b45309] hover:bg-[#92400e] disabled:bg-[#1a1a1a] disabled:text-[#858585] text-white rounded-xl font-medium text-sm transition-all">
                  Record Autopsy
                </button>
                <button onClick={() => { setAutopsyTarget(null); setAutopsyData({ context: '', rationalization: '', prevention: '', intentionActivated: '', intentionFailReason: '', eventDate: '' }); }} className="px-6 py-3 bg-[#1a1a1a] text-[#858585] hover:text-white rounded-xl text-sm transition-colors">
                  Skip
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Oracle Modal */}
        <OracleModal
          isOpen={oracleModal.isOpen}
          onClose={() => setOracleModal({ isOpen: false, content: '', isLoading: false, entryCount: null })}
          content={oracleModal.content}
          isLoading={oracleModal.isLoading}
          entryText={oracleEntryTextRef.current}
          entryModuleName="Kill List"
          entryCount={oracleModal.entryCount}
        />
        
      </div>
    </div>
  );
};

export default KillList;