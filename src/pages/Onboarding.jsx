import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { saveUserProfile } from '../utils/userProfile';
import { writeData } from '../utils/firebaseUtils';
import { track } from '../utils/analytics';
import logger from '../utils/logger';
import ouraToast from '../utils/toast';
import { RELAPSE_ARCHETYPES, saveConfrontationCriteria } from '../utils/confrontationCriteria';
import BriefingScreen from '../components/onboarding/BriefingScreen';
import { parseLines, PERSONAL_CONTEXT_LIMITS } from '../utils/personalContext';

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
  const [killTarget, setKillTarget] = useState('');
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();

  // BER-200: confrontation criteria setup (step 5)
  const [criterionArchetype, setCriterionArchetype] = useState('');
  const [criterionThreshold, setCriterionThreshold] = useState(2);
  const [criterionQuestion, setCriterionQuestion] = useState('');

  // Personal context (steps 6–8). All optional. Stored on userProfiles and
  // forwarded to the Oracle on every call so feedback can reference the
  // user's actual operating context.
  const [activeSituationsText, setActiveSituationsText] = useState('');
  const [knownTriggersText, setKnownTriggersText] = useState('');
  const [operatingContext, setOperatingContext] = useState('');

  // 0=briefing, 1=driver, 2=style, 3=focus, 4=kill target, 5=confrontation,
  // 6=active situations, 7=known triggers, 8=operating context
  const TOTAL_STEPS = 9;

  const canAdvance = () => {
    if (step === 1) return !!driver;
    if (step === 2) return !!feedbackStyle;
    if (step === 3) return focusStatement.trim().length >= 8;
    return true; // remaining steps are optional
  };

  // Persist the completed/skipped flag and exit. Called from the briefing
  // step's Skip and from any "Skip remaining" affordance. Best-effort —
  // failures here log but do not block the navigate, since the user
  // explicitly asked to leave.
  const handleSkipOnboarding = async () => {
    try {
      await saveUserProfile({
        onboardingCompletedAt: new Date().toISOString(),
        onboardingSkipped: true,
      });
      track('onboarding_skipped', { atStep: step });
    } catch (err) {
      logger.warn('Failed to mark onboarding skipped:', err);
    }
    navigate('/dashboard');
  };

  // Pass 3 New Finding 2 remediation: per-step progress markers stored in
  // sessionStorage so a partial-write failure doesn't re-execute already-
  // completed steps on retry. The marker is keyed by user identity proxy
  // (primaryDriver + focusStatement) so it can't bleed across sessions.
  const handleComplete = async () => {
    setSaving(true);
    const progressKey = `inner_ops_onboarding_progress:${driver}:${focusStatement.trim().slice(0, 32)}`;
    const readProgress = () => {
      try { return JSON.parse(sessionStorage.getItem(progressKey) || '{}'); } catch { return {}; }
    };
    const writeProgress = (patch) => {
      try {
        sessionStorage.setItem(progressKey, JSON.stringify({ ...readProgress(), ...patch }));
      } catch { /* sessionStorage is best-effort */ }
    };

    try {
      const progress = readProgress();

      const activeSituations = parseLines(activeSituationsText, PERSONAL_CONTEXT_LIMITS.ACTIVE_SITUATIONS);
      const knownTriggers = parseLines(knownTriggersText, PERSONAL_CONTEXT_LIMITS.KNOWN_TRIGGERS);

      if (!progress.profileSaved) {
        await saveUserProfile({
          primaryDriver: driver,
          feedbackStyle,
          focusStatement: focusStatement.trim(),
          activeSituations,
          knownTriggers,
          operatingContext: operatingContext.trim(),
          onboardingCompletedAt: new Date().toISOString(),
          onboardingSkipped: false,
        });
        writeProgress({ profileSaved: true });
      }

      // Create kill target if provided
      if (killTarget.trim() && !progress.killTargetSaved) {
        await writeData('killTargets', {
          title: killTarget.trim(),
          description: 'First kill contract — set during onboarding',
          category: 'bad-habit',
          consecutiveDaysRequired: 60,
          status: 'active',
          streak: 0,
          longestStreak: 0,
          checkIns: [],
          lastCheckIn: null,
          escapeData: [],
          targetDate: new Date().toISOString().split('T')[0],
          createdAt: new Date().toISOString(),
          lastUpdated: new Date().toISOString(),
          reflectionNotes: '',
        });
        writeProgress({ killTargetSaved: true });
      }

      // BER-200: save confrontation criterion if user defined one
      if (criterionArchetype && criterionQuestion.trim() && !progress.criterionSaved) {
        await saveConfrontationCriteria([{
          id: `criterion_${Date.now()}`,
          archetypeName: criterionArchetype,
          threshold: Math.max(1, Math.min(10, criterionThreshold || 2)),
          periodDays: 30,
          question: criterionQuestion.trim(),
        }]);
        writeProgress({ criterionSaved: true });
      }

      track('onboarding_completed', {
        primaryDriver: driver,
        feedbackStyle,
        hasKillTarget: !!killTarget.trim(),
        hasConfrontationCriterion: !!(criterionArchetype && criterionQuestion.trim()),
        activeSituationsCount: activeSituations.length,
        knownTriggersCount: knownTriggers.length,
        hasOperatingContext: !!operatingContext.trim(),
      });
      // All writes succeeded — clear the resume marker.
      try { sessionStorage.removeItem(progressKey); } catch { /* noop */ }
      navigate('/dashboard');
    } catch (err) {
      logger.error('Failed to save profile:', err);
      ouraToast.error('Failed to save profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleNext = () => {
    if (step < TOTAL_STEPS - 1) {
      setStep(step + 1);
    } else {
      handleComplete();
    }
  };

  // Step 0 (briefing) renders the standalone BriefingScreen so the same copy
  // is shown both here and from Settings → Replay briefing.
  if (step === 0) {
    return (
      <BriefingScreen
        onContinue={() => setStep(1)}
        onSkip={handleSkipOnboarding}
        primaryLabel="Continue"
        secondaryLabel="Skip"
        showProgress
        stepIndex={0}
        totalSteps={TOTAL_STEPS}
      />
    );
  }

  return (
    <div className="min-h-[100dvh] bg-black flex items-stretch sm:items-center justify-center px-4 max-sm:py-6 sm:py-12">
      <div className="max-w-xl w-full">

        {/* Progress bar */}
        <div className="flex flex-col gap-1.5 mb-6 sm:mb-10 max-sm:sticky max-sm:top-0 max-sm:z-10 max-sm:bg-black/95 max-sm:backdrop-blur-sm max-sm:py-3 max-sm:-mx-4 max-sm:px-4">
          <div className="flex gap-1.5">
            {Array.from({ length: TOTAL_STEPS }, (_, i) => (
              <div
                key={i}
                className={`h-0.5 flex-1 rounded-full transition-all duration-500 ${i <= step ? 'bg-white' : 'bg-[#1a1a1a]'}`}
              />
            ))}
          </div>
          <div className="sm:hidden text-[#858585] text-[10px] uppercase tracking-widest text-center">
            Step {step + 1} of {TOTAL_STEPS}
          </div>
        </div>

        {/* Step 1: Primary driver */}
        {step === 1 && (
          <div className="animate-fade-in-up">
            <p className="text-[#858585] text-xs uppercase tracking-widest mb-4">Question 1 of 3</p>
            <h2 className="text-2xl font-light text-white mb-8">What's the main reason you're here?</h2>
            <div className="space-y-3">
              {DRIVERS.map((d) => (
                <button
                  key={d.value}
                  onClick={() => setDriver(d.value)}
                  className={`w-full text-left p-4 rounded-2xl border transition-all duration-200 ${
                    driver === d.value
                      ? 'border-white bg-white/5 text-white'
                      : 'border-[#1a1a1a] text-[#ababab] hover:border-[#2a2a2a] hover:text-white'
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
            <p className="text-[#858585] text-xs uppercase tracking-widest mb-4">Question 2 of 3</p>
            <h2 className="text-2xl font-light text-white mb-2">How should the Oracle respond to you?</h2>
            <p className="text-[#858585] text-sm mb-8">This can be changed later in your profile.</p>
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
                  <div className={`font-medium mb-0.5 transition-colors ${feedbackStyle === s.value ? 'text-white' : 'text-[#ababab]'}`}>
                    {s.label}
                  </div>
                  <div className="text-[#858585] text-sm">{s.description}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 3: Focus statement */}
        {step === 3 && (
          <div className="animate-fade-in-up">
            <p className="text-[#858585] text-xs uppercase tracking-widest mb-4">Question 3 of 3</p>
            <h2 className="text-2xl font-light text-white mb-3">In one sentence — what do you most want to eliminate or become?</h2>
            <p className="text-[#858585] text-sm mb-8">The Oracle will use this as context every time it responds to you.</p>
            <textarea
              value={focusStatement}
              onChange={(e) => setFocusStatement(e.target.value)}
              placeholder="e.g. Stop numbing discomfort with distraction and build the discipline to do hard things alone."
              rows={3}
              className="w-full p-4 bg-[#0a0a0a] text-white rounded-2xl border border-[#1a1a1a] focus:border-white focus:outline-none resize-none placeholder-[#6a6a6a] transition-colors"
            />
            <div className={`text-xs mt-2 text-right transition-colors ${focusStatement.trim().length >= 8 ? 'text-[#858585]' : 'text-[#2a2a2a]'}`}>
              {focusStatement.trim().length} characters
            </div>
          </div>
        )}

        {/* Step 4: Kill target seed */}
        {step === 4 && (
          <div className="animate-fade-in-up">
            <p className="text-[#858585] text-xs uppercase tracking-widest mb-4">One more thing</p>
            <h2 className="text-2xl font-light text-white mb-3">Name the one pattern that's costing you the most right now.</h2>
            <p className="text-[#858585] text-sm mb-8">This becomes your first kill contract. You can skip this and add targets later.</p>
            <input
              type="text"
              value={killTarget}
              onChange={(e) => setKillTarget(e.target.value)}
              placeholder="e.g. Doomscrolling at night, avoiding hard conversations, porn..."
              className="w-full p-4 bg-[#0a0a0a] text-white rounded-2xl border border-[#1a1a1a] focus:border-white focus:outline-none placeholder-[#6a6a6a] transition-colors"
            />
          </div>
        )}

        {/* Step 5: Confrontation criteria — BER-200 */}
        {step === 5 && (
          <div className="animate-fade-in-up">
            <p className="text-[#858585] text-xs uppercase tracking-widest mb-4">Optional</p>
            <h2 className="text-2xl font-light text-white mb-3">Set a confrontation trigger.</h2>
            <p className="text-[#858585] text-sm mb-8">
              When a specific pattern repeats, the Oracle puts your own question back to you — not a system-generated one. You can skip this and set it later.
            </p>

            {/* Archetype */}
            <div className="mb-5">
              <label className="text-[#858585] text-xs uppercase tracking-widest block mb-2">When the pattern is</label>
              <select
                value={criterionArchetype}
                onChange={(e) => setCriterionArchetype(e.target.value)}
                className="w-full p-4 bg-[#0a0a0a] text-white rounded-2xl border border-[#1a1a1a] focus:border-white focus:outline-none transition-colors appearance-none"
              >
                <option value="">Select a pattern...</option>
                {RELAPSE_ARCHETYPES.map(({ id, label }) => (
                  <option key={id} value={id}>{label}</option>
                ))}
              </select>
            </div>

            {/* Threshold */}
            <div className="mb-5">
              <label className="text-[#858585] text-xs uppercase tracking-widest block mb-2">
                {criterionThreshold} time{criterionThreshold !== 1 ? 's' : ''} in 30 days
              </label>
              <input
                type="range"
                min={1}
                max={10}
                value={criterionThreshold}
                onChange={(e) => setCriterionThreshold(Number(e.target.value))}
                className="w-full accent-white"
              />
              <div className="flex justify-between text-[#858585] text-xs mt-1">
                <span>1</span><span>10</span>
              </div>
            </div>

            {/* Question */}
            <div className="mb-2">
              <label className="text-[#858585] text-xs uppercase tracking-widest block mb-2">I want to be asked</label>
              <textarea
                value={criterionQuestion}
                onChange={(e) => setCriterionQuestion(e.target.value)}
                rows={3}
                placeholder="e.g. What exactly are you running from right now?"
                className="w-full p-4 bg-[#0a0a0a] text-white rounded-2xl border border-[#1a1a1a] focus:border-white focus:outline-none resize-none placeholder-[#6a6a6a] transition-colors"
              />
            </div>
          </div>
        )}

        {/* Step 6: Active situations */}
        {step === 6 && (
          <div className="animate-fade-in-up">
            <p className="text-[#858585] text-xs uppercase tracking-widest mb-4">Optional · Operating context 1 of 3</p>
            <h2 className="text-2xl font-light text-white mb-3">What are you currently navigating?</h2>
            <p className="text-[#858585] text-sm mb-8">
              The situations consuming your attention right now. The Oracle and the journal prompt you when you go quiet will reference these by name. One per line. Up to three.
            </p>
            <textarea
              value={activeSituationsText}
              onChange={(e) => setActiveSituationsText(e.target.value)}
              placeholder={'e.g.\nCareer transition — uncertain runway\nRebuilding after the breakup\nFinancial reset'}
              rows={5}
              className="w-full p-4 bg-[#0a0a0a] text-white rounded-2xl border border-[#1a1a1a] focus:border-white focus:outline-none resize-none placeholder-[#6a6a6a] transition-colors"
            />
            <p className="text-[#858585] text-xs mt-2">Skip by leaving blank.</p>
          </div>
        )}

        {/* Step 7: Known triggers */}
        {step === 7 && (
          <div className="animate-fade-in-up">
            <p className="text-[#858585] text-xs uppercase tracking-widest mb-4">Optional · Operating context 2 of 3</p>
            <h2 className="text-2xl font-light text-white mb-3">Where do you historically fail?</h2>
            <p className="text-[#858585] text-sm mb-8">
              The times, places, or states that consistently precede failure. Naming them now sharpens drift detection later. One per line. Up to five.
            </p>
            <textarea
              value={knownTriggersText}
              onChange={(e) => setKnownTriggersText(e.target.value)}
              placeholder={'e.g.\nAlone after 11pm\nAfter conflict with R.\nWhen finances are tight\nLong unstructured weekends'}
              rows={6}
              className="w-full p-4 bg-[#0a0a0a] text-white rounded-2xl border border-[#1a1a1a] focus:border-white focus:outline-none resize-none placeholder-[#6a6a6a] transition-colors"
            />
            <p className="text-[#858585] text-xs mt-2">Skip by leaving blank.</p>
          </div>
        )}

        {/* Step 8: Operating context */}
        {step === 8 && (
          <div className="animate-fade-in-up">
            <p className="text-[#858585] text-xs uppercase tracking-widest mb-4">Optional · Operating context 3 of 3</p>
            <h2 className="text-2xl font-light text-white mb-3">Anything else the system should know?</h2>
            <p className="text-[#858585] text-sm mb-8">
              Constraints, history, current state — anything that would help the Oracle give you sharper feedback. Free-form.
            </p>
            <textarea
              value={operatingContext}
              onChange={(e) => setOperatingContext(e.target.value)}
              placeholder="e.g. Recovering from injury, no caffeine for the next 90 days. Sober 18 months. Single parent — limited solitude. Don't soften when I'm rationalizing."
              rows={6}
              className="w-full p-4 bg-[#0a0a0a] text-white rounded-2xl border border-[#1a1a1a] focus:border-white focus:outline-none resize-none placeholder-[#6a6a6a] transition-colors"
            />
            <p className="text-[#858585] text-xs mt-2">Skip by leaving blank.</p>
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between items-center mt-12 max-sm:mt-8 max-sm:sticky max-sm:bottom-16 max-sm:z-10 max-sm:bg-black/95 max-sm:backdrop-blur-sm max-sm:-mx-4 max-sm:px-4 max-sm:py-3">
          <button
            onClick={() => setStep(step - 1)}
            className="text-[#858585] hover:text-white transition-colors text-sm min-h-11 inline-flex items-center"
          >
            Back
          </button>

          <button
            onClick={handleNext}
            disabled={!canAdvance() || saving}
            className="px-8 py-3 bg-white text-black font-medium rounded-2xl disabled:opacity-20 hover:bg-gray-100 transition-all duration-200 text-sm min-h-11"
          >
            {saving ? 'Saving...' : step === TOTAL_STEPS - 1 ? 'Enter' : 'Continue'}
          </button>
        </div>

      </div>
    </div>
  );
}
