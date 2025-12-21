import React, { useState, useEffect } from 'react';
import { writeData, readUserData, deleteData } from '../utils/firebaseUtils';
import { generateAIFeedback } from '../utils/aiFeedback';
import OracleModal from '../components/OracleModal';

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
        alert(`Please complete: ${field.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}`);
        return false;
      }
    }

    if (newLesson.costs.length === 0) {
      alert('Please select at least one cost category');
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
          alert('Finalized lessons cannot be edited. Create a new entry if the rule was violated again.');
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
        alert('Hard Lesson finalized and locked. The extraction is complete.');
      }

    } catch (error) {
      console.error('Error saving Hard Lesson:', error);
      alert('Failed to save Hard Lesson. Please try again.');
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
      alert('This lesson is finalized and immutable. Create a new entry if the rule was violated again.');
      return;
    }
    
    setNewLesson(lesson);
    setEditingLesson(lesson);
    setShowForm(true);
  };

  const deleteLesson = async (lessonId) => {
    const lesson = lessons.find(l => l.id === lessonId);
    
    if (lesson?.isFinalized) {
      alert('Finalized lessons cannot be deleted. They are part of your permanent strategic assets.');
      return;
    }

    if (!window.confirm('Delete this Hard Lesson? This action cannot be undone.')) {
      return;
    }

    try {
      await deleteData('hardLessons', lessonId);
      setLessons(prev => prev.filter(l => l.id !== lessonId));
    } catch (error) {
      console.error('Error deleting Hard Lesson:', error);
      alert('Failed to delete lesson. Please try again.');
    }
  };

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="max-w-6xl mx-auto px-6 py-12">
        <div className="text-center mb-12 fade-in">
          <h1 className="text-2xl font-light text-white mb-2 tracking-wide">⚡ Hard Lessons</h1>
          <p className="text-gray-500 text-sm font-light mb-4">
            Forensic extraction of irreversible signal from irreversible pain
          </p>
          <div className="text-sm text-red-300 bg-gradient-to-br from-red-900/20 to-red-800/10 p-4 rounded-2xl border border-red-500/20 glass-morphism max-w-2xl mx-auto">
            <strong className="font-light">Purpose:</strong> Ensure the same lesson is never paid for twice. Memory with teeth.
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 mb-8 items-center justify-center">
          <button
            onClick={() => setShowForm(!showForm)}
            className="px-6 py-3 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white rounded-2xl transition-all duration-300 font-light tracking-wide shadow-lg hover:shadow-xl transform hover:scale-[1.02]"
          >
            {showForm ? 'Cancel' : '⚡ Extract New Lesson'}
          </button>
          
          <div className="text-sm text-gray-400 flex items-center gap-6 font-light">
            <span>Total Lessons: {lessons.length}</span>
            <span>Finalized: {lessons.filter(l => l.isFinalized).length}</span>
            <span>Draft: {lessons.filter(l => !l.isFinalized).length}</span>
          </div>
        </div>
        
        {/* Lesson Extraction Form */}
        {showForm && (
          <div className="bg-gradient-to-br from-gray-900/80 to-gray-950/80 backdrop-blur-sm rounded-3xl p-8 mb-8 border border-red-500/20 oura-card">
            <h2 className="text-xl font-light text-white mb-6 tracking-wide">
              {editingLesson ? 'Edit Hard Lesson (Draft)' : 'Extract Hard Lesson'}
            </h2>
          
          <div className="space-y-6">
            {/* Event Category */}
            <div>
              <label className="block text-gray-400 mb-2 font-medium">Event Category</label>
              <div className="grid grid-cols-3 gap-3">
                {eventCategories.map(cat => (
                  <button
                    key={cat.value}
                    type="button"
                    onClick={() => setNewLesson(prev => ({ ...prev, eventCategory: cat.value }))}
                    className={`p-3 rounded border-2 transition-colors text-left ${
                      newLesson.eventCategory === cat.value
                        ? 'border-red-500 bg-red-500/20'
                        : 'border-gray-600 hover:border-gray-500'
                    }`}
                  >
                    <div className="text-lg mb-1">{cat.icon}</div>
                    <div className="text-sm text-gray-300">{cat.label}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* The Event */}
            <div>
              <label className="block text-gray-400 mb-2 font-medium">
                The Event <span className="text-red-400">*</span>
              </label>
              <p className="text-xs text-gray-500 mb-2">What actually happened (no interpretation, just facts)</p>
              <textarea
                value={newLesson.eventDescription}
                onChange={(e) => setNewLesson(prev => ({ ...prev, eventDescription: e.target.value }))}
                rows={3}
                className="w-full p-3 bg-gray-700 text-white rounded border border-gray-600 focus:border-red-500 focus:outline-none"
                placeholder="Describe the concrete event that occurred..."
              />
            </div>

            {/* My Assumption */}
            <div>
              <label className="block text-gray-400 mb-2 font-medium">
                My Assumption <span className="text-red-400">*</span>
              </label>
              <p className="text-xs text-gray-500 mb-2">What you believed that turned out to be false</p>
              <textarea
                value={newLesson.myAssumption}
                onChange={(e) => setNewLesson(prev => ({ ...prev, myAssumption: e.target.value }))}
                rows={2}
                className="w-full p-3 bg-gray-700 text-white rounded border border-gray-600 focus:border-red-500 focus:outline-none"
                placeholder="I assumed that..."
              />
            </div>

            {/* The Signal I Ignored */}
            <div>
              <label className="block text-gray-400 mb-2 font-medium">
                The Signal I Ignored <span className="text-red-400">*</span>
              </label>
              <p className="text-xs text-gray-500 mb-2">The warning you noticed but discounted</p>
              <textarea
                value={newLesson.signalIgnored}
                onChange={(e) => setNewLesson(prev => ({ ...prev, signalIgnored: e.target.value }))}
                rows={2}
                className="w-full p-3 bg-gray-700 text-white rounded border border-gray-600 focus:border-red-500 focus:outline-none"
                placeholder="I ignored the signal that..."
              />
            </div>

            {/* The Cost */}
            <div>
              <label className="block text-gray-400 mb-2 font-medium">
                The Cost <span className="text-red-400">*</span>
              </label>
              <p className="text-xs text-gray-500 mb-2">Real consequences (select all that apply)</p>
              
              <div className="grid grid-cols-3 gap-2 mb-3">
                {costCategories.map(cost => (
                  <button
                    key={cost.value}
                    type="button"
                    onClick={() => handleCostToggle(cost.value)}
                    className={`p-2 rounded border text-left transition-colors ${
                      newLesson.costs.includes(cost.value)
                        ? 'border-red-500 bg-red-500/20 text-white'
                        : 'border-gray-600 hover:border-gray-500 text-gray-300'
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
                className="w-full p-3 bg-gray-700 text-white rounded border border-gray-600 focus:border-red-500 focus:outline-none"
                placeholder="Describe the specific costs you paid..."
              />
            </div>

            {/* The Lesson */}
            <div>
              <label className="block text-gray-400 mb-2 font-medium">
                The Lesson <span className="text-red-400">*</span>
              </label>
              <p className="text-xs text-gray-500 mb-2">One sentence. Brutally precise.</p>
              <input
                type="text"
                value={newLesson.extractedLesson}
                onChange={(e) => setNewLesson(prev => ({ ...prev, extractedLesson: e.target.value }))}
                className="w-full p-3 bg-gray-700 text-white rounded border border-gray-600 focus:border-red-500 focus:outline-none"
                placeholder="The core lesson is..."
              />
            </div>

            {/* The Rule Going Forward */}
            <div>
              <label className="block text-gray-400 mb-2 font-medium">
                The Rule Going Forward <span className="text-red-400">*</span>
              </label>
              <p className="text-xs text-gray-500 mb-2">An enforceable constraint, not advice</p>
              <input
                type="text"
                value={newLesson.ruleGoingForward}
                onChange={(e) => setNewLesson(prev => ({ ...prev, ruleGoingForward: e.target.value }))}
                className="w-full p-3 bg-gray-700 text-white rounded border border-gray-600 focus:border-red-500 focus:outline-none"
                placeholder='If... then... / Always... / Never...'
              />
            </div>

            {/* Action Buttons */}
            <div className="flex gap-4 pt-4 border-t border-gray-600">
              <button
                onClick={() => submitLesson(false)}
                disabled={loading}
                className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-600 text-white rounded transition-colors"
              >
                {loading ? 'Saving...' : 'Save Draft'}
              </button>
              
              <button
                onClick={() => submitLesson(true)}
                disabled={loading}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 text-white rounded transition-colors"
              >
                {loading ? 'Finalizing...' : 'Finalize Lesson'}
              </button>

              <button
                onClick={seekOracleExtraction}
                disabled={loading}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 text-white rounded transition-colors"
              >
                🔮 Seek Oracle Extraction
              </button>

              <button
                onClick={resetForm}
                className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lessons List */}
      <div>
        <h2 className="text-xl font-bold text-white mb-4">Extracted Lessons</h2>
        
        {lessons.length > 0 ? (
          <div className="space-y-6">
            {lessons.map((lesson) => {
              const category = eventCategories.find(cat => cat.value === lesson.eventCategory);
              const selectedCosts = costCategories.filter(cost => lesson.costs?.includes(cost.value));

              return (
                <div key={lesson.id} className={`rounded-lg p-6 border-2 ${
                  lesson.isFinalized 
                    ? 'bg-gray-900/50 border-red-500/50' 
                    : 'bg-gray-800 border-yellow-500/50'
                }`}>
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center space-x-3">
                      <span className="text-2xl">{category?.icon}</span>
                      <div>
                        <h3 className="text-white font-semibold">{category?.label}</h3>
                        <div className="flex items-center space-x-4 text-sm text-gray-400">
                          <span>{new Date(lesson.createdAt).toLocaleDateString()}</span>
                          <span className={`px-2 py-1 rounded text-xs ${
                            lesson.isFinalized 
                              ? 'bg-red-900/30 text-red-300 border border-red-500/30' 
                              : 'bg-yellow-900/30 text-yellow-300 border border-yellow-500/30'
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
                          className="px-2 py-1 bg-blue-600/80 text-white rounded text-xs hover:bg-blue-600 transition-colors"
                        >
                          Edit
                        </button>
                      )}
                      {!lesson.isFinalized && (
                        <button
                          onClick={() => deleteLesson(lesson.id)}
                          className="px-2 py-1 bg-red-600/80 text-white rounded text-xs hover:bg-red-600 transition-colors"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <h4 className="text-gray-300 font-medium mb-1">The Event</h4>
                      <p className="text-gray-200">{lesson.eventDescription}</p>
                    </div>

                    <div>
                      <h4 className="text-gray-300 font-medium mb-1">My Assumption</h4>
                      <p className="text-gray-200">{lesson.myAssumption}</p>
                    </div>

                    <div>
                      <h4 className="text-gray-300 font-medium mb-1">The Signal I Ignored</h4>
                      <p className="text-gray-200">{lesson.signalIgnored}</p>
                    </div>

                    <div>
                      <h4 className="text-gray-300 font-medium mb-1">The Cost</h4>
                      <div className="flex items-center gap-2 mb-2">
                        {selectedCosts.map(cost => (
                          <span key={cost.value} className="px-2 py-1 bg-gray-700 text-gray-300 rounded text-xs">
                            {cost.icon} {cost.label}
                          </span>
                        ))}
                      </div>
                      <p className="text-gray-200">{lesson.costDescription}</p>
                    </div>

                    <div className="border-t border-gray-600 pt-4">
                      <h4 className="text-white font-medium mb-1">The Lesson</h4>
                      <p className="text-red-300 font-medium">{lesson.extractedLesson}</p>
                    </div>

                    <div>
                      <h4 className="text-white font-medium mb-1">The Rule Going Forward</h4>
                      <p className="text-red-200 font-medium border-l-4 border-red-500 pl-4 bg-red-900/20 py-2">
                        {lesson.ruleGoingForward}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-12 text-gray-400">
            <div className="text-6xl mb-4">⚡</div>
            <h3 className="text-lg font-semibold mb-2">No Hard Lessons Extracted Yet</h3>
            <p className="text-gray-500 mb-4">
              When pain demands wisdom, extract the lesson here.
            </p>
            <button
              onClick={() => setShowForm(true)}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded transition-colors"
            >
              Extract Your First Lesson
            </button>
          </div>
        )}
      </div>

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