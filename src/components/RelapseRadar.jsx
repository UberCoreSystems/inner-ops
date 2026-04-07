
import React, { useState, useEffect, useMemo } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { getAuth } from '../firebase';
import { writeData, readUserData, updateData } from '../utils/firebaseUtils';
import { aiUtils } from '../utils/aiUtils';
import { generateAIFeedback } from '../utils/aiFeedback';
import VoiceInputButton from './VoiceInputButton';
import OracleModal from './OracleModal';
import ouraToast from '../utils/toast';
import logger from '../utils/logger';

const relapseSelves = [
  'The Addict',
  'The Victim', 
  'The Procrastinator',
  'The Pessimist',
  'The Perfectionist',
  'The People-Pleaser',
  'The Imposter',
  'The Self-Saboteur'
];

const relapseHabits = [
  'Excessive social media scrolling',
  'Binge eating',
  'Procrastination',
  'Negative self-talk',
  'Isolation',
  'Overthinking',
  'Comparing myself to others',
  'Avoiding responsibilities'
];

const substanceOptions = [
  'Alcohol',
  'Nicotine',
  'Cannabis',
  'Caffeine (excessive)',
  'Sugar (excessive)',
  'None'
];

const RelapseRadar = () => {
  const [step, setStep] = useState(1);
  const [selectedSelf, setSelectedSelf] = useState('');
  const [selectedHabits, setSelectedHabits] = useState([]);
  const [substanceUse, setSubstanceUse] = useState([]);
  const [reflection, setReflection] = useState('');
  const [relapseEntries, setRelapseEntries] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [aiInsights, setAiInsights] = useState([]);
  const [oracleModal, setOracleModal] = useState({ isOpen: false, content: '', isLoading: false });
  const [currentEntryId, setCurrentEntryId] = useState(null);

  useEffect(() => {
    let mounted = true;
    let unsubscribe = null;

    const setupAuthListener = async () => {
      const auth = await getAuth();
      if (!mounted) return;
      const unsub = onAuthStateChanged(auth, (user) => {
        if (!mounted) return;
        if (user) {
          loadRelapseEntries();
        } else {
          setRelapseEntries([]);
        }
      });
      if (mounted) {
        unsubscribe = unsub;
      } else {
        unsub();
      }
    };

    setupAuthListener();
    return () => {
      mounted = false;
      if (unsubscribe) unsubscribe();
    };
  }, []);

  const loadRelapseEntries = async () => {
    setLoadError(false);
    try {
      const entries = await readUserData('relapseEntries');
      setRelapseEntries(entries);

      // Generate AI insights based on patterns
      const insights = aiUtils.analyzeRelapsePatterns(entries);
      setAiInsights(insights);
    } catch (error) {
      logger.error("Error loading relapse entries:", error);
      setLoadError(true);
    }
  };

  const archetypeFrequency = useMemo(() => {
    if (relapseEntries.length === 0) return [];
    const counts = {};
    relapseEntries.forEach(e => {
      if (e.selectedSelf) counts[e.selectedSelf] = (counts[e.selectedSelf] || 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }));
  }, [relapseEntries]);

  const daysSinceLastRelapse = useMemo(() => {
    if (relapseEntries.length === 0) return null;
    const sorted = [...relapseEntries].sort((a, b) => {
      const aTime = a.createdAt?.toDate?.()?.getTime() ?? a.timestamp ?? 0;
      const bTime = b.createdAt?.toDate?.()?.getTime() ?? b.timestamp ?? 0;
      return bTime - aTime;
    });
    const latest = sorted[0].createdAt?.toDate?.() ?? (sorted[0].timestamp ? new Date(sorted[0].timestamp) : null);
    if (!latest) return null;
    return Math.floor((Date.now() - latest.getTime()) / (1000 * 60 * 60 * 24));
  }, [relapseEntries]);

  const filteredRelapseEntries = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    if (!normalizedQuery) return relapseEntries;

    return relapseEntries.filter((entry) => {
      const haystack = [
        entry.selectedSelf,
        entry.selectedHabits?.join(' '),
        entry.substanceUse?.join(' '),
        entry.reflection,
        entry.oracleFeedback
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes(normalizedQuery);
    });
  }, [relapseEntries, searchQuery]);

  const handleHabitToggle = (habit) => {
    setSelectedHabits(prev => 
      prev.includes(habit) 
        ? prev.filter(h => h !== habit)
        : [...prev, habit]
    );
  };

  const handleSubstanceToggle = (substance) => {
    setSubstanceUse(prev => 
      prev.includes(substance) 
        ? prev.filter(s => s !== substance)
        : [...prev, substance]
    );
  };

  const handleOracleReaction = async (reactionId) => {
    if (!currentEntryId) return;
    try {
      await updateData('relapseEntries', currentEntryId, { oracleReaction: reactionId });
    } catch (error) {
      logger.error('Error saving Oracle reaction:', error);
    }
  };

  const submitRelapseEntry = async () => {
    try {
      setLoading(true);
      
      // Show Oracle modal with loading state
      setOracleModal({ isOpen: true, content: '', isLoading: true });
      
      const entryText = `Self: ${selectedSelf}, Habits: ${selectedHabits.join(', ')}, Substances: ${substanceUse.join(', ')}, Reflection: ${reflection}`;
      const pastReflections = relapseEntries.slice(-3).map(entry => entry.reflection).filter(Boolean);
      const oracleFeedback = await generateAIFeedback('relapse', entryText, pastReflections);
      
      // Save the entry before revealing reactions so currentEntryId is set
      const entry = {
        selectedSelf,
        selectedHabits,
        substanceUse,
        reflection,
        oracleFeedback
      };

      const savedEntry = await writeData('relapseEntries', entry);
      setCurrentEntryId(savedEntry.id);
      setRelapseEntries(prev => [savedEntry, ...prev]);

      // Show Oracle feedback in modal
      setOracleModal({ isOpen: true, content: oracleFeedback, isLoading: false });
      
      ouraToast.success('Relapse check-in logged');

      // Clear form
      setSelectedSelf('');
      setSelectedHabits([]);
      setSubstanceUse([]);
      setReflection('');
      setSubmitSuccess(true);
      setTimeout(() => setSubmitSuccess(false), 3000);
      
    } catch (error) {
      logger.error("Error generating Oracle feedback:", error);
      setOracleModal({ 
        isOpen: true, 
        content: "The Oracle senses disturbance in the spiritual realm... Your journey is still witnessed. Please try again in a moment.", 
        isLoading: false 
      });
    } finally {
      setLoading(false);
    }
  };

  const nextStep = () => {
    if (step < 4) {
      setStep(step + 1);
    } else {
      submitRelapseEntry();
    }
  };

  const prevStep = () => {
    if (step > 1) {
      setStep(step - 1);
    }
  };

  return (
    <div className="oura-card p-6">
      <div className="mb-8">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-3xl font-light text-white tracking-tight">Relapse Radar</h2>
          <div className="text-sm text-gray-500">Step {step} of 4</div>
        </div>
        {/* AI Insights */}
        {aiInsights.length > 0 && step === 1 && (
          <div className="mb-6 oura-card border-l-4 border-oura-purple p-5">
            <h3 className="text-oura-purple font-light text-base mb-4 tracking-wide">AI RECOVERY INSIGHTS</h3>
            <div className="space-y-2">
              {aiInsights.map((insight, idx) => (
                <div key={idx} className="text-gray-300 text-sm bg-oura-darker p-3 rounded-xl leading-relaxed">
                  {insight}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Days since last relapse + archetype frequency — step 1 only */}
        {step === 1 && daysSinceLastRelapse !== null && (
          <div className="mb-6 flex items-center gap-3 oura-card p-4">
            <div className={`text-4xl font-light tabular-nums ${daysSinceLastRelapse === 0 ? 'text-red-400' : daysSinceLastRelapse < 3 ? 'text-oura-amber' : 'text-oura-cyan'}`}>
              {daysSinceLastRelapse}
            </div>
            <div>
              <div className="text-white text-sm font-light">day{daysSinceLastRelapse !== 1 ? 's' : ''} since last relapse</div>
              <div className="text-gray-500 text-xs">{relapseEntries.length} total check-in{relapseEntries.length !== 1 ? 's' : ''}</div>
            </div>
          </div>
        )}

        {step === 1 && archetypeFrequency.length >= 2 && (
          <div className="mb-6 oura-card p-5">
            <h3 className="text-xs text-gray-500 tracking-widest uppercase mb-4">Archetype Frequency</h3>
            <div className="space-y-2.5">
              {archetypeFrequency.map(({ name, count }) => {
                const maxCount = archetypeFrequency[0].count;
                const pct = Math.round((count / maxCount) * 100);
                return (
                  <div key={name} className="flex items-center gap-3">
                    <div className="text-gray-400 text-xs w-36 shrink-0 truncate">{name}</div>
                    <div className="flex-1 bg-oura-border rounded-full h-1.5 overflow-hidden">
                      <div
                        className="h-1.5 rounded-full bg-oura-amber transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="text-gray-500 text-xs w-4 text-right shrink-0">{count}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="w-full bg-oura-border rounded-full h-2">
          <div
            className="bg-oura-amber h-2 rounded-full transition-all duration-300"
            style={{ width: `${(step / 4) * 100}%` }}
          ></div>
        </div>
      </div>

      {step === 1 && (
        <div className="space-y-6 animate-fade-in-up">
          <h3 className="text-xl font-light text-white tracking-tight">Which self showed up today?</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {relapseSelves.map((self) => (
              <button
                key={self}
                onClick={() => setSelectedSelf(self)}
                className={`p-4 rounded-2xl text-left transition-all duration-200 ${
                  selectedSelf === self
                    ? 'bg-oura-amber text-black font-medium shadow-oura-glow-amber'
                    : 'bg-oura-card text-gray-300 hover:bg-oura-darker border border-oura-border'
                }`}
              >
                {self}
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-6 animate-fade-in-up">
          <h3 className="text-xl font-light text-white tracking-tight">What patterns emerged?</h3>
          <p className="text-gray-500 text-sm">Skip if none apply.</p>
          <div className="grid grid-cols-1 gap-3">
            {relapseHabits.map((habit) => (
              <button
                key={habit}
                onClick={() => handleHabitToggle(habit)}
                className={`p-4 rounded-2xl text-left transition-all duration-200 ${
                  selectedHabits.includes(habit)
                    ? 'bg-oura-amber text-black font-medium shadow-oura-glow-amber'
                    : 'bg-oura-card text-gray-300 hover:bg-oura-darker border border-oura-border'
                }`}
              >
                {habit}
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-6 animate-fade-in-up">
          <h3 className="text-xl font-light text-white tracking-tight">Any substance use?</h3>
          <p className="text-gray-500 text-sm">Skip if none apply.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {substanceOptions.map((substance) => (
              <button
                key={substance}
                onClick={() => handleSubstanceToggle(substance)}
                className={`p-4 rounded-2xl text-left transition-all duration-200 ${
                  substanceUse.includes(substance)
                    ? 'bg-oura-amber text-black font-medium shadow-oura-glow-amber'
                    : 'bg-oura-card text-gray-300 hover:bg-oura-darker border border-oura-border'
                }`}
              >
                {substance}
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="space-y-6 animate-fade-in-up">
          <h3 className="text-xl font-light text-white tracking-tight">Reflection</h3>
          <div className="relative">
            <textarea
              value={reflection}
              onChange={(e) => setReflection(e.target.value)}
              placeholder="What led to this? What can you learn? How will you recover?"
              className="w-full h-32 p-4 pr-14 bg-oura-card text-white rounded-2xl border border-oura-border focus:border-oura-amber focus:outline-none resize-none transition-all duration-200"
            />
            <div className="absolute right-2 top-2">
              <VoiceInputButton
                onTranscript={(transcript) => {
                  setReflection(prev => prev + (prev ? ' ' : '') + transcript);
                }}
                disabled={loading}
              />
            </div>
          </div>
        </div>
      )}

      {submitSuccess && (
        <div className="mb-6 oura-card border-l-4 border-oura-cyan p-4 animate-fade-in-up">
          <p className="text-gray-300 text-sm">✅ Relapse entry submitted successfully! Resetting form...</p>
        </div>
      )}

      <div className="flex justify-between mt-8 gap-4">
        <button
          onClick={prevStep}
          disabled={step === 1 || submitSuccess}
          className="px-6 py-3 bg-oura-card text-white rounded-2xl disabled:opacity-30 hover:bg-oura-darker transition-all duration-200 border border-oura-border"
        >
          Previous
        </button>
        <button
          onClick={nextStep}
          disabled={loading || submitSuccess || (step === 1 && !selectedSelf)}
          className="px-6 py-3 bg-oura-amber text-black font-medium rounded-2xl disabled:opacity-30 hover:bg-amber-500 transition-all duration-200"
        >
          {loading ? 'Submitting...' : submitSuccess ? 'Success!' : (step === 4 ? 'Submit' : 'Next')}
        </button>
      </div>

      {loadError && (
        <div className="mt-10 oura-card p-8 text-center">
          <p className="text-[#ef4444] mb-4 text-sm">Failed to load relapse entries. Please check your connection.</p>
          <button
            onClick={loadRelapseEntries}
            className="px-5 py-2.5 bg-[#ef4444]/10 text-[#ef4444] border border-[#ef4444]/30 rounded-xl hover:bg-[#ef4444]/20 transition-colors text-sm font-medium"
          >
            Retry
          </button>
        </div>
      )}

      {!loadError && relapseEntries.length > 0 && (
        <div className="mt-10">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
            <h3 className="text-2xl font-light text-white tracking-tight">
              Recent Entries{' '}
              <span className="text-gray-500 text-lg">
                ({searchQuery.trim() ? `${filteredRelapseEntries.length}/${relapseEntries.length}` : relapseEntries.length})
              </span>
            </h3>
            <div className="relative w-full sm:w-72">
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search entries..."
                className="w-full px-4 py-2.5 bg-oura-card text-white rounded-xl border border-oura-border focus:border-oura-amber focus:outline-none transition-colors"
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

          {filteredRelapseEntries.length > 0 ? (
            <div className="space-y-3">
              {filteredRelapseEntries.slice(0, 3).map((entry) => (
                <div key={entry.id} className="oura-card p-5 hover:shadow-oura-glow-sm transition-shadow duration-300">
                  <div className="text-oura-amber font-light text-lg">{entry.selectedSelf}</div>
                  <div className="text-gray-500 text-sm mt-2">
                    {entry.createdAt?.toDate?.()?.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </div>
                  <div className="text-gray-400 text-sm mt-3 leading-relaxed">
                    {entry.reflection?.substring(0, 100)}...
                  </div>
                  {entry.oracleFeedback && (
                    <div className="mt-4 p-4 bg-oura-darker border-l-4 border-oura-purple rounded-xl">
                      <h4 className="text-oura-purple font-light text-sm mb-2 tracking-wide">ORACLE'S JUDGMENT</h4>
                      <div className="text-gray-300 text-xs leading-relaxed">
                        {entry.oracleFeedback.substring(0, 150)}...
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="oura-card p-6 text-center">
              <div className="text-2xl mb-2 opacity-40">🧭</div>
              <p className="text-gray-300 text-sm">
                {searchQuery.trim() ? `No matches for “${searchQuery.trim()}”` : 'No entries to show yet.'}
              </p>
              {searchQuery.trim() && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="mt-3 px-4 py-2 bg-oura-card border border-oura-border text-gray-300 rounded-xl hover:text-white hover:border-gray-500 transition-all text-xs"
                >
                  Clear Search
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Oracle Modal */}
      <OracleModal
        isOpen={oracleModal.isOpen}
        onClose={() => { setOracleModal({ isOpen: false, content: '', isLoading: false }); setCurrentEntryId(null); }}
        content={oracleModal.content}
        isLoading={oracleModal.isLoading}
        onReaction={handleOracleReaction}
      />
    </div>
  );
};

export default RelapseRadar;
