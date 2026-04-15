# Inner Ops — Dead Code Sweep Log

> Append-only. Each entry is dated and produced by the weekly DEAD_CODE_SWEEP routine.
> Do not edit or delete prior entries.

---

## 2026-04-08

### Unused Imports

- `src/App.jsx` — `resetAnalytics` (imported from `./utils/analytics`, never invoked anywhere in the file; `identify` is used but not `resetAnalytics`)
- `src/utils/firebaseUtils.js` — `localStorageUtils` (imported from `./localStorage`, never referenced in any Firebase operation in the file)

---

### Orphaned Components

- No orphaned React components detected. All components found are imported and rendered.

---

### Dead Utilities

**src/utils/performanceUtils.js** — 7 exports never called anywhere in the codebase:
- `memoizeWithExpiry` — advanced memoization with expiry; only `throttleInput` is consumed (in VirtualizedList.jsx)
- `deepMemoize` — LRU cache-based memoization; unused
- `calculateVisibleRange` — virtual scrolling range calculator; unused
- `useDebouncedMemo` — React hook for debounced memoization; unused
- `chunkArray` — array chunking utility; unused
- `batchUpdates` — batch update handler; unused
- `useThrottledInput` — React hook for throttled input; unused

**src/utils/performanceMonitor.js** — 3 exports never imported anywhere:
- `useRenderTracking` — React hook for render tracking; not integrated into any component
- `withRenderTracking` — HOC wrapper; not integrated into any component
- Default export `performanceMonitor` — module default is not imported anywhere

**src/utils/debounce.js** — 3 exports never called (only `debounce` base function is imported, in KillList.jsx):
- `throttle` — basic throttle; unused
- `heavyDebounce` — debounce with immediate option; unused
- `adaptiveDebounce` — adaptive delay debouncing; unused

**src/utils/aiUtils.js** — 3 of 4 exported methods never called from UI (only `generateActionSteps` is used in Dashboard.jsx):
- `generateJournalReflection` — journal reflection prompt generator; unused
- `analyzeKillListPatterns` — kill list analysis; unused
- `generateAIFeedback` — duplicate wrapper around aiFeedback module; unused

**src/utils/firebaseUtils.js** — 4 test/debug functions with no UI call sites:
- `readTestData` — test-only data reader; not called from any component
- `writeTestDataNoAuth` — test-only writer; not called from any component
- `testFirebaseConnection` — connection test utility; not called from any component
- `recoverHistoricalData` — historical recovery function; defined but never invoked

**src/utils/dataMigration.js** — 1 orphaned export:
- `clearOldData` — exported but never called anywhere; `migrateOldDataToFirestore` and `findOldData` ARE used in Dashboard.jsx

---

### BER Residue

- No BER-1 through BER-13 TODO/FIXME references found in the codebase.
- No commented-out code blocks detected. Codebase uses single-line documentation comments only.

---

### blackMirrorAnalytics.js — UI Connectivity Check

All internal pipeline functions (`runPatternDetection`, `generateInsights`, `aggregateCrossModuleData`) are used internally by `getAnalyticsReport()`. Only `getAnalyticsReport()` is exported and called from the UI layer (BlackMirror.jsx line 9). The analytics layer is connected and callable.

**Status: PASS** — no dead code in blackMirrorAnalytics.js; internal functions are private pipeline steps, not orphaned exports.

---

### Firebase Listeners

All `onSnapshot()` and `getDocs()` calls are properly connected; results are consumed by their respective callbacks and data handlers. No disconnected listeners detected.

---

### Summary

- **Total dead code items found:** 21
- **Breakdown:**
  - Unused imports: 2
  - Dead utility functions (never called from any consumer): 14
  - Test/debug-only Firebase functions with no UI call sites: 4
  - Orphaned data migration export: 1
- **Estimated cleanup impact:** MEDIUM
  - The performance utilities (performanceUtils.js, performanceMonitor.js) represent the largest surface area and appear to be speculative infrastructure that was never wired up.
  - The aiUtils.js dead methods suggest the module was partially adopted — only one of four methods was connected.
- **Safe to delete without SSE review:** NO
  - Flag performanceUtils.js functions — some (e.g. `calculateVisibleRange`) may be intentional scaffolding for planned virtualization work; SSE should confirm before removal.
  - Flag aiUtils.js dead methods — may have been deferred rather than abandoned.
  - All other items (unused imports, test Firebase functions, debounce variants, `clearOldData`) are safe candidates after SSE sign-off.

---

*Scan completed by QA Engineer agent (BER-73) on 2026-04-08. No files were modified. Repo state verified unchanged before and after scan.*

---

