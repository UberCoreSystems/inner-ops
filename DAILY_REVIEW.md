## [2026-04-11] — BER-172 DAILY_REVIEW

> **Run:** BER-172 — DAILY_REVIEW routine execution
> **QA Agent:** 64512fb6 (QA Engineer)
> **Prior state:** All 5 modules PASS as of 2026-04-10 (BER-153/BER-162)

---

### Stability

- [PASS] Journaling — no new findings; error handling, PAIN_SIGNALS bridge, and Firebase subscriptions intact
- [PASS] Kill List — no new findings; autopsy aggregation, implementation intention validation, and escapeData flow intact
- [PASS] Hard Lessons — no new findings; 8-field validation, finalization lock, scar inventory flow all intact
- [PASS] Relapse Radar — no new findings; drift signals dual-surfaced (Dashboard + step 2), mountedRef guard active
- [PASS] Black Mirror — no new findings; getAnalyticsReport() connected and rendering; all 3 analytics layers operational
- [PASS] Firebase/Auth — all collections user-scoped; Dashboard Promise.all() gracefully handled; no auth edge case leaks
- [PASS] Error Boundaries — ErrorBoundary and InlineErrorBoundary wired; no silent failures detected

### Optimization

- [OPTIMIZE] Shared — `clearBehavioralContextCache()` exported from getBehavioralContext.js but never called after write operations (RelapseRadar, HardLessons, KillList); Oracle context can be stale up to 5 min post-write *(carry-forward from BER-162)*
- [OPTIMIZE] Shared — SynthesisBriefing.js runs separate reduce/sort passes for dominant archetype and dominant mood over identical datasets; single-pass aggregation possible *(carry-forward from BER-162)*

### Enhancement

- [IMPROVEMENT] Hard Lessons — Cost category buttons render neutral on form open despite being a required field; only highlights after interaction; first-time users are prone to missing it *(carry-forward, first noted BER-153)*
- [IMPROVEMENT] OracleModal — No UI-side timeout on Cloud Function call; if CF times out at 20s, user stays in loading state with no error or retry *(carry-forward, first noted 2026-04-09)*
- [IMPROVEMENT] Dashboard — Drift signal detection runs once on load; no re-run trigger on mid-session data changes; stale signals undermine early-detection mandate *(carry-forward from BER-153)*
- [IMPROVEMENT] Journal — Prompt carousel has no position indicator *(carry-forward)*
- [IMPROVEMENT] Kill List — Killed targets vanish rather than persisting as historical record *(carry-forward)*
- [IMPROVEMENT] Black Mirror — "Digital Consciousness Check" form title; no intermediate analytics loading states *(carry-forward)*
- [IMPROVEMENT] EmergencyButton — Breathing circle oversized on 375px mobile *(carry-forward)*
- [IMPROVEMENT] Relapse Radar — Escape autopsy form silently disables submit when intentionActivated missing; no toast *(carry-forward)*

### Summary

| Category | Count |
|---|---|
| FAIL (blockers) | 0 |
| WARNING | 0 |
| OPTIMIZE | 2 (carry-forward) |
| IMPROVEMENT | 8 (carry-forward) |
| New findings | 0 |

**Deploy readiness: READY**

No new blockers. No regressions. All 5 modules PASS stability. All previously verified fixes hold. Carry-forward improvements are quality-of-life items, not production risks.

**Git status: unchanged** — read-only review. No source files modified.

---

## [2026-04-10] — Evening Review (BER-162)

> **Run:** BER-162 — DAILY_REVIEW routine execution
> **QA Agent:** 64512fb6 (QA Engineer)

### Stability

- [PASS] Journaling — No new findings. Evasion detection (BER-138) confirmed operational in `aiFeedback.js:728` — `detectEvasionMarkers()` called before Oracle for journal/hardlessons modules, injects EVASION ALERT note when 2+ markers detected. No regressions.
- [PASS] Kill List — No new findings. Autopsy pattern aggregation confirmed rendered in UI at `KillList.jsx:993+` — expandable "Autopsy Pattern" section visible after 3+ escapes. Context and rationalization themes surfaced correctly. No regression on BER-125 (AVE circuit breaker), BER-126 (implementation intentions), or BER-131 (Hard Lessons bridge).
- [PASS] Hard Lessons — No new findings. All prior fixes hold. No regressions.
- [PASS] Relapse Radar — No new findings. `detectDriftSignals` confirmed connected via `useMemo` at `RelapseRadar.jsx:163` and displayed at step 2 entry flow (line 532). Dashboard integration (BER-152) holds. No regressions.
- [PASS] Black Mirror — No new findings. Analytics layer confirmed: `getAnalyticsReport` imported at `BlackMirror.jsx:9`, `calculateBlackMirrorIndex` computed and used. No dead code. No regressions.
- [PASS] Emergency Button — No new findings. BER-113 and BER-114 fixes verified stable.
- [PASS] Oracle — No new findings. BER-157 re-review verdict holds: `functions/index.js:53` destructures `behavioralContext`, passes to `buildSystemPrompt()` at line 61, injected into all non-extraction prompts via `buildBehavioralContextBlock()`. Cross-module context live.
- [PASS] Firebase — All modules: user-scoped reads, auth guards present, no unhandled promise rejections. Dashboard `Promise.all()` at line 329 is correctly wrapped in outer `try/catch` at line 325 — individual `.then()` chains return `data || []` graceful defaults. No crash risk.
- [WARNING] OracleModal — **Carry-forward.** No UI timeout on loading state. `httpsCallable` timeout is set to 20s on the CF call, but there is no UI-side recovery — if the function times out, user remains in loading state with no error message or retry option. Not a regression; logged since 2026-04-09.

---

### Optimization

- [OPTIMIZE] getBehavioralContext — `clearBehavioralContextCache(userId)` is exported from `src/utils/getBehavioralContext.js:140` but is never imported or called in any component or page. After a user logs a new relapse entry, updates a Hard Lesson rule, or modifies a kill target, Oracle's cross-module behavioral context remains stale for up to 5 minutes (cache TTL). Oracle responses in that window reflect outdated state. Fix: call `clearBehavioralContextCache(userId)` in RelapseRadar, HardLessons, and KillList after successful write operations.
- [OPTIMIZE] generateSynthesisBriefing — Dominant archetype and dominant mood are each computed in separate reduce/sort passes (lines 61–65 and lines 87–92 respectively). Both are independent aggregations over the same dataset. A single pass would compute both in one iteration.

