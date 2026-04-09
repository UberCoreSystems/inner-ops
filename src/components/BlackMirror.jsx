import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { writeData, readUserData, updateData } from '../utils/firebaseUtils';
import { generateAIFeedback } from '../utils/aiFeedback';
import VoiceInputButton from './VoiceInputButton';
import OracleModal from './OracleModal';
import VirtualizedList from './VirtualizedList';
import ouraToast from '../utils/toast';
import logger from '../utils/logger';
import { getAnalyticsReport } from '../utils/blackMirrorAnalytics';
import { SkeletonBox } from './SkeletonLoader';

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
  const [interactionLevel, setInteractionLevel] = useState(2);
  const [unconsciousCheck, setUnconsciousCheck] = useState(false);
  const [reflection, setReflection] = useState('');
  const [entries, setEntries] = useState([]);
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [aiFeedback, setAiFeedback] = useState('');
  const [loadingFeedback, setLoadingFeedback] = useState(false);
  const [showOracleModal, setShowOracleModal] = useState(false);
  const [currentEntryId, setCurrentEntryId] = useState(null);
  const [analyticsReport, setAnalyticsReport] = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [expandedFeedback, setExpandedFeedback] = useState(new Set());
  const [screenTimeError, setScreenTimeError] = useState('');
  const [triggerContext, setTriggerContext] = useState('');
  const [triggerContextError, setTriggerContextError] = useState('');

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

  useEffect(() => {
    const id = setTimeout(() => setSearchQuery(searchInput), 300);
    return () => clearTimeout(id);
  }, [searchInput]);

  // Load entries on component mount
  const loadEntries = useCallback(async () => {
    setLoadError(false);
    try {
      const savedEntries = await readUserData('blackMirrorEntries');
      setEntries(savedEntries || []);
    } catch (error) {
      logger.error('Error loading entries:', error);
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  const loadAnalytics = useCallback(async () => {
    setAnalyticsLoading(true);
    try {
      const report = await getAnalyticsReport();
      setAnalyticsReport(report);
    } catch (err) {
      logger.error('Analytics report failed:', err);
    } finally {
      setAnalyticsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

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

  const handleOracleReaction = async (reactionId) => {
    if (!currentEntryId) return;
    try {
      await updateData('blackMirrorEntries', currentEntryId, { oracleReaction: reactionId });
    } catch (error) {
      logger.error('Error saving Oracle reaction:', error);
    }
  };

  // Handle form submission
  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();

    const parsedScreenTime = parseFloat(screenTime);
    if (!screenTime.trim() || isNaN(parsedScreenTime) || parsedScreenTime < 0) {
      setScreenTimeError('Enter a valid number of hours (e.g., 3.5).');
      return;
    }
    setScreenTimeError('');

    if (!triggerContext.trim() || triggerContext.trim().length < 10) {
      setTriggerContextError('Required — at least one sentence (10 characters minimum).');
      return;
    }
    setTriggerContextError('');

    setLoading(true);

    // Detect consecutive high BMI (threshold: 25) from the two most recent entries
    const HIGH_BMI_THRESHOLD = 25;
    const consecutiveHighBMI = entries.length >= 2 &&
      entries[0].blackMirrorIndex >= HIGH_BMI_THRESHOLD &&
      entries[1].blackMirrorIndex >= HIGH_BMI_THRESHOLD;

    try {
      const calculatedIndex = calculateBlackMirrorIndex(screenTime, mentalFog, interactionLevel, unconsciousCheck);

      const entryData = {
        screenTime: parsedScreenTime,
        mentalFog,
        interactionLevel,
        unconsciousCheck,
        triggerContext: triggerContext.trim(),
        reflection: reflection.trim(),
        blackMirrorIndex: calculatedIndex,
        philosophicalInsight,
        createdAt: new Date().toISOString()
      };

      // Generate Oracle feedback
      setLoadingFeedback(true);
      setShowOracleModal(true);

      let finalEntry = entryData;

      try {
        const pastEntries = entries.length > 0 ? entries.slice(0, 3).map(e => `Index: ${e.blackMirrorIndex}, Screen: ${e.screenTime}h`) : [];
        const fogLabel = mentalFog <= 3 ? 'sharp' : mentalFog <= 6 ? 'moderate' : 'heavy';
        const interactionLabel = interactionLevel === 1 ? 'solo consumption' : interactionLevel === 2 ? 'mixed' : 'intentional connection';
        const blackMirrorText = [
          `My screen time today was ${screenTime} hours, giving me a Black Mirror index of ${calculatedIndex}/100.`,
          `Mental fog: ${mentalFog}/10 (${fogLabel}). Screen use pattern: ${interactionLabel}.`,
          `What I was avoiding when I reached for my phone: ${triggerContext.trim()}`,
          unconsciousCheck ? 'I caught myself reaching for my phone without any conscious intention — purely automatic.' : '',
          reflection ? `My reflection on this: ${reflection}` : '',
          consecutiveHighBMI ? 'User\'s BMI has been above threshold for 2 consecutive check-ins. Ask what specifically they will restrict — not whether they want to do better.' : '',
        ].filter(Boolean).join(' ');
        const feedback = await generateAIFeedback('Black Mirror', blackMirrorText, pastEntries);
        finalEntry = { ...entryData, oracleFeedback: feedback };
        setAiFeedback(feedback);
      } catch (feedbackError) {
        logger.error('Error generating feedback:', feedbackError);
        setAiFeedback('Oracle unavailable. Entry saved.');
      }

      // Save to Firebase before revealing reactions so currentEntryId is set
      const savedEntry = await writeData('blackMirrorEntries', finalEntry);
      setCurrentEntryId(savedEntry.id);
      setEntries(prev => [savedEntry, ...prev.slice(0, 49)]);
      loadAnalytics();

      setLoadingFeedback(false);

      ouraToast.success(`Screen time logged. Index: ${calculatedIndex}.`);

      // Reset form
      setScreenTime('');
      setMentalFog(5);
      setInteractionLevel(2);
      setUnconsciousCheck(false);
      setTriggerContext('');
      setReflection('');

    } catch (error) {
      logger.error('Error saving entry:', error);
      setLoadingFeedback(false);
    } finally {
      setLoading(false);
    }
  }, [screenTime, mentalFog, interactionLevel, unconsciousCheck, triggerContext, reflection, calculateBlackMirrorIndex, philosophicalInsight, entries, loadAnalytics]);

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
        </div>

        {/* Index History Sparkline */}
        {entries.length >= 2 && (
          <div className="oura-card p-5 mb-8 animate-fade-in-up">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-[#5a5a5a] text-xs uppercase tracking-widest">Index History</h3>
              <span className="text-[10px] text-[#3a3a3a]">last {Math.min(entries.length, 20)} entries</span>
            </div>
            {/* Index formula explanation */}
            <p className="text-[10px] text-[#3a3a3a] mb-4">
              Score = screen×8 + fog×2.5 − interaction×2 + unconscious×8 — lower is better
            </p>
            <div className="flex items-end gap-1 h-14">
              {[...entries].slice(0, 20).reverse().map((e, i) => {
                const idx = e.blackMirrorIndex || 0;
                const maxIdx = Math.max(...entries.slice(0, 20).map(x => x.blackMirrorIndex || 0), 20);
                const pct = Math.max((idx / maxIdx) * 100, 4);
                const color = idx >= 40 ? '#ef4444' : idx >= 25 ? '#f97316' : idx >= 15 ? '#eab308' : idx >= 8 ? '#4da6ff' : '#22c55e';
                const dateStr = e.createdAt ? new Date(e.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-0.5 h-full justify-end" title={`${dateStr}: ${idx}`}>
                    <div
                      className="w-full rounded-t transition-all duration-300"
                      style={{ height: `${pct}%`, backgroundColor: color, opacity: 0.75 }}
                    />
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between mt-1 text-[9px] text-[#2a2a2a]">
              <span>oldest</span>
              <span>latest</span>
            </div>
          </div>
        )}

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
              onChange={(e) => { setScreenTime(e.target.value); setScreenTimeError(''); }}
              className="w-full p-4 bg-oura-card text-white rounded-2xl border border-oura-border focus:border-oura-red focus:outline-none transition-all duration-200"
              placeholder="e.g., 3.5"
              required
            />
            {screenTimeError && <p className="text-xs text-red-400 mt-2">{screenTimeError}</p>}
            <p className="text-xs text-gray-500 mt-2">Only count mindless scrolling, not productive screen time</p>
          </div>

          <div>
            <label className="block text-gray-400 text-sm font-medium mb-3">What were you avoiding when you reached for your phone?</label>
            <textarea
              value={triggerContext}
              onChange={(e) => { setTriggerContext(e.target.value); setTriggerContextError(''); }}
              rows={2}
              className="w-full p-4 bg-oura-card text-white rounded-2xl border border-oura-border focus:border-oura-red focus:outline-none resize-none transition-all duration-200"
              placeholder="Name the specific thing you were avoiding or escaping."
              required
            />
            {triggerContextError && <p className="text-xs text-red-400 mt-2">{triggerContextError}</p>}
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
            <label className="block text-gray-400 text-sm font-medium mb-3">Was most of your screen use solo consumption or intentional connection?</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { value: 1, label: 'Mostly solo consumption' },
                { value: 2, label: 'Mixed' },
                { value: 3, label: 'Mostly intentional connection' },
              ].map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setInteractionLevel(opt.value)}
                  className={`p-3 rounded-2xl text-sm text-center transition-all duration-200 border ${interactionLevel === opt.value ? 'border-oura-red bg-oura-red/10 text-white' : 'border-oura-border bg-oura-card text-gray-400 hover:text-white hover:border-gray-500'}`}
                >
                  {opt.label}
                </button>
              ))}
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
              <span className={`text-4xl font-light ${currentIndex != null ? getIndexColor(currentIndex) : 'text-gray-400'}`}>
                {currentIndex != null ? currentIndex : '—'}
              </span>
            </div>
            <p className="text-gray-400 text-sm italic mb-4 leading-relaxed">"{philosophicalInsight}"</p>

            {currentIndex != null && (
              <div className="mt-4 p-4 bg-oura-darker rounded-2xl">
                <h4 className="text-oura-red font-light text-sm mb-2 tracking-wide">ANALYSIS</h4>
                <p className="text-gray-300 text-sm leading-relaxed">
                  {currentIndex >= 40 ? "SEVERE: Digital consumption has taken control. Immediate structural change required." :
                   currentIndex >= 25 ? "HIGH: Attention is being extracted. Set hard limits now — not tomorrow." :
                   currentIndex >= 15 ? "ELEVATED: Drift is in progress. Identify the specific trigger before this becomes a pattern." :
                   currentIndex >= 8 ? "MODERATE: The pull is there. Don't normalize it — name it and cut it." :
                   "CONTROLLED: Holding the line. Stay deliberate."}
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
            disabled={loading || !screenTime.trim() || triggerContext.trim().length < 10}
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
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search history..."
              className="w-full px-4 py-2.5 bg-oura-card text-white rounded-xl border border-oura-border focus:border-oura-red focus:outline-none transition-colors"
            />
            {searchInput && (
              <button
                onClick={() => { setSearchInput(''); setSearchQuery(''); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white text-xs"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {loadError ? (
          <div className="oura-card p-10 text-center border border-oura-border">
            <p className="text-red-400 mb-4 text-sm">Failed to load entries. Please check your connection.</p>
            <button
              onClick={loadEntries}
              className="px-5 py-2.5 bg-red-500/10 text-red-400 border border-red-500/30 rounded-xl hover:bg-red-500/20 transition-colors text-sm font-medium"
            >
              Retry
            </button>
          </div>
        ) : filteredEntries.length > 0 ? (
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
                    <span className="text-white text-sm font-light">
                      {entry.interactionLevel <= 3
                        ? (entry.interactionLevel === 1 ? 'Solo' : entry.interactionLevel === 2 ? 'Mixed' : 'Intentional')
                        : `${entry.interactionLevel}/10`}
                    </span>
                  </div>
                  <div className="bg-oura-darker p-3 rounded-xl">
                    <span className="text-gray-500 text-xs block mb-1">Unconscious</span>
                    <span className={`text-lg font-light ${entry.unconsciousCheck ? 'text-oura-red' : 'text-oura-cyan'}`}>
                      {entry.unconsciousCheck ? 'Yes' : 'No'}
                    </span>
                  </div>
                </div>

                {entry.triggerContext && (
                  <div className="mb-3">
                    <p className="text-gray-500 text-xs mb-2 uppercase tracking-wide">Avoidance Trigger</p>
                    <p className="text-gray-300 text-sm bg-oura-darker p-3 rounded-xl leading-relaxed">
                      {entry.triggerContext}
                    </p>
                  </div>
                )}

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
                      {entry.oracleFeedback.length > 200 && !expandedFeedback.has(entry.id)
                        ? `${entry.oracleFeedback.substring(0, 200)}...`
                        : entry.oracleFeedback
                      }
                    </div>
                    {entry.oracleFeedback.length > 200 && (
                      <button
                        onClick={() => setExpandedFeedback(prev => {
                          const next = new Set(prev);
                          next.has(entry.id) ? next.delete(entry.id) : next.add(entry.id);
                          return next;
                        })}
                        className="mt-2 text-oura-red text-xs hover:text-red-400 transition-colors"
                      >
                        {expandedFeedback.has(entry.id) ? 'Show less' : 'Show more'}
                      </button>
                    )}
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
                  onClick={() => { setSearchInput(''); setSearchQuery(''); }}
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

      {/* Pattern Analysis */}
      <div className="oura-card p-6 mt-8 animate-fade-in-up animation-delay-300">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-light text-white tracking-tight">Pattern Analysis</h2>
          {analyticsLoading && (
            <span className="text-xs text-gray-600 animate-pulse">Analyzing...</span>
          )}
        </div>

        {!analyticsReport ? (
          <div className="space-y-3">
            <SkeletonBox width="75%" height="1rem" />
            <SkeletonBox width="50%" height="0.875rem" />
            <SkeletonBox width="65%" height="0.875rem" />
          </div>
        ) : (analyticsReport.data.meta.counts.blackMirror < 3 || analyticsReport.data.meta.counts.journal < 3 || analyticsReport.data.meta.counts.relapse < 2) ? (
          <div className="py-6 text-center">
            <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-oura-darker flex items-center justify-center text-2xl">
              🔍
            </div>
            <h3 className="text-lg font-light text-white mb-2">Not enough data yet</h3>
            <p className="text-gray-500 text-sm mb-6 max-w-sm mx-auto">
              Pattern detection requires at least 3 Black Mirror entries, 3 journal entries, and 2 relapse entries.
            </p>
            <div className="grid grid-cols-3 gap-3 max-w-xs mx-auto">
              {[
                { label: 'Black Mirror', count: analyticsReport.data.meta.counts.blackMirror, need: 3 },
                { label: 'Journal', count: analyticsReport.data.meta.counts.journal, need: 3 },
                { label: 'Relapse', count: analyticsReport.data.meta.counts.relapse, need: 2 },
              ].map(({ label, count, need }) => (
                <div key={label} className="bg-oura-darker p-3 rounded-xl text-center">
                  <span className={`text-xl font-light block ${count >= need ? 'text-green-400' : 'text-white'}`}>{count}</span>
                  <span className="text-gray-500 text-xs block">{label}</span>
                  <span className="text-gray-600 text-xs block">need {need}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="px-3 py-1.5 bg-oura-darker rounded-full text-gray-400">
                {analyticsReport.insights.patterns_detected} pattern{analyticsReport.insights.patterns_detected !== 1 ? 's' : ''} detected
              </span>
              <span className="px-3 py-1.5 bg-oura-darker rounded-full text-gray-600">
                {analyticsReport.data.meta.counts.blackMirror} BM · {analyticsReport.data.meta.counts.journal} journal · {analyticsReport.data.meta.counts.relapse} relapse
              </span>
            </div>

            {[
              { key: 'behavioral_patterns', label: 'Behavioral Patterns', data: analyticsReport.insights.behavioral_patterns },
              { key: 'avoidance_patterns', label: 'Avoidance Patterns', data: analyticsReport.insights.avoidance_patterns },
              { key: 'identity_vs_behavior_gaps', label: 'Identity vs Behavior Gaps', data: analyticsReport.insights.identity_vs_behavior_gaps },
            ].map(({ key, label, data }) => (
              <div key={key}>
                <h3 className="text-xs uppercase tracking-widest text-[#5a5a5a] mb-3">{label}</h3>
                <ul className="space-y-2">
                  {data.map((insight, i) => (
                    insight === 'Insufficient data to generate insight' ? (
                      <li key={i} className="text-gray-600 text-sm italic px-1">Insufficient data to generate insight</li>
                    ) : (
                      <li key={i} className="text-gray-300 text-sm bg-oura-darker p-3 rounded-xl leading-relaxed">
                        {insight}
                      </li>
                    )
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Oracle Modal */}
      <OracleModal
        isOpen={showOracleModal}
        onClose={() => { setShowOracleModal(false); setCurrentEntryId(null); }}
        feedback={aiFeedback}
        loading={loadingFeedback}
        onReaction={handleOracleReaction}
      />
    </div>
    </div>
  );
};

export default BlackMirror;