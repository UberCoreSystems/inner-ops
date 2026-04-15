# QA Code Review Report — Pass 3

**Repo:** inner-ops
**Reviewed:** 2026-04-15
**Reviewer:** Claude QA Engineer
**Scope:** Verification of Pass 2 remediation + fresh review of areas neither prior pass examined deeply: `src/pages/Onboarding.jsx`, `src/pages/OuraCallback.jsx`, `src/utils/authService.js`, `src/utils/analytics.js`, `src/utils/blackMirrorAnalytics.js`, `src/utils/dataMigration.js`, `src/hooks/useBreathing.js`, `src/hooks/useCueRestructuring.js`, `src/hooks/useOracleModal.js`, `src/hooks/useSynthesisNewFlag.js`, `src/components/CrossModuleExtractionPrompts.jsx`, `src/components/CueRestructuringFlow.jsx`, `src/components/SynthesisGuard.jsx`, `src/components/KillClosureModal.jsx`, `src/components/QuickJournalModal.jsx`.

---

## Pass 2 Verification

| # | Title | Status | Notes |
|---|---|---|---|
| 1 | Firestore `list` permission grants enumeration | ✅ Fixed | `ownerListAllowed()` helper applied to all 7 top-level collections; `resource.data.userId == request.auth.uid` forces filtered queries. |
| 2 | `window.debugDashboard` exposed in production | ✅ Fixed | Already gated by `if (!isDevEnvironment) return;` at `Dashboard.jsx:150`. Pass 2 agent missed the existing guard; this finding was overstated, but the dynamic-import remediation strengthened it further. |
| 3 | React key collision on `aiInsights.reflections` | ✅ Fixed | `Journal.jsx:920` now uses `key={idx}` with explanatory comment. |
| 4 | `VirtualizedList` falls back to `virtualIndex` | ✅ Fixed | `VirtualizedList.jsx:71-89` now requires `item.id`, returns `null` and dev-warns when missing. |
| 5 | Top-level + user-scoped paths shadow each other | ✅ Fixed | Shadow `/users/{uid}/{collection}` matches removed; only top-level paths remain. |
| 6 | Oura token refresh swallows errors | ✅ Fixed | `ouraService.js:122-189` distinguishes 4xx (clears token via `clearStoredToken`) from 5xx (transient, kept). All log paths sanitized. |
| 7 | Dashboard imports privileged migration helpers | ✅ Fixed | `Dashboard.jsx:4` static import now only pulls `readUserData`/`writeData`; admin helpers loaded via dynamic import inside dev branch. |
| 8 | `useOuraData` race on rapid auth flips | ✅ Fixed | Generation counter (`currentGen`/`myGen`) added; stale results discarded even if in-flight fetch resolves later. |
| 9 | Journal AI insight effect captures stale state | ✅ Fixed | `aiInsightsRef` ref + tracking effect added; debounced timer reads via ref, no re-subscription on `aiInsights` change. |
| 10 | Synthesis briefing template null-guard | ✅ Fixed | `buildFallbackQuestion` extracts `firstViolatedRule`/`firstHighEscapeTitle`/`firstHighEscapeCount` with explicit defaults. |
| 11 | Clarity Score XOR fingerprint collision | ✅ Fixed | Replaced with FNV-1a accumulator (`Math.imul` mixing per-byte); order-preserving and duplicate-sensitive. |
| 12 | `writeData` leaks raw error for non-sensitive | ✅ Fixed | Always logs scrubbed `{ code, name, message: slice(0,200) }`; `options.sensitive` flag retained as additional payload-suppression. |
| 13 | Rate limiter exemption silent | ✅ Fixed | `functions/index.js` now emits `logOracleCall({ rateLimitExempt: true, ... })` for extraction calls. |
| 14 | OracleModal pushback no length feedback | ✅ Fixed | `maxLength={8000}` + visible `{n}/8000` counter with `aria-live="polite"`. |
| 15 | Profile identity-direction can't be cleared | ✅ Fixed | `clearIdentityDirection` function added with confirm dialog and history-append; "Clear" button rendered alongside Save/Cancel. |
| 16 | Skeleton-delay logic split across two effects | ✅ Fixed | Consolidated to single `useEffect` at `Journal.jsx:295-307` owning both timers. (Pass 3 verification agent looked at the wrong file and misreported this as Partial — confirmed via direct read.) |
| 17 | AuthForm lacks live password-confirm feedback | ✅ Fixed | Live ✓ / "Passwords do not match yet" indicator added below confirm field with `aria-live="polite"`. |
| 18 | `DEV_MODE` ships dead branches to production | ✅ Fixed | `DEV_MODE` removed; `enableAnonymousAuth`/`enableDevMode` no longer imported by `firebaseUtils.js`. `ensureAuthenticated` simplified to single auth check. |
| 19 | `useSynthesisAutoGenerate` not using schema constants | ✅ Fixed | Imports `COLLECTIONS` from `schema.js`; `userSettings` and `syntheses` reads now go through constants. |
| 20 | `useVoiceInput` lives in `src/utils/` | ✅ Fixed | Moved to `src/hooks/useVoiceInput.js`; old utils file deleted; `VoiceInputButton.jsx` import path updated. |