> **Carrying forward from prior runs (unresolved):**
> - Kill List — Oracle modal uses local `useState` instead of centralized `useOracleModal()` hook. No functional impact. ([2026-04-09])
> - firebaseUtils.js — `where("userId", "==", user.uid)` repeated across multiple query sites. Minor abstraction opportunity. ([2026-04-09])

---

### Enhancement

- [IMPROVEMENT] SynthesisBriefing — Cadence lock renders: *"Next briefing available: [DATE]"* with no further context. The user receives a date but no direction on what to review while locked out. Misses a high-leverage moment: redirect to last briefing archive or identity direction profile. Proposed copy: *"Synthesis locked until [DATE]. Review your last briefing or update your identity direction to sharpen the next one."*
- [IMPROVEMENT] generateSynthesisBriefing — `signalDeltaNote` at line 120 uses passive/observational framing: *"Behavioral patterns are moving against the stated identity direction: '[direction]'."* Product philosophy mandates confrontational, not descriptive, language. The note is stored in the briefing object and surfaced in the UI — its passive voice undercuts the module's mandate. Proposed reframe: *"Your behavior contradicts your stated direction — '[direction]'. Name the specific gap."*

> **Carrying forward from prior runs (unresolved improvements):**
> - OracleModal — No timeout safeguard on loading state. Infinite spinner risk on silent Cloud Function failure. ([2026-04-09])
> - Relapse Radar — Empty state hides Pattern Data section with no first-session prompt. ([2026-04-09])
> - BlackMirror — "Digital Consciousness Check" form title is philosophical; operational rename recommended. ([2026-04-09])
> - Relapse Radar — No copy reinforcing that logging should occur at moment of drift, not after collapse. ([2026-04-09])
> - Journal — Prompt carousel has no position indicator and no auto-rotation. ([2026-04-09])
> - Kill List — "Killed" targets removed from view rather than persisting as a permanent behavioral record. ([2026-04-09])
> - BlackMirror — Analytics loading shows only "Analyzing..." with no intermediate progress states. ([2026-04-09])
> - EmergencyButton — Breathing circle fixed at 192×192px; oversized on 375px mobile screens. ([2026-04-09])
> - Relapse Radar — `intentionActivated` validation disables submit with no toast explanation. ([2026-04-10 BER-153])
> - Hard Lessons — Cost category not pre-highlighted; only visually prominent after failed submit. ([2026-04-10 BER-153])
> - Dashboard — Drift signal detection runs once on load; does not re-run on mid-session data changes. ([2026-04-10 BER-153])

---

### Summary

| Category | Count |
|---|---|
| FAIL | 0 |
| WARNING | 1 (carried) |
| OPTIMIZE | 2 (new) + 2 (carried) |
| IMPROVEMENT | 2 (new) + 11 (carried) |
| **Total new findings** | **4** |

**Deploy Readiness: READY**

All modules stable. No new blockers. Key verifications this run: Oracle CF cross-module context confirmed live (BER-157 holds), evasion detection confirmed wired (BER-138 holds), autopsy pattern aggregation confirmed rendered in Kill List UI, drift signals dual-surfaced (BER-152 holds). Two new optimization/improvement findings filed — neither is a blocker.

**Git status: unchanged** — read-only review. No source files modified.

---

## [2026-04-10]

> **Run:** BER-153 — DAILY_REVIEW routine execution
> **QA Agent:** 64512fb6 (QA Engineer)

### Stability

- [PASS] Journaling — No findings. Full first-review completed. Required fields enforced (content, mood, intensity). Empty states present and product-aligned. Firebase calls user-scoped. Oracle fallback operational and terse. Hard Lessons bridge wired (PAIN_SIGNALS regex + navigation). No dead imports.
- [PASS] Kill List — No findings. UXR-001 state intact. Implementation intentions required (20-char minimum, both fields). AVE circuit breaker active (3-second lock before Oracle). Autopsy modal captures intention activation and failure reason. Pattern aggregation on 3+ escapes confirmed operational.
- [PASS] Hard Lessons — No findings. Full first-review completed. 8-field required form with per-field toast validation. Scar inventory flow fires correctly on first session (sessionStorage flag). Finalization lock enforced (immutable after isFinalized=true). Kill List bridge present (sessionStorage pre-fill). Oracle extraction wrapped in try/catch.
- [PASS] Relapse Radar — No findings. **BER-152 VERIFIED FIXED** — drift signals now dual-surfaced: (1) Dashboard renders signals via `detectDriftSignals()` on load when driftSignals.length > 0, (2) RelapseRadar step 2 shows signals contextually. All three signal types present: archetype_frequency, precursor_pattern, correlated_escape. Detection logic correct (7-day window for archetype/precursor, 48h for escape correlation).
- [PASS] Black Mirror — No findings. `blackMirrorAnalytics.js` fully connected — `getAnalyticsReport()` imported and called at line 170 of BlackMirror.jsx, report rendered in component JSX. Layer 1 (data normalization), Layer 2 (4 deterministic pattern rules), and Layer 3 (insight generation) all operational. No soft or motivational language in any insight output — all strictly data-derived. No dead imports.
- [PASS] Firebase — All collections user-scoped. `Promise.allSettled()` used in analytics for resilient cross-module fetch. Timestamp fallbacks present. Auth error propagation intact.

---

### Optimization

No new findings.

> **Carrying forward from prior runs (unresolved):**
> - Kill List — Local OracleModal state instead of centralized `useOracleModal()` hook. No functional impact. ([2026-04-09])
> - firebaseUtils.js — `where("userId", "==", user.uid)` clause repeated across query sites. Minor abstraction opportunity. ([2026-04-09])

---

### Enhancement

