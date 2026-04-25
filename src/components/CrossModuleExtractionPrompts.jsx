import React from 'react';

/**
 * CrossModuleExtractionPrompts — inline, dismissible prompt cards shown after a journal entry
 * is saved when the Oracle detects a Kill List contract or Relapse Radar signal.
 *
 * Props:
 *   extractions: { killList: {...}|null, relapseRadar: {...}|null }
 *   onDismissKillList: () => void
 *   onDismissRelapseRadar: () => void
 *   onConfirmKillList: (extraction) => void
 *   onConfirmRelapseRadar: (extraction) => void
 */
export default function CrossModuleExtractionPrompts({
  extractions,
  onDismissKillList,
  onDismissRelapseRadar,
  onConfirmKillList,
  onConfirmRelapseRadar,
}) {
  const { killList, relapseRadar } = extractions || {};

  if (!killList && !relapseRadar) return null;

  return (
    <div className="space-y-3 mb-8 animate-fade-in-up">
      {killList && (
        <div className="border border-[#ef4444]/30 bg-[#ef4444]/5 rounded-2xl p-4">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <p className="text-[#ef4444] text-xs uppercase tracking-widest mb-1">Ledger Signal</p>
              <p className="text-white text-sm font-medium">{killList.targetTitle}</p>
            </div>
            <button
              onClick={onDismissKillList}
              className="text-[#858585] hover:text-[#ababab] transition-colors text-xs flex-shrink-0 mt-0.5"
              title="Dismiss"
            >
              ✕
            </button>
          </div>
          <p className="text-[#ababab] text-xs leading-relaxed mb-3">
            {killList.targetDescription}
          </p>
          <p className="text-[#858585] text-xs italic mb-3 border-l-2 border-[#ef4444]/20 pl-2">
            "{killList.evidenceFromEntry}"
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => onConfirmKillList(killList)}
              className="px-4 py-1.5 bg-[#ef4444]/20 hover:bg-[#ef4444]/30 text-[#ef4444] text-xs font-medium rounded-lg transition-colors"
            >
              Add to Ledger
            </button>
            <button
              onClick={onDismissKillList}
              className="px-4 py-1.5 text-[#858585] hover:text-[#858585] text-xs transition-colors"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {relapseRadar && (
        <div className="border border-[#f59e0b]/30 bg-[#f59e0b]/5 rounded-2xl p-4">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <p className="text-[#f59e0b] text-xs uppercase tracking-widest">The Signal</p>
                {relapseRadar.urgency && (
                  <span className={`text-xs px-1.5 py-0.5 rounded-md border ${
                    relapseRadar.urgency === 'high'
                      ? 'text-[#ef4444] border-[#ef4444]/30 bg-[#ef4444]/10'
                      : relapseRadar.urgency === 'medium'
                        ? 'text-[#f59e0b] border-[#f59e0b]/30 bg-[#f59e0b]/10'
                        : 'text-[#858585] border-[#5a5a5a]/30 bg-[#5a5a5a]/10'
                  }`}>
                    {relapseRadar.urgency}
                  </span>
                )}
              </div>
              <p className="text-white text-sm font-medium">{relapseRadar.signalSummary}</p>
            </div>
            <button
              onClick={onDismissRelapseRadar}
              className="text-[#858585] hover:text-[#ababab] transition-colors text-xs flex-shrink-0 mt-0.5"
              title="Dismiss"
            >
              ✕
            </button>
          </div>
          {Array.isArray(relapseRadar.precursorConditions) && relapseRadar.precursorConditions.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-3">
              {relapseRadar.precursorConditions.map((c) => (
                <span key={c} className="text-xs px-2 py-0.5 bg-[#f59e0b]/10 border border-[#f59e0b]/20 text-[#f59e0b] rounded-md">
                  {c.replace(/_/g, ' ')}
                </span>
              ))}
            </div>
          )}
          <p className="text-[#858585] text-xs italic mb-3 border-l-2 border-[#f59e0b]/20 pl-2">
            "{relapseRadar.evidenceFromEntry}"
          </p>
          {relapseRadar.relatedKillTarget && (
            <p className="text-[#858585] text-xs mb-3">
              Connected to Ledger target: <span className="text-[#ababab]">{relapseRadar.relatedKillTarget}</span>
            </p>
          )}
          <div className="flex gap-2">
            <button
              onClick={() => onConfirmRelapseRadar(relapseRadar)}
              className="px-4 py-1.5 bg-[#f59e0b]/20 hover:bg-[#f59e0b]/30 text-[#f59e0b] text-xs font-medium rounded-lg transition-colors"
            >
              Log Radar Entry
            </button>
            <button
              onClick={onDismissRelapseRadar}
              className="px-4 py-1.5 text-[#858585] hover:text-[#858585] text-xs transition-colors"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
