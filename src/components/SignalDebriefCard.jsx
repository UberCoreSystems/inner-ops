import { useMemo, useState } from 'react';
import { updateData } from '../utils/firebaseUtils';
import { getDebriefQueue, getSignalAnchorMs } from '../utils/signalDebrief';
import { SIGNAL_RESOLUTION_OUTCOMES, SIGNAL_RESOLUTION_VIA } from '../utils/schema';
import { resolveArchetypeLabel } from '../utils/relapseTaxonomy';
import ouraToast from '../utils/toast';
import logger from '../utils/logger';

/**
 * Signal Debrief — the closure surface for signals whose 48h window passed
 * unresolved. One passed signal at a time, oldest first. Two calls: it held,
 * or it landed. No dismiss, no skip — scrolling past is the only deferral;
 * the card returns until every window is answered.
 *
 * Prop-driven on purpose: both surfaces (The Signal page, Dashboard) already
 * hold relapseEntries state, and answering must update that state in place —
 * self-fetching here would duplicate the read and drift out of sync.
 *
 * The card owns the HELD write (then reports it via onResolved). LANDED is
 * delegated whole via onLanded(entry): nothing may be stamped until the
 * relapse entry actually saves, and the two surfaces bridge into that flow
 * differently.
 */
const SignalDebriefCard = ({ entries, onResolved, onLanded, animationDelay = '0.03s' }) => {
  const [busy, setBusy] = useState(false);
  // After a held write: the id being noted, so the note UI survives the
  // entry leaving the pending queue.
  const [notingId, setNotingId] = useState(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [notedResolution, setNotedResolution] = useState(null);

  const queue = useMemo(() => getDebriefQueue(entries || []), [entries]);
  const current = queue[0] || null;

  if (!current && !notingId) return null;

  const finishNote = () => {
    setNotingId(null);
    setNoteDraft('');
    setNotedResolution(null);
  };

  const handleHeld = async () => {
    if (!current || busy) return;
    setBusy(true);
    const resolution = {
      outcome: SIGNAL_RESOLUTION_OUTCOMES.HELD,
      resolvedAt: new Date().toISOString(),
      via: SIGNAL_RESOLUTION_VIA.DEBRIEF,
    };
    try {
      await updateData('relapseEntries', current.id, { resolution });
      onResolved?.(current.id, resolution);
      setNotingId(current.id);
      setNoteDraft('');
      setNotedResolution(resolution);
    } catch (error) {
      logger.error('Signal debrief held write failed:', error);
      ouraToast.error('Save failed — signal still pending.');
    } finally {
      setBusy(false);
    }
  };

  const handleNoteSave = async () => {
    const trimmed = noteDraft.trim();
    if (!trimmed) { finishNote(); return; }
    setBusy(true);
    const resolution = { ...notedResolution, note: trimmed };
    try {
      await updateData('relapseEntries', notingId, { resolution });
      onResolved?.(notingId, resolution);
    } catch (error) {
      logger.error('Signal debrief note write failed:', error);
      ouraToast.error('Note not saved.');
    } finally {
      setBusy(false);
      finishNote();
    }
  };

  const handleLanded = () => {
    if (!current || busy) return;
    onLanded?.(current);
  };

  // Note micro-state: the signal is already closed; only the optional
  // one-liner remains before the queue advances.
  if (notingId) {
    return (
      <section id="signal-debrief-card" className="mb-10 animate-fade-in-up" style={{ animationDelay }}>
        <div
          className="oura-card oura-card-lit p-6 border-l-2 border-[#00d4aa]"
          style={{ '--lit-accent': '#00d4aa', background: 'linear-gradient(90deg, rgba(0, 212, 170, 0.05) 0%, transparent 40%), linear-gradient(180deg, #0a0a0a 0%, #050505 100%)' }}
        >
          <p className="text-[#00d4aa] text-xs font-medium uppercase tracking-widest mb-3">Signal Debrief</p>
          <p className="text-white text-sm leading-relaxed mb-1">Held. What held?</p>
          <p className="text-[#858585] text-xs mb-4">One line. Optional.</p>
          <input
            type="text"
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleNoteSave(); }}
            maxLength={200}
            autoFocus
            className="w-full px-4 py-3 rounded-xl bg-[#0a0a0a] border border-[#1a1a1a] text-gray-200 text-sm placeholder-gray-500 focus:outline-none focus:border-[#00d4aa]/40 mb-4"
          />
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={handleNoteSave}
              disabled={busy}
              className="px-5 py-2.5 bg-white text-black text-sm font-medium rounded-xl hover:bg-[#d1d1d1] hover:shadow-[0_0_20px_rgba(255,255,255,0.08)] disabled:opacity-50 transition-all"
            >
              Save
            </button>
            <button
              type="button"
              onClick={finishNote}
              disabled={busy}
              className="text-[#858585] hover:text-[#ababab] text-xs transition-colors"
            >
              Skip
            </button>
          </div>
        </div>
      </section>
    );
  }

  const anchorMs = getSignalAnchorMs(current);
  const loggedLine = anchorMs
    ? `Logged ${new Date(anchorMs).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
    : 'Logged — date unknown';
  const archetypeLabel = resolveArchetypeLabel(current.selectedSelf) || 'Quick log';
  const precursors = Array.isArray(current.precursorConditions) ? current.precursorConditions : [];

  return (
    <section id="signal-debrief-card" className="mb-10 animate-fade-in-up" style={{ animationDelay }}>
      <div
        className="oura-card oura-card-lit p-6 border-l-2 border-[#00d4aa]"
        style={{ '--lit-accent': '#00d4aa', background: 'linear-gradient(90deg, rgba(0, 212, 170, 0.05) 0%, transparent 40%), linear-gradient(180deg, #0a0a0a 0%, #050505 100%)' }}
      >
        <div className="flex items-start justify-between mb-3">
          <p className="text-[#00d4aa] text-xs font-medium uppercase tracking-widest">Signal Debrief</p>
          {queue.length > 1 && (
            <p className="text-[#858585] text-xs tabular-nums shrink-0">1 of {queue.length}</p>
          )}
        </div>
        <p className="text-white text-sm leading-relaxed mb-4">
          The 48-hour window on this signal has passed. Call it.
        </p>
        <div key={current.id} className="animate-fade-in mb-5">
          <div className="text-oura-cyan font-light text-lg">{archetypeLabel}</div>
          <div className="text-gray-400 text-sm mt-1">{loggedLine}</div>
          {precursors.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {precursors.map(c => (
                <span key={c} className="text-[10px] px-2 py-0.5 rounded-full bg-oura-darker text-gray-400 border border-oura-border">{c}</span>
              ))}
            </div>
          )}
          {current.reflection && (
            <p className="text-gray-400 text-sm leading-relaxed mt-3 line-clamp-2">{current.reflection}</p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={handleHeld}
            disabled={busy}
            className="px-5 py-3 rounded-xl border border-[#00d4aa] bg-[#00d4aa]/10 text-[#00d4aa] hover:bg-[#00d4aa]/20 disabled:opacity-50 text-sm font-medium transition-colors"
          >
            It held
          </button>
          <button
            type="button"
            onClick={handleLanded}
            disabled={busy}
            className="px-5 py-3 rounded-xl border border-[#b45309] bg-[#b45309]/10 text-[#b45309] hover:bg-[#b45309]/20 disabled:opacity-50 text-sm font-medium transition-colors"
          >
            It landed
          </button>
        </div>
      </div>
    </section>
  );
};

export default SignalDebriefCard;
