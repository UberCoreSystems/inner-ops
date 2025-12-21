import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { writeData, readUserData } from '../utils/firebaseUtils';
import { generateAIFeedback } from '../utils/aiFeedback';
import VoiceInputButton from './VoiceInputButton';
import OracleModal from './OracleModal';
import VirtualizedList from './VirtualizedList';

const philosophicalQuotes = [
  "He who is not satisfied with a little, is satisfied with nothing. - Epicurus",
  "The unexamined life is not worth living. - Socrates",
  "We suffer more in imagination than in reality. - Seneca",
  "You have power over your mind - not outside events. Realize this, and you will find strength. - Marcus Aurelius",
  "Man is disturbed not by things, but by the views he takes on things. - Epictetus",
  "The way is not in the sky. The way is in the heart. - Buddha",
  "He who conquers himself is the mightiest warrior. - Confucius",
  "The mind is everything. What you think you become. - Buddha",
  "Knowing yourself is the beginning of all wisdom. - Aristotle",
  "The only true wisdom is in knowing you know nothing. - Socrates",
  "What we plant in the soil of contemplation, we shall reap in the harvest of action. - Meister Eckhart",
  "The greatest remedy for anger is delay. - Seneca",
  "He who knows that enough is enough will always have enough. - Lao Tzu",
  "The superior man is modest in his speech, but exceeds in his actions. - Confucius",
  "Turn your wounds into wisdom. - Rumi",
  "Yesterday I was clever, so I wanted to change the world. Today I am wise, so I am changing myself. - Rumi",
  "The cave you fear to enter holds the treasure you seek. - Joseph Campbell",
  "Between stimulus and response there is a space. In that space is our power to choose our response. - Viktor Frankl",
  "Everything can be taken from a man but one thing: The last of human freedoms - to choose one's attitude. - Viktor Frankl",
  "The whole secret of existence is to have no fear. Never fear what will become of you. - Swami Vivekananda"
];

