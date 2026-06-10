# Inner Ops — Firestore Security Rules & Cloud Function Access Audit

**Date:** 2026-06-09
**Scope:** Firestore security rules, Cloud Function auth controls, emulator-based proof.
**Reference failure designed against:** QUITTR (same Firebase stack) shipped broken rules and exposed 600K+ users' compulsion data, ~100K of them minors. This pass exists so Inner Ops cannot fail the same way.
**Status:** ✅ Owner-only isolation proven by an automated 288-test matrix against the Firestore emulator. **Nothing deployed.** Deploy commands at the end — Bo pulls the trigger.

---

## 1. Phase 0 — Access Map (final, corrected)

**Data model:** root collections keyed by a `userId` field (NOT `/users/{uid}/...` subcollections). Every client write stamps `userId: user.uid` ([firebaseUtils.js:44-48](../src/utils/firebaseUtils.js#L44)); every read is scoped `where("userId","==",uid)` ([firebaseUtils.js:183](../src/utils/firebaseUtils.js#L183), [firebaseUtils.js:256](../src/utils/firebaseUtils.js#L256), [firebaseUtils.js:316](../src/utils/firebaseUtils.js#L316)). Two namespaces instead use **doc-id == uid** path ownership.

| Collection | Path shape | Ops (client) | Writer | Owner binding | VERIFIED |
|---|---|---|---|---|---|
| journalEntries | root | C/R/U/D + list | client | `userId` field | firebaseUtils.js + Journal.jsx |
| killTargets | root | C/R/U/D + list | client | `userId` field | useKillTargets.js, KillList.jsx |
| relapseEntries | root | C/R/U/D + list | client | `userId` field | RelapseRadar.jsx |
| hardLessons | root | C/R/U/D + list | client | `userId` field | HardLessons.jsx |
| compassChecks | root | C/R/U/D + list | client | `userId` field | Settings.jsx |
| confirmedKills | root | C/R/U/D + list | client | `userId` field | firebaseUtils.js moveDocAtomic |
| confrontations | root | C/R/U/D + list | client | `userId` field | PatternConfrontationCard.jsx |
| journalEntriesArchive | root | C/R/U/D + list | client | `userId` field | archiveUtils.js |
| killTargetsArchive | root | C/R/U/D + list | client | `userId` field | archiveUtils.js |
| hardLessonsArchive | root | C/R/U/D + list | client | `userId` field | archiveUtils.js |
| relapseEntriesArchive | root | C/R/U/D + list | client | `userId` field | archiveUtils.js |
| emergencyLogs | root | C/R/U/D + list | client | `userId` field | EmergencyButton.jsx |
| syntheses | root | C/R/U/D + list | client | `userId` field | generateSynthesisBriefing.js |
| userSettings | root | C/R/U/D + list | client | `userId` field | firebaseUtils.js upsertUserSettings |
| dailyBriefs | root (id `{uid}_{date}`) | C/R/U/D + list | client | `userId` field | dailyBrief.js |
| userProfiles/{uid} | doc-id=uid | C/R/U/D | client | path uid | userProfile.js, Onboarding.jsx |
| users/{uid} | doc-id=uid | C/R/U/D | client | path uid | (profile/settings doc) |
| users/{uid}/_rateLimits/* | subcol | — (locked) | **Cloud Function (Admin SDK)** | client `if false` | rateLimit.js:44 |
| users/{uid}/integrations/* | subcol | — (locked) | deferred (Oura) | client `if false` | ouraService.js:104 |
| users/{uid}/biometrics/* | subcol | read only | CF writes (Admin) | path uid (read) | ouraService.js:243 |

**Cleared non-findings:**
- `signalReport` / `signalReports` — **not a Firestore collection.** In-memory React state/prop only ([Dashboard.jsx:52](../src/pages/Dashboard.jsx#L52), composeMirrorReading.js). No rule needed.
- `test-connection` — was in the old rules but **no shipped client code reads/writes it** (grep returned zero hits). Removed (see §2).

**Auth model (VERIFIED):**
- Live path: **email/password only** — `createUserWithEmailAndPassword` / `signInWithEmailAndPassword` ([authService.js:22,75](../src/utils/authService.js#L22)).
- Anonymous auth + mock user exist but are **dev-only**: every entry point is guarded by `assertDevOnly()` which throws unless `import.meta.env.DEV`, and Vite/Terser dead-code-eliminates the bodies in a production build ([firebase.js:101-161](../src/firebase.js#L101)). `firebaseUtils.js` no longer wires any DEV_MODE bypass ([firebaseUtils.js:5-8,22-30](../src/utils/firebaseUtils.js#L5)). **Not reachable in shipped UI** — anonymous-uid orphaning risk does not apply to v1.

**Other surfaces:** No Firebase Storage, no Realtime Database configured ([firebase.json](../firebase.json) has no `storage`/`database` keys). Hosting security headers already set (HSTS, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy). Nothing to default-deny outside Firestore.

---

## 2. Rules — Before/After

The pre-existing rules were already owner-scoped and mature (this was **not** a QUITTR-style `allow ... if true` situation). The audit added belt-and-suspenders hardening only.

### Changes ([firestore.rules](../firestore.rules))

**(a) Explicit default-deny floor added** — catch-all at the bottom:
```
match /{document=**} {
  allow read, write: if false;
}
```
*Justification:* Firestore already denies unmatched paths, but the explicit floor makes intent un-missable and guarantees any **future** collection is denied until it gets its own owner-scoped block. Proven active: every denial trace in the test run terminates in `false for ... @ L268` (the floor's line). A new collection added without a rule fails closed, not open.

**(b) `test-connection` allow removed.** *Justification:* "No collection the app doesn't use gets an allow." Shipped code never touches it; smoke tests run against the (permissive) emulator or a real user-data collection. It is now covered by the default-deny floor (test: *"authenticated: write to removed test-connection denied"* passes).

**(c) AI-memory rule stub added (commented).** *Justification:* The post-launch Command Brief layer will persist a per-user memory doc. The owner-only template is pre-decided now (commented `aiMemory` block) so it cannot ship later with a weaker rule.

### Unchanged but verified-correct logic

| Helper | What it enforces | Why shaped this way |
|---|---|---|
| `isOwner(userId)` | signed-in AND `userId == auth.uid` | get/delete gate on `resource.data.userId` |
| `createsOwnDocument()` | `request.resource.data.userId` is a string AND `== auth.uid` | client cannot plant a doc under another uid |
| `updatesOwnDocument()` | existing `userId == auth.uid` AND `userId` unchanged | userId is immutable; no re-keying to steal/donate a doc |
| `ownerListAllowed()` | `resource.data.userId == auth.uid` | forces every list query to carry the `where("userId","==",uid)` filter; an unfiltered or cross-user query is rejected by the rules engine before touching data |

Admin-only namespaces (`_rateLimits`, `integrations`) are `allow read, write: if false` for all clients — only the Admin SDK (which bypasses rules) writes them. `biometrics` is owner-read, client-write-denied.

---

## 3. Cloud Function Hardening

All three functions in [functions/index.js](../functions/index.js) were audited. **No code changes were required** — the existing controls already meet the bar. Verified:

| Control | Status | Evidence |
|---|---|---|
| `oracle` rejects unauthenticated callers | ✅ | `if (!request.auth) throw HttpsError("unauthenticated", ...)` — [index.js:107](../functions/index.js#L107) |
| `oracleFollowUp` rejects unauthenticated | ✅ | [index.js:217](../functions/index.js#L217) |
| `deleteUserData` rejects unauthenticated | ✅ | [index.js:873](../functions/index.js#L873) |
| uid derived from verified token, never payload | ✅ | `const uid = request.auth.uid` in all three; `deleteUserData` deletes `where("userId","==",uid)` — caller cannot target another user ([index.js:850-866,882-888](../functions/index.js#L850)) |
| `ANTHROPIC_API_KEY` server-only | ✅ | `defineSecret("ANTHROPIC_API_KEY")` ([index.js:7](../functions/index.js#L7)); no `sk-ant-` literal anywhere in `src/`, `dist/`, or functions (grep clean) |
| Per-user rate limit | ✅ | `checkAndIncrementOracleLimit(uid)` — transaction-serialized UTC-day counter, shared pool, increments BEFORE the Anthropic call so failed calls still cost a slot ([rateLimit.js](../functions/rateLimit.js)) |
| No client-supplied raw system prompt | ✅ | `customSystemPrompt` rejected; per-call variation only via server-side `promptContextKey` registry ([index.js:38-82,115-120](../functions/index.js#L38)) |
| User-authored context treated as data, not instructions | ✅ | guillemet-wrapped, newline-stripped, length+count-clamped ([index.js:306-311](../functions/index.js#L306)) |
| Admin-SDK writes scoped to caller uid | ✅ | rate-limit counter path is `users/${uid}/_rateLimits/...`; deletion is uid-filtered; no request parameter can steer either to another user's path |

**One observation, not a blocker:** App Check is not enabled, so the callable endpoints accept any authenticated user's calls without attesting the caller is the real app. The per-user daily cap bounds abuse cost. Listed as Medium in §6.

---

## 4. Test Matrix Results

**Suite:** [rules-tests/firestore.rules.test.mjs](../rules-tests/firestore.rules.test.mjs) — `@firebase/rules-unit-testing@5` + `node:test` against the Firestore emulator.
**Command:** `npm run test:rules` (wraps `firebase emulators:exec --only firestore`).
**Coverage per collection:** unauth read/write denied; owner read/create(own uid)/update/delete/list allowed; non-owner read/update/delete/spoof-create/cross-user-query denied; userId-immutability on update; missing-userId rejected; unfiltered list rejected; doc-id collections reject enumeration; admin-only namespaces reject all client access; default-deny floor rejects removed/unknown collections.

```
ℹ tests 288
ℹ suites 21
ℹ pass 288
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 9144.1642
+  Script exited successfully (code 0)
```

Every one of the 15 userId-field collections, both doc-id==uid collections, the two locked admin namespaces, the biometrics cache, and the default-deny floor passed the full matrix. The recurring emulator trace `... false for 'create' @ L268` confirms the explicit floor is the terminal backstop on every denied write.

**Re-run forever:** `npm run test:rules` is wired into [package.json](../package.json) and should be added to the pre-deploy checklist. (Requires Java on PATH — the emulator is a JVM app.)

---

## 5. Deploy Commands & Post-Deploy Live Verification

**Bo runs these — not done in this pass.**

### Deploy
```bash
# 1. Prove rules still pass locally (Java/JDK must be on PATH)
npm run test:rules

# 2. Deploy ONLY the rules first (smallest blast radius)
firebase deploy --only firestore:rules --project inner-ops-8ce36

# 3. Deploy indexes separately (never bundle indexes with functions in one --only)
firebase deploy --only firestore:indexes --project inner-ops-8ce36

# 4. Functions — no code changed this pass, but confirm the secret is set first
firebase functions:secrets:set ANTHROPIC_API_KEY --project inner-ops-8ce36   # only if not already set
firebase deploy --only functions --project inner-ops-8ce36
```

### Post-deploy live verification (do NOT trust deploy success alone)
1. **Authenticated cross-user read** — sign in as test account A, capture a journalEntries doc id. Sign in as test account B in a second session and attempt `getDoc(journalEntries/<A's docId>)`. Expect `permission-denied`.
2. **Unauthenticated REST probe** — against a known doc path, signed out:
   ```bash
   curl "https://firestore.googleapis.com/v1/projects/inner-ops-8ce36/databases/(default)/documents/journalEntries/<docId>"
   ```
   Expect HTTP 403 `PERMISSION_DENIED`.
3. **Oracle unauth probe** — call the `oracle` callable without an auth token; expect `unauthenticated`.
4. **Functions runtime check** (per project convention — deploy success ≠ runtime success):
   ```bash
   firebase functions:log --only oracle --project inner-ops-8ce36
   ```
   Confirm a real authenticated invocation returns 200 and the rate-limit counter increments.

---

## 6. Residual Risks (found, NOT fixed this pass)

| # | Risk | Severity | Remediation |
|---|---|---|---|
| 1 | **App Check absent.** Callable functions accept any authenticated client; no attestation that calls originate from the real app. | Medium | Enable App Check (reCAPTCHA Enterprise / Play Integrity / DeviceCheck) and enforce on callables. ~0.5 day. |
| 2 | **No schema/field validation in rules.** Rules enforce ownership + userId immutability but not field types/shapes/sizes. A malicious owner can write malformed docs into their own space. | Low | Add per-collection `request.resource.data` field validation as a hardening follow-up. Functions already clamp Oracle inputs. |
| 3 | **`isAnonymous` field still written** by `writeData`/`updateData`. Harmless today (anon auth is dev-only, dead-code-eliminated in prod) but it's vestigial. | Low | Drop the field when the dev-only anon path is removed entirely. |
| 4 | **Rate-limit counter cleanup not automated.** `_rateLimits` docs accumulate one per user per UTC-day. | Low | Scheduled CF to delete `oracle_<dayKey>` docs older than N days (already noted in rateLimit.js header). |
| 5 | **Email deliverability** — default Firebase sender lands in Gmail spam; verification/reset emails affected. | Medium (pre-launch) | Configure custom SMTP (SendGrid/Postmark/Resend) with SPF/DKIM before public launch (already in CLAUDE.md pre-deploy checklist). Not a rules issue. |
| 6 | **`test:rules` needs Java.** CI/pre-deploy must have a JDK on PATH or the proof can't run. | Low | Document JDK as a dev/CI prerequisite; or run the emulator in a container that bundles Java. |

---

## 7. Acceptance Checklist

- [x] Default-deny floor in place (explicit `match /{document=**}` + Firestore's implicit deny).
- [x] Owner-only access proven by automated matrix for **every** collection (288 tests, 0 fail).
- [x] Non-owner / spoofed-userId / userId-rekey / cross-user-query / enumeration cases all denied.
- [x] Unauthenticated clients can read/write nothing.
- [x] Oracle proxy + follow-up + deleteUserData reject unauthenticated callers; uid from verified token only.
- [x] `ANTHROPIC_API_KEY` server-side only; no key leaked in client bundle or source.
- [x] `npm run test:rules` is a permanent one-command proof.
- [x] **Nothing deployed.** Deploy + live-verification steps handed to Bo above.