- [IMPROVEMENT] Relapse Radar — Escape autopsy form: `intentionActivated` field validation disables the submit button but provides no toast or inline message explaining what is missing. Users with an implementation intention attached to a target will see the button grey out with no explanation. Other validation failures in this module surface toasts. Inconsistency creates confusion.
- [IMPROVEMENT] Hard Lessons — Cost category selection has a visual required indicator but does not pre-highlight required state on form open. Only becomes visually prominent after a failed submission attempt. Given that 8 fields are required and costs is the only checkbox-type input, first-time users routinely miss it. Pre-highlight or add instructional copy above the cost grid.
- [IMPROVEMENT] Dashboard — Drift signal rendering is gated on `driftSignals.length > 0` after `detectDriftSignals()` runs on load. If detection threshold changes (e.g., user adds entries mid-session without refresh), the dashboard will not reflect updated signals until the next hard load. No re-run trigger on module data changes. Low-severity but worth flagging given Relapse Radar's mandate is early detection — stale signals undermine that.

> **Carrying forward from prior runs (unresolved improvements, no new ticket filed):**
> - OracleModal — No timeout safeguard on loading state. Infinite spinner risk on silent Cloud Function failure. ([2026-04-09])
> - Relapse Radar — Empty state hides Pattern Data section with no first-session prompt. ([2026-04-09])
> - BlackMirror — "Digital Consciousness Check" form title is philosophical; operational rename recommended ("Attention Sovereignty Audit"). ([2026-04-09])
> - Relapse Radar — No copy reinforcing that logging should occur at moment of drift, not after collapse. ([2026-04-09])
> - Journal — Prompt carousel has no position indicator ("Question X of Y") and no auto-rotation. ([2026-04-09])
> - Kill List — "Killed" targets removed from view rather than persisting as a permanent behavioral record. ([2026-04-09])
> - BlackMirror — Analytics loading shows only "Analyzing..." with no intermediate progress states. ([2026-04-09])
> - EmergencyButton — Breathing circle fixed at 192×192px; oversized on 375px mobile screens. ([2026-04-09])

---

### Summary

| Category | Count |
|---|---|
| FAIL | 0 |
| WARNING | 0 |
| OPTIMIZE | 0 (2 carried) |
| IMPROVEMENT | 3 (new) + 8 (carried) |
| **Total new findings** | **3** |

**Deploy Readiness: READY**

No new blockers. All prior FAILs verified resolved. BER-152 (Relapse Radar drift signal placement) confirmed fixed — dual-surfaced on dashboard and in step 2 entry flow. Black Mirror analytics layer confirmed connected and rendering. All 5 modules stable. Carry-forward improvements are logged but none represent product philosophy failures requiring escalation at this time.

**Git status: unchanged** — read-only review. No source files modified.

---

## [2026-04-07]

### Stability

- [FAIL] **All Modules / aiUtils.js** — `generateLocalAIResponse` (lines 254–326) is dead code. The function defines a full theme-detection and response system but is never called. `aiUtils.generateAIFeedback` bypasses it entirely, routing directly to `generateOracleFeedback` from `aiFeedback.js`. 72 lines of orphaned logic with no execution path. Remove or wire up.

- [WARNING] **Journal** — Dynamic insight system (`generateContextualInsights`, lines 363–427) checks for mood labels `happy`, `sad`, `angry`, `anxious`, `tired` — none of which exist in the Journal's mood taxonomy. The app uses `electric`, `foggy`, `sharp`, `hollow`, `chaotic`, `triumphant`, `heavy`, `light`, `focused`, `radiant`, `steady`, `calm`. Every mood-keyed branch silently misses, collapsing the system to the generic fallback on nearly every call. Additionally, `steady` is absent from the mood-specific fallback map (lines 410–423), producing an undefined lookup for that mood state. The live insight feature is non-functional for its intended purpose.

- [WARNING] **Kill List** — Auto-generated target description (line 204) uses `.label.split(' ').slice(1).join(' ')` — drops the first word of the category label. Single-word categories (e.g., `addiction` → "Addiction") produce an empty string, falling back to the generic `'target'`. Result: descriptions like "Eliminate this target" or "Eliminate this Habit". No functional break; silent data quality degradation on every new target.

- [WARNING] **Relapse Radar** — Auth listener cleanup has a race condition (lines 60–76). `useEffect` returns its cleanup before the async `setupAuthListener()` promise resolves. Firebase's `onAuthStateChanged` unsubscription is deferred via `.then()`, meaning if the component unmounts before the promise resolves, the listener continues firing and attempts state updates on the unmounted component. In React 18 this will not crash but produces resource leaks and spurious state update attempts.

- [WARNING] **App.jsx** — `lazyInitializeFirebase()` (lines 38–49) imports Firebase SDK's raw `getAuth` from `'firebase/auth'` directly, bypassing the app's custom lazy-init wrapper (`./firebase`). It calls `getAuth()` without an app argument. If invoked before Firebase app initialization completes, it returns a misconfigured or default auth instance. The error is silently swallowed (lines 83–85), masking potential initialization failures at startup.

- [WARNING] **Relapse Radar** — Header card (line 232) displays: "✨ Self-awareness bonus: Submitting entries rewards your honesty and growth mindset (+30 points, +20 for detailed reflection)." No points system exists anywhere in the codebase — no tracking, no calculation, no display. This is dead UI copy that presents a false feedback loop to the user.

- [WARNING] **Black Mirror** — `BlackMirror` component is eagerly imported in `App.jsx` (line 13: `import BlackMirror from './components/BlackMirror'`), but its route (`/blackmirror`, lines 237–246) wraps it in a `Suspense` boundary. The Suspense wrapper has no effect — the component is already in the main bundle. Code-splitting benefit is nullified. Either lazy-import it or remove the Suspense wrapper from its route.

- [WARNING] **Black Mirror** — Gamification copy in the header (line 239): "📱 Weekly check: +25 clarity points | Low index (<10): +10 bonus points." Same non-existent points system referenced in Relapse Radar. No clarity points are tracked, stored, or displayed anywhere in the app. Dead copy.

---

### Optimization