**Pass 2 verified status: 20/20 fixed.**

---

## New Finding 1: `Profile.saveIdentityDirection` does not re-check auth before write
- **Severity:** Medium
- **Category:** Critical Defects (correctness / data-loss UX)
- **Location:** `src/pages/Profile.jsx:79-117` (`saveIdentityDirection`)
- **Description:** The save flow trusts `settingsId` and component state but never re-confirms `authService.getCurrentUser()` immediately before the Firestore write. If the user signs out between opening the editor and pressing Save (token expiry, manual sign-out in another tab), `writeData`/`updateData` will throw — but the catch block only emits a generic toast. The local component state has already been mutated optimistically (`setIdentityDirection(trimmed)` runs after the await but the toast still fires).
- **Impact:** User sees "Identity direction saved" toast while the Firestore document was never updated, then logs back in to find their identity direction unchanged.
- **Recommendation:** Before the write, check `auth.currentUser`; if null, abort with an explicit "Please sign in to save" toast. Move the local `setIdentityDirection(trimmed)` call AFTER the successful await.
- **Effort Estimate:** Trivial

---

## New Finding 2: `Onboarding.handleComplete` lacks atomic-write guarantees
- **Severity:** Medium
- **Category:** Critical Defects (partial-write data corruption)
- **Location:** `src/pages/Onboarding.jsx` — `handleComplete`
- **Description:** Onboarding writes three artifacts sequentially: user profile, optional first kill target, optional confrontation criterion. There is no transaction or rollback. If the second write fails after the first succeeds, the user retries and the first artifact is created again — duplicate user profile or kill target. The catch block doesn't reset the UI step either, so the user is stuck on the "complete" screen with no clear indication of which write succeeded.
- **Impact:** Duplicate documents in Firestore on retry; confusing UX after a transient failure.
- **Recommendation:** Either (a) move the entire onboarding write into a Cloud Function that uses a Firestore batch/transaction, or (b) at minimum, store a `_onboardingProgress` marker after each successful write so a retry can resume from the right step instead of repeating completed writes.
- **Effort Estimate:** Medium

---

## New Finding 3: `useCueRestructuring` error state not surfaced to consumers
- **Severity:** Medium
- **Category:** Enhancement Opportunities (silent failure)
- **Location:** `src/hooks/useCueRestructuring.js` and consumer `src/components/BlackMirror.jsx`
- **Description:** The hook tracks an `error` state internally but does not return it. Consumers see an empty list whether the user has zero records or whether the load failed. Same pattern as Pass 1 Finding 6 (behavioral context error logging) — failure is captured but not propagated.
- **Impact:** Silent data-load failures in the BlackMirror module. Combined with the fact that Black Mirror is currently env-flag-gated, this is low-blast-radius today, but the pattern will mislead future debugging.
- **Recommendation:** Add `error` to the hook's return value and have the caller render an inline error state with retry. Mirror the `missingCollections` pattern from `getBehavioralContext.js`.
- **Effort Estimate:** Small

---