## 2026-04-08 (BER-79 — Weekly Dead Code Sweep, Second Pass)

> Delta scan against BER-73 baseline. All BER-73 findings confirmed still present — none resolved.
> New findings added below. No files were modified.

### Unused Imports — NEW

- No new unused imports detected beyond those reported in BER-73.

---

### Orphaned Component Exports — NEW

**src/components/SkeletonLoader.jsx** — BER-73 declared "no orphaned components." Narrower reading: several skeleton variants are exported from this file but never imported externally by any component or page. They are only referenced internally as building blocks for the exported composite skeletons (e.g., `SkeletonDashboard`). Two are fully orphaned — no consumer inside or outside the file:

- `SkeletonJournalPage` (line 238) — exported, never imported by Journal.jsx or any other file. Journal.jsx uses `SkeletonJournalEntry` directly instead.
- `SkeletonKillListPage` (line 253) — exported, never imported by KillList.jsx or any other file. Kill list pages use `SkeletonKillTarget` and `SkeletonList` directly.

Internal-only exports (used within SkeletonLoader.jsx composites, not externally callable by UI):
- `SkeletonCircle` — building block for composite skeletons only
- `SkeletonRing` — exported but not referenced internally or externally
- `SkeletonScoreBlock` — used only inside `SkeletonDashboard`
- `SkeletonScoreCard` — used only inside `SkeletonDashboard`
- `SkeletonInsightCard` — used only inside `SkeletonDashboard`
- `SkeletonActivityItem` — used only as default for `SkeletonList`

---

### Dead Hook Exports — NEW

**src/hooks/useKillTargets.js** — Two hook exports never imported anywhere outside the file:

- `useTodaysKillTargets` (line 333) — exported but never consumed by any component or page; `useActiveKillTargets` and `useKillTargetsForDate` serve this function in the UI instead.
- `useThisWeeksKillTargets` (line 488) — exported but never consumed anywhere.

---

### blackMirrorAnalytics.js — CORRECTION

Prior daily note (from DAILY_REVIEW runs) incorrectly stated `getAnalyticsReport()` result was "never rendered in JSX." This is **wrong**. BlackMirror.jsx lines 569–639 contain a full "Pattern Analysis" section that renders `analyticsReport.insights.behavioral_patterns`, `avoidance_patterns`, `identity_vs_behavior_gaps`, and count metadata. The analytics layer is **connected and rendering**.

**Status: CONFIRMED PASS** — blackMirrorAnalytics.js is wired to the UI. Prior DAILY_REVIEW findings on this point are superseded.

---

### Summary

**BER-73 findings:** All 21 items confirmed still present — no items resolved since last scan.

**New findings this pass:**
- `SkeletonJournalPage` and `SkeletonKillListPage` — exported but fully orphaned (2 items)
- `SkeletonRing` — exported but never referenced anywhere (1 item)
- 6 SkeletonLoader internal-only exports that are unnecessarily public API surface
- `useTodaysKillTargets` and `useThisWeeksKillTargets` — dead hook exports (2 items)

**Total new dead code items:** 5 confirmed orphans, 6 unnecessary public exports
**Estimated cleanup impact:** LOW (SkeletonLoader and hook exports are low-risk, no runtime behavior affected)
**Safe to delete without SSE review:** `SkeletonJournalPage`, `SkeletonKillListPage`, `SkeletonRing`, `useTodaysKillTargets`, `useThisWeeksKillTargets` — all export-only, no consumers

---

*Scan completed by QA Engineer agent (BER-79) on 2026-04-08. No files were modified. Repo state verified: 8 uncommitted working-tree modifications existed before scan and remain unchanged after.*

---

## 2026-04-08 (BER-83 — Weekly Dead Code Sweep, Third Pass)

> Delta scan against BER-79 baseline. All prior findings (BER-73: 21 items, BER-79: 5 confirmed orphans + 6 internal-only exports) confirmed still present — none resolved.
> New findings added below. No files were modified.

### Unused Imports — NEW

- `src/App.jsx` — `identify` (imported from `./utils/analytics`, never invoked anywhere in the file; BER-73 only flagged `resetAnalytics` — `identify` is also dead)

---

### Orphaned Exports — NEW

**src/components/SkeletonLoader.jsx** — 5 additional skeleton variants confirmed fully orphaned (never imported externally, not referenced as building blocks for any composite that is itself used):

- `SkeletonCircle` — building block for composites but those composites are also orphaned; never imported externally
- `SkeletonScoreBlock` — used only inside `SkeletonDashboard`, which is used in Dashboard.jsx, but `SkeletonScoreBlock` is not independently imported anywhere
- `SkeletonScoreCard` — same; internal to `SkeletonDashboard` only, never independently imported
- `SkeletonInsightCard` — internal to `SkeletonDashboard` only, never independently imported
- `SkeletonActivityItem` — used as default for `SkeletonList`'s renderItem but never imported externally as a standalone component

