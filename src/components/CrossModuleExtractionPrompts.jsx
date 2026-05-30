/**
 * CrossModuleExtractionPrompts — inline, dismissible suggestion cards. Oracle
 * classifies a journal entry into three independent signals (Kill List
 * contract, Relapse Radar precursor, Hard Lesson) and surfaces whichever
 * apply. Each card uses the destination module's canonical color so the
 * surface is recognizable at a glance:
 *
 *   • General Ledger / Kill List → red   #ef4444
 *   • The Signal / Relapse Radar → cyan  #00d4aa
 *   • Hard Lessons               → amber #b45309
 *
 * Props:
 *   extractions: { killList: {...}|null, relapseRadar: {...}|null, hardLesson: {...}|null }
 *   onDismissKillList / onDismissRelapseRadar / onDismissHardLesson
 *   onConfirmKillList / onConfirmRelapseRadar / onConfirmHardLesson
 */
export default function CrossModuleExtractionPrompts({
  extractions,
  onDismissKillList,
  onDismissRelapseRadar,
  onDismissHardLesson,
  onConfirmKillList,
  onConfirmRelapseRadar,
  onConfirmHardLesson,
}) {
  const { killList, relapseRadar, hardLesson } = extractions || {};

  if (!killList && !relapseRadar && !hardLesson) return null;

  return (
    <div className="space-y-3 mb-8 animate-fade-in-up">
      {killList && (
        <div className="border border-[#ef4444]/30 bg-[#ef4444]/5 rounded-2xl p-4">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <p className="text-[#ef4444] text-xs uppercase tracking-widest mb-1">General Ledger</p>
              <p className="text-white text-sm font-medium">
                This sounds like it needs some attention. Add to the General Ledger.
              </p>
            </div>
            <button
              onClick={onDismissKillList}
              className="text-[#858585] hover:text-[#ababab] transition-colors text-xs flex-shrink-0 mt-0.5"
              title="Dismiss"
            >
              ✕
            </button>
          </div>
          {killList.targetTitle && (
            <p className="text-white text-sm mb-1">{killList.targetTitle}</p>
          )}
          {killList.targetDescription && (
            <p className="text-[#ababab] text-xs leading-relaxed mb-3">
              {killList.targetDescription}
            </p>
          )}
          {killList.evidenceFromEntry && (
            <p className="text-[#858585] text-xs italic mb-3 border-l-2 border-[#ef4444]/20 pl-2">
              "{killList.evidenceFromEntry}"
            </p>
          )}
          <div className="flex gap-2">
            <button
              onClick={() => onConfirmKillList(killList)}
              className="px-4 py-1.5 bg-[#ef4444]/20 hover:bg-[#ef4444]/30 text-[#ef4444] text-xs font-medium rounded-lg transition-colors"
            >
              Add to Ledger
            </button>
            <button
              onClick={onDismissKillList}
              className="px-4 py-1.5 text-[#858585] hover:text-[#ababab] text-xs transition-colors"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {relapseRadar && (
        <div className="border border-[#00d4aa]/30 bg-[#00d4aa]/5 rounded-2xl p-4">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <p className="text-[#00d4aa] text-xs uppercase tracking-widest">The Signal</p>
                {relapseRadar.urgency && (
                  <span className={`text-xs px-1.5 py-0.5 rounded-md border ${
                    relapseRadar.urgency === 'high'
                      ? 'text-[#ef4444] border-[#ef4444]/30 bg-[#ef4444]/10'
                      : relapseRadar.urgency === 'medium'
                        ? 'text-[#00d4aa] border-[#00d4aa]/30 bg-[#00d4aa]/10'
                        : 'text-[#858585] border-[#5a5a5a]/30 bg-[#5a5a5a]/10'
                  }`}>
                    {relapseRadar.urgency}
                  </span>
                )}
              </div>
              <p className="text-white text-sm font-medium">
                This sounds like it has led or may lead to something bad. Assign a Signal.
              </p>
            </div>
            <button
              onClick={onDismissRelapseRadar}
              className="text-[#858585] hover:text-[#ababab] transition-colors text-xs flex-shrink-0 mt-0.5"
              title="Dismiss"
            >
              ✕
            </button>
          </div>
          {relapseRadar.signalSummary && (
            <p className="text-[#ababab] text-sm mb-2">{relapseRadar.signalSummary}</p>
          )}
          {Array.isArray(relapseRadar.precursorConditions) && relapseRadar.precursorConditions.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-3">
              {relapseRadar.precursorConditions.map((c) => (
                <span key={c} className="text-xs px-2 py-0.5 bg-[#00d4aa]/10 border border-[#00d4aa]/20 text-[#00d4aa] rounded-md">
                  {c.replace(/_/g, ' ')}
                </span>
              ))}
            </div>
          )}
          {relapseRadar.evidenceFromEntry && (
            <p className="text-[#858585] text-xs italic mb-3 border-l-2 border-[#00d4aa]/20 pl-2">
              "{relapseRadar.evidenceFromEntry}"
            </p>
          )}
          {relapseRadar.relatedKillTarget && (
            <p className="text-[#858585] text-xs mb-3">
              Connected to Ledger target: <span className="text-[#ababab]">{relapseRadar.relatedKillTarget}</span>
            </p>
          )}
          <div className="flex gap-2">
            <button
              onClick={() => onConfirmRelapseRadar(relapseRadar)}
              className="px-4 py-1.5 bg-[#00d4aa]/20 hover:bg-[#00d4aa]/30 text-[#00d4aa] text-xs font-medium rounded-lg transition-colors"
            >
              Assign Signal
            </button>
            <button
              onClick={onDismissRelapseRadar}
              className="px-4 py-1.5 text-[#858585] hover:text-[#ababab] text-xs transition-colors"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {hardLesson && (
        <div className="border border-[#b45309]/30 bg-[#b45309]/5 rounded-2xl p-4">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <p className="text-[#b45309] text-xs uppercase tracking-widest mb-1">Hard Lessons</p>
              <p className="text-white text-sm font-medium">
                This sounds like it cost you something. Extract the hard lesson.
              </p>
            </div>
            <button
              onClick={onDismissHardLesson}
              className="text-[#858585] hover:text-[#ababab] transition-colors text-xs flex-shrink-0 mt-0.5"
              title="Dismiss"
            >
              ✕
            </button>
          </div>
          {hardLesson.extractedLesson && (
            <p className="text-white text-sm mb-2">{hardLesson.extractedLesson}</p>
          )}
          {hardLesson.ruleGoingForward && (
            <p className="text-[#ababab] text-xs leading-relaxed mb-3">
              <span className="text-[#b45309]">Rule:</span> {hardLesson.ruleGoingForward}
            </p>
          )}
          {hardLesson.evidenceFromEntry && (
            <p className="text-[#858585] text-xs italic mb-3 border-l-2 border-[#b45309]/20 pl-2">
              "{hardLesson.evidenceFromEntry}"
            </p>
          )}
          <div className="flex gap-2">
            <button
              onClick={() => onConfirmHardLesson(hardLesson)}
              className="px-4 py-1.5 bg-[#b45309]/20 hover:bg-[#b45309]/30 text-[#b45309] text-xs font-medium rounded-lg transition-colors"
            >
              Extract Hard Lesson
            </button>
            <button
              onClick={onDismissHardLesson}
              className="px-4 py-1.5 text-[#858585] hover:text-[#ababab] text-xs transition-colors"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
