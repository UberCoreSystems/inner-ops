import React, { useState, useEffect, useCallback } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { getAuth } from '../firebase';
import { readUserData } from '../utils/firebaseUtils';
import { generateSynthesisBriefing } from '../utils/generateSynthesisBriefing';
import ouraToast from '../utils/toast';
import logger from '../utils/logger';

const CADENCE_OPTIONS = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Biweekly' },
];

const SIGNAL_DELTA_LABELS = {
  improving: 'Improving',
  stable: 'Stable',
  deteriorating: 'Deteriorating',
};

const SIGNAL_DELTA_COLORS = {
  improving: 'text-[#22c55e]',
  stable: 'text-[#8a8a8a]',
  deteriorating: 'text-[#ef4444]',
};

export default function SynthesisBriefing() {
  const [userId, setUserId] = useState(null);
  const [briefings, setBriefings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [cadence, setCadence] = useState('weekly');
  const [cadenceLockDate, setCadenceLockDate] = useState(null);
  const [selectedArchive, setSelectedArchive] = useState(null);

  useEffect(() => {
    let unsubscribe;
    const setup = async () => {
      const auth = await getAuth();
      unsubscribe = onAuthStateChanged(auth, (user) => {
        setUserId(user?.uid || null);
        if (user) {
          loadBriefings();
        } else {
          setBriefings([]);
          setInitialLoading(false);
        }
      });
    };
    setup();
    return () => { if (unsubscribe) unsubscribe(); };
  }, []);

  const loadBriefings = async () => {
    setInitialLoading(true);
    try {
      const data = await readUserData('syntheses');
      const sorted = (data || []).sort((a, b) => new Date(b.generatedAt) - new Date(a.generatedAt));
      setBriefings(sorted);
    } catch (err) {
      logger.error('Failed to load syntheses:', err);
    } finally {
      setInitialLoading(false);
    }
  };

  const handleGenerate = async () => {
    if (!userId || generating) return;
    setGenerating(true);
    setCadenceLockDate(null);
    try {
      const briefing = await generateSynthesisBriefing(userId, cadence);
      setBriefings(prev => [briefing, ...prev]);
      ouraToast.success('Briefing generated');
    } catch (err) {
      if (err.message?.startsWith('CADENCE_LOCK:')) {
        const lockDate = new Date(err.message.split(':').slice(1).join(':'));
        setCadenceLockDate(lockDate);
      } else {
        logger.error('Synthesis generation failed:', err);
        ouraToast.error('Failed to generate briefing');
      }
    } finally {
      setGenerating(false);
    }
  };

  const latestBriefing = briefings[0] || null;
  const archiveBriefings = briefings.slice(1);
  const displayBriefing = selectedArchive || latestBriefing;

  if (initialLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-[#3a3a3a] text-sm">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black">
      <div className="max-w-3xl mx-auto px-4 py-10">
        {/* Header */}
        <div className="mb-10">
          <h1 className="text-4xl font-light text-white tracking-tight mb-3">Synthesis Briefing</h1>
          <p className="text-[#5a5a5a] text-sm leading-relaxed">
            Cross-module behavioral intelligence. What your own data reveals across domains.
          </p>
        </div>

        {/* Generate controls */}
        <div className="oura-card p-6 mb-8">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex gap-2">
              {CADENCE_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setCadence(opt.value)}
                  className={`px-4 py-2 rounded-xl text-sm transition-colors ${cadence === opt.value ? 'bg-white text-black font-medium' : 'bg-[#1a1a1a] text-[#8a8a8a] hover:text-white'}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <button
              onClick={handleGenerate}
              disabled={generating || !!cadenceLockDate}
              className="px-6 py-2.5 bg-[#f59e0b] hover:bg-[#ea580c] disabled:bg-[#1a1a1a] disabled:text-[#5a5a5a] text-white rounded-xl font-medium transition-colors text-sm"
            >
              {generating ? 'Generating...' : 'Generate Briefing'}
            </button>
          </div>

          {cadenceLockDate && (
            <p className="mt-4 text-[#5a5a5a] text-sm">
              Next briefing available:{' '}
              <span className="text-[#8a8a8a]">
                {cadenceLockDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              </span>
            </p>
          )}
        </div>

        {/* No briefings yet */}
        {briefings.length === 0 && (
          <div className="oura-card p-12 text-center">
            <p className="text-[#5a5a5a] text-sm mb-2">No briefings generated yet.</p>
            <p className="text-[#3a3a3a] text-xs">Use the controls above to generate your first cross-module synthesis.</p>
          </div>
        )}

        {/* Current / selected briefing */}
        {displayBriefing && (
          <div className="mb-10">
            {selectedArchive && (
              <div className="flex items-center gap-3 mb-4">
                <button onClick={() => setSelectedArchive(null)} className="text-[#5a5a5a] text-xs hover:text-white transition-colors">← Latest</button>
                <span className="text-[#3a3a3a] text-xs">Archive record</span>
              </div>
            )}

            <div className="text-[#3a3a3a] text-xs mb-6">
              {new Date(displayBriefing.generatedAt).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
              {' · '}
              {displayBriefing.cadencePeriod}
            </div>

            {/* Section 1: Convergence Point */}
            <div className="mb-8">
              <div className="text-[#5a5a5a] text-xs uppercase tracking-widest mb-3">Convergence Point</div>
              <p className="text-[#d1d1d1] text-base leading-relaxed">{displayBriefing.convergencePoint}</p>
            </div>

            {/* Section 2: Violated Rules */}
            <div className="mb-8">
              <div className="text-[#5a5a5a] text-xs uppercase tracking-widest mb-3">Violated Rules</div>
              {displayBriefing.violatedRules?.length > 0 ? (
                <div className="space-y-2">
                  {displayBriefing.violatedRules.map((vr, idx) => (
                    <div key={idx} className="border-l-4 border-[#ef4444]/60 pl-4 py-1">
                      <p className="text-[#d1d1d1] text-sm">{vr.rule}</p>
                      <p className="text-[#3a3a3a] text-xs mt-0.5">{vr.source}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[#3a3a3a] text-sm">No rule violations detected this period.</p>
              )}
            </div>

            {/* Section 3: Signal Delta */}
            <div className="mb-8">
              <div className="text-[#5a5a5a] text-xs uppercase tracking-widest mb-3">Signal Delta</div>
              <div className={`text-2xl font-light ${SIGNAL_DELTA_COLORS[displayBriefing.signalDelta] || 'text-[#8a8a8a]'}`}>
                {SIGNAL_DELTA_LABELS[displayBriefing.signalDelta] || displayBriefing.signalDelta}
              </div>
            </div>

            {/* Section 4: Confrontation Question */}
            <div className="border-t border-[#1a1a1a] pt-8">
              <div className="text-[#5a5a5a] text-xs uppercase tracking-widest mb-5">Confrontation Question</div>
              <p className="text-white text-xl font-light leading-relaxed">
                {displayBriefing.confrontationQuestion}
              </p>
            </div>
          </div>
        )}

        {/* Archive */}
        {archiveBriefings.length > 0 && (
          <div className="mt-10">
            <div className="text-[#3a3a3a] text-xs uppercase tracking-widest mb-4">Previous Briefings</div>
            <div className="space-y-2">
              {archiveBriefings.map((b, idx) => (
                <button
                  key={idx}
                  onClick={() => setSelectedArchive(b)}
                  className={`w-full text-left px-5 py-4 rounded-xl border transition-colors ${selectedArchive === b ? 'border-[#f59e0b]/40 bg-[#f59e0b]/5' : 'border-[#1a1a1a] hover:border-[#2a2a2a] bg-[#0a0a0a]'}`}
                >
                  <div className="text-[#8a8a8a] text-sm">
                    {new Date(b.generatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </div>
                  <div className={`text-xs mt-1 ${SIGNAL_DELTA_COLORS[b.signalDelta] || 'text-[#5a5a5a]'}`}>
                    {SIGNAL_DELTA_LABELS[b.signalDelta] || b.signalDelta}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