**Note:** SkeletonScoreBlock/ScoreCard/InsightCard/ActivityItem are used as internal building blocks within SkeletonLoader.jsx. They are not dead *functionality* — they are dead *API surface*. SSE should confirm whether these should be unexported (made internal) vs deleted.

**src/utils/localStorage.js** — All legacy per-collection methods are dead code. App migrated fully to Firestore. Only `safeGetItem` and `safeSetItem` (the wrapper primitives) are still referenced. Dead methods:

- `saveKillTarget`, `getKillTargets`, `updateKillTarget`, `deleteKillTarget`
- `saveJournalEntry`, `getJournalEntries`
- `saveRelapseEntry`, `getRelapseEntries`
- `getCompassChecks`, `saveCompassCheck`
- `getBlackMirrorEntries`, `saveBlackMirrorEntry`

**src/utils/analytics.js** — 2 exports never imported anywhere:

- `identify` — exported but never called from any component or page
- `resetAnalytics` — exported but never called from any component or page (also flagged as unused import in App.jsx since BER-73)

**src/utils/firebaseUtils.js** — 1 additional dead export not caught in BER-73:

- `subscribeToUserData` — exported Firestore listener factory; never imported or called from any component or page

---

### Summary

**BER-73 findings (21 items):** All confirmed still present — none resolved.
**BER-79 findings (5 orphans + 6 internal-only exports):** All confirmed still present — none resolved.

**New findings this pass (BER-83):**
- `identify` unused import in App.jsx (1 item)
- Additional SkeletonLoader orphaned/unexported-API-surface exports: SkeletonCircle, SkeletonScoreBlock, SkeletonScoreCard, SkeletonInsightCard, SkeletonActivityItem (5 items)
- localStorage.js legacy collection methods: 11 dead methods
- analytics.js dead exports: identify, resetAnalytics (2 items)
- firebaseUtils.js: subscribeToUserData (1 item)

**Total new dead code items this pass:** 20
**Cumulative unresolved dead code items:** ~46
**Estimated cleanup impact:** HIGH (localStorage legacy methods alone represent a significant dead surface area)
**Safe to delete without SSE review:** localStorage legacy methods (no consumers confirmed); identify/resetAnalytics; subscribeToUserData. Flag SkeletonLoader internals — SSE to confirm delete vs unexport.

---

*Scan completed by QA Engineer agent (BER-83) on 2026-04-08. No files were modified. Repo state verified: 8 uncommitted working-tree modifications existed before scan and remain unchanged after.*

---

## 2026-04-09 (BER-116 — Weekly Dead Code Sweep, Fourth Pass)

> Delta scan against BER-83 baseline.
> BER-84 through BER-96 (SSE cleanup cycle) completed between scans — prior findings substantially resolved.
> No files were modified during this scan.

### Resolved Since BER-83 — CONFIRMED CLEAN

The following items from prior sweeps (BER-73, BER-79, BER-83) have been addressed:

| File | Item | Fixed By |
|------|------|----------|
| `src/utils/performanceUtils.js` | Dead exports: memoizeWithExpiry, deepMemoize, calculateVisibleRange, useDebouncedMemo, chunkArray, batchUpdates, useThrottledInput | BER-84 |
| `src/utils/performanceMonitor.js` | Entire file (deleted) | BER-85 |
| `src/utils/debounce.js` | Dead exports: throttle, heavyDebounce, adaptiveDebounce | BER-86 |
| `src/utils/aiUtils.js` | Dead methods: generateJournalReflection, analyzeKillListPatterns, generateAIFeedback | BER-87 |
| `src/utils/firebaseUtils.js` | Dead exports: readTestData, writeTestDataNoAuth, testFirebaseConnection, recoverHistoricalData | BER-88 |
| `src/utils/analytics.js` | `resetAnalytics` export removed | BER-89 |
| `src/App.jsx` | `resetAnalytics` unused import removed (note: `identify` IS used — line 73) | BER-89 |
| `src/components/SkeletonLoader.jsx` | Orphaned exports removed: SkeletonJournalPage, SkeletonKillListPage, SkeletonRing | BER-90 |
| `src/hooks/useKillTargets.js` | Dead exports removed: useTodaysKillTargets, useThisWeeksKillTargets | BER-91/95 |
| `src/utils/localStorage.js` | Legacy collection methods removed: saveKillTarget, getKillTargets, etc. (11 methods) | BER-96 |

**Cumulative resolved items: 30**