- [OPTIMIZE] **aiUtils.js** — `generateLocalAIResponse` (lines 254–326) is unused and should be removed. It adds 72 lines to the bundle with zero call sites.

- [OPTIMIZE] **aiUtils.js** — `analyzeKillListPatterns` (lines 58–97) uses stale category keys (`habit`, `thought`, `behavior`, `relationship`, `excuse`) that do not match the current Kill List taxonomy (`bad-habit`, `negative-thought`, `addiction`, `toxic-behavior`, `fear`, `procrastination`, `other`). The `topCategory` insight will always produce the generic fallback `'Keep building awareness in this area.'` — the switch logic never matches. Verify call sites and update keys or remove.

- [OPTIMIZE] **aiUtils.js** — `generateCompassInsights` (lines 100–157) references a Compass module (values: authenticity, courage, discipline, growth, service) with no route in `App.jsx`. If this module has been deprecated, the function is dead. If it's planned, the route is missing. One or the other should be resolved.

- [OPTIMIZE] **Kill List** — `categories` and `categoryIcons` state is wrapped in `useMemo` (lines 115–116) with no dependencies. Both reference module-level constants `CATEGORIES` and `CATEGORY_ICONS`. Memoizing stable constant references is a no-op and adds cognitive overhead.

- [OPTIMIZE] **Journal** — `journalPrompts` `useMemo` (lines 245–248) lists `oraclePrompts` as the only variable dependency but `basePrompts` is also spread in (module-level constant). This is fine as written but the dependency array on the `isTextareaFocused` prompt rotation effect (line 307: `[journalPrompts.length, isTextareaFocused]`) compares `journalPrompts.length` instead of `journalPrompts` — this means prompt content changes (new oracle questions) won't retrigger the interval reset unless the length changes. Minor stale-closure risk.

---

### Enhancement

- [IMPROVEMENT] **Relapse Radar** — "AI RECOVERY INSIGHTS" block (lines 236–247) is powered by `aiUtils.analyzeRelapsePatterns`, which outputs motivational, generic text: "🌱 No relapse entries yet. Focus on building strong preventive habits and self-awareness", "🔄 Multiple entries show you're building self-awareness. This recognition is the first step to lasting change." Output is not derived from actual stored behavioral data — it's templated encouragement. Module mandate is early warning detection before collapse. This section either needs to surface real pattern data (archetype frequency, gap since last, compounding triggers) or be removed. As currently implemented it fails the product spec.

- [IMPROVEMENT] **Journal** — Dynamic insight panel contains language that violates product philosophy:
  - "What might your soul be asking for?" (line 388) — wellness-adjacent
  - "sometimes we need to sit in the fog to appreciate the sunshine" (line 404) — motivational filler
  - "Short and sweet. Sometimes the most powerful insights come in few words." (line 403) — positive reinforcement with no signal value
  These are not signal extraction prompts. They read as self-help copy.

- [IMPROVEMENT] **Journal** — `basePrompts` (lines 233–242) include "What small win can I celebrate today?" — cheerleader framing. Journaling is defined as structured reflection for signal extraction, not celebration or gratitude practice. Prompt should be replaced with a signal-extraction question.

- [IMPROVEMENT] **All Modules — Oracle error fallbacks** — When Oracle feedback generation fails, every module falls back to mystical filler:
  - Journal: "The Oracle encounters interference in the cosmic currents... Your thoughts are still sacred."
  - Relapse Radar: "The Oracle senses disturbance in the spiritual realm... Your journey is still witnessed."
  - Kill List: "Your contract has been sealed in the ethereal realm. Pursue your target with unwavering focus."
  "Your journey is still witnessed" and "Your thoughts are still sacred" are wellness language. Error states should be terse and functional, not comforting. Recommend: a neutral fallback like "Oracle unavailable. Entry saved." with a retry path.

- [IMPROVEMENT] **Black Mirror** — Index analysis text for mid-range (8–25): "Moderate usage noted. You're building awareness." covers both 8–15 and 15–24 bands. The 15–24 range sits just below HIGH (25). "Building awareness" is passive and soft for a system designed to enforce attention sovereignty. At minimum the 15–24 range warrants harder language. Currently the analysis block checks ≥40, ≥25, <8 — the 8–25 band is a single catch-all with no differentiation.

- [IMPROVEMENT] **Hard Lessons** — Scar Inventory submission toast (line 163): "Expand them when you're ready." — "when you're ready" is passive framing. Hard Lessons is defined as a serious personal record, pain-forged. The language should reflect urgency to complete the record, not permission to delay.

- [IMPROVEMENT] **Kill List & Journal** — Both use `window.confirm()` for delete confirmation (KillList line 396, Journal line 534). The native browser dialog breaks UI consistency and bypasses the app's design system. All other modules use toast-based undo patterns. These two deletions should match the existing undo-toast pattern.

- [IMPROVEMENT] **Relapse Radar** — No archetype is required to advance past step 1 in the navigation flow — wait, actually step 1 does require `selectedSelf` (line 397). However, steps 2 and 3 are explicitly optional ("Skip if none apply"), and step 4 has no minimum reflection length enforced before submit. A user can submit a relapse check-in with an archetype but zero habits, zero substances, and an empty reflection. The resulting entry has almost no diagnostic value. Consider a minimum word count or non-empty reflection requirement at step 4 to preserve signal quality.

---

### Summary

| Category     | Count |
|---|---|
| FAIL         | 1     |
| WARNING      | 7     |
| OPTIMIZE     | 5     |
| IMPROVEMENT  | 8     |
| **Total**    | **21** |

**Deploy Readiness: REVIEW REQUIRED**

Critical blockers: 1 FAIL (dead code with zero call sites — `generateLocalAIResponse`). Stability warnings are non-crashing but include a confirmed non-functional feature (Journal dynamic insights), a UI race condition (Relapse Radar auth cleanup), and two instances of dead gamification copy referencing a points system that does not exist. No auth gaps found. Firebase security rules are correctly scoped per user. No broken routing detected. All 5 modules render. Black Mirror analytics layer is connected and callable from the UI — `getAnalyticsReport` is imported and invoked both on mount and post-submission in `BlackMirror.jsx`.

