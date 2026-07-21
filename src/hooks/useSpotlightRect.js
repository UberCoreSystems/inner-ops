import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Measures the element a spotlight step points at, and owns the scroll
 * choreography around that measurement.
 *
 * The ordering here is the whole hook, and it is not arbitrary:
 *
 *   hide cutout → unlock scroll → scrollIntoView → wait for settle →
 *   measure once → show cutout → lock scroll
 *
 * Two of those steps are counter-intuitive and worth stating plainly.
 *
 * The cutout is HIDDEN while scrolling rather than tracking the element. The
 * obvious implementation chases the rect with requestAnimationFrame, and it is
 * the reason most smooth-scrolling spotlights jitter — the scrim and the cutout
 * are composited a frame apart, which reads as the hole sliding across the
 * page. Dropping to a uniformly opaque scrim during the scroll costs nothing
 * visually and removes the entire class of problem. It is worst in an iOS
 * WebView, where momentum scrolling outruns rAF.
 *
 * Scroll is locked AFTER the settle, never before. Locking first would make
 * `scrollIntoView` a no-op and every step would measure whatever happened to be
 * on screen.
 *
 * The lock suppresses scroll *input* rather than changing layout. Both of the
 * usual approaches are wrong here:
 *
 *   `position: fixed` on <body> loses the scroll position on iOS when released.
 *
 *   `overflow: hidden` on <html> is worse and subtler. WebKit keeps painting
 *   fixed elements in the right place but hit-tests them against the unscrolled
 *   origin, so the tour caption rendered correctly and its buttons were
 *   unclickable — taps passed through to whatever page element sat underneath.
 *   Verified on WebKit at 390x844: a tap on "Next" landed on a Quick Actions
 *   link and navigated away mid-tour. Layout-based checks cannot catch this,
 *   because layout is exactly what stays correct.
 *
 * Blocking wheel/touch/key input leaves layout untouched, so hit-testing stays
 * honest on every engine. A scroll listener re-measures as a safety net for
 * vectors that cannot be intercepted, such as dragging the scrollbar.
 */

const SETTLE_DEBOUNCE_MS = 100;   // quiet period after the last scroll event
const SETTLE_IDLE_MS = 120;       // nothing moved at all — already in view
const SETTLE_CEILING_MS = 600;    // hard cap; a step must never hang on this
const CAPTION_RESERVE_PX = 180;   // vertical space the caption bar needs

// Keys that scroll the viewport. Space is included because it pages down.
const SCROLL_KEYS = ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '];

const prefersReducedMotion = () => {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};

/**
 * The `prefers-reduced-motion` block in index.css collapses CSS animation and
 * forces `scroll-behavior: auto`, but it has no effect on the JS `behavior`
 * option — a programmatic smooth scroll still animates under the setting. The
 * media query has to be read here as well.
 */
const scrollBehavior = () => (prefersReducedMotion() ? 'auto' : 'smooth');

/**
 * @param {string|null} selector  CSS selector for the current step's anchor
 * @param {boolean} active        false while the tour is closed
 * @returns {{rect: object|null, ready: boolean, placement: 'top'|'bottom', found: boolean}}
 *   `rect` is the raw cutout geometry in viewport coordinates, unpadded — the
 *   overlay owns its own inset. `ready` is false while scrolling, which is the
 *   signal to render an opaque scrim with no hole. `found` is false when the
 *   selector resolves to nothing or to a zero-area box, which is the caller's
 *   cue to skip the step.
 */
