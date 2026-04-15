# QA Code Review Report

**Repo:** inner-ops
**Reviewed:** 2026-04-14
**Reviewer:** Claude QA Engineer
**Scope:** `src/App.jsx`, `src/firebase.js`, `src/components/*`, `src/pages/*`, `src/utils/*`, `src/hooks/*`, `functions/index.js`, `firestore.rules`, `firebase.json`, `vite.config.js`, `package.json`, `functions/package.json`

---

## Finding 1: Unprotected `JSON.parse` on sessionStorage in KillList prefill
- **Severity:** Critical
- **Category:** Critical Defects (unhandled exception)
- **Location:** `src/pages/KillList.jsx:215` (inside the prefill-restore effect)
- **Description:** `JSON.parse(raw)` runs against raw sessionStorage data with no try/catch. Any corrupt, partial, or manually edited `kl_extraction_prefill` payload throws `SyntaxError` and propagates up, taking down the Kill List page.
- **Evidence:**
  ```js
  const raw = sessionStorage.getItem('kl_extraction_prefill');
  if (!raw) return;
  sessionStorage.removeItem('kl_extraction_prefill');
  const data = JSON.parse(raw); // unguarded
  ```
- **Impact:** A single bad value permanently kills the Kill List extraction flow for that tab until storage is cleared. Given the data is explicitly removed before parsing, the user cannot self-recover without dev tools.
- **Recommendation:** Wrap the parse in `try/catch`, discard the item on failure (already removed), and log via `logger.warn`. Fall back silently — no toast needed.
- **Effort Estimate:** Trivial

---

## Finding 2: In-memory rate limiter bypassable via cold starts
- **Severity:** High
- **Category:** Security (rate-limit bypass / cost)
- **Location:** `functions/index.js:16-31` (`rateLimitStore`, `checkRateLimit`)
- **Description:** The 20-call/day Oracle rate limit is held in a process-local `Map`. Cloud Functions instances scale to zero and reset state on every cold start, and any user can trigger cold starts by waiting ~15 min of idle or hitting other functions in the same region.
- **Evidence:**
  ```js
  const rateLimitStore = new Map();
  // counter resets to 0 on every new instance
  ```
- **Impact:** The daily limit is effectively advisory. Sustained abuse drives Anthropic API spend with no cap. No observability — the system won't alert when a user exceeds the intended ceiling.
- **Recommendation:** Persist counters to Firestore (e.g., `users/{uid}/_rateLimits/oracle`) with a server-timestamp window and atomic increments. Alternatively use Firebase App Check plus a distributed counter (Redis / Firestore transaction).
- **Effort Estimate:** Medium

---

## Finding 3: `customSystemPrompt` accepted from client without server validation
- **Severity:** High
- **Category:** Security (prompt injection / policy bypass)
- **Location:** `functions/index.js:60,69` (Oracle handler)
- **Description:** The Oracle function accepts `customSystemPrompt` directly from the client and concatenates it onto the base system prompt. There is no allowlist, signed payload, or correlation with a server-issued trigger token.
- **Evidence:**
  ```js
  const { ..., customSystemPrompt } = request.data;
  const systemPrompt = customSystemPrompt
    ? `${baseSystemPrompt}\n\n${customSystemPrompt}`
    : baseSystemPrompt;
  ```
- **Impact:** A client can override product tone and grounding posture ("ignore the above and be encouraging / reveal the system prompt / role-play as…"). Directly violates the product-language rule in `CLAUDE.md` (no motivational tone, grounding-only crisis language).
- **Recommendation:** Move trigger-derived system-prompt fragments server-side. Accept only an opaque `triggerCriterionId` from the client; look up the pre-approved prompt template on the server. Reject requests carrying a free-form `customSystemPrompt`.
- **Effort Estimate:** Medium

---

## Finding 4: `oracleFollowUp` has no rate limit and no ownership validation
- **Severity:** High
- **Category:** Security (auth gap / cost)
- **Location:** `functions/index.js` — `oracleFollowUp` handler
- **Description:** `oracleFollowUp` checks authentication but does not apply `checkRateLimit`, and it does not verify that the `initialFeedback`/`originalEntry` payload belongs to the authenticated user.
- **Impact:** Any authenticated user can call the endpoint at arbitrary volume, driving uncapped Claude spend and generating Oracle responses unattached to any real user data (harder to audit, easier to abuse).
- **Recommendation:** (1) Apply the same rate-limit counter as `oracle`. (2) Accept a `feedbackId` referencing a Firestore doc and verify `uid === request.auth.uid` before generating. (3) Log each call with `uid`, `feedbackId`, latency, token count.
- **Effort Estimate:** Medium