**Git status: unchanged** — this review is read-only. No modifications made to source files.

---

## [2026-04-08]

### Stability

- [FAIL] **App.jsx** — Firebase initialization race condition (lines 55–98). `onAuthStateChanged` unsubscription is assigned via `.then()` on the async `setupAuth()` chain. If the component unmounts before the Promise resolves, the `unsubscribe` variable is never set, the listener remains active, and state updates fire on an unmounted component. Pattern confirmed at line 91.

- [FAIL] **All Modules / firebaseUtils.js** — `readUserData()` (lines 239–245) catches all errors and returns an empty array. If the user is unauthenticated and `ensureAuthenticated()` throws, the calling component receives `[]` with no error indicator. Silent data loss; users see blank modules with no error message, no retry path, no auth redirect.

- [FAIL] **All Modules / firebaseUtils.js** — `readUserData()` and related functions call `.toDate()` on `docData.timestamp` or `docData.createdAt` without first validating the field type. If a document has `timestamp: null`, `.toDate()` throws. Any module rendering entries with a null timestamp field will crash on data load. No fallback timestamp substitution exists.

- [FAIL] **EmergencyButton.jsx** — `generateAIFeedback()` call (line 112) inside an async handler sets `isLoading: true` before the call but the catch block (lines 116–122) does not reset loading state on all failure paths. If the Promise rejects unexpectedly, the modal displays a spinner indefinitely with no dismiss path.

- [WARNING] **RelapseRadar.jsx** — `daysSinceLastRelapse` (lines 111–117): `latest` is assigned from `entry.createdAt ?? entry.timestamp`. If both are absent, `latest` is `undefined`. Line 117 computes `(Date.now() - latest.getTime()) / 86400000` — `.getTime()` call on undefined throws. Optional chaining is present for the property access but not the method call.

- [WARNING] **RelapseRadar.jsx** — `loadRelapseEntries()` is triggered from inside `onAuthStateChanged` (lines 64–76). No guard against rapid re-fires. If the auth state flips twice quickly (e.g., token refresh), two concurrent fetches can resolve out of order and overwrite state with stale data.

- [WARNING] **BlackMirror.jsx** — `transition-all duration-[4000ms]` (lines 278–282) uses an arbitrary Tailwind value. Arbitrary duration utilities must be safelisted in `tailwind.config.js` or they are purged in production builds. The breathing animation will silently break on `npm run build` if this is not safelisted.

- [WARNING] **KillList.jsx** — `setEntries(prev => [savedEntry, ...prev.slice(0, 49)])` (line 203) applies an optimistic local update simultaneously with a `subscribeToUserData` real-time listener. If a Firestore update arrives during the save window, the listener will overwrite the optimistic state before the save confirms. Temporary UI flicker; resolves on next snapshot.

- [WARNING] **OracleModal.jsx / QuickJournalModal.jsx** — No error boundary wraps either modal. If `content` prop is undefined or non-string and passed into a rendering branch that calls string methods, the modal crashes silently. Affected parent call sites: BlackMirror, RelapseRadar, EmergencyButton, HardLessons, KillList.

- [WARNING] **firebaseUtils.js** — `readUserData()` reads `auth.currentUser` at line 190 to get `user.uid`. A logout event between line 190 and the Firestore query executes a query with `userId == undefined`, returning 0 results rather than throwing. Module renders as if the user has no data. No auth check before query execution.

---

### Optimization

- [OPTIMIZE] **aiFeedback.js** — `import { track } from './analytics'` (line 3) is present but `track()` is never called in this file. Dead import adds unnecessary bundle surface.

- [OPTIMIZE] **Navbar.jsx / authService.js** — `getUserDisplayName()` is defined in both Navbar.jsx (lines 68–72) and `authService.js` (line 106). Both implementations compute the same value from `user.displayName || user.email`. Navbar should import from authService.

- [OPTIMIZE] **authService.js** — `getCurrentUser()` (line 73) is synchronous but Firebase auth initializes asynchronously. Called before auth completes, it returns `null` with no warning. No callers guard against null. Silent early-call failures occur with no observable feedback.

- [OPTIMIZE] **Journal.jsx** — `moodIcons` or equivalent icon map object is re-created inside the component body on every render. Should be defined at module scope or wrapped in `useMemo` to avoid 24-object allocation on every render cycle.

- [OPTIMIZE] **BlackMirror.jsx** — `calculateBlackMirrorIndex()` is memoized via `useMemo` (line 69) into `currentIndex`, then called again directly inside `handleSubmit()` (line 163) with the same inputs. The memoized value should be used at the call site; duplicate computation is unnecessary.

- [OPTIMIZE] **firebaseUtils.js** — Timestamp normalization logic (lines 210–230) is duplicated verbatim in both `readUserData()` and `subscribeToUserData()` (lines 291–310). 18 lines of identical code. Should be extracted to a shared `normalizeDocTimestamp()` helper.

- [OPTIMIZE] **blackMirrorAnalytics.js** — `aggregateCrossModuleData()` (lines ~504–506) fetches all documents from `blackMirrorEntries`, `journalEntries`, and `relapseEntries` without date-range filtering or pagination. On large datasets this loads all user history into memory. A configurable lookback window (e.g., 90 days) should gate all analytics reads.

- [OPTIMIZE] **Journal.jsx / BlackMirror.jsx / RelapseRadar.jsx** — `searchQuery` state triggers memoized filter recalculation on every keystroke. No debounce applied to `setSearchQuery`. Rapid typing causes cascading re-renders on each character. `debounce.js` utility exists in `src/utils/` and is not referenced by any of these components.

- [OPTIMIZE] **BlackMirror.jsx** — `loadEntries()` and `loadAnalytics()` (lines 101–126) are defined as `useCallback` hooks. Dependency arrays are incomplete — both reference state setters and Firebase utilities not listed. Stale closures may suppress re-execution when inputs change.

- [OPTIMIZE] **blackMirrorAnalytics.js / BlackMirror.jsx** — `getAnalyticsReport()` is imported and called (confirmed connected, not dead code). However, the returned `analyticsReport` is stored in state (line 120) and **never rendered in the component JSX**. The analytics layer runs, the data loads, and the result is silently discarded. Either surface the report in the UI or remove the call and associated state.

