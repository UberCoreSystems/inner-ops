import React, { useState, useEffect } from 'react';
import { writeData, readUserData } from '../utils/firebaseUtils';
import { aiUtils } from '../utils/aiUtils';
import { generateAIFeedback } from '../utils/aiFeedback';
import VoiceInputButton from '../components/VoiceInputButton';
import OracleModal from '../components/OracleModal';
import { createJournalEntry, getJournalEntries } from '../utils/journalUtils';




const moodOptions = [
  { emoji: '😊', label: 'Happy', value: 'happy' },
  { emoji: '😔', label: 'Sad', value: 'sad' },
  { emoji: '😠', label: 'Angry', value: 'angry' },
  { emoji: '😰', label: 'Anxious', value: 'anxious' },
  { emoji: '😴', label: 'Tired', value: 'tired' },
  { emoji: '😌', label: 'Calm', value: 'calm' },
  { emoji: '🤔', label: 'Thoughtful', value: 'thoughtful' },
  { emoji: '😕', label: 'Confused', value: 'confused' }
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
  const [aiFeedback, setAiFeedback] = useState('');
  const [loadingFeedback, setLoadingFeedback] = useState(false);
  const [showOracleModal, setShowOracleModal] = useState(false);
  const [pendingOracleFeedback, setPendingOracleFeedback] = useState('');

  useEffect(() => {
    loadJournalEntries();
  }, []);

 const loadJournalEntries = async () => {
  const savedEntries = await getJournalEntries();
  setEntries(savedEntries);
};
  

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!entry.trim()) return;

    setLoading(true);
    setLoadingFeedback(true);

    try {
      // Generate AI feedback
      const moodLabel = moodOptions.find(m => m.value === mood)?.label || mood;
      const inputText = `Mood: ${moodLabel} (${intensity}/5)\n${entry}`;
      const pastEntries = entries.slice(-3).map(e => e.content);
      const feedback = await generateAIFeedback('Journal', inputText, pastEntries);
      setLoadingFeedback(false);

      // Show oracle modal with mystical presentation
      setPendingOracleFeedback(feedback);
      setShowOracleModal(true);

      // Save entry with Oracle feedback
      const newEntry = await writeData('journalEntries', {
        content: entry,
        mood,
        intensity,
        oracleJudgment: feedback
      });
      setEntries(prev => [newEntry, ...prev]);

    } catch (error) {
      console.error("Error saving journal entry:", error);
      setLoadingFeedback(false);
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

          {/* Oracle Judgment Modal */}
          {showOracleModal && (
            <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 backdrop-blur-sm">
              <div className="relative max-w-2xl mx-4 w-full">
                {/* Mystical background effects */}
                <div className="absolute inset-0 bg-gradient-to-br from-blue-900/30 via-gray-900/50 to-black/70 rounded-lg animate-pulse"></div>
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-blue-500/10 to-transparent rounded-lg animate-pulse delay-1000"></div>

                {/* Main modal content */}
                <div className="relative bg-gray-900 border-2 border-blue-500/50 rounded-lg p-8 shadow-2xl">
                  {/* Mystical header */}
                  <div className="text-center mb-6">
                    <div className="text-6xl mb-4 animate-bounce">📜</div>
                    <h2 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent mb-2">
                      THE ORACLE'S WISDOM
                    </h2>
                    <div className="text-blue-300 text-sm mb-4 italic">
                      "Your soul's journey echoes through the ages..."
                    </div>
                    <div className="w-full h-px bg-gradient-to-r from-transparent via-blue-500 to-transparent mb-6"></div>
                  </div>

                  {/* Oracle's wisdom */}
                  <div className="mb-8">
                    <div className="bg-black/50 border border-blue-500/30 rounded-lg p-6 relative overflow-hidden">
                      {/* Mystical corner decorations */}
                      <div className="absolute top-2 left-2 text-blue-400 text-xs">◢</div>
                      <div className="absolute top-2 right-2 text-blue-400 text-xs">◣</div>
                      <div className="absolute bottom-2 left-2 text-blue-400 text-xs">◥</div>
                      <div className="absolute bottom-2 right-2 text-blue-400 text-xs">◤</div>

                      <div className="text-blue-200 leading-relaxed whitespace-pre-line text-center font-medium">
                        {pendingOracleFeedback}
                      </div>
                    </div>
                  </div>

                  {/* Accept judgment button */}
                  <div className="text-center">
                    <button
                      onClick={() => {
                        setAiFeedback(pendingOracleFeedback);
                        setShowOracleModal(false);
                        setPendingOracleFeedback('');
                      }}
                      className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-bold px-8 py-3 rounded-lg shadow-lg transform hover:scale-105 transition-all duration-200 border border-blue-400/50"
                    >
                      Receive the Oracle's Wisdom
                    </button>
                    <div className="text-blue-400 text-xs mt-2 italic">
                      "Truth illuminates the path of growth"
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* AI Philosophical Feedback */}
          {(aiFeedback || loadingFeedback) && (
            <div className="mt-4 p-4 bg-gray-900/50 border border-gray-600 rounded-lg">
              <h3 className="text-gray-300 font-medium mb-3">📜 Oracle's Judgment</h3>
              {loadingFeedback ? (
                <div className="text-gray-400 italic">Consulting ancient wisdom...</div>
              ) : (
                <div className="text-gray-200 text-sm leading-relaxed whitespace-pre-line">
                  {aiFeedback}
                </div>
              )}
            </div>
          )}

          <div>
            <label className="block text-gray-400 mb-3">How are you feeling?</label>
            <div className="grid grid-cols-4 gap-3">
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
                  "What am I most grateful for today?",
                  "What challenged me and how did I handle it?",
                  "What patterns am I noticing in my behavior?",
                  "What triggered strong emotions today?",
                  "What would I do differently if I could replay today?",
                  "What small win can I celebrate today?",
                  "What fear held me back today?",
                  "What am I learning about myself?"
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

          {/* AI Philosophical Feedback near save button */}
          {(aiFeedback || loadingFeedback) && (
            <div className="mt-4 p-4 bg-gray-900/50 border border-gray-600 rounded-lg">
              <h3 className="text-gray-300 font-medium mb-3">📜 Oracle's Judgment</h3>
              {loadingFeedback ? (
                <div className="text-gray-400 italic">Consulting ancient wisdom...</div>
              ) : (
                <div className="text-gray-200 text-sm leading-relaxed whitespace-pre-line">
                  {aiFeedback}
                </div>
              )}
            </div>
          )}

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
        isOpen={showOracleModal}
        onClose={() => setShowOracleModal(false)}
        feedback={aiFeedback}
        loading={loadingFeedback}
      />
    </div>
  );
}