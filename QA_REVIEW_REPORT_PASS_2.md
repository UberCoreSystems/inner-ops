# QA Code Review Report — Pass 2

**Repo:** inner-ops
**Reviewed:** 2026-04-15
**Reviewer:** Claude QA Engineer
**Scope:** Second-pass review focused on areas not deeply covered in `QA_REVIEW_REPORT.md`, plus regression checks on every file touched by the remediation sprint. Files examined: `firestore.rules`, `functions/index.js`, all `src/pages/*`, all `src/components/*`, all `src/hooks/*`, all `src/utils/*`, `src/firebase.js`, `src/App.jsx`, plus configuration files.

This report does **not** re-flag findings already addressed by the remediation sprint. Confirmed-fixed items are listed in the "Regression Audit" section at the end.

---

## Finding 1: Firestore `list` permission grants cross-user enumeration
- **Severity:** Critical
- **Category:** Security Flags (access control regression — introduced by Pass 1 remediation)
- **Location:** `firestore.rules:83, 90, 97, 104, 111, 118, 125` — every top-level collection (`journalEntries`, `killTargets`, `blackMirrorEntries`, `relapseEntries`, `hardLessons`, `compassChecks`, `test-connection`)
- **Description:** The Pass 1 remediation split `allow read` into `allow get, delete: if isOwner(resource.data.userId)` plus `allow list: if isSignedIn()`. Firestore evaluates `list` against the QUERY, not against each document — `resource.data.userId` is unavailable at list time. The original `allow read: if isOwner(resource.data.userId)` rule implicitly forced clients to send queries constrained by `where("userId","==",auth.uid)`, because list operations have to be satisfiable by the rule for every document the query could match. The new rule is satisfiable by any signed-in user even without that filter.
- **Evidence:**
  ```
  match /journalEntries/{docId} {
    allow create: if createsOwnDocument();
    allow get, delete: if isOwner(resource.data.userId);
    allow update: if updatesOwnDocument();
    allow list: if isSignedIn();   // ← any authed user can enumerate every entry
  }
  ```
- **Impact:** Authenticated cross-user data exfiltration. A single signed-in user can call `getDocs(collection(db, 'journalEntries'))` (no `where` clause) and receive every user's journal entries, kill targets, relapse entries, hard lessons, compass checks. Identical paths exist for the other six collections.
- **Recommendation:** Replace `allow list: if isSignedIn()` with `allow list: if isOwner(resource.data.userId)` (semantically equivalent to the original `allow read` rule and forces filtered queries), or write the query-aware predicate `allow list: if isSignedIn() && request.query.limit <= N && resource.data.userId == request.auth.uid`. The application's own helpers (`readUserData`, `subscribeToUserData`) already apply `where("userId","==",uid)` so the stricter rule won't break legitimate traffic. After fixing, run the Firestore emulator with both positive and negative tests asserting cross-uid list returns `permission-denied`.
- **Effort Estimate:** Trivial

---

## Finding 2: Admin/debug Firestore helpers exposed on `window` in production
- **Severity:** Critical
- **Category:** Security Flags (privileged operations exposed to client)
- **Location:** `src/pages/Dashboard.jsx:152-321` (the `window.debugDashboard = { ... }` block) plus the underlying helpers in `src/utils/firebaseUtils.js`: `debugInspectAllFirebaseData` (~line 294-350), `previewDataMigration` (~line 355-394), `executeDataMigration` (~line 399-458), `findDuplicateDocuments` (~line 463-527), `removeDuplicateDocuments` (~line 532-604)
- **Description:** Dashboard attaches a `debugDashboard` object to `window` on mount, exposing inspection helpers, data-migration helpers, and duplicate-removal helpers. The underlying functions in `firebaseUtils.js` issue UNFILTERED queries (`query(colRef)` with no `where`-clause) and bulk `updateDoc` / `deleteDoc` operations across collections. There is no `import.meta.env.DEV` gate. UI buttons in Dashboard call these via `window.debugDashboard?.findOldData?.()` and `window.debugDashboard?.migrateData?.()` (lines 1142, 1156).
- **Evidence:**
  ```js
  // Dashboard.jsx
  window.debugDashboard = {
    inspectFirebase: async () => { const result = await debugInspectAllFirebaseData(); ... },
    executeMigration: async (sourceUserId) => { ... await executeDataMigration(sourceUserId, currentUserId); },
    removeDuplicates: async () => { ... await removeDuplicateDocuments(); },
    ...
  };
  ```
  ```js
  // firebaseUtils.js
  const allDocsQuery = query(colRef);              // no userId filter
  const allDocsSnapshot = await getDocs(allDocsQuery);
  ```