- [OPTIMIZE] **EmergencyButton.jsx** — Component manages 9 interdependent state variables (lines 43–52) with nested async flows for breathing, modal, AI feedback, and step sequencing. At 400+ lines this is the highest-complexity component in the codebase. Breathing state and modal state should be extracted to separate hooks.

- [OPTIMIZE] **All Modules** — Each of the 5 modules independently manages identical `{ isOpen, content, isLoading }` OracleModal state. Same shape, same open/close pattern, same error fallbacks — duplicated 5 times. Should be extracted to a shared context provider or custom `useOracleModal()` hook.

---

### Enhancement

- [IMPROVEMENT] **All Modules** — No empty state UI. When `entries.length === 0`, all list views render blank. No first-entry CTA, no onboarding hint, no module description. New users see nothing and receive no signal on where to begin.

- [IMPROVEMENT] **BlackMirror.jsx** — `loadAnalytics()` runs on mount and takes 2–5 seconds. No skeleton loader or progress indicator is displayed during the wait. Skeleton components exist in other modules and are not imported here. App appears frozen on first load.

- [IMPROVEMENT] **KillList.jsx / Journal.jsx** — Delete actions use `window.confirm()` (KillList line 396, Journal line 534) — previously flagged in [2026-04-07]. Confirmed still present. Native browser dialog breaks design system consistency. All other modules use toast-based undo. Both deletions should be migrated to the existing undo-toast pattern.

- [IMPROVEMENT] **BlackMirror.jsx** — Success toast (line 208): `'Black Mirror entry logged'` — terse acknowledgment with no reinforcement of the act of self-tracking. Compared to the module's stated focus on attention sovereignty, the confirmation copy is functionally indistinguishable from any CRUD app.

- [IMPROVEMENT] **EmergencyButton.jsx** — Trigger placeholder text (line 333): `"e.g., stress, boredom, seeing an ex's post..."` — mundane examples that set a shallow reflection floor. Given the module's purpose (emergency intervention), placeholder should surface the real question the module is designed to address.

- [IMPROVEMENT] **BlackMirror.jsx** — Header describes the module as tracking "mindless scrolling and its impact on consciousness" with no link to the broader self-governance framework. No connection to Relapse Radar, Hard Lessons, or the behavioral elimination work in Kill List. Module reads as a standalone screen-time app.

- [IMPROVEMENT] **Journal.jsx / HardLessons.jsx** — No UI bridge between modules. Journal captures reflection; Hard Lessons captures pain-forged wisdom. A user recording a difficult moment in Journal has no affordance to escalate it directly to Hard Lessons. The two modules exist in isolation despite sharing overlapping use cases.

- [IMPROVEMENT] **All Modules** — Streak logic exists in KillList (lines 61–65). No cross-module streak or momentum view. Users cannot see aggregate behavioral performance across all 5 modules. Absence of cross-module continuity reduces the perceived coherence of the system.

- [IMPROVEMENT] **Onboarding.jsx** (lines 9–40) — User selects driver and feedback style but receives no orientation on how the 5 modules work together or what order to use them. Day-1 experience risks confusion about which module applies to which situation.

- [IMPROVEMENT] **All Modules** — No offline detection or sync status indicator. If Firestore writes fail due to connectivity, the user receives no feedback. Data is not confirmed as saved; no retry prompt; no queued-write indicator.

- [IMPROVEMENT] **All Modules** — No submission guard against double-clicks or rapid re-submission. Users can submit identical entries by clicking quickly. No button disable state during async write operations confirmed across BlackMirror, RelapseRadar, and HardLessons.

- [IMPROVEMENT] **AuthForm.jsx** — Sign-up form does not communicate data privacy or encryption status. Users authenticate with email/password but have no indication their self-governance data is private or scoped to their account. Friction point at the highest-stakes moment in the funnel.

---

### Summary

| Category      | Count |
|---|---|
| FAIL          | 4     |
| WARNING       | 6     |
| OPTIMIZE      | 12    |
| IMPROVEMENT   | 12    |
| **Total**     | **34** |

**Deploy Readiness: NOT READY**

Four FAIL-level blockers: two Firebase data-handling failures that cause silent data loss, one null-dereference crash on timestamp-missing entries, and one modal infinite-loading bug in EmergencyButton. All four are silent — users see no error, no retry, no explanation. Combined with the 2026-04-07 findings still unresolved (Journal mood-mismatch, dead AI recovery insights in Relapse Radar), the stability surface is too wide for production. Black Mirror analytics layer is confirmed connected and callable from the UI (`getAnalyticsReport` is imported and invoked), but the computed report is never rendered — functionality exists as dead computation. Cross-module continuity, empty states, and offline handling are the dominant UX gaps.

**Git status: unchanged** — this review is read-only. No modifications made to source files.

---

### [2026-04-08 Supplemental — BER-72 Fresh Sweep]

Additional findings from second pass confirming existing entries plus net-new items:

#### Stability

- [FAIL] **BlackMirror.jsx** — `calculateBlackMirrorIndex()` (line 56) calls `parseFloat(screenTime)` with no validation. If `screenTime` is empty or non-numeric on submit, `parseFloat` returns `NaN`. All downstream math (`Math.round(NaN * 8)`) propagates `NaN`, and the entry is saved to Firestore with `blackMirrorIndex: NaN`. No input guard exists at form submission.

- [WARNING] **BlackMirror.jsx** — `philosophicalInsight` computed via `useMemo(() => philosophicalQuotes[Math.floor(Math.random() * philosophicalQuotes.length)], [])` with empty deps. The random selection is non-deterministic at mount, meaning different render trees or strict-mode double-invocations may produce different quotes. Value intent is ambiguous — if stable-per-session is desired, initialize in `useState` instead.

- [WARNING] **firebase.js** — `initializeAuth()` and `initializeFirestore()` use boolean flag guards (`authInitialized`, `dbInitialized`) checked non-atomically. Concurrent initialization calls from two modules can both read `false` before either sets `true`, resulting in duplicate Firebase initialization calls. No mutex or singleton enforcement is in place.