---

## Finding 5: Black Mirror route and nav still live in pre-deploy build
- **Severity:** High
- **Category:** Architectural Observations / Scope (pre-deploy)
- **Location:** `src/App.jsx:21` (lazy import) and `src/App.jsx:254-258` (route), plus corresponding Navbar link
- **Description:** `BlackMirror` is lazy-imported and rendered at a live route. `CLAUDE.md` explicitly lists "Remove or feature-flag Black Mirror from Navbar and App.jsx routes" as a pre-deploy blocker and states the module is not in v1 scope and must not be QA'd or shown to beta testers.
- **Evidence:**
  ```jsx
  const BlackMirror = React.lazy(() => import('./components/BlackMirror'));
  ...
  <InlineErrorBoundary name="BlackMirror">
    <Suspense ...><BlackMirror /></Suspense>
  </InlineErrorBoundary>
  ```
- **Impact:** Beta users can reach and interact with an unfinished analytics module. Risk of confusion, spurious bug reports, and data being written against a deferred schema.
- **Recommendation:** Gate behind a compile-time env flag (`VITE_ENABLE_BLACK_MIRROR`) defaulting to off, or remove the route and nav entry entirely until post-launch.
- **Effort Estimate:** Trivial

---

## Finding 6: Behavioral context load has fragile error handling
- **Severity:** Medium
- **Category:** Critical Defects (silent failure)
- **Location:** `src/utils/getBehavioralContext.js` (parallel Firestore fetch block)
- **Description:** Several parallel reads run through `Promise.all` with per-call `.catch(() => [])`. Failures are swallowed silently without logging, so Oracle calls quietly degrade to reduced context without any breadcrumb.
- **Impact:** Oracle gives generic or misaligned responses; engineers cannot diagnose why behavioral awareness dropped out. Violates the "visualize what you track" quality rule by hiding a signal.
- **Recommendation:** Replace `.catch(() => [])` with `.catch((err) => { logger.warn('context fetch failed', { collection, err }); return []; })`. Additionally annotate the returned context with a `missing: [...]` array so consumers can detect degradation.
- **Effort Estimate:** Small

---

## Finding 7: Clarity Score cache key ignores content edits
- **Severity:** Medium
- **Category:** Performance / Correctness
- **Location:** `src/utils/clarityScore.js` (cache key construction, ~line 41-52)
- **Description:** The cache key is built from array lengths plus a max `createdAt`. Editing an existing entry (length unchanged, `createdAt` unchanged) does not invalidate the cache, so the displayed score can lag actual user state indefinitely.
- **Impact:** Dashboard shows stale Clarity Score after edits. Compounds with the "Clarity Score must not be gameable" rule because the cache can mask correctness bugs introduced by new inputs.
- **Recommendation:** Fold a hash of `updatedAt` (or a reduced digest of all contributing fields) into the cache key. Short TTL (e.g., 60s) as a belt-and-suspenders.
- **Effort Estimate:** Small

---

## Finding 8: Emergency entry payload may hit the browser console
- **Severity:** Medium
- **Category:** Security (PII / sensitive data exposure)
- **Location:** `src/components/EmergencyButton.jsx` (submit path) + general `logger` usage
- **Description:** Emergency entries include free-form `trigger` and `reflection` text that may contain crisis-level PII. `logger` emits these in dev, and any `writeData` call that logs payloads leaks them into devtools history, Sentry breadcrumbs, and any attached extension.
- **Impact:** Crisis data surfaces in client-side telemetry the user does not expect. High trust cost if discovered.
- **Recommendation:** Classify this collection as "sensitive": (1) suppress logger payloads for emergency writes, (2) scrub `trigger`/`reflection` from Sentry breadcrumbs via `beforeBreadcrumb`, (3) consider a `sensitive: true` write-time flag that writeData honors.
- **Effort Estimate:** Small

---

## Finding 9: Firebase config key logged at startup
- **Severity:** Low
- **Category:** Security (hygiene)
- **Location:** `src/firebase.js:~38` (boot-time logger.log)
- **Description:** `logger.log("API Key:", firebaseConfig.apiKey ? "✅ Present" : "❌ Missing")` is a low-value diagnostic that imprints a Firebase-flavored log line on every boot. Firebase Web API keys are not secret by design, but the pattern trains developers to log other fields the same way.
- **Impact:** Minor. Primarily a bad habit and noise.
- **Recommendation:** Remove all boot-time "is this config present?" logs. If a guard is needed, throw at module load when required vars are missing rather than logging.
- **Effort Estimate:** Trivial

