
import React, { useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase';
import { writeData, readUserData } from '../utils/firebaseUtils';
import { aiUtils } from '../utils/aiUtils';
import { generateAIFeedback } from '../utils/aiFeedback';
import VoiceInputButton from './VoiceInputButton';
import OracleModal from './OracleModal';
import ouraToast from '../utils/toast';

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
      
      ouraToast.success('Relapse check-in logged');

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
    <div className="oura-card p-6">
      <div className="mb-8">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-3xl font-light text-white tracking-tight">Relapse Radar</h2>
          <div className="text-sm text-gray-500">Step {step} of 4</div>
        </div>
        <div className="mb-6 oura-card border-l-4 border-oura-amber p-4">
          <p className="text-gray-300 text-sm leading-relaxed">✨ Self-awareness bonus: Submitting entries rewards your honesty and growth mindset (+30 points, +20 for detailed reflection)</p>
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
          disabled={loading || submitSuccess || (step === 1 && !selectedSelf) || (step === 4 && !reflection.trim())}
          className="px-6 py-3 bg-oura-amber text-black font-medium rounded-2xl disabled:opacity-30 hover:bg-amber-500 transition-all duration-200"
        >
          {loading ? 'Submitting...' : submitSuccess ? 'Success!' : (step === 4 ? 'Submit' : 'Next')}
        </button>
      </div>

      {relapseEntries.length > 0 && (
        <div className="mt-10">
          <h3 className="text-2xl font-light text-white mb-6 tracking-tight">
            Recent Entries <span className="text-gray-500 text-lg">({relapseEntries.length})</span>
          </h3>
          <div className="space-y-3">
            {relapseEntries.slice(0, 3).map((entry) => (
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
