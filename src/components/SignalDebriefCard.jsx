import { useEffect, useMemo, useState } from 'react';
import { updateData } from '../utils/firebaseUtils';
import { getOpenSignals, formatWindowRemaining, SIGNAL_STATES } from '../utils/signalDebrief';
import { SIGNAL_RESOLUTION_OUTCOMES, SIGNAL_RESOLUTION_VIA } from '../utils/schema';
import { resolveArchetypeLabel } from '../utils/relapseTaxonomy';
import { bridgeSignalToHardLessons } from '../utils/bridgeSignalToHardLessons';
import ouraToast from '../utils/toast';
import logger from '../utils/logger';

const TEAL = '#00d4aa';
const AMBER = '#b45309';
const CLOCK_TICK_MS = 60 * 1000;

/**
 * Signal Debrief — the closure surface for every signal still awaiting an
 * answer. Pending signals (72h window passed) come first, oldest first, then
 * live ones newest first. Two calls either way: it held, or it landed. No
 * dismiss, no skip — scrolling past is the only deferral; the card returns
 * until every signal is answered.
 *
 * Prop-driven on purpose: both surfaces (The Signal page, Dashboard) already
 * hold relapseEntries state, and answering must update that state in place —
 * self-fetching here would duplicate the read and drift out of sync. A
 * one-minute clock keeps the countdown and the live→pending flip honest
 * without a reload.
 *
 * The card owns both writes and reports each via onResolved. LANDED also
 * stashes the Hard Lessons prefill built from the signal; onLanded(entry)
 * then takes the surface to /hardlessons, where the slip itself is recorded.
 */
const SignalDebriefCard = ({ entries, onResolved, onLanded, animationDelay = '0.03s' }) => {
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  // After a held write: the id being noted, so the note UI survives the
  // entry leaving the open queue.
  const [notingId, setNotingId] = useState(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [notedResolution, setNotedResolution] = useState(null);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), CLOCK_TICK_MS);
    return () => clearInterval(id);
  }, []);

  const queue = useMemo(() => getOpenSignals(entries || [], now), [entries, now]);
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
      await updateData('relapseEntries', current.entry.id, { resolution });
      onResolved?.(current.entry.id, resolution);
      setNotingId(current.entry.id);
      setNoteDraft('');
      setNotedResolution(resolution);
    } catch (error) {
      logger.error('Signal debrief held write failed:', error);
      ouraToast.error('Save failed — signal still open.');
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

  const handleLanded = async () => {
    if (!current || busy) return;
    setBusy(true);
    const resolution = {
      outcome: SIGNAL_RESOLUTION_OUTCOMES.LANDED,
      resolvedAt: new Date().toISOString(),
      via: SIGNAL_RESOLUTION_VIA.DEBRIEF,
    };
    try {
      await updateData('relapseEntries', current.entry.id, { resolution });
      onResolved?.(current.entry.id, resolution);
      bridgeSignalToHardLessons(current.entry);
      onLanded?.(current.entry);
    } catch (error) {
      logger.error('Signal debrief landed write failed:', error);
      ouraToast.error('Save failed — signal still open.');
    } finally {
      setBusy(false);
    }
  };

  const cardStyle = (accent) => ({
    '--lit-accent': accent,
    background: `linear-gradient(90deg, ${accent}0d 0%, transparent 40%), linear-gradient(180deg, #0a0a0a 0%, #050505 100%)`,
  });

  // Note micro-state: the signal is already closed; only the optional
  // one-liner remains before the queue advances.
  if (notingId) {
    return (
      <section id="signal-debrief-card" className="mb-10 animate-fade-in-up" style={{ animationDelay }}>
        <div className="oura-card oura-card-lit p-6 border-l-2 border-[#00d4aa]" style={cardStyle(TEAL)}>
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

  const { entry, state } = current;
  const isLive = state.status === SIGNAL_STATES.LIVE;
  const accent = isLive ? TEAL : AMBER;
  const loggedLine = state.anchorMs
    ? `Logged ${new Date(state.anchorMs).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
    : 'Logged — date unknown';
  const protocolRun = entry.protocolRun && typeof entry.protocolRun === 'object' ? entry.protocolRun : null;
  const archetypeLabel = resolveArchetypeLabel(entry.selectedSelf) || (protocolRun ? 'Protocol' : 'Signal');
  const precursors = Array.isArray(entry.precursorConditions) ? entry.precursorConditions : [];
  const protocolLine = protocolRun
    ? [
        `Protocol run · intensity ${Number(protocolRun.intensity) || '?'}/10`,
        protocolRun.breathingCycles > 0 ? `${protocolRun.breathingCycles} breathing cycles` : null,
        protocolRun.trigger ? `trigger: ${protocolRun.trigger}` : null,
      ].filter(Boolean).join(' · ')
    : null;

  return (
    <section id="signal-debrief-card" className="mb-10 animate-fade-in-up" style={{ animationDelay }}>
      <div
        className={`oura-card oura-card-lit p-6 border-l-2 ${isLive ? 'border-[#00d4aa]' : 'border-[#b45309]'}`}
        style={cardStyle(accent)}
      >
        <div className="flex items-start justify-between mb-3">
          <p className={`${isLive ? 'text-[#00d4aa]' : 'text-[#b45309]'} text-xs font-medium uppercase tracking-widest`}>
            {isLive ? 'Signal open' : 'Signal Debrief'}
          </p>
          {queue.length > 1 && (
            <p className="text-[#858585] text-xs tabular-nums shrink-0">1 of {queue.length}</p>
          )}
        </div>
        <p className="text-white text-sm leading-relaxed mb-4">
          {isLive
            ? `Window closes in ${formatWindowRemaining(state.windowEndsAtMs - now).replace(' left', '')}. Pending conversion to a Hard Lesson or a close.`
            : 'The 72-hour window on this signal has passed. Call it: a Hard Lesson, or closed.'}
        </p>
        <div key={entry.id} className="animate-fade-in mb-5">
          <div className="text-oura-cyan font-light text-lg">{archetypeLabel}</div>
          <div className="text-gray-400 text-sm mt-1">{loggedLine}</div>
          {protocolLine && (
            <div className="text-[#00d4aa]/80 text-xs mt-2">{protocolLine}</div>
          )}
          {precursors.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {precursors.map(c => (
                <span key={c} className="text-[10px] px-2 py-0.5 rounded-full bg-oura-darker text-gray-400 border border-oura-border">{c}</span>
              ))}
            </div>
          )}
          {entry.reflection && (
            <p className="text-gray-400 text-sm leading-relaxed mt-3 line-clamp-2">{entry.reflection}</p>
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
