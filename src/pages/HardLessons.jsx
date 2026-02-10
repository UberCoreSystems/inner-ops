import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { writeData, readUserData, deleteData } from '../utils/firebaseUtils';
import { generateAIFeedback } from '../utils/aiFeedback';
import OracleModal from '../components/OracleModal';
import VirtualizedList from '../components/VirtualizedList';
import ouraToast from '../utils/toast';
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
  const [initialLoading, setInitialLoading] = useState(true);
  const [showSkeleton, setShowSkeleton] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingLesson, setEditingLesson] = useState(null);
  const [oracleModal, setOracleModal] = useState({ isOpen: false, content: '', isLoading: false });
  const pendingLessonDeletes = useRef(new Map());

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
    const savedLessons = await readUserData('hardLessons');
    setLessons(savedLessons || []);
    setInitialLoading(false);
  };

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
        ouraToast.warning(`Please complete: ${field.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}`);
        return false;
      }
    }

    if (newLesson.costs.length === 0) {
      ouraToast.warning('Please select at least one cost category');
      return false;
    }

    return true;
  };

  const seekOracleExtraction = async () => {
    if (!validateLesson()) return;

    setOracleModal({ isOpen: true, content: '', isLoading: true });

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
      setOracleModal({ isOpen: true, content: oracleWisdom, isLoading: false });

    } catch (error) {
      logger.error('Error seeking Oracle extraction:', error);
      setOracleModal({
        isOpen: true,
        content: 'The Oracle cannot pierce the veil at this moment. Trust your own extraction of wisdom.',
        isLoading: false
      });
    }
  };

  const submitLesson = async (finalize = false) => {
    if (!validateLesson()) return;

    setLoading(true);

    try {
      const lessonData = {
        ...newLesson,
        isFinalized: finalize,
        finalizedAt: finalize ? new Date().toISOString() : null
      };

      if (editingLesson) {
        // Handle edits with immutability constraints
        if (editingLesson.isFinalized) {
          ouraToast.info('Finalized lessons cannot be edited. Create a new entry if the rule was violated again.');
          setLoading(false);
          return;
        }

        lessonData.id = editingLesson.id;
        lessonData.originalCreatedAt = editingLesson.createdAt;
        await writeData('hardLessons', lessonData, editingLesson.id);
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
  };

  const editLesson = (lesson) => {
    if (lesson.isFinalized) {
      ouraToast.info('This lesson is finalized. Create a new entry if the rule was violated again.');
      return;
    }

    setNewLesson(lesson);
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
          <h2 className="text-2xl font-bold text-white mb-6">
            {editingLesson ? 'Edit Hard Lesson (Draft)' : 'Extract Hard Lesson'}
          </h2>

          <div className="space-y-6">
            {/* Event Category */}
            <div>
              <label className="block text-[#8a8a8a] text-sm uppercase tracking-wider mb-4">Event Category</label>
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
              <label className="block text-[#8a8a8a] text-sm uppercase tracking-wider mb-3">
                The Event <span className="text-[#f59e0b]">*</span>
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
              <label className="block text-[#8a8a8a] text-sm uppercase tracking-wider mb-3">
                My Assumption <span className="text-[#f59e0b]">*</span>
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
              <label className="block text-[#8a8a8a] text-sm uppercase tracking-wider mb-3">
                The Signal I Ignored <span className="text-[#f59e0b]">*</span>
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
              <label className="block text-[#8a8a8a] text-sm uppercase tracking-wider mb-3">
                The Cost <span className="text-[#f59e0b]">*</span>
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
              <label className="block text-[#8a8a8a] text-sm uppercase tracking-wider mb-3">
                The Lesson <span className="text-[#f59e0b]">*</span>
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
              <label className="block text-[#8a8a8a] text-sm uppercase tracking-wider mb-3">
                The Rule Going Forward <span className="text-[#f59e0b]">*</span>
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
                🔮 Seek Oracle Extraction
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
            {filteredLessons.length > 0 ? (
              <VirtualizedList
                items={filteredLessons}
                itemHeight={420}
                maxHeight={800}
                renderItem={({ item: lesson }) => {
                  const category = eventCategories.find(cat => cat.value === lesson.eventCategory);
                  const selectedCosts = costCategories.filter(cost => lesson.costs?.includes(cost.value));

                  return (
                    <div key={lesson.id} className={`oura-card p-6 ${
                      lesson.isFinalized
                        ? 'border-[#f59e0b]/50'
                        : 'border-[#f59e0b]/20'
                    }`}>
                      <div className="flex items-start justify-between mb-6">
                        <div className="flex items-center space-x-3">
                          <div className="w-12 h-12 rounded-full bg-[#0a0a0a] border border-[#1a1a1a] flex items-center justify-center">
                            <span className="text-2xl">{category?.icon}</span>
                          </div>
                          <div>
                            <h3 className="text-white font-medium">{category?.label}</h3>
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

                        <div className="flex space-x-2">
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
                      </div>
                    </div>
                  );
                }}
              />
            ) : (
              <div className="oura-card p-12 text-center">
                <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-[#0a0a0a] border border-[#1a1a1a] flex items-center justify-center text-2xl">
                  ⚡
                </div>
                <h3 className="text-lg font-light text-white mb-2">
                  {searchQuery.trim() ? `No matches for “${searchQuery.trim()}”` : 'No Hard Lessons Extracted Yet'}
                </h3>
                <p className="text-[#5a5a5a] mb-6 text-sm">
                  {searchQuery.trim()
                    ? 'Try a different keyword or clear the search.'
                    : 'Turn a painful event into an enforceable rule you never pay for twice.'}
                </p>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                  {searchQuery.trim() ? (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="px-6 py-3 bg-transparent border border-[#1a1a1a] text-[#8a8a8a] hover:text-white hover:border-[#2a2a2a] rounded-2xl transition-all duration-300 font-medium"
                    >
                      Clear Search
                    </button>
                  ) : (
                    <>
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
                      <button
                        onClick={() => {
                          setShowForm(true);
                          setTimeout(() => {
                            document.getElementById('hard-lessons-event')?.focus();
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                          }, 0);
                        }}
                        className="px-6 py-3 bg-transparent border border-[#1a1a1a] text-[#8a8a8a] hover:text-white hover:border-[#2a2a2a] rounded-2xl transition-all duration-300 font-medium"
                      >
                        Start the Framework
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Oracle Modal */}
      <OracleModal
        isOpen={oracleModal.isOpen}
        onClose={() => setOracleModal({ isOpen: false, content: '', isLoading: false })}
        content={oracleModal.content}
        isLoading={oracleModal.isLoading}
        title="Oracle's Extraction Wisdom"
      />
      </div>
    </div>
  );
}