## New Finding 4: `useVoiceInput` swallows browser permission denials
- **Severity:** Medium
- **Category:** Enhancement Opportunities (UX)
- **Location:** `src/hooks/useVoiceInput.js:47-50` — `recognition.onerror`
- **Description:** Browser support is detected via the presence of `webkitSpeechRecognition`, but microphone permission status is not. When permission is denied, `recognition.start()` succeeds and then `recognition.onerror` fires with `event.error === 'not-allowed'`. The current handler logs the error and flips `isListening` to false — the user sees the button click, hear nothing, and assume the feature is broken.
- **Impact:** Silent failure of voice input in journals, hard lessons, and relapse entries when mic permission is missing.
- **Recommendation:** Pass an `onError` callback alongside `onResult`/`onEnd`, and have `VoiceInputButton.jsx` toast a clear "Microphone permission required" message when `event.error === 'not-allowed'` or `'service-not-allowed'`.
- **Effort Estimate:** Small

---

## New Finding 5: `authService.onAuthStateChanged` invokes callback(null) on init failure
- **Severity:** Medium
- **Category:** Critical Defects (false logout)
- **Location:** `src/utils/authService.js` — `onAuthStateChanged` fallback path
- **Description:** When the cached auth instance isn't yet ready, the method falls back to `getAuth()` (lazy init). If the lazy init promise rejects (e.g., transient Firebase service blip during page load), the catch block calls `callback(null)`. The app's downstream `setUser(null)` then routes the user to `/auth` even though they were just signed in.
- **Impact:** Users intermittently bounced to the sign-in screen during transient initialization issues; loss of in-progress writes if a journal entry was being composed.
- **Recommendation:** Distinguish "no user" from "init failed". On init failure, propagate an error state (return an unsubscribe stub but call a separate `onInitError` callback or no callback at all) and let the App show an "Initialization failed — retry" surface instead of a fake-logout.
- **Effort Estimate:** Small

---

## New Finding 6: Admin helpers still exported from `firebaseUtils.js` regardless of caller
- **Severity:** Medium
- **Category:** Architectural Observations / Security
- **Location:** `src/utils/firebaseUtils.js` — `debugInspectAllFirebaseData`, `previewDataMigration`, `executeDataMigration`, `findDuplicateDocuments`, `removeDuplicateDocuments`
- **Description:** Pass 2 Finding 7 was fixed at the call site (Dashboard now dynamic-imports), but the functions themselves are still exported from `firebaseUtils.js` at module scope. Any future contributor adding a static import in any file pulls them back into the production graph. The protection is defense-in-depth but not architectural — it relies on every caller being disciplined.
- **Impact:** Easy to regress. A new contributor writing `import { executeDataMigration } from '../utils/firebaseUtils'` for what looks like a routine helper would re-introduce the leak.
- **Recommendation:** Move all admin helpers into `src/utils/firebaseAdmin.js` (new file). Have Dashboard's dev-only code dynamic-import from there. Configure ESLint or a Vite plugin to fail the build if any non-Dashboard file imports from `firebaseAdmin.js`.
- **Effort Estimate:** Medium

---

## New Finding 7: `Dashboard` synthesis prefetch error is silently swallowed
- **Severity:** Low
- **Category:** Code Quality (logging hygiene)
- **Location:** `src/pages/Dashboard.jsx:142-145` (the `readUserData('syntheses')` `.catch(() => {})`)
- **Description:** Empty arrow catch — failures are invisible. If syntheses fail to load (permission, network, rules misconfig), the SynthesisGuard logic that depends on `latestSynthesisIsNew` simply doesn't fire. No breadcrumb for triage.
- **Impact:** SynthesisGuard redirect won't activate on load failures; engineers can't tell the difference between "no new synthesis" and "synthesis read failed."
- **Recommendation:** Replace `.catch(() => {})` with `.catch((err) => logger.warn('Dashboard: synthesis prefetch failed:', err?.message))`.
- **Effort Estimate:** Trivial

---

