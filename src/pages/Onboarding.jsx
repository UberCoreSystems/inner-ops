import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { saveUserProfile } from '../utils/userProfile';
import { track } from '../utils/analytics';
import logger from '../utils/logger';

const DRIVERS = [
  { value: 'addiction', label: 'Breaking an addiction or compulsive pattern' },
  { value: 'loss', label: 'Processing a loss, betrayal, or painful experience' },
  { value: 'clarity', label: 'Building mental clarity and discipline' },
  { value: 'elimination', label: 'Eliminating behaviors that are costing me' },
  { value: 'becoming', label: 'Becoming someone specific — not just fixing problems' },
];

const FEEDBACK_STYLES = [
  { value: 'ruthless', label: 'Ruthless', description: 'No comfort. No softening. Just what is true.' },
  { value: 'strategic', label: 'Strategic', description: 'Cut to the decision I\'m avoiding. What\'s the move.' },
  { value: 'philosophical', label: 'Philosophical', description: 'Challenge my assumptions. Make me think differently.' },
  { value: 'balanced', label: 'Balanced', description: 'Direct and honest, but not brutal.' },
];

export default function Onboarding() {
  const [step, setStep] = useState(0);
  const [driver, setDriver] = useState('');
  const [feedbackStyle, setFeedbackStyle] = useState('');
  const [focusStatement, setFocusStatement] = useState('');
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();

  const canAdvance = () => {
    if (step === 1) return !!driver;
    if (step === 2) return !!feedbackStyle;
    if (step === 3) return focusStatement.trim().length >= 8;
    return true;
  };

  const handleComplete = async () => {
    setSaving(true);
    try {
      await saveUserProfile({
        primaryDriver: driver,
        feedbackStyle,
        focusStatement: focusStatement.trim(),
        onboardingCompletedAt: new Date().toISOString(),
      });
      track('onboarding_completed', { primaryDriver: driver, feedbackStyle });
    } catch (err) {
      logger.error('Failed to save profile:', err);
    } finally {
      setSaving(false);
      navigate('/dashboard');
    }
  };

  const handleNext = () => {
    if (step < 3) {
      setStep(step + 1);
    } else {
      handleComplete();
    }
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-4 py-12">
      <div className="max-w-xl w-full">

        {/* Progress bar */}
        <div className="flex gap-1.5 mb-10">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={`h-0.5 flex-1 rounded-full transition-all duration-500 ${i <= step ? 'bg-white' : 'bg-[#1a1a1a]'}`}
            />
          ))}
        </div>

        {/* Step 0: Welcome */}
        {step === 0 && (
          <div className="animate-fade-in-up">
            <p className="text-[#5a5a5a] text-xs uppercase tracking-widest mb-4">Inner Operations</p>
            <h1 className="text-4xl font-light text-white mb-6 leading-tight">
              This is your inner command center.
            </h1>
            <p className="text-[#8a8a8a] text-lg leading-relaxed mb-4">
              Every module — your journal, kill list, hard lessons, relapse tracking — feeds an AI advisor called the Oracle.
            </p>
            <p className="text-[#8a8a8a] text-lg leading-relaxed">
              The Oracle reads what you actually write and responds to it directly. No generic advice. No comfort. The more honest you are, the more useful it becomes.
            </p>
            <p className="text-[#5a5a5a] text-sm mt-8">Three questions before you start. Takes 90 seconds.</p>
          </div>
        )}

        {/* Step 1: Primary driver */}
        {step === 1 && (
          <div className="animate-fade-in-up">
            <p className="text-[#5a5a5a] text-xs uppercase tracking-widest mb-4">Question 1 of 3</p>
            <h2 className="text-2xl font-light text-white mb-8">What's the main reason you're here?</h2>
            <div className="space-y-3">
              {DRIVERS.map((d) => (
                <button
                  key={d.value}
                  onClick={() => setDriver(d.value)}
                  className={`w-full text-left p-4 rounded-2xl border transition-all duration-200 ${
                    driver === d.value
                      ? 'border-white bg-white/5 text-white'
                      : 'border-[#1a1a1a] text-[#8a8a8a] hover:border-[#2a2a2a] hover:text-white'
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 2: Feedback style */}
        {step === 2 && (
          <div className="animate-fade-in-up">
            <p className="text-[#5a5a5a] text-xs uppercase tracking-widest mb-4">Question 2 of 3</p>
            <h2 className="text-2xl font-light text-white mb-2">How should the Oracle respond to you?</h2>
            <p className="text-[#5a5a5a] text-sm mb-8">This can be changed later in your profile.</p>
            <div className="space-y-3">
              {FEEDBACK_STYLES.map((s) => (
                <button
                  key={s.value}
                  onClick={() => setFeedbackStyle(s.value)}
                  className={`w-full text-left p-4 rounded-2xl border transition-all duration-200 ${
                    feedbackStyle === s.value
                      ? 'border-white bg-white/5'
                      : 'border-[#1a1a1a] hover:border-[#2a2a2a]'
                  }`}
                >
                  <div className={`font-medium mb-0.5 transition-colors ${feedbackStyle === s.value ? 'text-white' : 'text-[#8a8a8a]'}`}>
                    {s.label}
                  </div>
                  <div className="text-[#5a5a5a] text-sm">{s.description}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 3: Focus statement */}
        {step === 3 && (
          <div className="animate-fade-in-up">
            <p className="text-[#5a5a5a] text-xs uppercase tracking-widest mb-4">Question 3 of 3</p>
            <h2 className="text-2xl font-light text-white mb-3">In one sentence — what do you most want to eliminate or become?</h2>
            <p className="text-[#5a5a5a] text-sm mb-8">The Oracle will use this as context every time it responds to you.</p>
            <textarea
              value={focusStatement}
              onChange={(e) => setFocusStatement(e.target.value)}
              placeholder="e.g. Stop numbing discomfort with distraction and build the discipline to do hard things alone."
              rows={3}
              className="w-full p-4 bg-[#0a0a0a] text-white rounded-2xl border border-[#1a1a1a] focus:border-white focus:outline-none resize-none placeholder-[#3a3a3a] transition-colors"
            />
            <div className={`text-xs mt-2 text-right transition-colors ${focusStatement.trim().length >= 8 ? 'text-[#5a5a5a]' : 'text-[#2a2a2a]'}`}>
              {focusStatement.trim().length} characters
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between items-center mt-12">
          {step > 0 ? (
            <button
              onClick={() => setStep(step - 1)}
              className="text-[#5a5a5a] hover:text-white transition-colors text-sm"
            >
              Back
            </button>
          ) : (
            <button
              onClick={() => navigate('/dashboard')}
              className="text-[#3a3a3a] hover:text-[#5a5a5a] transition-colors text-sm"
            >
              Skip
            </button>
          )}

          <button
            onClick={handleNext}
            disabled={!canAdvance() || saving}
            className="px-8 py-3 bg-white text-black font-medium rounded-2xl disabled:opacity-20 hover:bg-gray-100 transition-all duration-200 text-sm"
          >
            {saving ? 'Saving...' : step === 3 ? 'Enter' : 'Continue'}
          </button>
        </div>

      </div>
    </div>
  );
}
