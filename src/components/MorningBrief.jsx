import { useEffect, useState } from 'react';
import { getOrGenerateDailyBrief } from '../utils/dailyBrief';
import logger from '../utils/logger';

/**
 * MorningBrief — daily operator-cadence AI briefing.
 *
 * Renders a single AI-generated paragraph at the top of the Dashboard. One
 * generation per calendar day, Firestore-cached under `dailyBriefs/{uid}_{YYYY-MM-DD}`.
 * The user cannot force regeneration — tomorrow produces a new one.
 *
 * Rendering rules:
 *   - Plain prose paragraph. No quote marks, no author attribution, no
 *     visible timestamp.
 *   - Date label in the established Dashboard section-header style
 *     (small, uppercase, wide tracking, subdued color) — matches
 *     BehavioralRecordDensity / SignalReport section headers.
 *   - No regenerate button. Deliberate — protects against dopamine-checking.
 *   - On failure: a single-line error message. No automatic retry.
 *
 * @param {{ userId: string }} props
 */
export default function MorningBrief({ userId }) {
  const [brief, setBrief] = useState(null);
  const [status, setStatus] = useState('loading'); // 'loading' | 'ready' | 'error'

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    (async () => {
      try {
        const result = await getOrGenerateDailyBrief(userId);
        if (cancelled) return;
        if (result && result.brief) {
          setBrief(result.brief);
          setStatus('ready');
        } else {
          setStatus('error');
        }
      } catch (err) {
        logger.warn('MorningBrief: generation failed', err?.message);
        if (!cancelled) setStatus('error');
      }
    })();

    return () => { cancelled = true; };
  }, [userId]);

  // Date label: "BRIEF — Tuesday, April 16" (uppercase via CSS, matching
  // the other Dashboard section-header patterns).
  const label = (() => {
    const now = new Date();
    const weekday = now.toLocaleDateString('en-US', { weekday: 'long' });
    const month = now.toLocaleDateString('en-US', { month: 'long' });
    const day = now.getDate();
    return `Brief — ${weekday}, ${month} ${day}`;
  })();

  return (
    <section className="mb-10 animate-fade-in-up" style={{ animationDelay: '0.03s' }}>
      <h3 className="text-[#858585] text-xs uppercase tracking-widest mb-4">
        {label}
      </h3>
      <div className="oura-card p-6">
        {status === 'loading' && (
          <p className="text-[#858585] text-sm">Generating today's brief…</p>
        )}
        {status === 'error' && (
          <p className="text-[#ababab] text-sm leading-relaxed">
            Brief unavailable. Refresh the page or engage a module to restore signal.
          </p>
        )}
        {status === 'ready' && (
          <p className="text-white text-sm leading-relaxed">
            {brief}
          </p>
        )}
      </div>
    </section>
  );
}