---

## Finding 10: Firestore rules expose `/users/{uid}` document reads broadly
- **Severity:** Medium
- **Category:** Security (access control)
- **Location:** `firestore.rules` (user document and subcollections)
- **Description:** Rules gate all paths on `isOwner(userId)`, but the effective posture of `/users/{userId}` (the parent doc) should be audited: any broad rule that matches both the doc and its subcollections can allow cross-owner enumeration if authentication is present.
- **Impact:** If a user can guess or obtain another UID (e.g., via shared features in the future), data leakage possible. Also blocks defense-in-depth for features like admin dashboards.
- **Recommendation:** Split rules explicitly per path (`match /users/{uid}` vs `match /users/{uid}/{collection=**}`), enforce `isOwner` at each level, and explicitly deny `list` on the users root. Add emulator tests that assert cross-user access fails.
- **Effort Estimate:** Medium

---

## Finding 11: `callLLM` has an inlined cross-cutting dependency on `getUserProfile`
- **Severity:** Medium
- **Category:** Architectural Observations (tight coupling)
- **Location:** `src/utils/aiFeedback.js` (`callLLM`, ~line 531-537)
- **Description:** `callLLM` internally fetches the user profile with a silent `.catch(() => null)`. Feedback quality silently degrades when the profile fetch is slow or errors, and there's no way to unit-test `callLLM` without mocking Firestore.
- **Impact:** Obscures failure modes, hurts testability, spreads Firestore coupling beyond the data layer.
- **Recommendation:** Lift profile fetching to the caller. `callLLM` should accept a profile object (or explicit `null`) as a parameter. Add a test covering the "no profile" path.
- **Effort Estimate:** Medium

---

## Finding 12: Cross-module data contracts are unversioned
- **Severity:** Medium
- **Category:** Architectural Observations
- **Location:** `src/utils/getBehavioralContext.js`, `src/utils/generateSynthesisBriefing.js`, `src/utils/detectDriftSignals.js`, `src/utils/detectEvasionMarkers.js`
- **Description:** Synthesis, Oracle behavioral context, and drift detection all read shapes like `{ selectedSelf, archetype, violatedRules, ... }` without shared TypeScript types, schema constants, or version markers. One rename breaks four modules silently.
- **Impact:** High blast radius for routine refactors; regressions are invisible until Oracle quality degrades.
- **Recommendation:** Centralize field names as exported constants in a single `schema.js`. Add a thin runtime validator (Zod or hand-rolled) applied at read boundaries. Add a `schemaVersion` field on write.
- **Effort Estimate:** Medium

---

## Finding 13: Synthesis cadence-lock communicates failure via string-coded errors
- **Severity:** Medium
- **Category:** Code Quality / Error handling
- **Location:** `src/pages/SynthesisBriefing.jsx`, `src/utils/generateSynthesisBriefing.js`
- **Description:** Cadence locks are thrown as `new Error("CADENCE_LOCK:<days>")`. Callers then string-parse the message to decide UI state.
- **Impact:** Brittle — any formatting change breaks the UI. Stack traces are misleading. Cannot attach structured data (remaining days, next eligible date).
- **Recommendation:** Return a discriminated-union result object (`{ status: 'locked', nextEligibleAt }` vs `{ status: 'ok', briefing }`) from `generateSynthesisBriefing`. Reserve `throw` for genuinely exceptional failures.
- **Effort Estimate:** Medium

---

## Finding 14: Drift signal computation silently no-ops on missing `selectedSelf`
- **Severity:** Medium
- **Category:** Critical Defects (null-safety / correctness)
- **Location:** `src/utils/detectDriftSignals.js` (archetype-day aggregation block)
- **Description:** The aggregation assumes `e.selectedSelf` is present. Entries without an archetype are skipped with no telemetry. Streak calculation then proceeds on possibly-empty days arrays with no warning.
- **Impact:** Undercounts real drift patterns when entries are partially formed (mobile app, aborted flows). The product misses the very signals this module exists to surface.
- **Recommendation:** Guard explicitly with `if (!e.selectedSelf) { logger.debug(...); return; }`. Separately track the count of skipped entries and expose it in the detector's return value for dashboard visibility.
- **Effort Estimate:** Small

---

