import React, { useState, useEffect } from 'react';
import { writeData, readUserData, deleteData } from '../utils/firebaseUtils';
import { generateAIFeedback } from '../utils/aiFeedback';
import OracleModal from '../components/OracleModal';
import ouraToast from '../utils/toast';

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
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingLesson, setEditingLesson] = useState(null);
  const [oracleModal, setOracleModal] = useState({ isOpen: false, content: '', isLoading: false });

  useEffect(() => {
    loadHardLessons();
  }, []);

  const loadHardLessons = async () => {
    const savedLessons = await readUserData('hardLessons');
    setLessons(savedLessons || []);
  };

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
      console.error('Error seeking Oracle extraction:', error);
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
      console.error('Error saving Hard Lesson:', error);
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
    
    if (lesson?.isFinalized) {
      ouraToast.info('Finalized lessons cannot be deleted. They are permanent strategic assets.');
      return;
    }

    if (!window.confirm('Delete this Hard Lesson? This action cannot be undone.')) {
      return;
    }

    try {
      await deleteData('hardLessons', lessonId);
      setLessons(prev => prev.filter(l => l.id !== lessonId));
      ouraToast.success('Hard Lesson deleted');
    } catch (error) {
      console.error('Error deleting Hard Lesson:', error);
      ouraToast.error('Failed to delete lesson');
    }
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
        <h3 className="text-[#5a5a5a] text-xs uppercase tracking-widest mb-4">Extracted Lessons</h3>
        
        {lessons.length > 0 ? (
          <div className="space-y-6">
            {lessons.map((lesson) => {
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
            })}
          </div>
        ) : (
          <div className="oura-card p-12 text-center">
            <div className="text-6xl mb-4 opacity-30">⚡</div>
            <h3 className="text-lg font-semibold text-[#8a8a8a] mb-2">No Hard Lessons Extracted Yet</h3>
            <p className="text-[#5a5a5a] mb-6 text-sm">
              When pain demands wisdom, extract the lesson here.
            </p>
            <button
              onClick={() => setShowForm(true)}
              className="px-6 py-3 bg-[#f59e0b] hover:bg-[#ea580c] text-white rounded-2xl transition-all duration-300 font-medium"
            >
              Extract Your First Lesson
            </button>
          </div>
        )}
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