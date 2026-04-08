import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { writeData, readUserData, deleteData, updateData } from '../utils/firebaseUtils';
import { generateAIFeedback } from '../utils/aiFeedback';
import OracleModal from '../components/OracleModal';
import ouraToast from '../utils/toast';
import { useOracleModal } from '../hooks/useOracleModal';
import logger from '../utils/logger';
import { SkeletonList, SkeletonCard } from '../components/SkeletonLoader';

// Event categories for Hard Lessons
const eventCategories = [
  { value: 'relationship_misjudgment', label: 'Relationship Misjudgment', icon: '💔' },
  { value: 'leadership_error', label: 'Leadership Error', icon: '👑' },
  { value: 'boundary_failure', label: 'Boundary Failure', icon: '🚧' },
  { value: 'overconfidence', label: 'Overconfidence', icon: '🎯' },
  { value: 'underestimation', label: 'Underestimation', icon: '⚖️' },
  { value: 'ignored_intuition', label: 'Ignored Intuition', icon: '🔮' },
  { value: 'physiological_misread', label: 'Hormonal/Physiological Misread', icon: '🧬' },
  { value: 'trust_without_verification', label: 'Trust Given Without Verification', icon: '🤝' },
  { value: 'other', label: 'Other', icon: '⚡' }
];

// Cost categories for tracking real consequences
const costCategories = [
  { value: 'emotional', label: 'Emotional', icon: '💭' },
  { value: 'financial', label: 'Financial', icon: '💰' },
  { value: 'relational', label: 'Relational', icon: '👥' },
  { value: 'physical', label: 'Physical', icon: '🏥' },
  { value: 'professional', label: 'Professional', icon: '💼' },
  { value: 'time', label: 'Time/Opportunity', icon: '⏰' }
];

