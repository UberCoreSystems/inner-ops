/**
 * computeDepthTrend — pure function that turns a journal entry stream into a
 * 30-day metacognitive-depth readout for the Dashboard MirrorStack.
 *
 * Oracle classifies every journal entry as 'Surface' | 'Pattern' | 'Identity'
 * (the `metacognitiveDepth` field, persisted on each entry). This function
 * aggregates the recent window into a distribution and compares the most
 * recent half-window against the immediately prior half-window to label the
 * trajectory.
 *
 * Voice / measurement rules (consumed by MirrorStack):
 *   - 'surfacing' is descriptive, not a judgment. Depth measures reflection
 *     style, not virtue. The card must not moralize.
 *   - Below DEPTH_TRUST_THRESHOLD classified entries: render an empty-state.
 *     Mirrors the philosophy of Oracle's TRUST_THRESHOLD (functions/index.js):
 *     do not draw trajectory claims from undersized samples.
 *
 * Deterministic given input — accepts `now` for test injection, mirroring
 * the composeMirrorReading pattern.
 */

import { MS_PER_DAY, getEntryTimestamp } from './dateUtils.js';

export const DEPTH_TRUST_THRESHOLD = 10;
const VALID_DEPTHS = new Set(['Surface', 'Pattern', 'Identity']);
const TRAJECTORY_DELTA_THRESHOLD = 15; // percentage points
const MIN_PER_HALF_WINDOW = 4;

const emptyResult = () => ({
  classifiedCount: 0,
  totalCount: 0,
  distribution: { Surface: 0, Pattern: 0, Identity: 0 },
  trajectory: 'insufficient',
  belowTrustThreshold: true,
});

/**
 * @param {Array<object>} journalEntries — raw journal entries (may include
 *   entries without metacognitiveDepth; they are tolerated and counted in
 *   totalCount but excluded from distribution).
 * @param {{
 *   windowDays?: number,        // total window for distribution (default 30)
 *   compareWindowDays?: number, // half-window size for trajectory (default 14)
 *   now?: number,               // for tests; defaults to Date.now()
 * }} [opts]
 * @returns {{
 *   classifiedCount: number,
 *   totalCount: number,
 *   distribution: { Surface: number, Pattern: number, Identity: number },
 *   trajectory: 'deepening' | 'stable' | 'surfacing' | 'insufficient',
 *   belowTrustThreshold: boolean,
 * }}
 */
export function computeDepthTrend(journalEntries, opts = {}) {
  const entries = Array.isArray(journalEntries) ? journalEntries : [];
  const windowDays = opts.windowDays ?? 30;
  const compareWindowDays = opts.compareWindowDays ?? 14;
  const now = opts.now ?? Date.now();

  if (entries.length === 0) return emptyResult();

  const windowStart = now - windowDays * MS_PER_DAY;
  const recentHalfStart = now - compareWindowDays * MS_PER_DAY;
  const priorHalfStart = now - 2 * compareWindowDays * MS_PER_DAY;

  const distribution = { Surface: 0, Pattern: 0, Identity: 0 };
  const recentHalf = { Surface: 0, Pattern: 0, Identity: 0, total: 0 };
  const priorHalf = { Surface: 0, Pattern: 0, Identity: 0, total: 0 };
  let classifiedCount = 0;
  let totalCount = 0;

  for (const entry of entries) {
    const ts = getEntryTimestamp(entry);
    if (!ts || ts <= windowStart || ts > now) continue;
    totalCount += 1;

    const depth = entry?.metacognitiveDepth;
    if (!VALID_DEPTHS.has(depth)) continue;
    classifiedCount += 1;
    distribution[depth] += 1;

    if (ts > recentHalfStart) {
      recentHalf[depth] += 1;
      recentHalf.total += 1;
    } else if (ts > priorHalfStart) {
      priorHalf[depth] += 1;
      priorHalf.total += 1;
    }
  }

  const belowTrustThreshold = classifiedCount < DEPTH_TRUST_THRESHOLD;

  let trajectory;
  if (
    recentHalf.total < MIN_PER_HALF_WINDOW ||
    priorHalf.total < MIN_PER_HALF_WINDOW
  ) {
    trajectory = 'insufficient';
  } else {
    const recentDeepPct =
      ((recentHalf.Pattern + recentHalf.Identity) / recentHalf.total) * 100;
    const priorDeepPct =
      ((priorHalf.Pattern + priorHalf.Identity) / priorHalf.total) * 100;
    const recentSurfacePct = (recentHalf.Surface / recentHalf.total) * 100;
    const priorSurfacePct = (priorHalf.Surface / priorHalf.total) * 100;

    if (recentDeepPct - priorDeepPct >= TRAJECTORY_DELTA_THRESHOLD) {
      trajectory = 'deepening';
    } else if (recentSurfacePct - priorSurfacePct >= TRAJECTORY_DELTA_THRESHOLD) {
      trajectory = 'surfacing';
    } else {
      trajectory = 'stable';
    }
  }

  return {
    classifiedCount,
    totalCount,
    distribution,
    trajectory,
    belowTrustThreshold,
  };
}

export default computeDepthTrend;
