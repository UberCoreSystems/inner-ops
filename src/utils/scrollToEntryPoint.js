/**
 * Bring a module's entry control into view and put the cursor in it.
 *
 * Used by the first-run intro cards (ModuleIntro): the action button promises
 * "Write today's entry" / "Name your first target", so the page has to land on
 * the field that does it. The five pages previously each rolled their own
 * version — three called `window.scrollTo({ top: 0 })`, which is only correct
 * when the input happens to sit at the top of the page, and two did not scroll
 * at all.
 *
 * `block: 'center'` matches the convention already used for programmatic scroll
 * in this codebase (useSpotlightRect.js, the KillList reactivate path). It also
 * clears both nav bars without hard-coded offsets — the desktop nav is
 * `sticky top-0` and the mobile nav is `fixed bottom-0`, so an element centred
 * vertically is under neither.
 */

const prefersReducedMotion = () => {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};

// Only form controls get focus. Some entry points are cards rather than inputs
// (Synthesis runs a briefing instead of collecting text); scrolling to those is
// right, but focusing them would paint a focus ring on something the user did
// not tab to.
const FOCUSABLE_ENTRY = /^(input|textarea|select)$/i;

// The target often does not exist yet — the caller usually opens a collapsed
// form in the same click, and the intro card unmounts itself on dismiss, which
// changes the page height. Wait for React to commit both before measuring, then
// poll a bounded number of frames for the element to appear.
const SETTLE_FRAMES = 2;
const MAX_FRAMES = 30; // ~500ms at 60fps, then give up silently

export function scrollToEntryPoint(selector, { focus = true } = {}) {
  if (!selector || typeof document === 'undefined') return;

  let frames = 0;

  const attempt = () => {
    const el = frames >= SETTLE_FRAMES ? document.querySelector(selector) : null;
    if (!el) {
      if (frames++ < MAX_FRAMES) requestAnimationFrame(attempt);
      return;
    }

    el.scrollIntoView({ block: 'center', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });

    // preventScroll matters: without it the browser jumps the element into view
    // instantly on focus, cancelling the smooth scroll that just started.
    if (focus && FOCUSABLE_ENTRY.test(el.tagName)) {
      try {
        el.focus({ preventScroll: true });
      } catch {
        el.focus();
      }
    }
  };

  requestAnimationFrame(attempt);
}

export default scrollToEntryPoint;