## New Finding 8: `analytics.track` and `identify` swallow PostHog errors silently
- **Severity:** Low
- **Category:** Code Quality / Observability
- **Location:** `src/utils/analytics.js` — `track`, `identify`, `resetAnalytics`
- **Description:** Each function wraps the PostHog call in `try {} catch {}` with no logging. Misconfigured event names, malformed properties, or PostHog initialization regressions are invisible.
- **Impact:** Telemetry quietly degrades without any signal to engineering.
- **Recommendation:** In each catch block, `if (import.meta.env.DEV) logger.warn('analytics: failed', err?.message)`. Production stays quiet but dev surfaces the failure.
- **Effort Estimate:** Trivial

---

## New Finding 9: Synthesis auto-generation gives no UX signal
- **Severity:** Low
- **Category:** Enhancement Opportunities (UX)
- **Location:** `src/hooks/useSynthesisAutoGenerate.js` + `src/components/SynthesisGuard.jsx`
- **Description:** When the cadence period elapses, the hook silently generates a briefing in the background. SynthesisGuard then redirects the user to `/synthesis` without warning. From the user's perspective they were on the dashboard and were teleported to a different page with no announcement.
- **Impact:** Confusing UX; user wonders if they clicked something.
- **Recommendation:** Add a transient toast ("Weekly briefing ready") or render a banner on Dashboard with a "View briefing" CTA instead of an automatic redirect.
- **Effort Estimate:** Small

---

## New Finding 10: `useBreathing` does not clean up its interval on unmount
- **Severity:** Low
- **Category:** Performance (memory / interval leak)
- **Location:** `src/hooks/useBreathing.js`
- **Description:** The breathing cycle uses `setInterval` to step phases. If the user closes the EmergencyButton modal mid-cycle, the interval keeps firing in the background and updating React state on an unmounted component (React warns about state updates on unmounted components in dev). The `reset()` function clears the interval, but it's only called explicitly — not via a `useEffect` cleanup tied to unmount.
- **Impact:** React dev warnings; minor wasted CPU on closed modals.
- **Recommendation:** Wire the interval ID into a `useRef` and add a `useEffect(() => () => clearInterval(ref.current), [])` cleanup so unmount always tears down the cycle.
- **Effort Estimate:** Small

---

## New Finding 11: `dataMigration.findOldData` and `migrateOldDataToFirestore` log raw localStorage payloads
- **Severity:** Low
- **Category:** Security Flags (logging hygiene)
- **Location:** `src/utils/dataMigration.js`
- **Description:** Migration helpers `console.log` discovered localStorage payloads (journal entries, kill targets) verbatim during the dev migration flow. PostHog and Sentry breadcrumbs ingest these. Same risk class as Pass 1 Finding 8 (sensitive payload scrub) but for a different code path.
- **Impact:** User content from legacy localStorage leaks into telemetry during migration.
- **Recommendation:** Replace payload logs with summaries (`{ collection, count, oldest, newest }`); never log entry text or kill target titles.
- **Effort Estimate:** Small
- **Note:** Migration helpers are only loaded in dev now (Pass 2 Finding 7 fix), so the blast radius is small. Worth fixing before any future re-enablement.

---

## New Finding 12: `KillClosureModal` does not trap focus
- **Severity:** Low
- **Category:** Enhancement Opportunities (a11y)
- **Location:** `src/components/KillClosureModal.jsx`
- **Description:** The modal renders an overlay and inputs but does not focus the first input on open, does not trap Tab inside the modal, and does not restore focus to the originating button on close. Users navigating with the keyboard can Tab through the modal and into the page underneath.
- **Impact:** Accessibility failure for keyboard-only users at a moment when the user is making a finalize-kill decision (high-intent action).
- **Recommendation:** Use a focus-trap pattern (e.g., `react-focus-lock` if a dep is acceptable, or hand-rolled — focus first input on open, capture Tab/Shift-Tab to cycle within the modal, restore focus on close).
- **Effort Estimate:** Small

---