- **Impact:** Two compounding risks. (1) If Finding 1 is fixed, these calls will now throw `permission-denied` and the Dashboard UI buttons that depend on them will break — silent UX regression. (2) If Finding 1 is **not** fixed, these expose a one-line console invocation for any signed-in user to enumerate or destructively rewrite cross-user documents (`window.debugDashboard.executeMigration("victim-uid")` reassigns every doc owned by the victim to the attacker). Sentry/PostHog also collect these console logs.
- **Recommendation:** (1) Wrap the entire `window.debugDashboard` assignment and the corresponding UI buttons in an `if (import.meta.env.DEV)` gate, OR (2) move all migration / duplicate-cleanup operations into a Cloud Function that uses Admin SDK and verifies the caller is in an admin claim list. Do not ship to beta with these on the global object.
- **Effort Estimate:** Medium

---

## Finding 3: React key collision risk on `aiInsights.reflections`
- **Severity:** High
- **Category:** Critical Defects (rendering correctness)
- **Location:** `src/pages/Journal.jsx:917`
- **Description:** The reflections list maps with `key={insight}` where `insight` is the free-form AI-generated string. Duplicate strings (the AI can produce the same observation twice when the entry is short or repetitive) collapse to a single key in React's reconciler.
- **Evidence:**
  ```jsx
  aiInsights.reflections.map((insight, idx) => (
    <div key={insight} className="text-[#d8b4fe] ...">
      {insight}
    </div>
  ))
  ```
- **Impact:** When duplicates occur, React drops the second item or attaches transitions/state to the wrong DOM node. Symptoms include the insights list visually losing entries, animations playing twice on the same element, or focus jumping.
- **Recommendation:** Either generate stable IDs at insight-creation time (`{ id: crypto.randomUUID(), text }`) and key on `id`, or fall back to `key={`${idx}-${insight.slice(0,20)}`}` if a stable id is not feasible. Plain `idx` is acceptable here because the list is append-only and not reorderable.
- **Effort Estimate:** Trivial

---

## Finding 4: `VirtualizedList` falls back to `virtualIndex` as React key
- **Severity:** High
- **Category:** Critical Defects (list reconciliation)
- **Location:** `src/components/VirtualizedList.jsx:71`
- **Description:** `<div key={item.id || virtualIndex} style={style}>` — when an item has no `id`, the key becomes the index of the visible window, which changes every time the user scrolls. React then thinks every item is a different item on each scroll tick, triggering full unmount/remount of every row.
- **Evidence:**
  ```jsx
  {visibleItems.map(({ item, virtualIndex, style }) => (
    <div key={item.id || virtualIndex} style={style}>
      {renderItem({ item, index: virtualIndex })}
    </div>
  ))}
  ```
- **Impact:** Severe scroll perf, lost focus inside any row that owns input state, and broken animations. Also defeats the purpose of virtualization — virtual scrolling assumes stable identity.
- **Recommendation:** Require `item.id` and warn in dev when missing. Do not silently fall back to a positional key. If a list truly has no IDs, the caller should compute a deterministic content hash before passing items in.
- **Effort Estimate:** Small

---

## Finding 5: Top-level and user-scoped Firestore paths shadow each other
- **Severity:** High
- **Category:** Architectural Observations / Security
- **Location:** `firestore.rules` — `/users/{userId}/journalEntries/{entryId}` (line ~33) vs `/journalEntries/{docId}` (line ~79); same dual-pathing for `killTargets`, `blackMirrorEntries`, `relapseEntries`, `hardLessons`, `compassChecks`
- **Description:** Two completely different Firestore paths with the same logical name and different access rules. The application code today writes to the top-level paths (`addDoc(collection(db, 'journalEntries'), ...)`), so the nested `/users/{uid}/journalEntries/...` rules are unused. Their presence creates ambiguity about where data actually lives and which rule set applies.
- **Impact:** (1) Future contributors may add code that writes to the nested path, splitting data across two locations. (2) Migration tooling has to guess which path holds what. (3) The nested rules give a false sense of security — they look strict, but the actual writes go to the looser top-level rules.
- **Recommendation:** Decide on one canonical layout (top-level + `userId` filter is the current de-facto choice) and remove the unused `/users/{uid}/{collection}` matches. Add a one-line comment in `firestore.rules` documenting the canonical path so future agents don't re-introduce the duplication.
- **Effort Estimate:** Small

