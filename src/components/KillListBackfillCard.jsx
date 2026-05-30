import { useState, useMemo } from 'react';

function formatDay(dateStr) {
  const d = new Date(`${dateStr}T12:00:00`);
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export default function KillListBackfillCard({
  target,
  missedDates,
  onAllHeld,
  onLogEscape,
  onLogEach,
  onDismiss,
  busy = false,
}) {
  const [mode, setMode] = useState('idle');
  const [entries, setEntries] = useState(() =>
    (missedDates || []).map(date => ({ date, held: null, context: '' }))
  );

  const gapDays = missedDates?.length || 0;
  const canSubmitEach = useMemo(() => {
    if (entries.length === 0) return false;
    for (const e of entries) {
      if (e.held === null) return false;
      if (e.held === false && !e.context.trim()) return false;
    }
    return true;
  }, [entries]);

  const updateEntry = (date, patch) => {
    setEntries(prev => prev.map(e => e.date === date ? { ...e, ...patch } : e));
  };

  return (
    <div className="oura-card p-5 border-l-2 border-[#ef4444]/40 mb-3">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <p className="text-[#ef4444] text-[10px] uppercase tracking-widest mb-1">Reconcile gap</p>
          <p className="text-white text-sm leading-relaxed">
            No check-in on <span className="font-medium">{target.title}</span> for {gapDays} day{gapDays !== 1 ? 's' : ''}. How did it hold up?
          </p>
        </div>
        <button
          onClick={onDismiss}
          disabled={busy}
          className="text-[#858585] hover:text-[#858585] text-xs transition-colors shrink-0"
          title="Dismiss for now"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      {mode === 'idle' && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={onAllHeld}
            disabled={busy}
            className="px-4 py-2 text-sm rounded-xl bg-transparent text-white border border-[#2a2a2a] hover:border-[#ef4444] hover:bg-[#ef4444]/5 disabled:opacity-50 transition-all"
          >
            All held
          </button>
          <button
            onClick={() => setMode('pick-escape')}
            disabled={busy}
            className="px-4 py-2 text-sm rounded-xl bg-transparent text-[#b45309] border border-[#b45309]/30 hover:bg-[#b45309]/10 disabled:opacity-50 transition-all"
          >
            Log escape
          </button>
          <button
            onClick={() => setMode('log-each')}
            disabled={busy}
            className="px-4 py-2 text-sm rounded-xl bg-transparent text-[#ababab] border border-[#2a2a2a] hover:border-[#3a3a3a] hover:text-white disabled:opacity-50 transition-all"
          >
            Log each day
          </button>
        </div>
      )}

      {mode === 'pick-escape' && (
        <div>
          <p className="text-[#ababab] text-xs mb-3">Which day did it get you?</p>
          <div className="flex flex-wrap gap-2 mb-3">
            {missedDates.map(date => (
              <button
                key={date}
                onClick={() => onLogEscape(date)}
                disabled={busy}
                className="px-3 py-1.5 text-xs rounded-lg bg-[#0a0a0a] text-[#d1d1d1] border border-[#1a1a1a] hover:border-[#b45309]/40 hover:text-[#b45309] disabled:opacity-50 transition-colors"
              >
                {formatDay(date)}
              </button>
            ))}
          </div>
          <button
            onClick={() => setMode('idle')}
            disabled={busy}
            className="text-[#858585] hover:text-[#ababab] text-xs transition-colors"
          >
            Back
          </button>
        </div>
      )}

      {mode === 'log-each' && (
        <div>
          <p className="text-[#ababab] text-xs mb-3">Mark each day. Logging stops at the first escape.</p>
          <div className="space-y-2 mb-4">
            {entries.map(entry => (
              <div key={entry.date} className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-3">
                <div className="flex items-center gap-3">
                  <div className="text-[#ababab] text-xs uppercase tracking-wider w-28 shrink-0">
                    {formatDay(entry.date)}
                  </div>
                  <div className="flex gap-2 flex-1">
                    <button
                      onClick={() => updateEntry(entry.date, { held: true, context: '' })}
                      disabled={busy}
                      className={`flex-1 py-2 text-xs rounded-lg border transition-all ${
                        entry.held === true
                          ? 'bg-[#1a1a1a] text-white border-[#ef4444]/40'
                          : 'bg-transparent text-[#ababab] border-[#2a2a2a] hover:border-[#ef4444]/30 hover:text-white'
                      }`}
                    >
                      Held
                    </button>
                    <button
                      onClick={() => updateEntry(entry.date, { held: false })}
                      disabled={busy}
                      className={`flex-1 py-2 text-xs rounded-lg border transition-all ${
                        entry.held === false
                          ? 'bg-[#1a1a1a] text-[#b45309] border-[#b45309]/40'
                          : 'bg-transparent text-[#ababab] border-[#2a2a2a] hover:border-[#b45309]/30 hover:text-[#b45309]'
                      }`}
                    >
                      Escaped
                    </button>
                  </div>
                </div>
                {entry.held === false && (
                  <input
                    type="text"
                    value={entry.context}
                    onChange={(e) => updateEntry(entry.date, { context: e.target.value })}
                    placeholder="What happened that day?"
                    className="mt-2 w-full p-2 bg-[#050505] text-white text-xs rounded-lg border border-[#1a1a1a] focus:border-[#b45309]/50 focus:outline-none placeholder-[#555555]"
                  />
                )}
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => onLogEach(entries)}
              disabled={busy || !canSubmitEach}
              className="px-4 py-2 text-sm rounded-xl bg-white text-black hover:bg-[#d1d1d1] disabled:bg-[#1a1a1a] disabled:text-[#858585] transition-colors"
            >
              {busy ? 'Reconciling' : 'Reconcile days'}
            </button>
            <button
              onClick={() => setMode('idle')}
              disabled={busy}
              className="px-4 py-2 text-sm rounded-xl bg-transparent text-[#858585] hover:text-white transition-colors"
            >
              Back
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