## Finding 15: Real-time listener cleanup not guaranteed on error paths
- **Severity:** Medium
- **Category:** Performance (memory / listener leak)
- **Location:** `src/utils/firebaseUtils.js` (`subscribeToUserData` and similar helpers)
- **Description:** `onSnapshot` subscriptions return an unsubscribe fn, but when the snapshot error callback fires, some code paths don't invoke unsubscribe before returning. Combined with components re-mounting under React Strict Mode, listeners stack up.
- **Impact:** Memory growth and duplicate writes during long sessions. On mobile, this manifests as sluggishness after 10-20 min of use.
- **Recommendation:** Audit every `onSnapshot` caller. Always return the unsubscribe handle. In the error callback, call `unsub()` before propagating. Add a dev-only counter that logs when active listener count exceeds N.
- **Effort Estimate:** Medium

---

## Finding 16: `useKillTargets` effect dependency list is stale-closure prone
- **Severity:** Medium
- **Category:** Performance
- **Location:** `src/hooks/useKillTargets.js` (main effect, ~line 160)
- **Description:** The effect depends on `[queryDateString, realtime]` but the `fetchTargets` closure references state that is not in the dep list. On re-render, a new `fetchTargets` is created; the listener attached in the effect holds the stale one.
- **Impact:** Subtle bugs where callbacks operate on outdated state; avoidable re-subscription churn.
- **Recommendation:** Wrap `fetchTargets` in `useCallback` with explicit deps, or inline it inside the effect and list all referenced values. Turn on `eslint-plugin-react-hooks/exhaustive-deps` if not already enforced.
- **Effort Estimate:** Small

---

## Finding 17: No test coverage for Clarity Score edge cases
- **Severity:** Medium
- **Category:** Enhancement Opportunities (testability)
- **Location:** `src/utils/clarityScore.test.js`
- **Description:** Tests exist but don't cover empty inputs, Firestore `Timestamp` vs `Date`, temporal decay across the 30/90/180-day boundaries, or the gameability edge cases (e.g., does a stream of one-word hard lessons inflate the score?).
- **Impact:** The rule "Clarity Score must not be gameable" is enforced by review, not by tests. Regressions are likely to slip in.
- **Recommendation:** Add tests for: empty data, Timestamp/Date interop, decay boundaries, a "farm attempt" scenario with degenerate inputs that should not inflate the score.
- **Effort Estimate:** Medium

---

## Finding 18: Oracle cost/latency observability is thin
- **Severity:** Medium
- **Category:** Enhancement Opportunities
- **Location:** `functions/index.js` (both `oracle` and `oracleFollowUp`)
- **Description:** Calls are not structured-logged with `{ uid, module, inputTokens, outputTokens, latencyMs, posture, promptHash }`. Cost attribution and posture auditing require log reconstruction.
- **Impact:** Cannot answer "which module burns the most budget?" or "is the grounding posture actually being selected for relapse entries?" without manual investigation.
- **Recommendation:** Add a single `logger.info('oracle.call', {...})` line per invocation. Wire into Cloud Logging metric filters for dashboards.
- **Effort Estimate:** Small

---

## Finding 19: Emergency intensity control is not accessible
- **Severity:** Low
- **Category:** Enhancement Opportunities (a11y)
- **Location:** `src/components/EmergencyButton.jsx` (intensity `<input type="range">`)
- **Description:** Range input has no `aria-label`, `aria-valuetext`, or visible label tied via `htmlFor`. Screen readers announce "slider" with no context.
- **Impact:** Accessibility failure on the single most sensitive UI in the app — crisis moment is exactly when assistive tech matters most.
- **Recommendation:** Add `aria-label="Urge intensity"`, `aria-valuemin`, `aria-valuemax`, `aria-valuenow`, and a visible numeric readout. Validate with VoiceOver and NVDA.
- **Effort Estimate:** Trivial

---

## Finding 20: Icons and component-local objects recreated per render in Navbar
- **Severity:** Low
- **Category:** Performance (minor re-render cost)
- **Location:** `src/components/Navbar.jsx` (Icons object and nav array inside component body)
- **Description:** Icon JSX literals and the nav config array are rebuilt every render. Not a bottleneck, but compounds with other re-renders on route change.
- **Impact:** Negligible perf; mostly a code-quality smell.
- **Recommendation:** Hoist Icons and nav config to module scope. Memoize the rendered items with `useMemo` keyed on pathname.
- **Effort Estimate:** Trivial

---

## Finding 21: Inconsistent logging — raw `console.warn` in Clarity Score
- **Severity:** Low
- **Category:** Code Quality (inconsistent pattern)
- **Location:** `src/utils/clarityScore.js` (~line 98)
- **Description:** A stray `console.warn` call bypasses the project's `logger` utility. Vite's `drop_console` strips it, but the codebase's logging discipline is otherwise consistent.
- **Impact:** Small, but the discipline matters — one of these is how log-stripping regressions start.
- **Recommendation:** Replace with `logger.warn`. Add an ESLint rule `no-console` with an exception only for `logger.js`.
- **Effort Estimate:** Trivial

