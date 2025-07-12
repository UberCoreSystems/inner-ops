import React, { useState, useEffect } from 'react';
import { writeData, readUserData } from '../utils/firebaseUtils';
import { aiUtils } from '../utils/aiUtils';
import { generateAIFeedback } from '../utils/aiFeedback';
import VoiceInputButton from '../components/VoiceInputButton';
import OracleModal from '../components/OracleModal';

const moodOptions = [
  { emoji: '🔥', label: 'Burning', value: 'burning' },
  { emoji: '🌊', label: 'Drowning', value: 'drowning' },
  { emoji: '⚡', label: 'Electric', value: 'electric' },
  { emoji: '🌫️', label: 'Foggy', value: 'foggy' },
  { emoji: '🗡️', label: 'Sharp', value: 'sharp' },
  { emoji: '🕳️', label: 'Hollow', value: 'hollow' },
  { emoji: '🌪️', label: 'Chaotic', value: 'chaotic' },
  { emoji: '🌑', label: 'Void', value: 'void' },
  { emoji: '👑', label: 'Triumphant', value: 'triumphant' },
  { emoji: '🌌', label: 'Transcendent', value: 'transcendent' }
];

const intensityLevels = [
  { value: 1, label: 'Very Low' },
  { value: 2, label: 'Low' },
  { value: 3, label: 'Moderate' },
  { value: 4, label: 'High' },
  { value: 5, label: 'Very High' }
];

export default function Journal() {
  const [entry, setEntry] = useState('');
  const [mood, setMood] = useState(moodOptions[0].value);
  const [intensity, setIntensity] = useState(3);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [aiReflections, setAiReflections] = useState([]);
  const [oracleModal, setOracleModal] = useState({ isOpen: false, content: '', isLoading: false });

  useEffect(() => {
    loadJournalEntries();
  }, []);

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
                  <div className="text-2xl mb-1">{option.emoji}</div>
                  <div className="text-sm text-gray-300">{option.label}</div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-gray-400 mb-3">Intensity Level</label>
            <div className="flex items-center space-x-4">
              <input
                type="range"
                min="1"
                max="5"
                value={intensity}
                onChange={(e) => {
                  const newIntensity = parseInt(e.target.value);
                  setIntensity(newIntensity);
                  // Generate AI reflections based on mood and intensity
                  const reflections = aiUtils.generateJournalReflection(mood, newIntensity, entry);
                  setAiReflections(reflections);
                }}
                className="flex-1 h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer"
              />
              <span className="text-white font-medium w-20">
                {intensityLevels.find(level => level.value === intensity)?.label}
              </span>
            </div>
          </div>

          <div>
            <label className="block text-gray-400 mb-3">What's on your mind?</label>

            <div className="mb-3">
              <label className="block text-gray-400 mb-2">Journal Prompts (click to use)</label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-3">
                {[
                  "What illusion did I mistake for reality today?",
                  "Which of my reactions revealed a hidden weakness?",
                  "What fear am I feeding that keeps me small?",
                  "Where did I betray my own standards today?",
                  "What pattern keeps repeating that I refuse to see?",
                  "If I could rebuild today with no excuses, what would change?"
                ].map((prompt, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setEntry(prev => prev + (prev ? '\n\n' : '') + prompt + '\n');
                      // Update AI reflections when prompt is used
                      const reflections = aiUtils.generateJournalReflection(mood, intensity, entry + prompt);
                      setAiReflections(reflections);
                    }}
                    className="text-left p-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded text-sm"
                  >
                    {prompt}
                  </button>
                ))}
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
                      <span className="text-2xl">{moodOption?.emoji}</span>
                      <span className="text-gray-400">
                        {moodOption?.label} - {intensityLabel}
                      </span>
                    </div>
                    <span className="text-sm text-gray-500">
                      {new Date(entry.createdAt).toLocaleDateString()} at {new Date(entry.createdAt).toLocaleTimeString()}
                    </span>
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
