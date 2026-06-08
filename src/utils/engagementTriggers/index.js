import { evaluateJournalStaleness } from './journalStaleness.js';
import { evaluateSynthesisReady } from './synthesisReady.js';
import { evaluateKillListCheckIn } from './killListCheckIn.js';
import { ENGAGEMENT_TRIGGERS } from '../schema.js';

/**
 * Trigger registry. Each entry is `{ id, evaluate }`. Adding a trigger
 * requires registering it here AND adding a corresponding entry in
 * DEFAULT_NOTIFICATION_PREFERENCES (schema.js).
 *
 * Order matters — the BannerStack renders the first N enabled banners and
 * collapses the rest. Higher priority first.
 */
export const TRIGGERS = [
  { id: ENGAGEMENT_TRIGGERS.JOURNAL_STALENESS, evaluate: evaluateJournalStaleness },
  { id: ENGAGEMENT_TRIGGERS.SYNTHESIS_READY, evaluate: evaluateSynthesisReady },
  { id: ENGAGEMENT_TRIGGERS.KILL_LIST_CHECK_IN, evaluate: evaluateKillListCheckIn },
];

/**
 * Pure orchestrator. Runs each registered trigger evaluator against the
 * current state and returns the non-null payloads. Defensive: an evaluator
 * throwing does not bring the others down.
 */
export const evaluateAllTriggers = (state) => {
  const out = [];
  for (const trigger of TRIGGERS) {
    try {
      const payload = trigger.evaluate(state);
      if (payload) out.push(payload);
    } catch {
      // Swallow — a single broken evaluator should never blank the banner.
    }
  }
  return out;
};

/**
 * Decide which banners to render and how many to collapse. Pre-deploy ships
 * with stack-of-1; this helper returns `{ visible, collapsedCount }` so the
 * v1.1 stack-of-2 + "+N more" UI can drop in without touching call sites.
 */
export const layoutBanners = (banners, { maxVisible = 1 } = {}) => {
  const safeMax = Math.max(1, maxVisible);
  return {
    visible: banners.slice(0, safeMax),
    collapsedCount: Math.max(0, banners.length - safeMax),
  };
};

export { evaluateJournalStaleness, evaluateSynthesisReady, evaluateKillListCheckIn };