---

## Finding 6: `oauthService` token refresh swallows errors silently
- **Severity:** High
- **Category:** Security Flags / Reliability
- **Location:** `src/utils/ouraService.js` — `getValidToken` refresh block
- **Description:** When the stored Oura token is past expiry, `getValidToken` calls the refresh endpoint inside a try/catch that returns `null` on any failure without logging the cause. Refresh-token rotation, network errors, and provider-side revocation are indistinguishable to the caller.
- **Impact:** Users silently lose Oura integration with no breadcrumb in Sentry; Dashboard widgets that depend on biometrics quietly empty out. The stored (potentially invalid) refresh token is not cleared, so subsequent attempts retry the same broken token.
- **Recommendation:** Log refresh failures with `{ status, code }` (never the token itself), distinguish "token expired and refresh failed" from "no token stored" in the return value, and clear the stored token on definitive 4xx responses so the user is prompted to re-authorize.
- **Effort Estimate:** Small

---

## Finding 7: `Dashboard.jsx` imports privileged migration helpers at module scope
- **Severity:** High
- **Category:** Architectural Observations / Bundle Hygiene
- **Location:** `src/pages/Dashboard.jsx:4`
- **Description:** The page-level import pulls every privileged helper into the user-facing bundle: `import { readUserData, writeData, debugInspectAllFirebaseData, previewDataMigration, executeDataMigration, findDuplicateDocuments, removeDuplicateDocuments } from '../utils/firebaseUtils';`. Even if Finding 2 is gated behind a dev flag, the code paths still ship to production.
- **Impact:** Increases bundle size, attack surface, and code-reading overhead for an authenticated user inspecting devtools. Makes it easier for future contributors to call these by accident.
- **Recommendation:** Either move the helpers into a separate `src/utils/firebaseAdmin.js` that is dynamically imported only when a dev/admin flag is set, or split them into a Cloud Function call surface and remove them from the client bundle entirely.
- **Effort Estimate:** Medium

---

## Finding 8: `useOuraData` race when auth state flips during in-flight fetch
- **Severity:** Medium
- **Category:** Performance / Correctness
- **Location:** `src/hooks/useOuraData.js:36-50` (inside `onAuthStateChanged` callback)
- **Description:** The hook uses a `cancelled` flag and checks it before each `setState`, but the `Promise.all([getTodaysBiometrics(uid), getHrvBaseline(uid)])` itself is not abortable. If the user signs out and back in quickly, two concurrent fetches can complete out-of-order; the cancelled-flag check prevents the wrong-state update from the older flight, but the network requests still run to completion and burn quota.
- **Impact:** Wasted Oura API calls (rate-limited on their side), longer perceived load time, and a window where stale data could briefly display.
- **Recommendation:** Wrap the fetches in an `AbortController` and pass the signal into `getTodaysBiometrics`/`getHrvBaseline`. Abort the controller in the cleanup so in-flight requests are cancelled when auth changes.
- **Effort Estimate:** Medium

---

## Finding 9: `Journal.jsx` AI insight effect captures stale state
- **Severity:** Medium
- **Category:** Performance / Correctness
- **Location:** `src/pages/Journal.jsx:373` (the dynamic AI-insight generation effect)
- **Description:** The effect debounces a generator that reads `aiInsights`, `mood`, `intensity`, and other state values, but its dependency array does not include every captured variable. When dependencies change, a new closure runs, but the debounced timer from the previous closure may still fire with stale captures.
- **Impact:** Generated insights occasionally reflect the wrong mood/intensity, or apply to an entry the user has since edited away from. Hard to reproduce — manifests as "the insight doesn't match what I just wrote."
- **Recommendation:** Either inline the generator into the effect with an exhaustive dep list, or move the generator into a `useCallback` whose deps include all captured state. Enable `react-hooks/exhaustive-deps` in ESLint to catch future drift.
- **Effort Estimate:** Small

---