const BlackMirror = () => {
  const [screenTime, setScreenTime] = useState('');
  const [mentalFog, setMentalFog] = useState(5);
  const [interactionLevel, setInteractionLevel] = useState(5);
  const [unconsciousCheck, setUnconsciousCheck] = useState(false);
  const [reflection, setReflection] = useState('');
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [aiFeedback, setAiFeedback] = useState('');
  const [loadingFeedback, setLoadingFeedback] = useState(false);
  const [showOracleModal, setShowOracleModal] = useState(false);

  // Calculate Black Mirror Index - stable reference
  const calculateBlackMirrorIndex = useCallback((screenTimeValue, mentalFogValue, interactionValue, unconsciousCheckValue) => {
    const screenTime_num = parseFloat(screenTimeValue) || 0;
    const fogWeight = 2.5;
    const screenWeight = 8;
    const interactionWeight = -2;
    const checkPenalty = unconsciousCheckValue ? 8 : 0;

    return Math.round(
      screenWeight * screenTime_num + 
      fogWeight * mentalFogValue + 
      interactionWeight * interactionValue + 
      checkPenalty
    );
  }, []);

  // Current Black Mirror Index for display
  const currentIndex = useMemo(() => {
    if (!screenTime) return 0;
    return calculateBlackMirrorIndex(screenTime, mentalFog, interactionLevel, unconsciousCheck);
  }, [screenTime, mentalFog, interactionLevel, unconsciousCheck, calculateBlackMirrorIndex]);

  // Philosophical insight - stable reference
  const philosophicalInsight = useMemo(() => {
    return philosophicalQuotes[Math.floor(Math.random() * philosophicalQuotes.length)];
  }, []);

  // Load entries on component mount
  useEffect(() => {
    const loadEntries = async () => {
      try {
        const savedEntries = await readUserData('blackMirrorEntries');
        setEntries(savedEntries || []);
      } catch (error) {
        if (import.meta.env.DEV) {
          console.error('Error loading entries:', error);
        }
      }
    };
    loadEntries();
  }, []);

  // Voice input handler
  const handleVoiceInput = useCallback((transcript) => {
    setReflection(prev => prev + (prev ? ' ' : '') + transcript);
  }, []);

  // Color function
  const getIndexColor = useCallback((index) => {
    if (index >= 40) return 'text-red-400';
    if (index >= 25) return 'text-orange-400';
    if (index >= 15) return 'text-yellow-400';
    if (index >= 8) return 'text-blue-400';
    return 'text-green-400';
  }, []);

  // Handle form submission
  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    if (!screenTime.trim()) return;

    setLoading(true);

    try {
      const calculatedIndex = calculateBlackMirrorIndex(screenTime, mentalFog, interactionLevel, unconsciousCheck);

      const entryData = {
        screenTime: parseFloat(screenTime),
        mentalFog,
        interactionLevel,
        unconsciousCheck,
        reflection: reflection.trim(),
        blackMirrorIndex: calculatedIndex,
        philosophicalInsight,
        createdAt: new Date().toISOString()
      };

      // Generate Oracle feedback
      setLoadingFeedback(true);
      setShowOracleModal(true);

      try {
        const pastEntries = entries.length > 0 ? entries.slice(0, 3).map(e => `Index: ${e.blackMirrorIndex}, Screen: ${e.screenTime}h`) : [];
        const feedback = await generateAIFeedback('Black Mirror', `Screen time: ${screenTime}h, Index: ${calculatedIndex}`, pastEntries);
        entryData.oracleFeedback = feedback;
        setAiFeedback(feedback);
      } catch (feedbackError) {
        console.error('Error generating feedback:', feedbackError);
        setAiFeedback('The Oracle remains silent for now...');
      }

      setLoadingFeedback(false);

      // Save to Firebase
      const savedEntry = await writeData('blackMirrorEntries', entryData);
      setEntries(prev => [savedEntry, ...prev.slice(0, 49)]);

      // Reset form
      setScreenTime('');
      setMentalFog(5);
      setInteractionLevel(5);
      setUnconsciousCheck(false);
      setReflection('');

    } catch (error) {
      console.error('Error saving entry:', error);
      setLoadingFeedback(false);
    } finally {
      setLoading(false);
    }
  }, [screenTime, mentalFog, interactionLevel, unconsciousCheck, reflection, calculateBlackMirrorIndex, philosophicalInsight, entries]);

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="max-w-4xl mx-auto px-6 py-12">
        <div className="text-center mb-12 fade-in">
          <h1 className="text-2xl font-light text-white mb-2 tracking-wide">📱 Black Mirror</h1>
          <p className="text-gray-500 text-sm font-light">Track mindless scrolling and its impact on consciousness</p>
          <div className="mt-4 text-sm text-purple-300 font-light">
            📱 Weekly check: +25 clarity points | Low index (&lt;10): +10 bonus points
          </div>
        </div>

        <div className="bg-gradient-to-br from-gray-900/80 to-gray-950/80 backdrop-blur-sm rounded-3xl p-8 mb-8 border border-gray-800/50 oura-card">
          <h2 className="text-xl font-light text-white mb-6 tracking-wide">Digital Consciousness Check</h2>

          <form onSubmit={handleSubmit} className="space-y-8">
            <div>
              <label className="block text-gray-400 mb-3 font-light tracking-wide">Mindless Screen Time Today (hours)</label>
              <input
                type="number"
                step="0.5"
                min="0"
                max="24"
                value={screenTime}
                onChange={(e) => setScreenTime(e.target.value)}
                className="w-full p-4 bg-gradient-to-br from-gray-800/50 to-gray-900/50 text-white rounded-2xl border border-gray-700/50 focus:border-purple-500/50 focus:outline-none focus:ring-2 focus:ring-purple-500/20 transition-all duration-300 backdrop-blur-sm"
                placeholder="e.g., 3.5"
                required
              />
              <p className="text-xs text-gray-500 mt-2 font-light">Only count mindless scrolling, not productive screen time</p>
            </div>
            
            <div>
              <label className="block text-gray-400 mb-3 font-light tracking-wide">Mental Fog Level (1-10)</label>
              <input
                type="range"
                min="1"
                max="10"
                value={mentalFog}
                onChange={(e) => setMentalFog(Number(e.target.value))}
                className="w-full h-3 bg-gradient-to-r from-gray-700 to-gray-600 rounded-2xl appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-purple-500/20"
              />
              <div className="flex justify-between text-xs text-gray-500 mt-3 font-light">
                <span>1 - Crystal Clear</span>
                <span className="text-white font-light text-lg">{mentalFog}</span>
                <span>10 - Total Fog</span>
              </div>
            </div>

            <div>
              <label className="block text-gray-400 mb-3 font-light tracking-wide">Real-World Human Interaction (1-10)</label>
              <input
                type="range"
                min="1"
                max="10"
                value={interactionLevel}
                onChange={(e) => setInteractionLevel(Number(e.target.value))}
                className="w-full h-3 bg-gradient-to-r from-gray-700 to-gray-600 rounded-2xl appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
              <div className="flex justify-between text-xs text-gray-500 mt-3 font-light">
                <span>1 - Isolated</span>
                <span className="text-white font-light text-lg">{interactionLevel}</span>
                <span>10 - Very Social</span>
              </div>
            </div>

            <div className="flex items-center space-x-4 p-4 bg-gradient-to-r from-gray-800/30 to-gray-900/30 rounded-2xl border border-gray-700/30">
              <input
                type="checkbox"
                id="unconsciousCheck"
                checked={unconsciousCheck}
                onChange={(e) => setUnconsciousCheck(e.target.checked)}
                className="w-5 h-5 rounded text-purple-600 bg-gray-700 border-gray-600 focus:ring-purple-500 focus:ring-2"
              />
              <label htmlFor="unconsciousCheck" className="text-gray-300 font-light tracking-wide">
                Did you unconsciously reach for your phone in the last 5 minutes?
              </label>
            </div>

            {/* Black Mirror Index Display */}
            <div className="bg-gradient-to-br from-black/60 to-gray-900/60 border-l-4 border-red-500/70 p-6 rounded-2xl backdrop-blur-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-light text-white tracking-wide">🧠 Black Mirror Index</h3>
                <span className={`text-3xl font-thin ${currentIndex > 0 ? getIndexColor(currentIndex) : 'text-gray-400'}`}>
                  {currentIndex > 0 ? currentIndex : '—'}
                </span>
              </div>
              <p className="text-gray-300 text-sm italic mb-4 font-light">"{philosophicalInsight}"</p>

            {currentIndex > 0 && (
              <div className="mt-3">
                <h4 className="text-purple-300 font-medium text-sm mb-2">🔍 Current Analysis:</h4>
                <p className="text-purple-200 text-sm">
                  {currentIndex >= 40 ? "🔥 SEVERE: Time for serious digital habit changes." :
                   currentIndex >= 25 ? "⚡ HIGH: Set stronger boundaries to protect your attention." :
                   currentIndex < 8 ? "🌟 EXCELLENT: Maintaining healthy digital boundaries!" :
                   "📱 Moderate usage noted. You're building awareness."}
                </p>
              </div>
            )}
          </div>

          <div className="mt-6">
            <label className="block text-gray-400 mb-3">Reflection (Optional)</label>
            <div className="relative">
              <textarea
                value={reflection}
                onChange={(e) => setReflection(e.target.value)}
                rows={4}
                className="w-full p-4 pr-16 bg-gradient-to-br from-gray-800/50 to-gray-900/50 text-white rounded-2xl border border-gray-700/50 focus:border-purple-500/50 focus:outline-none focus:ring-2 focus:ring-purple-500/20 resize-none transition-all duration-300 backdrop-blur-sm"
                placeholder="How did technology impact your consciousness today? What patterns do you notice?"
              />
              <div className="absolute right-3 top-3">
                <VoiceInputButton
                  onTranscript={handleVoiceInput}
                  disabled={loading}
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || !screenTime.trim()}
            className="w-full bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 disabled:from-gray-700 disabled:to-gray-800 text-white font-light py-4 px-8 rounded-2xl transition-all duration-300 tracking-wide shadow-lg hover:shadow-xl transform hover:scale-[1.02] disabled:hover:scale-100"
          >
            {loading ? 'Saving...' : 'Save Black Mirror Entry'}
          </button>
        </form>
        </div>

        {/* Recent Entries */}
        <div className="bg-gradient-to-br from-gray-900/80 to-gray-950/80 backdrop-blur-sm rounded-3xl p-8 border border-gray-800/50 oura-card">
          <h2 className="text-xl font-light text-white mb-6 tracking-wide">Recent Digital Consciousness Checks ({entries.length})</h2>

        {entries.length > 0 ? (
          <VirtualizedList
            items={entries}
            itemHeight={280}
            maxHeight={400}
            overscan={1}
            renderItem={({ item: entry }) => (
              <div className="bg-gray-700 rounded-lg p-4 mx-2 my-2">
                <div className="flex items-center justify-between mb-3">
                  <span className={`text-lg font-bold ${getIndexColor(entry.blackMirrorIndex)}`}>
                    Index: {entry.blackMirrorIndex}
                  </span>
                  <span className="text-sm text-gray-400">
                    {new Date(entry.createdAt).toLocaleDateString()}
                  </span>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm mb-3">
                  <div>
                    <span className="text-gray-400">Screen Time:</span>
                    <span className="text-white ml-1">{entry.screenTime}h</span>
                  </div>
                  <div>
                    <span className="text-gray-400">Mental Fog:</span>
                    <span className="text-white ml-1">{entry.mentalFog}/10</span>
                  </div>
                  <div>
                    <span className="text-gray-400">Interaction:</span>
                    <span className="text-white ml-1">{entry.interactionLevel}/10</span>
                  </div>
                  <div>
                    <span className="text-gray-400">Unconscious Check:</span>
                    <span className="text-white ml-1">{entry.unconsciousCheck ? 'Yes' : 'No'}</span>
                  </div>
                </div>

                {entry.reflection && (
                  <div className="mb-3">
                    <p className="text-gray-400 text-sm mb-1">Reflection:</p>
                    <p className="text-gray-300 text-sm bg-gray-600/50 p-2 rounded">
                      {entry.reflection}
                    </p>
                  </div>
                )}

                {entry.oracleFeedback && (
                  <div className="mt-3 p-3 bg-gray-800/50 border border-purple-500/30 rounded-lg">
                    <h4 className="text-purple-300 font-medium text-sm mb-2">🔮 Oracle's Judgment</h4>
                    <div className="text-purple-200 text-xs leading-relaxed">
                      {entry.oracleFeedback.length > 200 ? 
                        `${entry.oracleFeedback.substring(0, 200)}...` : 
                        entry.oracleFeedback
                      }
                    </div>
                  </div>
                )}

                <div className="mt-3 p-2 bg-black/30 rounded">
                  <p className="text-gray-400 text-xs italic">
                    "{entry.philosophicalInsight}"
                  </p>
                </div>
              </div>
            )}
          />
        ) : (
          <div className="text-center py-12">
            <p className="text-gray-400 text-lg">No entries yet. Start tracking your digital consciousness!</p>
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
    </div>
  );
};

export default BlackMirror;