export default function HardLessons() {
  // Form state for new lesson
  const [newLesson, setNewLesson] = useState({
    eventCategory: '',
    eventDescription: '',
    myAssumption: '',
    signalIgnored: '',
    costs: [],
    costDescription: '',
    extractedLesson: '',
    ruleGoingForward: '',
    isFinalized: false
  });

  // Module state
  const [lessons, setLessons] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [showSkeleton, setShowSkeleton] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingLesson, setEditingLesson] = useState(null);
  const { oracleModal, openLoading: openOracleLoading, openWithContent: openOracleWithContent, close: closeOracle } = useOracleModal();
  const [pendingOracleReaction, setPendingOracleReaction] = useState(null);
  const [pendingOracleWisdom, setPendingOracleWisdom] = useState('');
  const pendingLessonDeletes = useRef(new Map());
  const autoOpenedIds = useRef(new Set());

  // Scar Inventory state (first-time guided flow)
  const [scarInventory, setScarInventory] = useState(['', '', '']);
  const [showScarFlow, setShowScarFlow] = useState(false);
  const [savingScars, setSavingScars] = useState(false);

  useEffect(() => {
    loadHardLessons();
  }, []);

  // Delay showing skeleton to prevent flicker
  useEffect(() => {
    const skeletonTimer = setTimeout(() => {
      if (initialLoading) {
        setShowSkeleton(true);
      }
    }, 250);

    return () => clearTimeout(skeletonTimer);
  }, [initialLoading]);

  // Keep skeleton visible briefly once data arrives to avoid blink
  useEffect(() => {
    let dwellTimer;
    if (!initialLoading && showSkeleton) {
      dwellTimer = setTimeout(() => setShowSkeleton(false), 300);
    }
    return () => clearTimeout(dwellTimer);
  }, [initialLoading, showSkeleton]);

  const loadHardLessons = async () => {
    setInitialLoading(true);
    setLoadError(false);
    try {
      const savedLessons = await readUserData('hardLessons');
      setLessons(savedLessons || []);
    } catch (error) {
      logger.error('❌ Error loading hard lessons:', error);
      setLoadError(true);
    } finally {
      setInitialLoading(false);
    }
  };

  // Show scar flow when lessons load empty (first time), unless skipped this session
  useEffect(() => {
    if (!initialLoading && lessons.length === 0 && !sessionStorage.getItem('scar_flow_skipped')) {
      setShowScarFlow(true);
    }
  }, [initialLoading, lessons.length]);

  // Auto-open the form if we arrived with an Oracle-extracted draft (from Journal bridge)
  useEffect(() => {
    if (initialLoading || lessons.length === 0) return;
    const extracted = lessons.find(l => l.isOracleExtracted && !l.isFinalized && !autoOpenedIds.current.has(l.id));
    if (extracted) {
      // Track in a session ref so reloads of lessons state don't re-trigger the effect
      autoOpenedIds.current.add(extracted.id);
      setNewLesson({
        eventCategory: extracted.eventCategory || '',
        eventDescription: extracted.eventDescription || '',
        myAssumption: extracted.myAssumption || '',
        signalIgnored: extracted.signalIgnored || '',
        costs: Array.isArray(extracted.costs) ? extracted.costs : [],
        costDescription: extracted.costDescription || '',
        extractedLesson: extracted.extractedLesson || '',
        ruleGoingForward: extracted.ruleGoingForward || '',
        isFinalized: false,
      });
      setEditingLesson(extracted);
      setShowForm(true);
      setShowScarFlow(false);
      // Scroll to top after a tick so the form is visible
      setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 100);
    }
  }, [initialLoading, lessons]);

  const submitScarInventory = async () => {
    const filled = scarInventory.filter(s => s.trim().length > 0);
    if (filled.length === 0) return;

    setSavingScars(true);
    try {
      const newLessons = [];
      for (const scar of filled) {
        const stub = await writeData('hardLessons', {
          eventCategory: '',
          eventDescription: scar.trim(),
          myAssumption: '',
          signalIgnored: '',
          costs: [],
          costDescription: '',
          extractedLesson: '',
          ruleGoingForward: '',
          isFinalized: false,
          isScarStub: true,
          createdAt: new Date().toISOString(),
        });
        newLessons.push(stub);
      }
      setLessons(prev => [...newLessons, ...prev]);
      setShowScarFlow(false);
      setScarInventory(['', '', '']);
      ouraToast.success(`${filled.length} scar${filled.length > 1 ? 's' : ''} recorded. Complete each record to lock in the lesson.`);
    } catch (error) {
      logger.error('Error saving scar inventory:', error);
      ouraToast.error('Failed to save scars');
    } finally {
      setSavingScars(false);
    }
  };

  const costFrequency = useMemo(() => {
    if (lessons.length === 0) return [];
    const counts = {};
    lessons.forEach(l => {
      (l.costs || []).forEach(cost => {
        counts[cost] = (counts[cost] || 0) + 1;
      });
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([value, count]) => {
        const def = costCategories.find(c => c.value === value);
        return { value, label: def?.label ?? value, icon: def?.icon ?? '⚡', count };
      });
  }, [lessons]);

  const filteredLessons = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    if (!normalizedQuery) return lessons;

    return lessons.filter((lesson) => {
      const categoryLabel = eventCategories.find(cat => cat.value === lesson.eventCategory)?.label || '';
      const statusLabel = lesson.isFinalized ? 'finalized' : 'draft';
      const haystack = [
        categoryLabel,
        lesson.eventDescription,
        lesson.myAssumption,
        lesson.signalIgnored,
        lesson.costDescription,
        lesson.extractedLesson,
        lesson.ruleGoingForward,
        statusLabel
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes(normalizedQuery);
    });
  }, [lessons, searchQuery, eventCategories]);

  const handleCostToggle = (costValue) => {
    setNewLesson(prev => ({
      ...prev,
      costs: prev.costs.includes(costValue)
        ? prev.costs.filter(c => c !== costValue)
        : [...prev.costs, costValue]
    }));
  };

  const validateLesson = () => {
    const fieldLabels = {
      eventCategory: 'Event Category',
      eventDescription: 'Event Description',
      myAssumption: 'My Assumption',
      signalIgnored: 'Signal Ignored',
      costDescription: 'Cost Description',
      extractedLesson: 'Extracted Lesson',
      ruleGoingForward: 'Rule Going Forward',
    };

    const required = [
      'eventCategory',
      'eventDescription',
      'myAssumption',
      'signalIgnored',
      'costDescription',
      'extractedLesson',
      'ruleGoingForward'
    ];

    for (const field of required) {
      if (!newLesson[field]?.trim()) {
        ouraToast.warning(`Please complete: ${fieldLabels[field] ?? field}`);
        return false;
      }
    }

    if (newLesson.costs.length === 0) {
      ouraToast.warning('Please select at least one cost category');
      return false;
    }

    return true;
  };

  const handleOracleReaction = (reactionId) => {
    setPendingOracleReaction(reactionId);
  };

  const seekOracleExtraction = async () => {
    if (!validateLesson()) return;

    setPendingOracleReaction(null);
    setPendingOracleWisdom('');
    openOracleLoading();

    try {
      const extractionPrompt = `
Event: ${newLesson.eventDescription}
My Assumption: ${newLesson.myAssumption}
Signal Ignored: ${newLesson.signalIgnored}
Cost: ${newLesson.costDescription}
Category: ${eventCategories.find(cat => cat.value === newLesson.eventCategory)?.label}

Please help extract the core lesson and rule from this experience.
`;

      const oracleWisdom = await generateAIFeedback('hardLessons', extractionPrompt, lessons.slice(-3));
      setPendingOracleWisdom(oracleWisdom);
      openOracleWithContent(oracleWisdom);

    } catch (error) {
      logger.error('Error seeking Oracle extraction:', error);
      openOracleWithContent('The Oracle cannot pierce the veil at this moment. Trust your own extraction of wisdom.');
    }
  };

  const submitLesson = async (finalize = false) => {
    if (!validateLesson()) return;

    setLoading(true);

    try {
      const lessonData = {
        ...newLesson,
        isFinalized: finalize,
        finalizedAt: finalize ? new Date().toISOString() : null,
        ...(pendingOracleReaction ? { oracleReaction: pendingOracleReaction } : {}),
        ...(pendingOracleWisdom ? { oracleWisdom: pendingOracleWisdom } : {})
      };

      if (editingLesson) {
        // Handle edits with immutability constraints
        if (editingLesson.isFinalized) {
          ouraToast.info('Finalized lessons cannot be edited. Create a new entry if the rule was violated again.');
          setLoading(false);
          return;
        }

        lessonData.originalCreatedAt = editingLesson.createdAt;
        await updateData('hardLessons', editingLesson.id, lessonData);
      } else {
        await writeData('hardLessons', lessonData);
      }

      await loadHardLessons();
      resetForm();

      if (finalize) {
        ouraToast.achievement('Hard Lesson finalized and locked');
      } else {
        ouraToast.success('Hard Lesson saved');
      }

    } catch (error) {
      logger.error('Error saving Hard Lesson:', error);
      ouraToast.error('Failed to save Hard Lesson');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setNewLesson({
      eventCategory: '',
      eventDescription: '',
      myAssumption: '',
      signalIgnored: '',
      costs: [],
      costDescription: '',
      extractedLesson: '',
      ruleGoingForward: '',
      isFinalized: false
    });
    setShowForm(false);
    setEditingLesson(null);
    setPendingOracleWisdom('');
    setPendingOracleReaction(null);
  };

  const editLesson = (lesson) => {
    if (lesson.isFinalized) {
      ouraToast.info('This lesson is finalized. Create a new entry if the rule was violated again.');
      return;
    }

    setNewLesson({ ...lesson, isScarStub: false, isWeeklyAutopsy: false });
    setEditingLesson(lesson);
    setShowForm(true);
  };

  const deleteLesson = async (lessonId) => {
    const lesson = lessons.find(l => l.id === lessonId);
    const lessonIndex = lessons.findIndex(l => l.id === lessonId);

    if (lesson?.isFinalized) {
      ouraToast.info('Finalized lessons cannot be deleted. They are permanent strategic assets.');
      return;
    }

    if (!lesson) return;

    if (!window.confirm('Delete this Hard Lesson? You can undo within 5 seconds.')) {
      return;
    }

    setLessons(prev => prev.filter(l => l.id !== lessonId));

    const existingPending = pendingLessonDeletes.current.get(lessonId);
    if (existingPending) {
      clearTimeout(existingPending.timeoutId);
      pendingLessonDeletes.current.delete(lessonId);
    }

    const undoDelete = () => {
      const pending = pendingLessonDeletes.current.get(lessonId);
      if (!pending) return;

      clearTimeout(pending.timeoutId);
      pendingLessonDeletes.current.delete(lessonId);

      setLessons(prev => {
        if (prev.some(l => l.id === lessonId)) return prev;
        const next = [...prev];
        const insertIndex = Math.min(pending.index, next.length);
        next.splice(insertIndex, 0, pending.lesson);
        return next;
      });

      ouraToast.dismiss(pending.toastId);
      ouraToast.success('Deletion undone');
    };

    const toastId = ouraToast.warning(
      <div className="flex items-center gap-3">
        <span>Hard Lesson deleted</span>
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
        await deleteData('hardLessons', lessonId);
      } catch (error) {
        logger.error('Error deleting Hard Lesson:', error);
        setLessons(prev => {
          if (prev.some(l => l.id === lessonId)) return prev;
          const next = [...prev];
          const insertIndex = Math.min(lessonIndex, next.length);
          next.splice(insertIndex, 0, lesson);
          return next;
        });
        ouraToast.error('Failed to delete lesson');
      } finally {
        pendingLessonDeletes.current.delete(lessonId);
      }
    }, 5000);

    pendingLessonDeletes.current.set(lessonId, { timeoutId, lesson, index: lessonIndex, toastId });
  };

  // Derive which of the 7 form fields are complete
  const formSteps = [
    { key: 'eventCategory',    label: 'Category',   done: !!newLesson.eventCategory },
    { key: 'eventDescription', label: 'Event',       done: !!newLesson.eventDescription?.trim() },
    { key: 'myAssumption',     label: 'Assumption',  done: !!newLesson.myAssumption?.trim() },
    { key: 'signalIgnored',    label: 'Signal',      done: !!newLesson.signalIgnored?.trim() },
    { key: 'costs',            label: 'Cost',        done: newLesson.costs.length > 0 && !!newLesson.costDescription?.trim() },
    { key: 'extractedLesson',  label: 'Lesson',      done: !!newLesson.extractedLesson?.trim() },
    { key: 'ruleGoingForward', label: 'Rule',        done: !!newLesson.ruleGoingForward?.trim() },
  ];
  const completedSteps = formSteps.filter(s => s.done).length;

  return (
    <div className="min-h-screen bg-black">
      <div className="max-w-6xl mx-auto p-6">
        {/* Header */}
        <div className="mb-8 animate-fade-in-up">
          <h1 className="text-4xl font-bold text-white mb-3">⚡ Hard Lessons</h1>
          <p className="text-[#8a8a8a] text-lg mb-4">
            Forensic extraction of irreversible signal from irreversible pain
          </p>
          <div className="oura-card p-4 border-l-4 border-[#f59e0b]">
            <p className="text-sm text-[#8a8a8a]">
              <span className="text-[#f59e0b] font-semibold">Purpose:</span> Ensure the same lesson is never paid for twice. Memory with teeth.
            </p>
          </div>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-3 gap-4 mb-8 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
          <div className="oura-card p-6 text-center">
            <div className="text-[#5a5a5a] text-xs uppercase tracking-widest mb-2">Total Lessons</div>
            <div className="oura-score text-white">{lessons.length}</div>
          </div>
          <div className="oura-card p-6 text-center">
            <div className="text-[#5a5a5a] text-xs uppercase tracking-widest mb-2">Finalized</div>
            <div className="oura-score text-[#22c55e]">{lessons.filter(l => l.isFinalized).length}</div>
          </div>
          <div className="oura-card p-6 text-center">
            <div className="text-[#5a5a5a] text-xs uppercase tracking-widest mb-2">Draft</div>
            <div className="oura-score text-[#f59e0b]">{lessons.filter(l => !l.isFinalized).length}</div>
          </div>
        </div>

        {/* Cost type distribution */}
        {costFrequency.length >= 2 && (
          <div className="oura-card p-5 mb-8 animate-fade-in-up" style={{ animationDelay: '0.15s' }}>
            <h3 className="text-xs text-[#5a5a5a] uppercase tracking-widest mb-4">Cost Distribution</h3>
            <div className="space-y-2.5">
              {costFrequency.map(({ value, label, icon, count }) => {
                const maxCount = costFrequency[0].count;
                const pct = Math.round((count / maxCount) * 100);
                return (
                  <div key={value} className="flex items-center gap-3">
                    <div className="text-sm w-4 shrink-0">{icon}</div>
                    <div className="text-[#8a8a8a] text-xs w-28 shrink-0 truncate">{label}</div>
                    <div className="flex-1 bg-[#1a1a1a] rounded-full h-1.5 overflow-hidden">
                      <div
                        className="h-1.5 rounded-full bg-[#f59e0b] transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="text-[#5a5a5a] text-xs w-4 text-right shrink-0">{count}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Action Button */}
        <div className="mb-8 animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
          <button
            onClick={() => setShowForm(!showForm)}
            className="px-6 py-3 bg-[#f59e0b] hover:bg-[#ea580c] text-white rounded-2xl transition-all duration-300 font-medium"
          >
            {showForm ? 'Cancel' : '⚡ Extract New Lesson'}
          </button>
        </div>

      {/* Lesson Extraction Form */}
      {showForm && (
        <div className="oura-card p-8 mb-8 border-l-4 border-[#f59e0b] animate-fade-in-up" style={{ animationDelay: '0.3s' }}>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-2xl font-bold text-white">
              {editingLesson ? 'Edit Hard Lesson (Draft)' : 'Extract Hard Lesson'}
            </h2>
            <span className="text-sm text-[#5a5a5a] font-light tabular-nums">
              <span className={completedSteps === 7 ? 'text-[#22c55e]' : 'text-[#f59e0b]'}>
                {completedSteps}
              </span>
              <span>/7 complete</span>
            </span>
          </div>

          {/* Step progress bar */}
          <div className="mb-8">
            <div className="flex items-center gap-1.5 mb-2">
              {formSteps.map((step, i) => (
                <div key={step.key} className="flex-1 flex flex-col items-center gap-1">
                  <div className={`h-1.5 w-full rounded-full transition-all duration-300 ${
                    step.done ? 'bg-[#f59e0b]' : 'bg-[#1a1a1a]'
                  }`} />
                  <span className={`text-[9px] uppercase tracking-wide leading-none transition-colors duration-200 ${
                    step.done ? 'text-[#f59e0b]' : 'text-[#3a3a3a]'
                  }`}>{step.label}</span>
                </div>
              ))}
            </div>
          </div>

          {newLesson.isOracleFailed && (
            <div className="mb-6 px-4 py-3 rounded-xl border border-[#ef4444]/30 bg-[#ef4444]/5 text-sm text-[#ef4444]">
              Oracle extraction failed. The event description below is raw journal content — edit it before finalizing.
            </div>
          )}

          <div className="space-y-6">
            {/* Event Category */}
            <div>
              <label className="flex items-center gap-2 text-sm uppercase tracking-wider mb-4">
                <span className={newLesson.eventCategory ? 'text-[#f59e0b]' : 'text-[#8a8a8a]'}>Event Category</span>
                {newLesson.eventCategory && <span className="text-[#22c55e] text-xs">✓</span>}
              </label>
              <div className="grid grid-cols-3 gap-3">
                {eventCategories.map(cat => (
                  <button
                    key={cat.value}
                    type="button"
                    onClick={() => setNewLesson(prev => ({ ...prev, eventCategory: cat.value }))}
                    className={`p-4 rounded-2xl border transition-all duration-300 text-left ${
                      newLesson.eventCategory === cat.value
                        ? 'border-[#f59e0b] bg-[#f59e0b]/10 scale-105'
                        : 'border-[#1a1a1a] hover:border-[#2a2a2a] bg-[#0a0a0a]'
                    }`}
                  >
                    <div className="text-xl mb-2">{cat.icon}</div>
                    <div className="text-xs text-[#8a8a8a]">{cat.label}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* The Event */}
            <div>
              <label className="flex items-center gap-2 text-sm uppercase tracking-wider mb-3">
                <span className={newLesson.eventDescription?.trim() ? 'text-[#f59e0b]' : 'text-[#8a8a8a]'}>The Event</span>
                {newLesson.eventDescription?.trim() ? <span className="text-[#22c55e] text-xs">✓</span> : <span className="text-[#f59e0b]">*</span>}
              </label>
              <p className="text-xs text-[#5a5a5a] mb-3">What actually happened (no interpretation, just facts)</p>
              <textarea
                id="hard-lessons-event"
                value={newLesson.eventDescription}
                onChange={(e) => setNewLesson(prev => ({ ...prev, eventDescription: e.target.value }))}
                rows={3}
                className="w-full p-4 bg-[#0a0a0a] text-white rounded-2xl border border-[#1a1a1a] focus:border-[#f59e0b] focus:outline-none transition-colors resize-none"
                placeholder="Describe the concrete event that occurred..."
              />
            </div>

            {/* My Assumption */}
            <div>
              <label className="flex items-center gap-2 text-sm uppercase tracking-wider mb-3">
                <span className={newLesson.myAssumption?.trim() ? 'text-[#f59e0b]' : 'text-[#8a8a8a]'}>My Assumption</span>
                {newLesson.myAssumption?.trim() ? <span className="text-[#22c55e] text-xs">✓</span> : <span className="text-[#f59e0b]">*</span>}
              </label>
              <p className="text-xs text-[#5a5a5a] mb-3">What you believed that turned out to be false</p>
              <textarea
                value={newLesson.myAssumption}
                onChange={(e) => setNewLesson(prev => ({ ...prev, myAssumption: e.target.value }))}
                rows={2}
                className="w-full p-4 bg-[#0a0a0a] text-white rounded-2xl border border-[#1a1a1a] focus:border-[#f59e0b] focus:outline-none transition-colors resize-none"
                placeholder="I assumed that..."
              />
            </div>

            {/* The Signal I Ignored */}
            <div>
              <label className="flex items-center gap-2 text-sm uppercase tracking-wider mb-3">
                <span className={newLesson.signalIgnored?.trim() ? 'text-[#f59e0b]' : 'text-[#8a8a8a]'}>The Signal I Ignored</span>
                {newLesson.signalIgnored?.trim() ? <span className="text-[#22c55e] text-xs">✓</span> : <span className="text-[#f59e0b]">*</span>}
              </label>
              <p className="text-xs text-[#5a5a5a] mb-3">The warning you noticed but discounted</p>
              <textarea
                value={newLesson.signalIgnored}
                onChange={(e) => setNewLesson(prev => ({ ...prev, signalIgnored: e.target.value }))}
                rows={2}
                className="w-full p-4 bg-[#0a0a0a] text-white rounded-2xl border border-[#1a1a1a] focus:border-[#f59e0b] focus:outline-none transition-colors resize-none"
                placeholder="I ignored the signal that..."
              />
            </div>

            {/* The Cost */}
            <div>
              <label className="flex items-center gap-2 text-sm uppercase tracking-wider mb-3">
                <span className={(newLesson.costs.length > 0 && newLesson.costDescription?.trim()) ? 'text-[#f59e0b]' : 'text-[#8a8a8a]'}>The Cost</span>
                {(newLesson.costs.length > 0 && newLesson.costDescription?.trim()) ? <span className="text-[#22c55e] text-xs">✓</span> : <span className="text-[#f59e0b]">*</span>}
              </label>
              <p className="text-xs text-[#5a5a5a] mb-3">Real consequences (select all that apply)</p>

              <div className="grid grid-cols-3 gap-2 mb-4">
                {costCategories.map(cost => (
                  <button
                    key={cost.value}
                    type="button"
                    onClick={() => handleCostToggle(cost.value)}
                    className={`p-3 rounded-xl border text-left text-sm transition-all duration-300 ${
                      newLesson.costs.includes(cost.value)
                        ? 'border-[#f59e0b] bg-[#f59e0b]/10 text-white scale-105'
                        : 'border-[#1a1a1a] hover:border-[#2a2a2a] text-[#8a8a8a] bg-[#0a0a0a]'
                    }`}
                  >
                    <span className="mr-2">{cost.icon}</span>
                    {cost.label}
                  </button>
                ))}
              </div>

              <textarea
                value={newLesson.costDescription}
                onChange={(e) => setNewLesson(prev => ({ ...prev, costDescription: e.target.value }))}
                rows={2}
                className="w-full p-4 bg-[#0a0a0a] text-white rounded-2xl border border-[#1a1a1a] focus:border-[#f59e0b] focus:outline-none transition-colors resize-none"
                placeholder="Describe the specific costs you paid..."
              />
            </div>

            {/* The Lesson */}
            <div>
              <label className="flex items-center gap-2 text-sm uppercase tracking-wider mb-3">
                <span className={newLesson.extractedLesson?.trim() ? 'text-[#f59e0b]' : 'text-[#8a8a8a]'}>The Lesson</span>
                {newLesson.extractedLesson?.trim() ? <span className="text-[#22c55e] text-xs">✓</span> : <span className="text-[#f59e0b]">*</span>}
              </label>
              <p className="text-xs text-[#5a5a5a] mb-3">One sentence. Brutally precise.</p>
              <input
                type="text"
                value={newLesson.extractedLesson}
                onChange={(e) => setNewLesson(prev => ({ ...prev, extractedLesson: e.target.value }))}
                className="w-full p-4 bg-[#0a0a0a] text-white rounded-2xl border border-[#1a1a1a] focus:border-[#f59e0b] focus:outline-none transition-colors"
                placeholder="The core lesson is..."
              />
            </div>

            {/* The Rule Going Forward */}
            <div>
              <label className="flex items-center gap-2 text-sm uppercase tracking-wider mb-3">
                <span className={newLesson.ruleGoingForward?.trim() ? 'text-[#f59e0b]' : 'text-[#8a8a8a]'}>The Rule Going Forward</span>
                {newLesson.ruleGoingForward?.trim() ? <span className="text-[#22c55e] text-xs">✓</span> : <span className="text-[#f59e0b]">*</span>}
              </label>
              <p className="text-xs text-[#5a5a5a] mb-3">An enforceable constraint, not advice</p>
              <input
                type="text"
                value={newLesson.ruleGoingForward}
                onChange={(e) => setNewLesson(prev => ({ ...prev, ruleGoingForward: e.target.value }))}
                className="w-full p-4 bg-[#0a0a0a] text-white rounded-2xl border border-[#1a1a1a] focus:border-[#f59e0b] focus:outline-none transition-colors"
                placeholder='If... then... / Always... / Never...'
              />
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap gap-3 pt-6 border-t border-[#1a1a1a]">
              <button
                onClick={() => submitLesson(false)}
                disabled={loading}
                className="px-6 py-3 bg-[#f59e0b] hover:bg-[#ea580c] disabled:bg-[#1a1a1a] disabled:text-[#5a5a5a] text-white rounded-2xl transition-all duration-300 font-medium"
              >
                {loading ? 'Saving...' : 'Save Draft'}
              </button>

              <button
                onClick={() => submitLesson(true)}
                disabled={loading}
                className="px-6 py-3 bg-[#ef4444] hover:bg-[#dc2626] disabled:bg-[#1a1a1a] disabled:text-[#5a5a5a] text-white rounded-2xl transition-all duration-300 font-medium"
              >
                {loading ? 'Finalizing...' : 'Finalize Lesson'}
              </button>

              <button
                onClick={seekOracleExtraction}
                disabled={loading}
                className="px-6 py-3 bg-[#a855f7] hover:bg-[#9333ea] disabled:bg-[#1a1a1a] disabled:text-[#5a5a5a] text-white rounded-2xl transition-all duration-300 font-medium"
              >
                🔮 Ask Oracle to Extract Lesson & Rule
              </button>

              <button
                onClick={resetForm}
                className="px-6 py-3 bg-[#0a0a0a] hover:bg-[#1a1a1a] text-[#8a8a8a] rounded-2xl transition-all duration-300 font-medium border border-[#1a1a1a]"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lessons List */}
      <section className="animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <h3 className="text-[#5a5a5a] text-xs uppercase tracking-widest">
            Extracted Lessons
            {searchQuery.trim() && (
              <span className="text-[#3a3a3a] ml-2">({filteredLessons.length}/{lessons.length})</span>
            )}
          </h3>
          <div className="relative w-full sm:w-80">
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search lessons..."
              className="w-full px-4 py-2.5 bg-[#0a0a0a] text-white rounded-xl border border-[#1a1a1a] focus:border-[#f59e0b] focus:outline-none transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#5a5a5a] hover:text-white text-xs"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        <div className="relative">
          <div className={`fade-pane ${initialLoading && showSkeleton ? 'visible' : 'hidden'}`}>
            <SkeletonList count={3} ItemComponent={SkeletonCard} />
          </div>

          <div className={`fade-pane ${initialLoading || showSkeleton ? 'hidden' : 'visible'}`}>
            {loadError ? (
              <div className="oura-card p-12 text-center">
                <p className="text-[#ef4444] mb-4 text-sm">Failed to load hard lessons. Please check your connection.</p>
                <button
                  onClick={loadHardLessons}
                  className="px-5 py-2.5 bg-[#ef4444]/10 text-[#ef4444] border border-[#ef4444]/30 rounded-xl hover:bg-[#ef4444]/20 transition-colors text-sm font-medium"
                >
                  Retry
                </button>
              </div>
            ) : filteredLessons.length > 0 ? (
              <div className="space-y-4">
                {filteredLessons.map((lesson) => {
                  const category = eventCategories.find(cat => cat.value === lesson.eventCategory);
                  const selectedCosts = costCategories.filter(cost => lesson.costs?.includes(cost.value));

                  // Weekly autopsy stubs get a compact card with "Expand Autopsy" CTA
                  if (lesson.isWeeklyAutopsy && !lesson.isFinalized) {
                    return (
                      <div key={lesson.id} className="oura-card p-5 border-dashed border-[#6366f1]/30">
                        <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-[#6366f1] text-xs uppercase tracking-widest font-medium">Weekly Autopsy</span>
                              <span className="text-[#5a5a5a] text-xs">{new Date(lesson.createdAt).toLocaleDateString()}</span>
                            </div>
                            <p className="text-[#d1d1d1] text-sm leading-relaxed truncate">{lesson.eventDescription}</p>
                          </div>
                          <div className="flex items-center gap-2 ml-4 shrink-0">
                            <button
                              onClick={() => editLesson(lesson)}
                              className="px-4 py-2 text-xs font-medium bg-[#6366f1]/10 text-[#6366f1] border border-[#6366f1]/30 rounded-xl hover:bg-[#6366f1]/20 transition-colors"
                            >
                              Expand Autopsy
                            </button>
                            <button
                              onClick={() => deleteLesson(lesson.id)}
                              className="w-8 h-8 flex items-center justify-center rounded-full bg-[#ef4444]/10 text-[#ef4444] hover:bg-[#ef4444]/20 transition-colors text-xs"
                            >
                              🗑️
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  }

                  // Scar stubs get a compact card
                  if (lesson.isScarStub && !lesson.extractedLesson) {
                    return (
                      <div key={lesson.id} className="oura-card p-5 border-dashed border-[#f59e0b]/30">
                        <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-[#f59e0b] text-xs uppercase tracking-widest font-medium">Scar</span>
                              <span className="text-[#5a5a5a] text-xs">{new Date(lesson.createdAt).toLocaleDateString()}</span>
                            </div>
                            <p className="text-[#d1d1d1] text-sm leading-relaxed truncate">{lesson.eventDescription}</p>
                          </div>
                          <div className="flex items-center gap-2 ml-4 shrink-0">
                            <button
                              onClick={() => editLesson(lesson)}
                              className="px-4 py-2 text-xs font-medium bg-[#f59e0b]/10 text-[#f59e0b] border border-[#f59e0b]/30 rounded-xl hover:bg-[#f59e0b]/20 transition-colors"
                            >
                              Extract Lesson
                            </button>
                            <button
                              onClick={() => deleteLesson(lesson.id)}
                              className="w-8 h-8 flex items-center justify-center rounded-full bg-[#ef4444]/10 text-[#ef4444] hover:bg-[#ef4444]/20 transition-colors text-xs"
                            >
                              🗑️
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div key={lesson.id} className={`oura-card p-6 ${
                      lesson.isFinalized
                        ? 'border-[#f59e0b]/50'
                        : 'border-[#f59e0b]/20'
                    }`}>
                      <div className="flex items-start justify-between mb-6">
                        <div className="flex items-center space-x-3">
                          <div className="w-12 h-12 rounded-full bg-[#0a0a0a] border border-[#1a1a1a] flex items-center justify-center">
                            <span className="text-2xl">{category?.icon || '⚡'}</span>
                          </div>
                          <div>
                            <h3 className="text-white font-medium">{category?.label || 'Uncategorized'}</h3>
                            <div className="flex items-center space-x-3 text-xs text-[#5a5a5a] mt-1">
                              <span>{new Date(lesson.createdAt).toLocaleDateString()}</span>
                              <span className={`px-2 py-1 rounded-lg ${
                                lesson.isFinalized
                                  ? 'bg-[#f59e0b]/10 text-[#f59e0b] border border-[#f59e0b]/30'
                                  : 'bg-[#8a8a8a]/10 text-[#8a8a8a] border border-[#2a2a2a]'
                              }`}>
                                {lesson.isFinalized ? '🔒 FINALIZED' : '📝 DRAFT'}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex space-x-2 items-center">
                          {!lesson.isFinalized && (
                            <button
                              onClick={() => editLesson(lesson)}
                              className="w-8 h-8 flex items-center justify-center rounded-full bg-[#4da6ff]/10 text-[#4da6ff] hover:bg-[#4da6ff]/20 transition-colors"
                            >
                              ✏️
                            </button>
                          )}
                          {!lesson.isFinalized && (
                            <button
                              onClick={() => deleteLesson(lesson.id)}
                              className="w-8 h-8 flex items-center justify-center rounded-full bg-[#ef4444]/10 text-[#ef4444] hover:bg-[#ef4444]/20 transition-colors"
                            >
                              🗑️
                            </button>
                          )}
                          {lesson.isFinalized && (
                            <span className="text-[#8a8a8a] text-xs">Permanent record. Create a new entry if the rule was violated again.</span>
                          )}
                        </div>
                      </div>

                      <div className="space-y-5">
                        <div>
                          <h4 className="text-[#8a8a8a] text-xs uppercase tracking-wider mb-2">The Event</h4>
                          <p className="text-[#d1d1d1] leading-relaxed">{lesson.eventDescription}</p>
                        </div>

                        <div>
                          <h4 className="text-[#8a8a8a] text-xs uppercase tracking-wider mb-2">My Assumption</h4>
                          <p className="text-[#d1d1d1] leading-relaxed">{lesson.myAssumption}</p>
                        </div>

                        <div>
                          <h4 className="text-[#8a8a8a] text-xs uppercase tracking-wider mb-2">The Signal I Ignored</h4>
                          <p className="text-[#d1d1d1] leading-relaxed">{lesson.signalIgnored}</p>
                        </div>

                        <div>
                          <h4 className="text-[#8a8a8a] text-xs uppercase tracking-wider mb-2">The Cost</h4>
                          <div className="flex items-center gap-2 mb-3">
                            {selectedCosts.map(cost => (
                              <span key={cost.value} className="px-2 py-1 bg-[#0a0a0a] text-[#8a8a8a] rounded-lg text-xs border border-[#1a1a1a]">
                                {cost.icon} {cost.label}
                              </span>
                            ))}
                          </div>
                          <p className="text-[#d1d1d1] leading-relaxed">{lesson.costDescription}</p>
                        </div>

                        <div className="border-t border-[#1a1a1a] pt-5">
                          <h4 className="text-white font-medium mb-2 text-sm uppercase tracking-wider">The Lesson</h4>
                          <p className="text-[#f59e0b] font-medium leading-relaxed">{lesson.extractedLesson}</p>
                        </div>

                        <div>
                          <h4 className="text-white font-medium mb-2 text-sm uppercase tracking-wider">The Rule Going Forward</h4>
                          <p className="text-[#fbbf24] font-medium border-l-4 border-[#f59e0b] pl-4 bg-[#f59e0b]/10 py-3 rounded-r-xl leading-relaxed">
                            {lesson.ruleGoingForward}
                          </p>
                        </div>

                        {/* Oracle wisdom — saved from extraction */}
                        {lesson.oracleWisdom && typeof lesson.oracleWisdom === 'string' && (
                          <div className="border-t border-[#1a1a1a] pt-5">
                            <div className="flex items-center gap-2 mb-2">
                              <div className="w-1.5 h-1.5 rounded-full bg-[#a855f7]" />
                              <h4 className="text-[#5a5a5a] font-medium text-xs uppercase tracking-wider">Oracle</h4>
                            </div>
                            <p className="text-[#8a8a8a] text-sm leading-relaxed">{lesson.oracleWisdom}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div>
                {searchQuery.trim() ? (
                  <div className="oura-card p-12 text-center">
                    <h3 className="text-lg font-light text-white mb-2">{`No matches for "${searchQuery.trim()}"`}</h3>
                    <p className="text-[#5a5a5a] mb-6 text-sm">Try a different keyword or clear the search.</p>
                    <button
                      onClick={() => setSearchQuery('')}
                      className="px-6 py-3 bg-transparent border border-[#1a1a1a] text-[#8a8a8a] hover:text-white hover:border-[#2a2a2a] rounded-2xl transition-all duration-300 font-medium"
                    >
                      Clear Search
                    </button>
                  </div>
                ) : showScarFlow ? (
                  /* ── Scar Inventory: first-time guided flow ── */
                  <div className="oura-card p-8 border-l-4 border-[#f59e0b] animate-fade-in-up">
                    <h2 className="text-2xl font-light text-white mb-2">Before you extract your first lesson, name 3 events that left you scarred.</h2>
                    <p className="text-[#5a5a5a] text-sm mb-8">No analysis. No explanation. Just name the events. You can extract the full lesson later.</p>

                    <div className="space-y-4">
                      {scarInventory.map((scar, i) => (
                        <div key={i} className="flex items-center gap-3">
                          <span className="text-[#f59e0b] text-sm font-medium tabular-nums w-5 shrink-0">{i + 1}.</span>
                          <input
                            type="text"
                            value={scar}
                            onChange={(e) => setScarInventory(prev => {
                              const next = [...prev];
                              next[i] = e.target.value;
                              return next;
                            })}
                            placeholder={
                              i === 0 ? 'The trust I gave that was used against me...' :
                              i === 1 ? 'The warning I ignored that cost me...' :
                              'The decision I made that changed everything...'
                            }
                            className="flex-1 p-4 bg-[#0a0a0a] text-white rounded-xl border border-[#1a1a1a] focus:border-[#f59e0b] focus:outline-none transition-colors placeholder-[#2a2a2a]"
                            autoFocus={i === 0}
                          />
                        </div>
                      ))}
                    </div>

                    <div className="flex flex-wrap gap-3 mt-8">
                      <button
                        onClick={submitScarInventory}
                        disabled={savingScars || scarInventory.every(s => !s.trim())}
                        className="px-6 py-3 bg-[#f59e0b] hover:bg-[#ea580c] disabled:bg-[#1a1a1a] disabled:text-[#5a5a5a] text-white rounded-2xl transition-all duration-300 font-medium"
                      >
                        {savingScars ? 'Saving...' : 'Record These Scars'}
                      </button>
                      <button
                        onClick={() => {
                          sessionStorage.setItem('scar_flow_skipped', 'true');
                          setShowScarFlow(false);
                          setShowForm(true);
                          setTimeout(() => {
                            document.getElementById('hard-lessons-event')?.focus();
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                          }, 0);
                        }}
                        className="px-6 py-3 bg-transparent border border-[#1a1a1a] text-[#5a5a5a] hover:text-white hover:border-[#2a2a2a] rounded-2xl transition-all duration-300 font-medium"
                      >
                        Skip — I'll extract a full lesson now
                      </button>
                    </div>
                  </div>
                ) : (
                  /* ── Standard empty state (after scar flow dismissed or skipped) ── */
                  <div className="oura-card p-12 text-center">
                    <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-[#0a0a0a] border border-[#1a1a1a] flex items-center justify-center text-2xl">
                      ⚡
                    </div>
                    <h3 className="text-lg font-light text-white mb-2">No Hard Lessons Extracted Yet</h3>
                    <p className="text-[#5a5a5a] mb-6 text-sm">Turn a painful event into an enforceable rule you never pay for twice.</p>
                    <button
                      onClick={() => {
                        setShowForm(true);
                        setTimeout(() => {
                          document.getElementById('hard-lessons-event')?.focus();
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }, 0);
                      }}
                      className="px-6 py-3 bg-[#f59e0b] hover:bg-[#ea580c] text-white rounded-2xl transition-all duration-300 font-medium"
                    >
                      Extract Your First Lesson
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Oracle Modal */}
      <OracleModal
        isOpen={oracleModal.isOpen}
        onClose={closeOracle}
        content={oracleModal.content}
        isLoading={oracleModal.isLoading}
        title="Oracle's Extraction Wisdom"
        onReaction={handleOracleReaction}
      />
      </div>
    </div>
  );
}
