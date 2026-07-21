/**
 * Stacking convention.
 *
 * Until now every element competing for the top — both navs and all seven
 * modals — used `z-50`, and correctness came down to DOM order. That works
 * only while nothing needs to sit above a modal.
 *
 * The first-run tutorial does: a spotlight must dim the page including the
 * nav, and a caption must sit above the spotlight. So this file establishes a
 * scale rather than renumbering everything.
 *
 *   50   app chrome and modals (existing, unchanged)
 *   60   tutorial scrim, click-catcher, and cutout ring
 *   61   tutorial caption and its controls
 *
 * These numbers only mean anything in the ROOT stacking context. Any ancestor
 * that establishes one — a transform, a filter, or an opacity animation, which
 * is easy to miss — re-scopes every z-index beneath it, and the whole subtree
 * then competes as a single unit at its own level. That is why the tutorial
 * layer portals to <body> rather than rendering in place: mounted under the
 * Dashboard wrapper, `z-60`/`z-61` lost to the `z-50` mobile nav.
 *
 * react-hot-toast sets z-index 9999 inline and deliberately stays on top — a
 * toast must never be occluded, including during a tutorial.
 *
 * Tailwind arbitrary values (`z-[60]`) are used at call sites; these constants
 * exist for inline styles and to give the convention somewhere to live.
 */
export const Z_LAYERS = Object.freeze({
  CHROME: 50,
  TUTORIAL_SCRIM: 60,
  TUTORIAL_CAPTION: 61,
});

export default Z_LAYERS;