#### Optimization

- [OPTIMIZE] **All Modules** — Skeleton loader timing (`250ms delay + 300ms show`) is copy-pasted verbatim into all 5 module files. A `useSkeleton(loading)` custom hook would unify this. The `debounce.js` utility (confirmed in `src/utils/`) is unused by all modules that manually implement 300ms debounce — direct duplication.

#### Enhancement

- [IMPROVEMENT] **KillList.jsx** — On target defeat (escape autopsy submitted), no affordance exists to log the behavioral failure in Relapse Radar. The two modules address adjacent failure states but are completely isolated. An "Escalate to Relapse Radar" CTA post-autopsy would close this gap without adding a new feature.

- [IMPROVEMENT] **HardLessons.jsx → KillList.jsx** — A finalized Hard Lesson surfacing a repeating behavior pattern has no path to create a Kill Target from it. Users must manually copy the lesson and re-enter it in Kill List.

---

## [2026-04-08 — BER-74 Third Pass]

### Stability

All four FAIL-level blockers from the [2026-04-08] entry remain unresolved. No new FAIL-level findings.

- [WARNING] **All Modules** — Auth logout between form submit and Firestore write is not handled with user-visible feedback. `writeData()` will throw with a permission-denied error, which is caught and displayed as a generic failure. No code path distinguishes auth revocation from network failure or quota errors. Users have no actionable signal to re-authenticate.

- [WARNING] **BlackMirror.jsx** — `getAnalyticsReport()` is called on mount and post-submission (confirmed connected, not dead code). The returned `analyticsReport` is stored in state but **never rendered in component JSX**. The analytics engine runs, data populates state, and the result is silently discarded. Confirmed from prior [2026-04-08] entry — still unresolved.

---

### Optimization

- [OPTIMIZE] **All Modules / generateAIFeedback()** — Oracle context format is inconsistent across call sites. BlackMirror passes 3 recent BM entries as objects; KillList passes 3 target titles as strings; HardLessons passes 3 lesson objects; Journal and RelapseRadar pass different shapes. The Oracle model receives inconsistent shaped context per module. No standardized context adapter exists. This is a net-new finding not in prior passes.

- [OPTIMIZE] **Dashboard.jsx** — `loadCriticalData()` (lines 390–427) issues 5 sequential Firestore reads (`readUserData()` called 5 times in series). The `blackMirrorAnalytics.js` module already demonstrates the correct pattern — `Promise.allSettled()` for parallel fetches. Dashboard should match.

---

### Enhancement

- [IMPROVEMENT] **All Modules** — Empty states confirmed blank across all 5 modules on fresh account. No first-entry CTA, no module description, no onboarding pointer visible. New users see a blank form with no framing. Flagged in prior passes; still unresolved.

- [IMPROVEMENT] **KillList.jsx / Journal.jsx** — `window.confirm()` delete dialogs confirmed still present (KillList line 396, Journal line 534). Third flag. These break design system consistency; all other modules use toast-based undo.

---

### Summary

| Category     | Count |
|---|---|
| FAIL         | 0 (4 from prior passes remain open) |
| WARNING      | 2 |
| OPTIMIZE     | 2 |
| IMPROVEMENT  | 3 |
| **Total new**| **7** |

**Deploy Readiness: NOT READY**

All four FAIL-level blockers from the 2026-04-08 first pass remain open: Firebase silent data loss on auth failure, null-dereference crash on missing timestamps, EmergencyButton infinite loading modal, and BlackMirror NaN index propagation. Product philosophy is solid — language and tone hold across all 5 modules. Primary gap is stability (silent failures) and UX (empty states, cross-module flow continuity).

**Git status: unchanged** — this review is read-only. No modifications made to source files.

---

## [2026-04-09]

Post-fix sprint review. All pre-deploy blockers (BER-99–108) resolved. This sweep covers the full codebase at current HEAD (54fc38d).

### Stability

- [FAIL] EmergencyButton — `setBreathPhase` and `setBreathCount` called at line 249 but not exposed by `useBreathing` hook (returns `{ breathPhase, breathCount, start, reset, getInstruction, getColor }` only). "Another Round" button will throw runtime error "setBreathPhase is not a function". Confirmed by reading both `useBreathing.js` and `EmergencyButton.jsx`.
- [FAIL] EmergencyButton — Line 321: "You reached out. That's strength." — wellness/motivational language in a crisis intervention tool. Product alignment failure. Emergency Button must use command-based tone, not validation language.
- [WARNING] RelapseRadar — Chained optional chain `createdAt?.toDate?.()?.getTime()` at lines 114–115 could return falsy while data exists if `.toDate()` returns null. The `isNaN()` guard at line 119 mitigates this but the underlying pattern is fragile.
- [WARNING] KillList — Bare `catch` blocks (no error parameter) at lines 328, 337, 387 swallow errors silently. Oracle fallback messages are shown but no error is logged. Diagnosis of Oracle service failures in production will be blind.
- [WARNING] BlackMirror — `createdAt` saved as ISO string (line 187) while other modules use `serverTimestamp()`. Normalization in `firebaseUtils.js` handles it, but inconsistent storage format increases maintenance risk.

### Optimization

- [OPTIMIZE] blackMirrorAnalytics.js — `getAnalyticsReport()` executes 3+ Firestore reads + full JS processing on every component mount. No client-side caching or TTL. At scale (100+ entries), this is expensive on every navigation to Black Mirror.
- [OPTIMIZE] firebaseUtils.js — `normalizeDocTimestamp` is not exported/reused. Near-identical timestamp normalization exists in ~15 locations across clarityScore.js, blackMirrorAnalytics.js, and Journal.jsx. Should be shared utility.
- [OPTIMIZE] BlackMirror — `philosophicalInsight` is generated on mount and persisted to every Firestore entry (line 186) but never displayed to the user for new entries. Unnecessary database writes and storage per entry.
- [OPTIMIZE] RelapseRadar — Multiple `useMemo` blocks at lines 100–130 each depend solely on `relapseEntries`. These pure calculations could be moved to a custom hook to reduce component complexity.
- [OPTIMIZE] KillList — `user` state maintained locally (lines 115, 147–152) via `onAuthStateChanged` listener, but `user` is never used directly in the component. App.jsx already manages auth state. Redundant subscription.

