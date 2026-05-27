import React from 'react';
import { composeMirrorReading } from '../utils/composeMirrorReading.js';

// MirrorStack — the Dashboard's reflective surface. Renders the layered
// reading produced by composeMirrorReading: identity DIRECTION, OBSERVED
// tension lines, optional PRECURSOR alert, SYNTHESIS, and a closing QUESTION.
// All content selection lives in the util; this component only renders.
function MirrorStack({
  killTargets = [],
  hardLessons = [],
  relapseEntries = [],
  signalReport,
  behavioralContext,
}) {
  const reading = composeMirrorReading({
    killTargets,
    hardLessons,
    relapseEntries,
    signalReport,
    behavioralContext,
  });

  const hasAnything =
    !!reading.direction ||
    reading.observedLines.length > 0 ||
    !!reading.precursorAlert ||
    !!reading.synthesis ||
    !!reading.question;

  if (!hasAnything) return null;

  return (
    <section className="mb-10 animate-fade-in-up" style={{ animationDelay: '0.06s' }}>
      <div
        className="oura-card p-6 border"
        style={{ borderColor: 'rgba(77, 166, 255, 0.15)' }}
      >
        <h3 className="text-[#858585] text-xs uppercase tracking-widest mb-5">Mirror</h3>

        {reading.direction && (
          <div>
            <p className="text-[#858585] text-[10px] uppercase tracking-widest mb-2">Direction</p>
            <p className="text-white text-base font-light leading-relaxed italic">
              “{reading.direction}”
            </p>
          </div>
        )}

        {reading.observedLines.length > 0 && (
          <div className={reading.direction ? 'mt-5 pt-5 border-t border-[#1a1a1a]' : ''}>
            <p className="text-[#858585] text-[10px] uppercase tracking-widest mb-3">Observed</p>
            <div className="space-y-3">
              {reading.observedLines.map((line, i) => (
                <p key={i} className="text-[#ababab] text-sm leading-relaxed">
                  {line}
                </p>
              ))}
            </div>
          </div>
        )}

        {reading.precursorAlert && (
          <div className="mt-5 border-l-2 border-l-[#b45309] bg-[#b45309]/5 pl-4 py-3 rounded-r-lg">
            <p className="text-[#b45309] text-[10px] uppercase tracking-widest mb-1">Precursor</p>
            <p className="text-[#f5f5f5] text-sm leading-relaxed">
              {reading.precursorAlert}
            </p>
          </div>
        )}

        {reading.synthesis && (
          <div className="mt-5 pt-5 border-t border-[#1a1a1a]">
            <p
              className="text-[#4da6ff] text-sm leading-relaxed font-medium"
              style={{ textShadow: '0 0 16px rgba(77, 166, 255, 0.4)' }}
            >
              {reading.synthesis}
            </p>
          </div>
        )}

        {reading.question && (
          <div className="mt-3">
            <p className="text-[#858585] text-sm leading-relaxed italic">
              {reading.question}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

export default React.memo(MirrorStack);