export function useSpotlightRect(selector, active) {
  const [state, setState] = useState({ rect: null, ready: false, placement: 'bottom', found: true });

  const lockedRef = useRef(false);
  const lockHandlersRef = useRef(null);
  const timersRef = useRef([]);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }, []);

  const lockScroll = useCallback(() => {
    if (lockedRef.current) return;

    const preventMove = (e) => e.preventDefault();
    const preventKeys = (e) => {
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target?.isContentEditable) return;
      if (SCROLL_KEYS.includes(e.key)) e.preventDefault();
    };

    // passive: false is required — the default for wheel/touchmove is passive,
    // and preventDefault() is ignored on a passive listener.
    window.addEventListener('wheel', preventMove, { passive: false });
    window.addEventListener('touchmove', preventMove, { passive: false });
    window.addEventListener('keydown', preventKeys, { passive: false });

    lockHandlersRef.current = { preventMove, preventKeys };
    lockedRef.current = true;
  }, []);

  const unlockScroll = useCallback(() => {
    if (!lockedRef.current) return;
    const h = lockHandlersRef.current;
    if (h) {
      window.removeEventListener('wheel', h.preventMove);
      window.removeEventListener('touchmove', h.preventMove);
      window.removeEventListener('keydown', h.preventKeys);
    }
    lockHandlersRef.current = null;
    lockedRef.current = false;
  }, []);

  /**
   * Measure without scrolling. Used for the initial measurement after a settle
   * and for every subsequent resize, so the two paths cannot drift apart.
   */
  const measure = useCallback(() => {
    if (!selector) return;
    const el = document.querySelector(selector);
    const r = el?.getBoundingClientRect();

    if (!el || !r || r.width === 0 || r.height === 0) {
      setState({ rect: null, ready: true, placement: 'bottom', found: false });
      return;
    }

    const vh = window.innerHeight;
    let { top, height } = r;
    let placement;

    if (height > vh - CAPTION_RESERVE_PX) {
      // Taller than the viewport can frame. Left alone the cutout would cover
      // the entire screen, leaving no visible scrim — which does not read as a
      // spotlight at all, just an unexplained border. Cap it and pin the
      // caption below the visible portion.
      top = Math.max(top, 12);
      height = Math.round(vh * 0.6);
      placement = 'bottom';
    } else {
      // Caption goes opposite the target: a target low on screen gets a
      // top-pinned caption and vice versa. Cheaper and steadier than per-step
      // tooltip positioning, and it can never overlap the highlight.
      placement = top + height / 2 > vh / 2 ? 'top' : 'bottom';
    }

    setState({
      rect: { top, left: r.left, width: r.width, height },
      ready: true,
      placement,
      found: true,
    });
  }, [selector]);

  // Scroll the step's anchor into view, then measure once it stops moving.
  useEffect(() => {
    if (!active || !selector) return undefined;

    let cancelled = false;
    clearTimers();

    const el = document.querySelector(selector);
    if (!el) {
      setState({ rect: null, ready: true, placement: 'bottom', found: false });
      return undefined;
    }

    // Hide the cutout and release the lock so the scroll can actually happen.
    setState((prev) => ({ ...prev, ready: false }));
    unlockScroll();

    const settle = () => {
      if (cancelled) return;
      cancelled = true;
      detach();
      clearTimers();
      measure();
      lockScroll();
    };

    let scrolled = false;
    let debounceTimer = null;

    const onScroll = () => {
      scrolled = true;
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(settle, SETTLE_DEBOUNCE_MS);
      timersRef.current.push(debounceTimer);
    };

    // `scrollend` is exact where it exists; the debounce is the fallback for
    // Safari, which has not shipped it.
    const onScrollEnd = () => settle();

    const detach = () => {
      window.removeEventListener('scroll', onScroll, true);
      document.removeEventListener('scrollend', onScrollEnd, true);
      clearTimeout(debounceTimer);
    };

    window.addEventListener('scroll', onScroll, true);
    document.addEventListener('scrollend', onScrollEnd, true);

    el.scrollIntoView({ block: 'center', behavior: scrollBehavior() });

    // Nothing moved — the anchor was already centred, or reduced-motion made
    // the jump synchronous and it completed before the listener attached.
    // Without this the step would sit on the 600ms ceiling every time.
    const idleTimer = setTimeout(() => { if (!scrolled) settle(); }, SETTLE_IDLE_MS);
    // Backstop. A step must never hang because a scroll event went missing.
    const ceilingTimer = setTimeout(settle, SETTLE_CEILING_MS);
    timersRef.current.push(idleTimer, ceilingTimer);

    return () => {
      cancelled = true;
      detach();
      clearTimers();
    };
  }, [selector, active, measure, clearTimers, lockScroll, unlockScroll]);

  // Re-measure on anything that can move the anchor under a locked page. The
  // body observer catches BannerStack mounting a banner above <Routes>, which
  // shifts the whole page and would otherwise leave the cutout behind.
  useEffect(() => {
    if (!active || !selector) return undefined;

    let frame = null;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };

    // Only once the step has settled and locked. Re-measuring mid-scroll would
    // set `ready`, which is exactly what the hide-during-scroll design avoids.
    const onScroll = () => { if (lockedRef.current) schedule(); };

    window.addEventListener('resize', schedule);
    window.addEventListener('orientationchange', schedule);
    window.addEventListener('scroll', onScroll, { passive: true });

    let observer = null;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(schedule);
      observer.observe(document.body);
    }

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('orientationchange', schedule);
      window.removeEventListener('scroll', onScroll);
      if (observer) observer.disconnect();
    };
  }, [selector, active, measure]);

  // Releasing the lock on unmount is not optional — a tour torn down mid-step
  // would otherwise leave the page permanently unscrollable.
  useEffect(() => {
    if (!active) {
      clearTimers();
      unlockScroll();
    }
    return () => {
      clearTimers();
      unlockScroll();
    };
  }, [active, clearTimers, unlockScroll]);

  return state;
}

export default useSpotlightRect;