## Finding 10: Synthesis briefing template strings don't null-guard derived fields
- **Severity:** Medium
- **Category:** Critical Defects (null-safety)
- **Location:** `src/utils/generateSynthesisBriefing.js` — `deriveConvergencePoint` and `buildFallbackQuestion`
- **Description:** Several derived values (`dominantArchetype`, `dominantMood`, `highEscapeTargets[0]`) can be `null`/`undefined` for new users with sparse data. Most call sites guard, but `buildFallbackQuestion` interpolates `${highEscapeTargets[0].title}` and `${highEscapeTargets[0].escapeData?.length || 0}` without a guard on the first conditional branch — relies on the outer `if (highEscapeTargets.length > 0)` check, which is correct, but the pattern is fragile.
- **Impact:** Low today (current guards happen to cover all paths), but any future addition of a new fallback branch could throw on the first low-data user that hits it.
- **Recommendation:** Extract the `highEscapeTargets[0]?.title` access into a named local with a default before interpolation, or move template construction into a single function that takes already-validated inputs.
- **Effort Estimate:** Small

---

## Finding 11: `clarityScore` cache fingerprint uses XOR (order-insensitive)
- **Severity:** Low
- **Category:** Correctness (cache collision)
- **Location:** `src/utils/clarityScore.js:13-22` — `fingerprintCollection`
- **Description:** The fingerprint XORs all timestamps. XOR is commutative, so `[t1, t2, t3]` and `[t3, t2, t1]` produce the same fingerprint — and adding a duplicate timestamp twice cancels it out (`t ^ t == 0`). In practice the array length is also part of the cache key, which mitigates most collisions, but two arrays with the same length, same set of timestamps, and different content will collide.
- **Impact:** Theoretical cache collision returning stale score. Very unlikely in production data, but easy to harden.
- **Recommendation:** Use a position-aware accumulator: `acc = ((acc * 31) ^ t) >>> 0`, or just join the timestamps as a string. Cost is negligible.
- **Effort Estimate:** Trivial

---

## Finding 12: `firebaseUtils.writeData` still leaks `error` for non-sensitive writes
- **Severity:** Low
- **Category:** Security Flags (logging hygiene)
- **Location:** `src/utils/firebaseUtils.js:107-115` (inside `writeData` catch)
- **Description:** The Pass 1 remediation scrubs the error to `{ code, name }` only when `options.sensitive` is set. For all other writes, the entire `error` object — which includes `error.message` and (depending on Firebase version) the document data echoed back in the message — is logged via `logger.error`. Sentry breadcrumbs pick this up.
- **Impact:** Non-emergency writes that happen to contain user content (journal entries, hard lessons) can leak excerpts into Sentry breadcrumbs on permission-denied responses.
- **Recommendation:** Always log only `{ code, name, message: scrub(error.message) }` from `writeData` — the full error is rarely needed for triage. If detail is needed, add a debug-mode-only branch that logs the full object behind a flag.
- **Effort Estimate:** Trivial

---

## Finding 13: Rate limiter exemption is silent
- **Severity:** Low
- **Category:** Enhancement Opportunities (observability)
- **Location:** `functions/index.js:178-181` (the `isExtractionCall` check)
- **Description:** Calls with `moduleName` of `killlistextraction` or `relapsedetection` skip the rate limiter entirely with no log line. There's no way to audit how many of a given user's daily Oracle calls are exempted, or to detect a misuse where a normal entry gets routed through the extraction path.
- **Impact:** Cost auditing blind spot. Also blocks an alerting policy that says "alert if extraction-call rate exceeds normal baseline."
- **Recommendation:** Emit a `logOracleCall({ fn: 'oracle', exempt: true, ... })` line whenever the rate-limit branch is skipped, mirroring the existing structured log fields.
- **Effort Estimate:** Trivial

---

## Finding 14: `OracleModal` pushback textarea has no length feedback
- **Severity:** Low
- **Category:** Enhancement Opportunities (UX)
- **Location:** `src/components/OracleModal.jsx` — pushback textarea
- **Description:** The server clamps pushback at `MAX_USER_RESPONSE_CHARS = 8000`. The textarea has no `maxLength` attribute and no character counter, so a user who exceeds the cap sees their input silently truncated by the server.
- **Impact:** User confusion when long pushback gets cut off mid-sentence in the Oracle's reply.
- **Recommendation:** Add `maxLength={8000}` to the textarea and a small character counter under it (`{value.length} / 8000`) — keeps client and server in sync visually.
- **Effort Estimate:** Trivial

---

