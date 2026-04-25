import React from 'react';

function MirrorStack({ killTargets = [], hardLessons = [], signalReport }) {
  const finalizedCount = (hardLessons || []).filter(
    l => l?.isFinalized && (l?.ruleGoingForward || '').trim().length > 0
  ).length;
  const violatedInWindow = signalReport?.ruleIntegrity?.violatedInWindow ?? 0;
  const priorViolated = signalReport?.ruleIntegrity?.priorViolatedInWindow;

  const activeTargets = (killTargets || []).filter(t => t?.status === 'active');
  const activeCount = activeTargets.length;

  const weekAgoMs = Date.now() - 7 * 86400000;
  let held = 0;
  let escaped = 0;
  let untouched = 0;
  activeTargets.forEach(t => {
    const recent = (t.checkIns || []).filter(c => {
      const ts = new Date(c.date).getTime();
      return Number.isFinite(ts) && ts > weekAgoMs;
    });
    if (recent.length === 0) untouched += 1;
    else if (recent.some(c => !c.held)) escaped += 1;
    else held += 1;
  });

  const driftCount = (signalReport?.driftSignals || []).length;
  const priorDrift = signalReport?.priorDriftSignalCount;

  let trajectoryText = 'not yet measured';
  const hasDriftPrior = typeof priorDrift === 'number';
  const hasViolationPrior = typeof priorViolated === 'number';
  if (hasDriftPrior || hasViolationPrior) {
    const driftDelta = hasDriftPrior ? driftCount - priorDrift : 0;
    const violationDelta = hasViolationPrior ? violatedInWindow - priorViolated : 0;
    const combined = driftDelta + violationDelta;
    if (combined > 0) trajectoryText = 'deteriorating';
    else if (combined < 0) trajectoryText = 'improving';
    else trajectoryText = 'stable';
  }

  if (finalizedCount === 0 && activeCount === 0) return null;

  return (
    <section className="mb-10 animate-fade-in-up" style={{ animationDelay: '0.06s' }}>
      <div className="oura-card p-6">
        <h3 className="text-[#858585] text-xs uppercase tracking-widest mb-5">Mirror</h3>
        <div className="grid grid-cols-2 gap-6 divide-x divide-[#00d4aa]/20">
          <div className="pr-6">
            <p className="text-[#858585] text-[10px] uppercase tracking-widest mb-3">Declared</p>
            <div className="space-y-3">
              <p className="text-white text-sm">
                <span className="font-light text-2xl tabular-nums text-[#00d4aa]/90">{finalizedCount}</span>
                <span className="text-[#858585] ml-2">finalized rule{finalizedCount !== 1 ? 's' : ''}</span>
              </p>
              <p className="text-white text-sm">
                <span className="font-light text-2xl tabular-nums text-[#00d4aa]/90">{activeCount}</span>
                <span className="text-[#858585] ml-2">active kill contract{activeCount !== 1 ? 's' : ''}</span>
              </p>
            </div>
          </div>
          <div className="pl-6">
            <p className="text-[#858585] text-[10px] uppercase tracking-widest mb-3">Observed</p>
            <div className="space-y-3">
              <p className="text-white text-sm">
                {finalizedCount > 0 ? (
                  <>
                    <span className={`font-light text-2xl tabular-nums ${violatedInWindow > 0 ? 'text-[#b45309]' : 'text-[#ababab]'}`}>{violatedInWindow}</span>
                    <span className="text-[#858585] ml-2">violated in 14d</span>
                  </>
                ) : (
                  <span className="text-[#858585]">no rules to measure</span>
                )}
              </p>
              <p className="text-white text-sm">
                {activeCount > 0 ? (
                  <span className="text-[#ababab]">
                    {held} held · {escaped} escaped · {untouched} untouched in 7d
                  </span>
                ) : (
                  <span className="text-[#858585]">no contracts to measure</span>
                )}
              </p>
            </div>
          </div>
        </div>
        <p className="text-[#858585] text-xs mt-5 pt-4 border-t border-[#1a1a1a]">
          Trajectory: <span className={
            trajectoryText === 'improving' ? 'text-[#00d4aa]' :
            trajectoryText === 'deteriorating' ? 'text-[#b45309]' :
            'text-[#ababab]'
          }>{trajectoryText}</span>.
        </p>
      </div>
    </section>
  );
}

export default React.memo(MirrorStack);
