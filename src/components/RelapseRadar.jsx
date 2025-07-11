
import React, { useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase';
import { writeData, readUserData } from '../utils/firebaseUtils';
import { aiUtils } from '../utils/aiUtils';
import { generateAIFeedback } from '../utils/aiFeedback';
import VoiceInputButton from './VoiceInputButton';
import OracleModal from './OracleModal';

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
  const [loading, setLoading] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [aiInsights, setAiInsights] = useState([]);
  const [oracleModal, setOracleModal] = useState({ isOpen: false, content: '', isLoading: false });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        loadRelapseEntries();
      } else {
        setRelapseEntries([]);
      }
    });
    return () => unsubscribe();
  }, []);

  const loadRelapseEntries = async () => {
    try {
      const entries = await readUserData('relapseEntries');
      setRelapseEntries(entries);
      
      // Generate AI insights based on patterns
      const insights = aiUtils.analyzeRelapsePatterns(entries);
      setAiInsights(insights);
    } catch (error) {
      console.error("Error loading relapse entries:", error);
    }
  };

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

  const submitRelapseEntry = async () => {
    try {
      setLoading(true);
      
      // Show Oracle modal with loading state
      setOracleModal({ isOpen: true, content: '', isLoading: true });
      
      const entryText = `Self: ${selectedSelf}, Habits: ${selectedHabits.join(', ')}, Substances: ${substanceUse.join(', ')}, Reflection: ${reflection}`;
      const pastReflections = relapseEntries.slice(-3).map(entry => entry.reflection).filter(Boolean);
      const oracleFeedback = await generateAIFeedback('relapse', entryText, pastReflections);
      
      // Show Oracle feedback in modal
      setOracleModal({ isOpen: true, content: oracleFeedback, isLoading: false });

      // Save the entry with Oracle feedback immediately
      const entry = {
        selectedSelf,
        selectedHabits,
        substanceUse,
        reflection,
        oracleFeedback
      };

      await writeData('relapseEntries', entry);
      setRelapseEntries(prev => [entry, ...prev]);

      // Clear form
      setSelectedSelf('');
      setSelectedHabits([]);
      setSubstanceUse([]);
      setReflection('');
      setSubmitSuccess(true);
      setTimeout(() => setSubmitSuccess(false), 3000);
      
    } catch (error) {
      console.error("Error generating Oracle feedback:", error);
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
    <div className="bg-gray-800 rounded-lg p-6">
      <div className="mb-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold text-white">Relapse Radar</h2>
          <div className="text-sm text-gray-400">Step {step} of 4</div>
        </div>
        <div className="mb-4 p-3 bg-green-900/30 border border-green-500/30 rounded-lg">
          <p className="text-green-300 text-sm">✨ Self-awareness bonus: Submitting entries rewards your honesty and growth mindset (+30 points, +20 for detailed reflection)</p>
        </div>
        
        {/* AI Insights */}
        {aiInsights.length > 0 && step === 1 && (
          <div className="mb-4 p-4 bg-orange-900/30 border border-orange-500/30 rounded-lg">
            <h3 className="text-orange-300 font-medium mb-3">🤖 AI Recovery Insights</h3>
            <div className="space-y-2">
              {aiInsights.map((insight, idx) => (
                <div key={idx} className="text-orange-200 text-sm bg-orange-800/20 p-2 rounded">
                  {insight}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="w-full bg-gray-700 rounded-full h-2">
          <div 
            className="bg-red-500 h-2 rounded-full transition-all duration-300"
            style={{ width: `${(step / 4) * 100}%` }}
          ></div>
        </div>
      </div>

      {step === 1 && (
        <div className="space-y-4">
          <h3 className="text-xl text-white mb-4">Which self showed up today?</h3>
          <div className="grid grid-cols-2 gap-3">
            {relapseSelves.map((self) => (
              <button
                key={self}
                onClick={() => setSelectedSelf(self)}
                className={`p-3 rounded-lg text-left transition-colors ${
                  selectedSelf === self
                    ? 'bg-red-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                {self}
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <h3 className="text-xl text-white mb-4">What patterns emerged?</h3>
          <div className="grid grid-cols-1 gap-3">
            {relapseHabits.map((habit) => (
              <button
                key={habit}
                onClick={() => handleHabitToggle(habit)}
                className={`p-3 rounded-lg text-left transition-colors ${
                  selectedHabits.includes(habit)
                    ? 'bg-red-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                {habit}
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <h3 className="text-xl text-white mb-4">Any substance use?</h3>
          <div className="grid grid-cols-2 gap-3">
            {substanceOptions.map((substance) => (
              <button
                key={substance}
                onClick={() => handleSubstanceToggle(substance)}
                className={`p-3 rounded-lg text-left transition-colors ${
                  substanceUse.includes(substance)
                    ? 'bg-red-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                {substance}
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="space-y-4">
          <h3 className="text-xl text-white mb-4">Reflection</h3>
          <div className="relative">
            <textarea
              value={reflection}
              onChange={(e) => setReflection(e.target.value)}
              placeholder="What led to this? What can you learn? How will you recover?"
              className="w-full h-32 p-3 pr-14 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-red-500 focus:outline-none"
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
        <div className="mb-6 p-4 bg-green-600 text-white rounded-lg">
          ✅ Relapse entry submitted successfully! Resetting form...
        </div>
      )}

      <div className="flex justify-between mt-6">
        <button
          onClick={prevStep}
          disabled={step === 1 || submitSuccess}
          className="px-4 py-2 bg-gray-600 text-white rounded-lg disabled:opacity-50"
        >
          Previous
        </button>
        <button
          onClick={nextStep}
          disabled={loading || submitSuccess || (step === 1 && !selectedSelf) || (step === 4 && !reflection.trim())}
          className="px-4 py-2 bg-red-600 text-white rounded-lg disabled:opacity-50"
        >
          {loading ? 'Submitting...' : submitSuccess ? 'Success!' : (step === 4 ? 'Submit' : 'Next')}
        </button>
      </div>

      {relapseEntries.length > 0 && (
        <div className="mt-8">
          <h3 className="text-xl text-white mb-4">Recent Entries</h3>
          <div className="space-y-3">
            {relapseEntries.slice(0, 3).map((entry) => (
              <div key={entry.id} className="bg-gray-700 p-4 rounded-lg">
                <div className="text-red-400 font-semibold">{entry.selectedSelf}</div>
                <div className="text-gray-300 text-sm mt-1">
                  {entry.createdAt?.toDate?.()?.toLocaleDateString()}
                </div>
                <div className="text-gray-400 text-sm mt-2">
                  {entry.reflection?.substring(0, 100)}...
                </div>
                {entry.oracleFeedback && (
                  <div className="mt-3 p-3 bg-gray-800/50 border border-purple-500/30 rounded-lg">
                    <h4 className="text-purple-300 font-medium text-sm mb-2">🔮 Oracle's Judgment</h4>
                    <div className="text-purple-200 text-xs leading-relaxed">
                      {entry.oracleFeedback.substring(0, 150)}...
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Oracle Modal */}
      <OracleModal
        isOpen={oracleModal.isOpen}
        onClose={() => setOracleModal({ isOpen: false, content: '', isLoading: false })}
        content={oracleModal.content}
        isLoading={oracleModal.isLoading}
      />
    </div>
  );
};

export default RelapseRadar;
