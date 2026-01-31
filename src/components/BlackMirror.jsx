import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { writeData, readUserData } from '../utils/firebaseUtils';
import { generateAIFeedback } from '../utils/aiFeedback';
import VoiceInputButton from './VoiceInputButton';
import OracleModal from './OracleModal';
import VirtualizedList from './VirtualizedList';
import ouraToast from '../utils/toast';
import logger from '../utils/logger';

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
  const [searchQuery, setSearchQuery] = useState('');
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

  const filteredEntries = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    if (!normalizedQuery) return entries;

    return entries.filter((entry) => {
      const haystack = [
        entry.reflection,
        entry.oracleFeedback,
        entry.philosophicalInsight,
        String(entry.screenTime),
        String(entry.blackMirrorIndex),
        entry.unconsciousCheck ? 'yes' : 'no'
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes(normalizedQuery);
    });
  }, [entries, searchQuery]);

  // Load entries on component mount
  useEffect(() => {
    const loadEntries = async () => {
      try {
        const savedEntries = await readUserData('blackMirrorEntries');
        setEntries(savedEntries || []);
      } catch (error) {
        if (import.meta.env.DEV) {
          logger.error('Error loading entries:', error);
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
        logger.error('Error generating feedback:', feedbackError);
        setAiFeedback('The Oracle remains silent for now...');
      }

      setLoadingFeedback(false);

      // Save to Firebase
      const savedEntry = await writeData('blackMirrorEntries', entryData);
      setEntries(prev => [savedEntry, ...prev.slice(0, 49)]);
      
      ouraToast.success('Black Mirror entry logged');

      // Reset form
      setScreenTime('');
      setMentalFog(5);
      setInteractionLevel(5);
      setUnconsciousCheck(false);
      setReflection('');

    } catch (error) {
      logger.error('Error saving entry:', error);
      setLoadingFeedback(false);
    } finally {
      setLoading(false);
    }
  }, [screenTime, mentalFog, interactionLevel, unconsciousCheck, reflection, calculateBlackMirrorIndex, philosophicalInsight, entries]);

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="max-w-4xl mx-auto p-4 md:p-6 lg:p-8">
        {/* Header */}
        <div className="mb-8 animate-fade-in-up">
          <h1 className="text-4xl md:text-5xl font-light text-white mb-3 tracking-tight">
            Black Mirror
          </h1>
          <p className="text-gray-400 text-base md:text-lg mb-4">
            Track mindless scrolling and its impact on consciousness
          </p>
          <div className="oura-card p-4 border-l-4 border-oura-red">
            <p className="text-sm text-gray-300">
              📱 Weekly check: +25 clarity points | Low index (&lt;10): +10 bonus points
            </p>
          </div>
        </div>

        {/* Digital Consciousness Check Form */}
        <div className="oura-card p-6 mb-8 animate-fade-in-up animation-delay-100">
          <h2 className="text-2xl font-light text-white mb-6 tracking-tight">Digital Consciousness Check</h2>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-gray-400 text-sm font-medium mb-3">Mindless Screen Time Today (hours)</label>
            <input
              id="black-mirror-screen-time"
              type="number"
              step="0.5"
              min="0"
              max="24"
              value={screenTime}
              onChange={(e) => setScreenTime(e.target.value)}
              className="w-full p-4 bg-oura-card text-white rounded-2xl border border-oura-border focus:border-oura-red focus:outline-none transition-all duration-200"
              placeholder="e.g., 3.5"
              required
            />
            <p className="text-xs text-gray-500 mt-2">Only count mindless scrolling, not productive screen time</p>
          </div>

          <div>
            <label className="block text-gray-400 text-sm font-medium mb-3">Mental Fog Level (1-10)</label>
            <input
              type="range"
              min="1"
              max="10"
              value={mentalFog}
              onChange={(e) => setMentalFog(Number(e.target.value))}
              className="w-full h-2 bg-oura-border rounded-full appearance-none cursor-pointer oura-slider"
            />
            <div className="flex justify-between text-xs text-gray-500 mt-3">
              <span>1 - Crystal Clear</span>
              <span className="text-white text-lg font-light">{mentalFog}</span>
              <span>10 - Total Fog</span>
            </div>
          </div>

          <div>
            <label className="block text-gray-400 text-sm font-medium mb-3">Real-World Human Interaction (1-10)</label>
            <input
              type="range"
              min="1"
              max="10"
              value={interactionLevel}
              onChange={(e) => setInteractionLevel(Number(e.target.value))}
              className="w-full h-2 bg-oura-border rounded-full appearance-none cursor-pointer oura-slider"
            />
            <div className="flex justify-between text-xs text-gray-500 mt-3">
              <span>1 - Isolated</span>
              <span className="text-white text-lg font-light">{interactionLevel}</span>
              <span>10 - Very Social</span>
            </div>
          </div>

          <div className="flex items-center p-4 bg-oura-darker rounded-2xl">
            <input
              type="checkbox"
              id="unconsciousCheck"
              checked={unconsciousCheck}
              onChange={(e) => setUnconsciousCheck(e.target.checked)}
              className="mr-3 w-5 h-5 accent-oura-red"
            />
            <label htmlFor="unconsciousCheck" className="text-gray-300 text-sm">
              Did you unconsciously reach for your phone in the last 5 minutes?
            </label>
          </div>

          {/* Black Mirror Index Display */}
          <div className="oura-card border-l-4 border-oura-red p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-light text-white tracking-tight">Black Mirror Index</h3>
              <span className={`text-4xl font-light ${currentIndex > 0 ? getIndexColor(currentIndex) : 'text-gray-400'}`}>
                {currentIndex > 0 ? currentIndex : '—'}
              </span>
            </div>
            <p className="text-gray-400 text-sm italic mb-4 leading-relaxed">"{philosophicalInsight}"</p>

            {currentIndex > 0 && (
              <div className="mt-4 p-4 bg-oura-darker rounded-2xl">
                <h4 className="text-oura-red font-light text-sm mb-2 tracking-wide">ANALYSIS</h4>
                <p className="text-gray-300 text-sm leading-relaxed">
                  {currentIndex >= 40 ? "SEVERE: Time for serious digital habit changes." :
                   currentIndex >= 25 ? "HIGH: Set stronger boundaries to protect your attention." :
                   currentIndex < 8 ? "EXCELLENT: Maintaining healthy digital boundaries!" :
                   "Moderate usage noted. You're building awareness."}
                </p>
              </div>
            )}
          </div>

          <div className="mt-6">
            <label className="block text-gray-400 text-sm font-medium mb-3">Reflection (Optional)</label>
            <div className="relative">
              <textarea
                id="black-mirror-reflection"
                value={reflection}
                onChange={(e) => setReflection(e.target.value)}
                rows={4}
                className="w-full p-4 pr-14 bg-oura-card text-white rounded-2xl border border-oura-border focus:border-oura-red focus:outline-none resize-none transition-all duration-200"
                placeholder="How did technology impact your consciousness today? What patterns do you notice?"
              />
              <div className="absolute right-2 top-2">
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
            className="w-full bg-oura-red hover:bg-red-600 disabled:bg-oura-border text-white font-light py-4 px-6 rounded-2xl transition-all duration-200 tracking-wide"
          >
            {loading ? 'Saving...' : 'Save Entry'}
          </button>
        </form>
      </div>

      {/* Recent Entries */}
      <div className="oura-card p-6 animate-fade-in-up animation-delay-200">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
          <h2 className="text-2xl font-light text-white tracking-tight">
            History{' '}
            <span className="text-gray-500 text-lg">
              ({searchQuery.trim() ? `${filteredEntries.length}/${entries.length}` : entries.length})
            </span>
          </h2>
          <div className="relative w-full sm:w-72">
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search history..."
              className="w-full px-4 py-2.5 bg-oura-card text-white rounded-xl border border-oura-border focus:border-oura-red focus:outline-none transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white text-xs"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {filteredEntries.length > 0 ? (
          <VirtualizedList
            items={filteredEntries}
            itemHeight={280}
            maxHeight={400}
            overscan={1}
            renderItem={({ item: entry }) => (
              <div className="oura-card p-5 mx-2 my-2 hover:shadow-oura-glow-sm transition-shadow duration-300">
                <div className="flex items-center justify-between mb-4">
                  <span className={`text-3xl font-light ${getIndexColor(entry.blackMirrorIndex)}`}>
                    {entry.blackMirrorIndex}
                  </span>
                  <span className="text-sm text-gray-500">
                    {new Date(entry.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                  <div className="bg-oura-darker p-3 rounded-xl">
                    <span className="text-gray-500 text-xs block mb-1">Screen Time</span>
                    <span className="text-white text-lg font-light">{entry.screenTime}h</span>
                  </div>
                  <div className="bg-oura-darker p-3 rounded-xl">
                    <span className="text-gray-500 text-xs block mb-1">Mental Fog</span>
                    <span className="text-white text-lg font-light">{entry.mentalFog}/10</span>
                  </div>
                  <div className="bg-oura-darker p-3 rounded-xl">
                    <span className="text-gray-500 text-xs block mb-1">Interaction</span>
                    <span className="text-white text-lg font-light">{entry.interactionLevel}/10</span>
                  </div>
                  <div className="bg-oura-darker p-3 rounded-xl">
                    <span className="text-gray-500 text-xs block mb-1">Unconscious</span>
                    <span className={`text-lg font-light ${entry.unconsciousCheck ? 'text-oura-red' : 'text-oura-cyan'}`}>
                      {entry.unconsciousCheck ? 'Yes' : 'No'}
                    </span>
                  </div>
                </div>

                {entry.reflection && (
                  <div className="mb-4">
                    <p className="text-gray-500 text-xs mb-2 uppercase tracking-wide">Reflection</p>
                    <p className="text-gray-300 text-sm bg-oura-darker p-3 rounded-xl leading-relaxed">
                      {entry.reflection}
                    </p>
                  </div>
                )}

                {entry.oracleFeedback && (
                  <div className="mt-4 p-4 bg-oura-darker border-l-4 border-oura-red rounded-xl">
                    <h4 className="text-oura-red font-light text-sm mb-2 tracking-wide">ORACLE'S JUDGMENT</h4>
                    <div className="text-gray-300 text-xs leading-relaxed">
                      {entry.oracleFeedback.length > 200 ? 
                        `${entry.oracleFeedback.substring(0, 200)}...` : 
                        entry.oracleFeedback
                      }
                    </div>
                  </div>
                )}

                <div className="mt-4 p-3 bg-black/40 rounded-xl border border-oura-border">
                  <p className="text-gray-500 text-xs italic leading-relaxed">
                    "{entry.philosophicalInsight}"
                  </p>
                </div>
              </div>
            )}
          />
        ) : (
          <div className="oura-card p-10 text-center border border-oura-border">
            <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-oura-darker flex items-center justify-center text-2xl">
              🪞
            </div>
            <h3 className="text-lg font-light text-white mb-2">
              {searchQuery.trim() ? `No matches for “${searchQuery.trim()}”` : 'No Black Mirror entries yet'}
            </h3>
            <p className="text-gray-500 text-sm mb-6">
              {searchQuery.trim()
                ? 'Try a different keyword or clear the search.'
                : 'Log a quick check-in to surface unconscious patterns and reclaim attention.'}
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              {searchQuery.trim() ? (
                <button
                  onClick={() => setSearchQuery('')}
                  className="px-6 py-2.5 bg-transparent border border-oura-border text-gray-300 hover:text-white hover:border-gray-500 rounded-xl transition-all duration-300 font-medium text-sm"
                >
                  Clear Search
                </button>
              ) : (
                <>
                  <button
                    onClick={() => {
                      document.getElementById('black-mirror-screen-time')?.focus();
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className="px-6 py-2.5 bg-oura-red hover:bg-red-600 text-white rounded-xl transition-all duration-300 font-medium text-sm"
                  >
                    Log Today’s Check
                  </button>
                  <button
                    onClick={() => {
                      document.getElementById('black-mirror-reflection')?.focus();
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className="px-6 py-2.5 bg-transparent border border-oura-border text-gray-300 hover:text-white hover:border-gray-500 rounded-xl transition-all duration-300 font-medium text-sm"
                  >
                    Add a Reflection
                  </button>
                </>
              )}
            </div>
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