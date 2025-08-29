import React, { useState, useEffect } from 'react';
import { writeData, readUserData, deleteData } from '../utils/firebaseUtils';
import { aiUtils } from '../utils/aiUtils';
import { generateAIFeedback } from '../utils/aiFeedback';
import VoiceInputButton from '../components/VoiceInputButton';
import OracleModal from '../components/OracleModal';

const moodOptions = [
  { emoji: '⚡', label: 'Electric', value: 'electric' },
  { emoji: '�️', label: 'Foggy', value: 'foggy' },
  { emoji: '🗡️', label: 'Sharp', value: 'sharp' },
  { emoji: '🕳️', label: 'Hollow', value: 'hollow' },
  { emoji: '🌪️', label: 'Chaotic', value: 'chaotic' },
  { emoji: '�', label: 'Triumphant', value: 'triumphant' },
  { emoji: '🪨', label: 'Heavy', value: 'heavy' },
  { emoji: '🦋', label: 'Light', value: 'light' },
  { emoji: '🎯', label: 'Focused', value: 'focused' },
  { emoji: '💎', label: 'Radiant', value: 'radiant' }
];

const intensityLevels = [
  { value: 1, label: 'Flickering', icon: '🕯️', description: 'Barely there' },
  { value: 2, label: 'Glowing', icon: '🔥', description: 'Gentle warmth' },
  { value: 3, label: 'Burning', icon: '🔥🔥', description: 'Steady flame' },
  { value: 4, label: 'Blazing', icon: '🔥🔥🔥', description: 'Intense heat' },
  { value: 5, label: 'Inferno', icon: '🔥🔥🔥🔥', description: 'White hot' }
];

