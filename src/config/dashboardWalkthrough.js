/**
 * Steps for the Dashboard first-run walkthrough.
 *
 * Pure data so the copy can be reviewed as writing. Voice rules match the rest
 * of the product: second person, declarative, short. No encouragement, no
 * exclamation marks, no emoji.
 *
 * Anchor selection is deliberate and load-bearing. Every target below renders
 * UNCONDITIONALLY, including for an account with no data — which is the entire
 * audience for this feature. Cards behind a data or day-of-week conditional
 * (MorningBrief, PatternConfrontationCard, WeeklyRuleReview, Early Warning,
 * Sunday Autopsy, Monday Kill Report, the Synthesis banner) are absent on day
 * one and are therefore unusable as tour stops, however informative they are
 * later.
 *
 * Captions are capped near 110 characters of body so they hold to 2–3 lines at
 * 320px without scrolling the caption bar.
 */

export const WALKTHROUGH_ID = 'dashboard';

export const WALKTHROUGH_STEPS = Object.freeze([
  {
    id: 'mirror',
    selector: '[data-tour="mirror"]',
    title: 'The Oracle reading',
    body: 'Reads across every module and reports back. It does not congratulate you. Early on it will say it does not have enough to work with — that is accurate, not a failure.',
  },
  {
    id: 'quick-actions',
    selector: '[data-tour="quick-actions"]',
    title: 'The four modules',
    body: 'Journal first. You draw the contracts, lessons, and signals from it. The Oracle guides, it does not decide.',
  },
  {
    id: 'stats',
    selector: '[data-tour="stats"]',
    title: 'Your stats',
    body: 'All-time totals. The only number that matters is the one still moving. Start with one entry today.',
  },
]);

export default WALKTHROUGH_STEPS;
