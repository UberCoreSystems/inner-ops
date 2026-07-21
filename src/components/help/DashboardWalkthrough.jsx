import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { WALKTHROUGH_STEPS } from '../../config/dashboardWalkthrough';
import { useSpotlightRect } from '../../hooks/useSpotlightRect';
import { track } from '../../utils/analytics';
import { Z_LAYERS } from '../../utils/zLayers';
import SpotlightOverlay from './SpotlightOverlay';

/**
 * State machine for the Dashboard first-run walkthrough: start gating, anchor
 * resolution, degradation, persistence, analytics.
 *
 * The design premise is that the DOM it points at will eventually change
 * without anyone remembering this file exists. A tour that assumes its anchors
 * are present is a tour that one day renders a dimmed screen with a hole over
 * nothing, on first run, for a brand-new user. So every anchor is treated as
 * optional at every point it is used:
 *
 *   - at start, the step list is built from the selectors that actually
 *     resolve, and "Step n of m" counts survivors rather than the configured
 *     four — a tour that says "3 of 4" and then ends is worse than "3 of 3";
 *   - on each step activation the anchor is re-queried, because a card can
 *     unmount mid-tour when its data arrives;
 *   - if nothing resolves at all the education still runs, as a plain card.
 *
 * `walkthrough_degraded` is the highest-value event here. It is how a broken
 * anchor surfaces before a user reports it.
 */

const READY_SELECTOR = '[data-tour-ready="true"]';
const READY_POLL_MS = 150;
const READY_CEILING_MS = 5000;

const resolves = (selector) => {
  const el = document.querySelector(selector);
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
};

export default function DashboardWalkthrough({ source = 'launcher', onFinish }) {
  // 'waiting' → the skeleton/content cross-fade has not settled yet.
  // 'running' → spotlight. 'fallback' → no anchors resolved; plain card.
  const [phase, setPhase] = useState('waiting');
  const [steps, setSteps] = useState([]);
  const [index, setIndex] = useState(0);

  const startedRef = useRef(false);
  const finishedRef = useRef(false);
  const viewedRef = useRef(new Set());

  // Wait for the Dashboard's skeleton→content cross-fade before measuring
  // anything. Measuring during the fade returns the skeleton's geometry.
  useEffect(() => {
    let elapsed = 0;
    let timer = null;

    const attempt = () => {
      const ready = document.querySelector(READY_SELECTOR);
      if (ready || elapsed >= READY_CEILING_MS) {
        const survivors = WALKTHROUGH_STEPS.filter((s) => resolves(s.selector));

        if (survivors.length < WALKTHROUGH_STEPS.length) {
          track('walkthrough_degraded', {
            resolved: survivors.length,
            expected: WALKTHROUGH_STEPS.length,
            timedOut: !ready,
          });
        }

        setSteps(survivors);
        setPhase(survivors.length === 0 ? 'fallback' : 'running');
        return;
      }
      elapsed += READY_POLL_MS;
      timer = setTimeout(attempt, READY_POLL_MS);
    };

    attempt();
    return () => clearTimeout(timer);
  }, []);

  // Ref latch: StrictMode double-mounts effects in development, which would
  // otherwise double every start in the numbers.
  useEffect(() => {
    if (phase === 'waiting' || startedRef.current) return;
    startedRef.current = true;
    track('walkthrough_started', { source, steps: steps.length, mode: phase });
  }, [phase, source, steps.length]);

  const step = steps[index] || null;
  const { rect, ready, placement, found } = useSpotlightRect(
    phase === 'running' ? step?.selector : null,
    phase === 'running',
  );

  const finish = useCallback((status, atStep) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    track(status === 'completed' ? 'walkthrough_completed' : 'walkthrough_skipped', {
      source,
      atStep,
      steps: steps.length,
    });
    onFinish?.({ status, atStep });
  }, [onFinish, source, steps.length]);

  const advance = useCallback(() => {
    setIndex((prev) => {
      if (prev + 1 >= steps.length) {
        finish('completed', prev);
        return prev;
      }
      return prev + 1;
    });
  }, [steps.length, finish]);

  const skip = useCallback(() => finish('skipped', index), [finish, index]);

  // A card can unmount between resolution and activation — the tour holds a
  // scroll lock and several hundred milliseconds pass per step. Step over it
  // rather than spotlighting an empty region.
  useEffect(() => {
    if (phase !== 'running' || !step || found) return;
    if (index + 1 >= steps.length) finish('completed', index);
    else setIndex((prev) => prev + 1);
  }, [found, phase, step, index, steps.length, finish]);

  useEffect(() => {
    if (phase !== 'running' || !step || viewedRef.current.has(step.id)) return;
    viewedRef.current.add(step.id);
    track('walkthrough_step_viewed', { stepId: step.id, index });
  }, [phase, step, index]);

  // Escape exits. Mandatory rather than a nicety: the scrim sits above
  // EmergencyButton, so the user must always have a one-key way out.
  useEffect(() => {
    const onKeyDown = (e) => { if (e.key === 'Escape') skip(); };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [skip]);

  const fallbackBody = useMemo(
    () => WALKTHROUGH_STEPS.map((s) => `${s.title}. ${s.body}`),
    [],
  );

  if (phase === 'waiting') return null;

  // No anchor resolved. The DOM changed out from under the config, but the
  // four things a new user needs to know have not, so they are delivered as
  // sequential text. Marked complete on dismissal so it does not retry forever.
  if (phase === 'fallback') {
    // Portalled for the same reason as the spotlight: rendered in place it
    // would be trapped in the page wrapper's stacking context and painted
    // under the mobile nav. See the note in SpotlightOverlay.jsx.
    return createPortal(
      <>
        <div
          className="fixed inset-0 bg-black/[0.82]"
          style={{ zIndex: Z_LAYERS.TUTORIAL_SCRIM }}
          aria-hidden="true"
        />
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="walkthrough-fallback-title"
          className="fixed inset-x-0 top-1/2 -translate-y-1/2 mx-4 max-w-md sm:mx-auto"
          style={{ zIndex: Z_LAYERS.TUTORIAL_CAPTION }}
        >
          <div className="oura-card p-5 border border-white/15 bg-[#0d0d0d] max-h-[80vh] overflow-y-auto">
            <p className="text-[#858585] text-xs uppercase tracking-widest mb-2">First run</p>
            <h2 id="walkthrough-fallback-title" className="text-white font-medium mb-4">
              What is on this screen
            </h2>
            <div className="space-y-3">
              {fallbackBody.map((line) => (
                <p key={line} className="text-[#ababab] text-sm leading-relaxed">{line}</p>
              ))}
            </div>
            <button
              onClick={() => finish('completed', null)}
              className="mt-5 w-full px-5 py-2.5 rounded-xl text-sm font-medium bg-white text-black hover:bg-[#d1d1d1] transition-colors min-h-11"
            >
              Done
            </button>
          </div>
        </div>
      </>,
      document.body,
    );
  }

  if (!step) return null;

  return (
    <SpotlightOverlay
      rect={rect}
      ready={ready}
      placement={placement}
      stepIndex={index}
      stepCount={steps.length}
      title={step.title}
      body={step.body}
      isLast={index === steps.length - 1}
      onAdvance={advance}
      onSkip={skip}
    />
  );
}