export default function Journal() {
  const [entry, setEntry] = useState('');
  const [mood, setMood] = useState(moodOptions[0].value);
  const [intensity, setIntensity] = useState(3);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [aiReflections, setAiReflections] = useState([]);
  const [oracleModal, setOracleModal] = useState({ isOpen: false, content: '', isLoading: false });
  
  // State for rotating prompts
  const [currentPromptIndex, setCurrentPromptIndex] = useState(0);
  const [promptVisible, setPromptVisible] = useState(true);

  const journalPrompts = [
    "What am I most grateful for today?",
    "What challenged me and how did I handle it?",
    "What patterns am I noticing in my behavior?",
    "What triggered strong emotions today?",
    "What would I do differently if I could replay today?",
    "What small win can I celebrate today?",
    "What fear held me back today?",
    "What am I learning about myself?"
  ];

  useEffect(() => {
    loadJournalEntries();
  }, []);

  // Effect for rotating prompts
  useEffect(() => {
    const interval = setInterval(() => {
      // Fade out
      setPromptVisible(false);
      
      // After fade out completes, change prompt and fade in
      setTimeout(() => {
        setCurrentPromptIndex((prev) => (prev + 1) % journalPrompts.length);
        setPromptVisible(true);
      }, 300); // Half of the transition duration
      
    }, 3000); // Change every 3 seconds

    return () => clearInterval(interval);
  }, [journalPrompts.length]);

  const loadJournalEntries = async () => {
    const savedEntries = await readUserData('journalEntries');
    setEntries(savedEntries);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!entry.trim()) return;

    setLoading(true);

    try {
      // Generate AI feedback first
      const moodLabel = moodOptions.find(m => m.value === mood)?.label || mood;
      const inputText = `Mood: ${moodLabel} (${intensity}/5)\n${entry}`;
      const pastEntries = entries.slice(-3).map(e => e.content);
      
      // Show Oracle modal with loading state
      setOracleModal({ isOpen: true, content: '', isLoading: true });

      const feedback = await generateAIFeedback('journal', inputText, pastEntries);
      
      // Show Oracle feedback in modal
      setOracleModal({ isOpen: true, content: feedback, isLoading: false });

      // Save entry with Oracle feedback
      const newEntry = await writeData('journalEntries', {
        content: entry,
        mood,
        intensity,
        oracleJudgment: feedback
      });
      setEntries(prev => [newEntry, ...prev]);

      // Clear form
      setEntry('');
      setMood(moodOptions[0].value);
      setIntensity(3);
      setAiReflections([]);

    } catch (error) {
      console.error("Error saving journal entry:", error);
      setOracleModal({ 
        isOpen: true, 
        content: "The Oracle encounters interference in the cosmic currents... Your thoughts are still sacred. Please try again in a moment.", 
        isLoading: false 
      });
    } finally {
      setLoading(false);
    }
  };

  // Delete journal entry
  const deleteEntry = async (entryId) => {
    if (!window.confirm('Are you sure you want to delete this journal entry? This action cannot be undone.')) {
      return;
    }

    try {
      console.log("🗑️ Journal: Deleting entry:", entryId);
      await deleteData('journalEntries', entryId);
      console.log('✅ Journal: Entry deleted successfully');
      
      // Update local state immediately
      setEntries(prev => prev.filter(entry => entry.id !== entryId));
      
      // Show success message
      alert('Journal entry deleted successfully.');
    } catch (error) {
      console.error('❌ Journal: Error deleting entry:', error);
      alert('Failed to delete journal entry. Please try again.');
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">📝 Journal</h1>
        <p className="text-gray-400">Capture your thoughts and reflect on your journey</p>
        <div className="mt-2 text-sm text-green-300">
          ✍️ Each entry: +10 clarity points | 7-day streak: +50 bonus | 30-day streak: +200 bonus
        </div>
      </div>

      {/* Entry Form */}
      <div className="bg-gray-800 rounded-lg p-6 mb-8">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* AI Reflections */}
          {aiReflections.length > 0 && (
            <div className="mb-6 p-4 bg-purple-900/30 border border-purple-500/30 rounded-lg">
              <h3 className="text-purple-300 font-medium mb-3">🤖 AI Reflection Insights</h3>
              <div className="space-y-2">
                {aiReflections.map((reflection, idx) => (
                  <div key={idx} className="text-purple-200 text-sm bg-purple-800/20 p-2 rounded">
                    {reflection}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="block text-gray-400 mb-3">How are you feeling?</label>
            <div className="grid grid-cols-5 gap-3">
              {moodOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setMood(option.value)}
                  className={`p-3 rounded-lg border-2 transition-colors ${
                    mood === option.value
                      ? 'border-blue-500 bg-blue-500/20'
                      : 'border-gray-600 hover:border-gray-500'
                  }`}
                >
                  <div className="text-xl mb-1">{option.emoji}</div>
                  <div className="text-sm text-gray-300">{option.label}</div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-gray-400 mb-3">Intensity Level</label>
            <div className="space-y-4">
              {/* Fire icons row */}
              <div className="flex justify-between items-center px-2">
                {intensityLevels.map((level) => (
                  <button
                    key={level.value}
                    type="button"
                    onClick={() => {
                      setIntensity(level.value);
                      // Generate AI reflections based on mood and intensity
                      const reflections = aiUtils.generateJournalReflection(mood, level.value, entry);
                      setAiReflections(reflections);
                    }}
                    className="flex flex-col items-center transition-all duration-200 hover:scale-110"
                  >
                    <div className="text-2xl mb-2">{level.icon}</div>
                    <div className={`w-4 h-4 rounded-full border-2 transition-colors ${
                      intensity === level.value
                        ? 'bg-orange-500 border-orange-500'
                        : 'border-gray-500 hover:border-orange-400'
                    }`}></div>
                  </button>
                ))}
              </div>
              
              {/* Selected intensity description */}
              <div className="text-center">
                <div className="text-white font-medium">
                  {intensityLevels.find(level => level.value === intensity)?.label}
                </div>
                <div className="text-gray-400 text-sm">
                  {intensityLevels.find(level => level.value === intensity)?.description}
                </div>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-gray-400 mb-3">What's on your mind?</label>

            <div className="mb-3">
              <label className="block text-gray-400 mb-2">Journal Prompt</label>
              <div className="mb-3 h-16 flex items-center justify-center">
                <button
                  type="button"
                  onClick={() => {
                    const currentPrompt = journalPrompts[currentPromptIndex];
                    setEntry(prev => prev + (prev ? '\n\n' : '') + currentPrompt + '\n');
                    // Update AI reflections when prompt is used
                    const reflections = aiUtils.generateJournalReflection(mood, intensity, entry + currentPrompt);
                    setAiReflections(reflections);
                  }}
                  className={`text-center p-4 bg-gradient-to-r from-purple-700 to-blue-700 hover:from-purple-600 hover:to-blue-600 text-white rounded-lg text-sm font-medium transition-all duration-600 transform ${
                    promptVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
                  } min-h-[4rem] flex items-center justify-center shadow-lg hover:shadow-xl max-w-2xl mx-auto`}
                  style={{
                    transition: 'opacity 0.6s ease-in-out, transform 0.6s ease-in-out'
                  }}
                >
                  <span className="text-center leading-relaxed">
                    {journalPrompts[currentPromptIndex]}
                  </span>
                </button>
              </div>
              <div className="text-center">
                <p className="text-xs text-gray-500 mb-2">
                  Prompt {currentPromptIndex + 1} of {journalPrompts.length} • Click to add to your entry
                </p>
                <div className="flex justify-center space-x-1">
                  {journalPrompts.map((_, index) => (
                    <div
                      key={index}
                      className={`w-2 h-2 rounded-full transition-colors duration-300 ${
                        index === currentPromptIndex ? 'bg-blue-500' : 'bg-gray-600'
                      }`}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="relative">
              <textarea
                value={entry}
                onChange={(e) => setEntry(e.target.value)}
                rows={6}
                className="w-full p-4 pr-14 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none resize-none"
                placeholder="Write about your day, thoughts, feelings, challenges, or victories..."
                required
              />
              <div className="absolute right-2 top-2">
                <VoiceInputButton
                  onTranscript={(transcript) => {
                    setEntry(prev => prev + (prev ? ' ' : '') + transcript);
                    // Update AI reflections when voice input is used
                    const reflections = aiUtils.generateJournalReflection(mood, intensity, entry + transcript);
                    setAiReflections(reflections);
                  }}
                  disabled={loading}
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || !entry.trim()}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white py-3 rounded-lg transition-colors"
          >
            {loading ? 'Saving...' : 'Save Entry'}
          </button>
        </form>
      </div>

      {/* Previous Entries */}
      <div>
        <h2 className="text-xl font-bold text-white mb-4">Previous Entries</h2>
        {entries.length > 0 ? (
          <div className="space-y-4">
            {entries.map((entry) => {
              const moodOption = moodOptions.find(m => m.value === entry.mood);
              const intensityLabel = intensityLevels.find(i => i.value === entry.intensity)?.label;

              return (
                <div key={entry.id} className="bg-gray-800 rounded-lg p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-3">
                      <span className="text-xl">{moodOption?.emoji}</span>
                      <span className="text-gray-400">
                        {moodOption?.label} - {intensityLabel}
                      </span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <span className="text-sm text-gray-500">
                        {new Date(entry.createdAt).toLocaleDateString()} at {new Date(entry.createdAt).toLocaleTimeString()}
                      </span>
                      <button
                        onClick={() => deleteEntry(entry.id)}
                        className="px-2 py-1 bg-red-600/80 text-white rounded text-xs hover:bg-red-600 transition-colors opacity-75 hover:opacity-100"
                        title="Delete this entry"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                  <p className="text-gray-300 leading-relaxed mb-4">{entry.content}</p>

                  {entry.oracleJudgment && (
                    <div className="mt-4 p-4 bg-gray-900/50 border border-gray-600 rounded-lg">
                      <h4 className="text-gray-300 font-medium mb-2">📜 Oracle's Judgment</h4>
                      <div className="text-gray-200 text-sm leading-relaxed whitespace-pre-line">
                        {entry.oracleJudgment}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-12">
            <p className="text-gray-400 text-lg">No journal entries yet. Start writing!</p>
          </div>
        )}
      </div>

      {/* Oracle Modal */}
      <OracleModal
        isOpen={oracleModal.isOpen}
        onClose={() => setOracleModal({ isOpen: false, content: '', isLoading: false })}
        content={oracleModal.content}
        isLoading={oracleModal.isLoading}
      />
    </div>
  );
}