## Finding 15: `Profile.jsx` identity-direction validation rejects clearing the field
- **Severity:** Low
- **Category:** Enhancement Opportunities (UX)
- **Location:** `src/pages/Profile.jsx:79-84` (`saveIdentityDirection`)
- **Description:** Validation `if (trimmed.length < 20 || trimmed.length > 200)` rejects empty input. There is no separate "clear identity direction" affordance, so a user who wants to remove their direction (because it no longer fits) is stuck with the old value or has to fabricate a new 20-char minimum string.
- **Impact:** Minor UX dead-end. Users either keep stale identity statements or work around the validation.
- **Recommendation:** Add an explicit "Clear" button that nulls `identityDirection` and appends a `{ statement, supersededAt }` entry to `identityDirectionHistory`. Keep the 20-char minimum on save.
- **Effort Estimate:** Small

---

## Finding 16: `Journal.jsx` skeleton-delay logic split across two effects
- **Severity:** Low
- **Category:** Code Quality (maintainability)
- **Location:** `src/pages/Journal.jsx:288-305`
- **Description:** Two `useEffect`s coordinate skeleton visibility via separate timers (250ms show-delay, 300ms hide-dwell). State transitions through both effects are ordering-sensitive, and either timer can fire after unmount if the component re-renders during the dwell window.
- **Impact:** Edge-case skeleton flicker on fast loads; harder to test.
- **Recommendation:** Consolidate into a single `useSkeletonState(loading, { showDelay, dwell })` hook that owns both timers and clears them on unmount.
- **Effort Estimate:** Small

---

## Finding 17: `AuthForm` lacks live password-confirmation feedback
- **Severity:** Low
- **Category:** Enhancement Opportunities (UX/A11y)
- **Location:** `src/components/AuthForm.jsx:60-77`
- **Description:** Password and confirm-password inputs are siblings with no live mismatch indicator. Validation only fires on submit, surfacing a generic toast.
- **Impact:** Worse signup UX, particularly on mobile where typing is slower.
- **Recommendation:** Add a small inline indicator under the confirm-password input that shows ✓ when matched and an error message when not. Keep the submit-time validation as the authoritative check.
- **Effort Estimate:** Trivial

---