## New Finding 13: `useOracleModal` close path doesn't reset `entryCount`
- **Severity:** Low
- **Category:** Code Quality (state hygiene)
- **Location:** `src/hooks/useOracleModal.js`
- **Description:** `openWithContent(content, entryCount)` sets `entryCount`, but the `close()` function clears `content` and `isOpen` without resetting `entryCount`. The next call that uses `openLoading()` then renders with the prior session's `entryCount` until `openWithContent` is called again. Edge-case staleness window.
- **Impact:** Brief render with mismatched `entryCount` could affect data-depth-calibrated UI elements in the OracleModal between loading and content states.
- **Recommendation:** Reset `entryCount` to `null` in `close()`. Also reset in `openLoading()`.
- **Effort Estimate:** Trivial

---

## New Finding 14: `CrossModuleExtractionPrompts` doesn't debounce repeated extraction triggers
- **Severity:** Low
- **Category:** Performance / Cost
- **Location:** `src/components/CrossModuleExtractionPrompts.jsx`
- **Description:** Each render that mounts the component can fire an extraction call to the Oracle. There is no debounce or per-entry deduplication, so a quick mount/unmount cycle (e.g., due to a parent re-render) could fire multiple extraction calls for the same journal text. Extraction calls are exempt from the rate limiter (Finding 13 in the original report — exemption is intentional for background calls), so they have no per-day ceiling.
- **Impact:** Wasted Anthropic API spend on duplicate extraction requests when components re-mount.
- **Recommendation:** Track a per-entry-id flag in `sessionStorage` or component state: if extraction has already been attempted for this entry id this session, skip the second call.
- **Effort Estimate:** Small

---

## New Finding 15: `SynthesisGuard` redirect logic depends on a single readable doc
- **Severity:** Informational
- **Category:** Architectural Observations
- **Location:** `src/components/SynthesisGuard.jsx`
- **Description:** The guard reads the latest synthesis once on mount and decides whether to redirect. If the user generates a briefing in another tab or via the auto-generate hook, the guard in this tab won't pick it up until a remount. Not a bug — just a documentation gap that explains why navigation doesn't always reflect synthesis state in real time.
- **Impact:** None functional; informational.
- **Recommendation:** Document the read-once semantics in a comment, or convert to a real-time `onSnapshot` listener if the multi-tab use-case becomes important.
- **Effort Estimate:** Trivial

---

## Areas Confirmed Solid (no findings)

- `firestore.rules` after Pass 2 fix — `ownerListAllowed` correctly forces filtered queries; emulator tests would round this out but the rule logic itself is sound.
- `src/components/Confetti.jsx` — does not exist in the repo; no consumers reference it. The Pass 2 scope listing was stale; not a finding.
- `src/hooks/useSynthesisNewFlag.js` — exists, returns a boolean from a snapshot listener with proper unsubscribe; clean.
- `src/pages/OuraCallback.jsx` — error param is rendered via `{error}` in JSX; React auto-escapes string content, so no XSS via that surface. Clean.
- `src/utils/aiFeedback.test.js` and `src/utils/clarityScore.test.js` — tests are well-structured. Clarity Score test file already covers the FNV-1a fingerprint via the existing edge-case tests added in Pass 1 Finding 17.
- Pass 2 remediations on `Dashboard.jsx`, `Journal.jsx`, `VirtualizedList.jsx`, `OracleModal.jsx`, `AuthForm.jsx`, `Profile.jsx`, `useOuraData.js`, `clarityScore.js`, `firebaseUtils.js`, `ouraService.js`, `firestore.rules`, and `functions/index.js` — all verified intact and correct via direct read.

---

## Summary
- **Total New Findings:** 15
- **Critical:** 0 | **High:** 0 | **Medium:** 6 | **Low:** 8 | **Informational:** 1
- **Top 3 Priorities:**
  1. New Finding 5 — `authService.onAuthStateChanged` calling `callback(null)` on init failure can produce false logouts
  2. New Finding 2 — Onboarding partial-write retry path produces duplicate documents
  3. New Finding 6 — Admin helpers still exported at module scope from `firebaseUtils.js` (defense-in-depth gap)
- **Overall Assessment:** All 20 Pass 2 findings are confirmed fixed. No new Critical or High issues remain. Remaining items are correctness edges, observability gaps, and small UX/a11y improvements — substantively safer than the prior pass. The code is in good shape for beta with the three medium items addressed.