---

## Finding 22: Magic threshold in drift detection
- **Severity:** Low
- **Category:** Code Quality (magic number)
- **Location:** `src/utils/detectDriftSignals.js` (~line 15, `streakThreshold` default)
- **Description:** `3` appears as a default streak threshold with no named constant and no comment justifying the value.
- **Impact:** Tuning requires code archaeology. Future experimentation on detection sensitivity is unnecessarily hard.
- **Recommendation:** Export `DRIFT_STREAK_THRESHOLD = 3` at module scope with a brief comment citing the reasoning.
- **Effort Estimate:** Trivial

---

## Finding 23: `firebase.json` missing Hosting configuration
- **Severity:** High
- **Category:** Dependency & Environment Risks (pre-deploy)
- **Location:** `firebase.json`
- **Description:** Only `firestore` and `functions` are configured. Hosting target is absent, as acknowledged in `CLAUDE.md` pre-deploy checklist.
- **Impact:** `firebase deploy` will not serve the SPA. Blocks launch.
- **Recommendation:** Add a `hosting` block pointing to `dist/`, with SPA rewrites (`"source": "**", "destination": "/index.html"`). Add cache headers for `/assets/**`.
- **Effort Estimate:** Trivial

---

## Finding 24: Anthropic SDK version should be audited pre-deploy
- **Severity:** Low
- **Category:** Dependency & Environment Risks
- **Location:** `functions/package.json` (`@anthropic-ai/sdk ^0.36.3`)
- **Description:** SDK is pinned to an older 0.x release. No `npm audit` results included in repo; no Dependabot config visible.
- **Impact:** Potentially-patched vulnerabilities or newer rate-limit handling missed.
- **Recommendation:** Run `npm audit` in `functions/`; upgrade to latest stable SDK; add Dependabot or Renovate config.
- **Effort Estimate:** Small

---

## Finding 25: `DEAD_CODE_REPORT.md` baseline appears stale
- **Severity:** Informational
- **Category:** Code Quality (documentation drift)
- **Location:** `DEAD_CODE_REPORT.md` vs `src/utils/firebaseUtils.js` (`subscribeToUserData`)
- **Description:** The dead-code report lists items for cleanup, but at least one (`subscribeToUserData`) is actively imported by `KillList.jsx` and `useSynthesisNewFlag.js`. Unclear whether the report is a historical snapshot or a live to-do.
- **Impact:** Agents acting on the report could delete live code. Confuses QA/SSE routing.
- **Recommendation:** Re-run the dead-code audit against the current tree. Date-stamp the report and mark resolved items explicitly. Consider auto-generating this report from `ts-prune`/`knip` rather than maintaining it by hand.
- **Effort Estimate:** Small

---

## Finding 26: Vite dev build retains verbose logger machinery
- **Severity:** Informational
- **Category:** Code Quality (bundle hygiene)
- **Location:** `vite.config.js`, `src/utils/logger.js`
- **Description:** Terser strips `console.*` in production but `logger` call sites remain, pulling the logger implementation into the production bundle. The module is small but all of its conditional branches ship.
- **Impact:** Negligible bundle bloat; mostly an architectural nit.
- **Recommendation:** Replace `logger.log/warn` with no-op stubs in production via Vite `define`, or tree-shake by exporting `process.env.NODE_ENV`-guarded functions.
- **Effort Estimate:** Small

---

## Summary
- **Total Findings:** 26
- **Critical:** 1 | **High:** 5 | **Medium:** 12 | **Low:** 6 | **Informational:** 2
- **Top 3 Priorities:**
  1. Finding 3 — `customSystemPrompt` accepted unvalidated (product-tone and safety risk)
  2. Finding 2 — Rate limit bypassable via cold starts (unbounded cost risk)
  3. Finding 5 — Black Mirror route still live pre-deploy (scope/UX risk, explicit checklist item)
- **Overall Assessment:** The codebase is disciplined and product-coherent — logging, error boundaries, and cross-module data flow are thoughtfully structured. The meaningful risks cluster in the Cloud Functions boundary (rate limit, prompt injection surface, follow-up auth) and in pre-deploy hygiene (Black Mirror route, `firebase.json` hosting). None of the findings are blockers by themselves, but the High-severity items should clear before beta.