---

### Unresolved From Prior Scans

**`src/utils/firebaseUtils.js` — `subscribeToUserData` (first flagged BER-83, not included in BER-88 scope)**

- Line 218: `export const subscribeToUserData = async (collectionName, callback) => { ... }`
- No imports found anywhere in `src/`. Never called from any component or page.
- BER-88 fixed 4 other firebaseUtils dead exports but missed this one.

---

### Unused Imports

None found. All imports are actively used.

---

### Orphaned Components

None found. All components in `src/components/` are imported and rendered.

---

### Dead Utilities

**`src/utils/localStorage.js` — Entire file is dead (NEW)**

BER-96 cleaned up the 11 legacy collection methods. The remaining exported object `localStorageUtils` (containing `safeGetItem`, `safeSetItem`, `setUser`, `getUser`, `removeUser`) is not imported by any component, page, hook, or utility in `src/`.

```
export const localStorageUtils = { safeGetItem, safeSetItem, setUser, getUser, removeUser }
```

No consumer exists. The file has no live callers. Safe to delete after SSE review.

---

### BER Residue

**`src/utils/clarityScore.js:96` — bare `console.warn` instead of `logger.warn` (NEW)**

```js
console.warn(`[clarityScore] Kill target "${target.name || target.id}" has no difficulty or recognized priority — defaulting to 'deep'`);
```

Rest of the codebase uses the `logger` utility. This bypasses logger filtering and will emit in all environments. Minor — but inconsistent with the established pattern.

---

### blackMirrorAnalytics.js — UI Connectivity Check

All four exports confirmed connected:
- `runPatternDetection`, `generateInsights`, `aggregateCrossModuleData` — internal pipeline, called by `getAnalyticsReport()`
- `getAnalyticsReport()` — imported and called from BlackMirror.jsx line 127

**Status: PASS**

---

### Firebase Listeners

All `onSnapshot()` and `getDocs()` calls verified connected and properly unsubscribed. No disconnected listeners.

**Status: PASS**

---

### Summary

| Category | Count |
|----------|-------|
| Items resolved since BER-83 | 30 |
| Pre-existing unresolved (subscribeToUserData) | 1 |
| New dead utility exports | 1 (localStorage.js) |
| New residue findings | 1 (clarityScore.js console.warn) |
| **Total outstanding items** | **3** |

- **Estimated cleanup impact:** LOW — 3 items, no runtime behavior affected
- **Safe to delete without SSE review:** `subscribeToUserData` export (no consumers confirmed). Flag `localStorage.js` file deletion — SSE to confirm no external consumers outside `src/` before deleting.

---

*Scan completed by QA Engineer agent (BER-116) on 2026-04-09. No files were modified. Repo state verified unchanged: 3 untracked files (DAILY_REVIEW.md, DEAD_CODE_REPORT.md, SCORING.md) before and after scan.*

---

## 2026-04-14 (QA Remediation Sprint — Finding 25 reconciliation)

> Reconciliation pass against the current working tree, performed during the remediation sprint. This is not a full delta scan — it only resolves inaccuracies carried forward in prior entries.

### Corrections

- **`subscribeToUserData` (firebaseUtils.js)** — prior scans (BER-83, BER-116) flagged this export as unused. **FALSE POSITIVE as of 2026-04-14.** The function is actively imported and called by `src/pages/KillList.jsx` (`KillList`'s real-time listener) and `src/hooks/useSynthesisNewFlag.js`. Grep confirms two live consumers. Marking RESOLVED (not via deletion — via verification that it is in use).

- **`clarityScore.js` `console.warn`** — BER-116 flagged a bare `console.warn`. Current file uses `logger.warn`. **RESOLVED** (inspection confirms no stray `console.warn` remains in the file).

### New items (from remediation sprint)

- No new dead code introduced this sprint. Additions are all active: `src/utils/schema.js` (consumed by `getBehavioralContext.js`, `generateSynthesisBriefing.js`, `detectDriftSignals.js`), server-side `PROMPT_CONTEXT_REGISTRY` in `functions/index.js` (consumed by clients of `oracle`).

### Residual outstanding

- `src/utils/localStorage.js` — entire file still appears orphaned per BER-116. Not touched this sprint (out of scope). Carried forward.

### Cumulative unresolved

| Item | Status |
|------|--------|
| `localStorage.js` (orphan file) | Open — carried from BER-116 |
| `subscribeToUserData` | **Resolved** — in use |
| `clarityScore.js` console.warn | **Resolved** — already logger.warn |

---

*Reconciliation completed by SSE remediation agent on 2026-04-14. Full weekly sweep to resume on next BER-scheduled run.*