### Enhancement

- [IMPROVEMENT] Journal — Pain signal detection (line 188, regex `PAIN_SIGNALS`) fires but no UI affordance exists to bridge to Hard Lessons. User can't act on the signal within the module. A "Extract as Hard Lesson?" prompt would close this flow gap.
- [IMPROVEMENT] RelapseRadar — Pattern data panel shows metrics (archetype freq, top trigger, weekly counts) with no explanation of what each signals or what action to take. Numbers without meaning = friction.
- [IMPROVEMENT] RelapseRadar — No copy reinforcing that logging should happen at moment of drift, not after collapse. The product differentiates on early detection; the UI doesn't communicate this.
- [IMPROVEMENT] BlackMirror — "Not enough data yet" empty state (lines 591–613) tells user what thresholds are needed but not why those thresholds exist or what patterns will emerge. Needs product-philosophy-aligned language.
- [IMPROVEMENT] BlackMirror — Form title "Digital Consciousness Check" uses philosophical language. Product tone should be operational/precise. Rename to "Attention Sovereignty Audit" or equivalent.
- [IMPROVEMENT] KillList — "Killed" targets are removed from view. Behavioral elimination should be permanently visible as a record (killed badge with date, or separate "Kills Earned" section). 3-second celebration undersells permanence.
- [IMPROVEMENT] EmergencyButton — Breathing circle fixed at `w-48 h-48` (192×192px). On 375px-wide mobile screen this occupies ~50% width, pushing instruction text and cycle counter off-screen.
- [IMPROVEMENT] Journal — Prompt carousel has no position indicator ("Question 3 of 8") and no auto-rotation. Users can't tell how many prompts exist or if cycling will show a repeat.
- [IMPROVEMENT] BlackMirror — Analytics loading shows only "Analyzing..." text. No intermediate progress states ("Loading data..." → "Detecting patterns..." → "Generating insights..."). Slow connections produce silent gap.

### Summary

- Stability: 2 FAIL, 3 WARNING
- Optimization: 5 OPTIMIZE
- Enhancement: 9 IMPROVEMENT
- Total findings: 19

**Deploy Readiness: NOT READY**

Two new FAILs found post-fix sprint: EmergencyButton "Another Round" button will crash (undefined function call), and wellness language present in EmergencyButton crisis completion screen. Both require SSE fix before ship.

**Git status: unchanged** — read-only review. No source files modified.

---

## [2026-04-09]

> **Run:** BER-115 — DAILY_REVIEW routine execution
> **QA Agent:** 64512fb6 (QA Engineer)

### Stability

- [PASS] Journaling — No findings. Mood taxonomy, dynamic insights, Oracle fallback, auth guards all clean. No window.confirm() present.
- [PASS] Kill List — No findings. Difficulty tiers, milestone tracking, Oracle fallback, cross-module link to Hard Lessons all verified.
- [PASS] Hard Lessons — No findings. Category structure, scar inventory flow, Oracle extraction bridge, form state all clean.
- [PASS] Relapse Radar — No findings. BER-105 (daysSinceLastRelapse NaN) VERIFIED FIXED. Auth listener race condition (BER-101) VERIFIED FIXED. mountedRef pattern intact.
- [PASS] Black Mirror — No findings. BER-77 (calculateBlackMirrorIndex() NaN) VERIFIED FIXED via parseFloat() || 0 coercion. Analytics layer fully connected and rendering.
- [PASS] Emergency Button — BER-113 VERIFIED FIXED: line 249 uses resetBreathing() — setBreathPhase/setBreathCount calls absent. BER-114 VERIFIED FIXED: line 321 reads "Session complete. You controlled it." — wellness message gone.
- [PASS] Firebase — All read/write operations user-scoped. Auth errors propagate. Permission errors logged with hints. No cross-user contamination.
- [PASS] window.confirm() — No instances found anywhere in src/. BER-81 fix holds.
- [PASS] Oracle fallbacks — All five modules produce neutral, operational unavailability messages. No wellness/motivational language in any fallback string.

### Optimization

- [OPTIMIZE] Kill List — Uses local state `useState({ isOpen, content, isLoading })` for Oracle modal at line 100. All other modules use the centralized `useOracleModal()` hook. Inconsistent pattern; no functional impact. Candidate for SSE cleanup.
- [OPTIMIZE] firebaseUtils.js — `where("userId", "==", user.uid)` clause repeated across multiple query sites (lines 181, 231+). Not a bug; minor abstraction opportunity.

### Enhancement

- [IMPROVEMENT] OracleModal.jsx — No timeout safeguard on loading state. If the Cloud Function fails silently, user is stuck in spinner indefinitely. Recommend 30-second timeout with fallback message.
- [IMPROVEMENT] Relapse Radar — Empty state when relapseEntries.length === 0 hides the Pattern Data section entirely. A contextual prompt ("Add your first check-in to see patterns emerge") would reduce first-session friction.

> **Carrying forward from 2026-04-08 (unresolved improvements, no new ticket filed):**
> - BlackMirror "Digital Consciousness Check" form title is too philosophical — operational rename recommended.
> - RelapseRadar early-detection copy absent — UI doesn't reinforce the "catch drift early" philosophy.
> - Journal prompt carousel has no position indicator.
> - KillList "killed" targets disappear rather than persisting as a record.
> - BlackMirror analytics loading has no intermediate progress states.
> - EmergencyButton breathing circle oversized on 375px mobile screens.

### Summary

- Stability: 0 FAIL, 0 WARNING
- Optimization: 2 OPTIMIZE
- Enhancement: 2 IMPROVEMENT (new) + 6 carried from prior runs
- Total new findings: 4

**Deploy Readiness: READY**

All previously filed FAILs (BER-113, BER-114) resolved and verified. No new blockers. App is stable across all 5 modules. No regressions detected against any closed BER.

**Git status: unchanged** — read-only review. No source files modified.

