import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Z_LAYERS } from '../../utils/zLayers';

/**
 * Presentational layer for one spotlight step. Holds no tour state — geometry
 * arrives measured, copy arrives resolved, every control calls up.
 *
 * The dim is a single positioned element with an enormous box-shadow spread,
 * not four surrounding divs and not a clip-path:
 *
 *   Four divs leave hairline seams where fractional device pixels meet on a 3x
 *   display, and cannot round the corners of the hole without more elements.
 *
 *   clip-path can cut a rounded hole with `evenodd`, but WebKit has a long
 *   history of jank compositing a full-viewport clipped layer, and it
 *   re-rasterizes on every rect change — once per step, plus every resize.
 *
 * Box-shadow is one element and one property, gets the rounded cutout for
 * free, composites as a single layer, and works back through old WKWebView.
 * The spread is `200vmax` rather than a large pixel value so it stays correct
 * on any display.
 *
 * Everything is portalled to <body>, and that is a correctness requirement
 * rather than a preference.
 *
 * Rendered in place, the overlay sits under Dashboard's page wrapper, which
 * carries `animate-fade-in`. An opacity ANIMATION establishes a stacking
 * context — the wrapper has no transform, so it is safe for positioning, but
 * it is not safe for stacking. Every z-index inside it is then scoped to that
 * subtree, and the subtree itself resolves at `z-index: auto` in the root
 * context. The mobile nav (`z-50`, fixed, outside the subtree) therefore
 * painted above the caption despite the caption asking for `z-61`.
 *
 * Chromium releases the stacking context once the animation finishes, so this
 * was invisible there; WebKit retains it. Verified at 390x844: taps on "Next"
 * hit a nav link and navigated away mid-tour. Portalling to <body> puts the
 * layer in the root stacking context, where the numbers in zLayers.js mean
 * what they say on every engine.
 */

const SCRIM = 'rgba(0, 0, 0, 0.82)';
const RING_INSET = 8;      // breathing room around the highlighted card
const RING_RADIUS = 20;    // matches the oura-card corner

export default function SpotlightOverlay({
  rect,
  ready,
  placement,
  stepIndex,
  stepCount,
  title,
  body,
  isLast,
  onAdvance,
  onSkip,
}) {
  const captionRef = useRef(null);

  // Move focus into the caption on each step so a screen reader announces the
  // new copy, and keep Tab inside it. The page behind is inert by construction
  // — the click-catcher swallows pointer events — but nothing stops a keyboard
  // from walking into it.
  useEffect(() => {
    const node = captionRef.current;
    if (!node) return undefined;

    node.focus({ preventScroll: true });

    const onKeyDown = (e) => {
      if (e.key !== 'Tab') return;
      const focusable = node.querySelectorAll('button, [href], [tabindex]:not([tabindex="-1"])');
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    node.addEventListener('keydown', onKeyDown);
    return () => node.removeEventListener('keydown', onKeyDown);
  }, [stepIndex]);

  const showCutout = ready && rect;

  const captionPosition = placement === 'top'
    ? { top: 'calc(env(safe-area-inset-top, 0px) + 12px)' }
    : { bottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' };

  return createPortal(
    <>
      {/* Click-catcher. Sits under the ring and swallows every tap, which also
          makes tapping anywhere advance the tour. The highlighted card is
          deliberately NOT clickable: an accidental navigation mid-tour ends it
          with no way back to where the user was. */}
      <div
        className="fixed inset-0"
        style={{
          zIndex: Z_LAYERS.TUTORIAL_SCRIM,
          // Until the scroll settles there is no hole, so this element is the
          // scrim. Once measured, the ring's shadow takes over the dimming and
          // this goes transparent.
          backgroundColor: showCutout ? 'transparent' : SCRIM,
        }}
        onClick={onAdvance}
        aria-hidden="true"
      />

      {showCutout && (
        <div
          data-spotlight-ring=""
          className="fixed animate-fade-in"
          style={{
            zIndex: Z_LAYERS.TUTORIAL_SCRIM,
            top: rect.top - RING_INSET,
            left: rect.left - RING_INSET,
            width: rect.width + RING_INSET * 2,
            height: rect.height + RING_INSET * 2,
            borderRadius: RING_RADIUS,
            boxShadow: `0 0 0 200vmax ${SCRIM}`,
            pointerEvents: 'none',
          }}
          aria-hidden="true"
        />
      )}

      <div
        ref={captionRef}
        data-spotlight-caption=""
        role="dialog"
        aria-modal="true"
        aria-labelledby="spotlight-title"
        tabIndex={-1}
        className="fixed left-0 right-0 mx-4 max-w-md sm:mx-auto outline-none"
        style={{ zIndex: Z_LAYERS.TUTORIAL_CAPTION, ...captionPosition }}
      >
        <div className="oura-card p-5 border border-white/15 bg-[#0d0d0d]">
          {/* Same progress treatment as the onboarding wizard, so the tutorial
              reads as a continuation of it rather than a separate system. */}
          <div className="flex gap-1.5 mb-4">
            {Array.from({ length: stepCount }, (_, i) => (
              <div
                key={i}
                className={`h-0.5 flex-1 rounded-full transition-all duration-500 ${i <= stepIndex ? 'bg-white' : 'bg-[#1a1a1a]'}`}
              />
            ))}
          </div>

          <h2 id="spotlight-title" className="text-white font-medium mb-2">{title}</h2>
          <p className="text-[#ababab] text-sm leading-relaxed">{body}</p>

          <div className="mt-5 flex items-center justify-between gap-3">
            <p className="text-[#858585] text-[10px] uppercase tracking-widest">
              Step {stepIndex + 1} of {stepCount}
            </p>
            <div className="flex items-center gap-2">
              {/* Skip is present on every step. The scrim covers EmergencyButton
                  at z-50, so a one-tap exit is mandatory, not a courtesy. */}
              <button
                onClick={onSkip}
                className="text-[#858585] hover:text-[#ababab] text-sm transition-colors min-h-11 px-3"
              >
                Skip
              </button>
              <button
                onClick={onAdvance}
                className="px-5 py-2.5 rounded-xl text-sm font-medium bg-white text-black hover:bg-[#d1d1d1] transition-colors min-h-11"
              >
                {isLast ? 'Done' : 'Next'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}
