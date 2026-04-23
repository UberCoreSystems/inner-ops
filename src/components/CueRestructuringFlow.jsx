import React, { useState } from 'react';
import { writeData } from '../utils/firebaseUtils';
import { PATTERN_LABELS } from '../utils/blackMirrorAnalytics';
import logger from '../utils/logger';

const inferCueFromPattern = (pattern) => {
  if (!pattern.evidence) return '';
  switch (pattern.rule) {
    case 'REPEATED_DISTRACTION_CYCLE': {
      const windows = pattern.evidence.windows || [];
      return windows.length > 0 ? `${windows[0].label} hours` : '';
    }
    case 'TIME_BASED_BEHAVIOR_CLUSTER': {
      const d = pattern.evidence.dominantWindow;
      return d ? `${d.label} window` : '';
    }
    case 'JOURNAL_DROPOFF_DISTRACTION_SPIKE':
      return 'journaling gap';
    case 'AVOIDANCE_PATTERN_TRIGGER_LINK':
      return 'relapse event';
    default:
      return '';
  }
};

const CueRestructuringFlow = ({ pattern, onSave, onCancel }) => {
  const [step, setStep] = useState(1);
  const [cueName, setCueName] = useState(inferCueFromPattern(pattern));
  const [targetBehavior, setTargetBehavior] = useState(PATTERN_LABELS[pattern.rule] || pattern.rule);
  const [statedConflict, setStatedConflict] = useState('');
  const [substitutionTrigger, setSubstitutionTrigger] = useState('');
  const [substitutionAction, setSubstitutionAction] = useState('');
  const [saving, setSaving] = useState(false);

  const canAdvance = () => {
    if (step === 1) return cueName.trim().length > 0;
    if (step === 2) return targetBehavior.trim().length > 0;
    if (step === 3) return statedConflict.trim().length > 0;
    if (step === 4) return substitutionTrigger.trim().length > 0 && substitutionAction.trim().length > 0;
    return false;
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const record = {
        patternRule: pattern.rule,
        patternEvidence: pattern.evidence || null,
        cueName: cueName.trim(),
        targetBehavior: targetBehavior.trim(),
        statedConflict: statedConflict.trim(),
        substitutionTrigger: substitutionTrigger.trim(),
        substitutionAction: substitutionAction.trim(),
        createdAt: new Date().toISOString(),
        status: 'active',
      };
      const saved = await writeData('cueRestructurings', record);
      onSave(saved);
    } catch (err) {
      logger.error('CueRestructuringFlow: save failed', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-4 border border-oura-border bg-oura-darker rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs uppercase tracking-widest text-[#858585]">
          Cue Restructuring — Step {step}/4
        </span>
        <button
          onClick={onCancel}
          className="text-xs text-gray-600 hover:text-gray-400 transition-colors"
        >
          Cancel
        </button>
      </div>

      {step === 1 && (
        <div>
          <p className="text-gray-400 text-sm mb-3">What fires this pattern?</p>
          <input
            type="text"
            value={cueName}
            onChange={e => setCueName(e.target.value)}
            className="w-full p-3 bg-black text-white rounded-xl border border-oura-border focus:border-oura-red focus:outline-none transition-all duration-200 text-sm"
            placeholder="Name the cue"
            autoFocus
          />
        </div>
      )}

      {step === 2 && (
        <div>
          <p className="text-gray-400 text-sm mb-3">What does it make you do?</p>
          <input
            type="text"
            value={targetBehavior}
            onChange={e => setTargetBehavior(e.target.value)}
            className="w-full p-3 bg-black text-white rounded-xl border border-oura-border focus:border-oura-red focus:outline-none transition-all duration-200 text-sm"
            placeholder="Name the behavior it produces"
            autoFocus
          />
        </div>
      )}

      {step === 3 && (
        <div>
          <p className="text-gray-400 text-sm mb-3">What did you say you wanted instead?</p>
          <textarea
            value={statedConflict}
            onChange={e => setStatedConflict(e.target.value)}
            rows={3}
            className="w-full p-3 bg-black text-white rounded-xl border border-oura-border focus:border-oura-red focus:outline-none resize-none transition-all duration-200 text-sm"
            placeholder="State the competing commitment"
            autoFocus
          />
        </div>
      )}

      {step === 4 && (
        <div>
          <p className="text-gray-400 text-sm mb-4">Lock the substitution.</p>
          <div className="space-y-3 mb-4">
            <div>
              <p className="text-gray-600 text-xs mb-2">When:</p>
              <input
                type="text"
                value={substitutionTrigger}
                onChange={e => setSubstitutionTrigger(e.target.value)}
                className="w-full p-3 bg-black text-white rounded-xl border border-oura-border focus:border-oura-red focus:outline-none transition-all duration-200 text-sm"
                placeholder="[cue fires]"
                autoFocus
              />
            </div>
            <div>
              <p className="text-gray-600 text-xs mb-2">I will:</p>
              <input
                type="text"
                value={substitutionAction}
                onChange={e => setSubstitutionAction(e.target.value)}
                className="w-full p-3 bg-black text-white rounded-xl border border-oura-border focus:border-oura-red focus:outline-none transition-all duration-200 text-sm"
                placeholder="[action]"
              />
            </div>
          </div>
          {(substitutionTrigger.trim() || substitutionAction.trim()) && (
            <div className="p-4 bg-black border border-oura-red/40 rounded-xl mb-2">
              <p className="text-white text-sm leading-relaxed">
                When {substitutionTrigger.trim() || '[cue fires]'}: I will {substitutionAction.trim() || '[action]'}.
              </p>
            </div>
          )}
        </div>
      )}

      <div className="flex justify-between mt-5">
        {step > 1 ? (
          <button
            onClick={() => setStep(s => s - 1)}
            className="text-xs text-gray-600 hover:text-gray-400 transition-colors"
          >
            Back
          </button>
        ) : (
          <span />
        )}

        {step < 4 ? (
          <button
            onClick={() => setStep(s => s + 1)}
            disabled={!canAdvance()}
            className="px-4 py-2 bg-oura-darker border border-oura-border text-gray-300 hover:text-white hover:border-gray-500 disabled:opacity-40 rounded-xl text-sm transition-all duration-200"
          >
            Next
          </button>
        ) : (
          <button
            onClick={handleSave}
            disabled={!canAdvance() || saving}
            className="px-4 py-2 bg-oura-red hover:bg-red-600 disabled:opacity-40 text-white rounded-xl text-sm transition-all duration-200"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        )}
      </div>
    </div>
  );
};

export default CueRestructuringFlow;