## Finding 18: `DEV_MODE` toggle in `firebaseUtils.js` ships to production
- **Severity:** Low
- **Category:** Code Quality (dead branches in production)
- **Location:** `src/utils/firebaseUtils.js:6` — `const DEV_MODE = false;`
- **Description:** A module-level `DEV_MODE` boolean gates anonymous-auth and mock-user paths. The flag is hardcoded to `false` and the dead branches still ship in the production bundle (Terser cannot prove the flag is constant across the file's exports without `as const` semantics).
- **Impact:** Dead code in the bundle. More importantly, the existence of an editable boolean that bypasses authentication is a footgun for future contributors.
- **Recommendation:** Either delete the `DEV_MODE` branches entirely (the `enableAnonymousAuth` and `enableDevMode` exports in `firebase.js` can stay if needed for emulator work), or replace `DEV_MODE` with `import.meta.env.DEV` so Vite can dead-code-eliminate the prod path.
- **Effort Estimate:** Small

---

## Finding 19: `useSynthesisAutoGenerate` reads `userSettings` without schema constants
- **Severity:** Informational
- **Category:** Architectural Observations
- **Location:** `src/hooks/useSynthesisAutoGenerate.js:23-27`
- **Description:** The hook reads `'userSettings'` and `'syntheses'` collection names and the `synthesisCadence` field as string literals, while the rest of the codebase migrated to `src/utils/schema.js` constants (`COLLECTIONS.USER_SETTINGS`, `COLLECTIONS.SYNTHESES`). Inconsistent adoption.
- **Impact:** Drift target — if the schema constants are renamed, this hook silently keeps using the old name.
- **Recommendation:** Import from `./utils/schema.js` and add a `SYNTHESIS_CADENCE` field to the schema if you want to centralize that key too.
- **Effort Estimate:** Trivial

---

## Finding 20: `useVoiceInput` lives in `src/utils/` instead of `src/hooks/`
- **Severity:** Informational
- **Category:** Code Quality (file organization)
- **Location:** `src/utils/useVoiceInput.js`
- **Description:** Naming convention violation — every other React hook lives in `src/hooks/`. This file's `use` prefix flags it as a hook to React (correctly), but its location implies it's a utility.
- **Impact:** None functional. Discoverability cost only.
- **Recommendation:** Move to `src/hooks/useVoiceInput.js` and update imports.
- **Effort Estimate:** Trivial

---

## Regression Audit — Pass 1 Remediations

Verified items from `QA_REVIEW_REPORT.md` that are confirmed-fixed in the current tree (no further action needed):

- **Pass 1 Finding 1** (KillList JSON.parse) — `src/pages/KillList.jsx:215` now logs via `logger.warn` on parse failure. ✅
- **Pass 1 Finding 2** (rate limiter) — `enforceOracleRateLimit` in `functions/index.js` correctly uses Firestore transactions and Admin SDK. ✅
- **Pass 1 Finding 3** (`customSystemPrompt`) — Server rejects the field; client uses `promptContextKey` registry with input clamping. ✅
- **Pass 1 Finding 4** (`oracleFollowUp`) — Rate limit and input bounds applied. (Persisted-feedback ownership still tracked as a follow-up.)
- **Pass 1 Finding 5** (Black Mirror gating) — `BLACK_MIRROR_ENABLED` env flag in both `App.jsx` and `Navbar.jsx`. ✅
- **Pass 1 Finding 6** (behavioral context error logging) — `missingCollections` now surfaced; per-collection failures logged. ✅
- **Pass 1 Finding 7** (Clarity cache key) — Now includes per-collection fingerprint and 60s TTL. ✅ (XOR collision risk noted as Finding 11 in this pass.)
- **Pass 1 Finding 8** (sensitive payload scrub) — `writeData` honors `{ sensitive: true }`; EmergencyButton uses it. ✅ (Non-sensitive path still leaks — see Finding 12 in this pass.)
- **Pass 1 Finding 9** (boot API-key log) — Removed; `firebase.js` fails fast on missing config. ✅
- **Pass 1 Finding 10** (Firestore rules split) — Rules were split as instructed, but the `list` permission was made too broad. **See Finding 1 above.** ❌
- **Pass 1 Findings 11–13** (callLLM lift, schema.js, Synthesis discriminated return) — Verified end-to-end; all callers updated. ✅
- **Pass 1 Finding 14** (drift signal guard + skippedCount) — Verified. ✅
- **Pass 1 Finding 15** (`onSnapshot` cleanup) — `safeUnsubscribe` pattern in `subscribeToUserData`. ✅
- **Pass 1 Finding 16** (`useKillTargets` useCallback) — Verified. ✅
- **Pass 1 Finding 17** (Clarity edge-case tests) — New tests added covering Timestamp interop, decay boundaries, and farm-attempt scenarios. ✅
- **Pass 1 Finding 18** (structured Oracle logging) — `logOracleCall` emits JSON line per call. ✅
- **Pass 1 Finding 19** (Emergency slider a11y) — `aria-label`, `aria-valuemin/max/now`, `aria-valuetext` and visible readout all present. ✅
- **Pass 1 Finding 20** (Navbar Icons hoist) — Both `Icons` and `NAV_ITEMS` are at module scope. ✅
- **Pass 1 Finding 21** (`logger.warn` in clarityScore) — Already correct. ✅
- **Pass 1 Finding 22** (`DRIFT_STREAK_THRESHOLD` constant) — Exported from `detectDriftSignals.js`. ✅
- **Pass 1 Finding 23** (Hosting config) — `firebase.json` includes `hosting` block with SPA rewrites and asset cache headers. ✅
- **Pass 1 Finding 24** (Anthropic SDK upgrade) — Bumped to `^0.65.0` in `functions/package.json`. (Awaiting `npm install` + audit; tracked.)
- **Pass 1 Finding 25** (DEAD_CODE_REPORT reconciliation) — Updated entry appended. ✅
- **Pass 1 Finding 26** (logger tree-shaking) — `__INNER_OPS_IS_DEV__` Vite define added; logger branches on it. ✅

---

## Summary
- **Total Findings:** 20
- **Critical:** 2 | **High:** 5 | **Medium:** 3 | **Low:** 7 | **Informational:** 3
- **Top 3 Priorities:**
  1. Finding 1 — Firestore `list` permission is now overly broad (introduced by Pass 1 remediation; cross-user enumeration possible)
  2. Finding 2 — `window.debugDashboard` exposes destructive admin operations to any signed-in user in production
  3. Finding 3 / 4 — React key-collision risks in `Journal.jsx` and `VirtualizedList.jsx` (correctness regressions waiting to bite)
- **Overall Assessment:** The Pass 1 remediation closed 25 of 26 prior findings cleanly, but the Firestore-rules change overshot — the new `allow list: if isSignedIn()` is a critical regression that must ship before beta. Outside of that and the long-standing `window.debugDashboard` exposure, the v1 surface is in good shape; remaining items are smaller correctness, performance, and UX hardening work.
