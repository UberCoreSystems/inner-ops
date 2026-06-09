# Inner Ops — Pre-Ship Review (Code / Security / Release Engineering) — 2026-06-08

> Scope: stability, correctness, data integrity, performance, security, accessibility, build readiness.
> Product strategy / positioning / UX copy are **out of scope** (separate review).
> Every finding carries a `file:line` receipt and a label: **[VERIFIED]** (read/ran and confirmed), **[INFERRED]** (reasoned, not executed), **[VERIFIED-EXTERNAL]** (confirmed against an external source).
> This is a *fresh* report; the prior `audit/PRE_SHIP_REVIEW.md` (2026-04-24) is left untouched. Several of its findings are now stale — see §F "Corrections to the prior report."

---

## A. Executive Summary

**Verdict: YES WITH FIXES.** Shippable as a **closed beta**. **Not** ready for unrestricted public launch until the privacy/data-erasure gap (C-1, C-2) and the kill-ledger data-integrity bug (C-3) are fixed.

What is solid (all [VERIFIED]):
- **Build is clean** — `vite build` exits 0, 438 modules, only two cosmetic dynamic-import warnings ([appendix](#appendix)).
- **Tests pass 299/299**, **lint clean** (`--max-warnings 0` passes).
- **Dev server boots clean** — ready in 365 ms, serves `HTTP 200`.
- **No AI key reaches the client** — Anthropic key is a server-side Firebase secret; all calls proxy through the `oracle` Cloud Function. `functions/index.js:7,149,241`.
- **No secret was ever committed to git** — full-history scan clean; only `.env.example` placeholders were ever tracked.
- **Firestore rules are default-deny, owner-gated** — static analysis found no cross-user read/write path. (Note: the live emulator probe could **not** be run — no JDK on host — so rule-isolation claims are rigorous **[INFERRED]**, not emulator-**[VERIFIED]**; see §E and "Verification limits.")

What holds it back from a clean "YES":
- **No privacy notice and no account/data deletion** for highly sensitive relapse/journal data (C-1, C-2). A trust and likely legal gate for public launch.
- **One genuine data-integrity bug**: the kill-confirmation path does a non-atomic write-then-delete with no re-entry guard, which can duplicate the kill ledger that feeds Clarity Score and Synthesis (C-3).
- **Unbounded Firestore reads** — every page pulls full lifetime history; pre-deploy is the correct, cheap moment to add `limit()` (C-4).

There are **no true BLOCKERs** by the severity rubric (nothing ships broken, loses/leaks data on day one, exposes a secret, or fails to build). The tempting candidates and why each is not a blocker are listed in §B.

| Severity | Count |
|---|---|
| Blocker | 0 |
| High | 4 |
| Medium | 13 |
| Low | 12 |

**Launch confidence: 7/10** for closed beta · ~5/10 for unrestricted public launch (rationale in §H).

---

## B. Critical Blockers (must fix before launch)

**None.** Stating this honestly rather than inflating severity. The three items most likely to be mistaken for blockers, and why they aren't:

- **Unbounded Firestore reads** (C-4) — degrades over time as data accumulates; on day one with small datasets it neither breaks nor corrupts. → **High**, not blocker.
- **No privacy policy / account deletion** (C-1, C-2) — a launch *gate for public sharing*, not a runtime defect. The rubric maps "fix before public sharing" to **High**.
- **Rate-limit doc mismatch** (D-1) — production allows 100/day vs the documented 20/day; it's a calibration/documentation error, not breakage. → **Medium**.

---

## C. High Priority (fix before public sharing)

### C-1. No privacy notice / data-handling disclosure anywhere — [VERIFIED]
Receipt: app-wide grep for `privacy|consent|GDPR|data-handling` in `src/` returns zero matches; `src/pages/Onboarding.jsx` collects triggers/sobriety context with no disclosure; no `/privacy` or `/terms` route in `src/App.jsx:303-307`.
Why it matters: users entering addiction/relapse and intimate journal data are given no statement of what is stored, where, who can access it, or that journal text is sent to Anthropic for Oracle feedback. Baseline trust + likely GDPR/CCPA requirement before public launch.

### C-2. No account deletion and no data export (right-to-erasure gap) — [VERIFIED]
Receipt: `src/pages/Settings.jsx:1-306` offers only notification toggles, briefing replay, and personal-context editing; grep for `deleteUser|deleteAccount|export` in `src/` finds nothing. Per-entry delete exists (`src/utils/firebaseUtils.js:95-100`, `src/utils/archiveUtils.js:24-100`) but there is no bulk wipe, account deletion, or export.
Why it matters: for this data class, erasure + portability are baseline. Absence is a material privacy gap.

### C-3. Kill-confirmation path: non-atomic write+delete with no re-entry guard → duplicate kill ledger / streak corruption — [VERIFIED]
Receipt: `src/pages/KillList.jsx:781-843`. The same-day guard at `:786` reads `target.lastCheckIn === today` from `targetsRef.current`, which is only updated *after* the async writes complete (`:823,827`). There is **no synchronous `useRef` re-entry guard** (unlike `addTarget` at `:600-601`). On the kill branch, `:820-821` runs `writeData('confirmedKills', …)` then `deleteData('killTargets', …)` as two **non-transactional** ops. A rapid double-tap of "Held the line" can: (a) both pass the stale `lastCheckIn` guard, (b) write **two** `confirmedKills` docs (duplicate kill record), or (c) double-increment the streak.
Why it matters: `confirmedKills` and `streak` feed Clarity Score and Synthesis. CLAUDE.md explicitly requires Clarity Score not be gameable; duplicate/inflated kills violate that. `dailyCheckIn` and `submitAutopsy` (`:846`) both lack the `submittingRef` guard that every other create handler has.

### C-4. Unbounded Firestore reads — every page pulls full lifetime history (no `limit()` / pagination) — [VERIFIED]
Receipt: `src/utils/firebaseUtils.js:128-161` (`readUserData`) and `:178-232` (`subscribeToUserData`) issue `query(colRef, where("userId","==",uid))` with no `limit()`, `orderBy`, or cursor, then sort client-side (`:157`). Fan-out: Dashboard runs 5 full-collection reads per mount and uses only `.slice(0,3)` (`src/pages/Dashboard.jsx:196-214,253-255`); Journal loads all entries (`src/pages/Journal.jsx:540`); RelapseRadar reads all killTargets + relapseEntries (`src/components/RelapseRadar.jsx:146,215`). `src/components/VirtualizedList.jsx` is built but imported nowhere, while Journal (`:1398`) and KillList (`:2262`) render the full unsliced list.
Why it matters: read cost, parse, and client sort are all O(n) in lifetime history. CLAUDE.md notes pre-deploy is when "aggressive changes are safe" — adding `limit()` + `orderBy('timestamp','desc')` now (with the matching composite index) is the highest-leverage, lowest-risk fix, and `VirtualizedList` is the matching render-side mitigation.

---

## D. Medium Priority (fix shortly after launch)

### D-1. Rate-limit documented as 20/day but production allows 100/day; one journal save ≈ 5 Oracle calls — [VERIFIED]
Receipt: `functions/.env:10` `ORACLE_DAILY_LIMIT=100`; code default `functions/rateLimit.js:35` = 50; CLAUDE.md + function table say "20/day". Both `oracle` and `oracleFollowUp` share the counter (`functions/index.js:127,224`), and one journal save fires 1 classifier + up to 3 extractors via `src/utils/crossModuleExtraction.js:89-135` plus the feedback call — ~5 increments. At 100/day this is not a lockout risk (~20 saves/day), so the *real* defect is the **documentation being wrong by 5×**. Reconcile CLAUDE.md to 100 (or set the intended value explicitly) so the stated security property is true.

### D-2. `shadow-oura-glow-sm` is an undefined Tailwind token — hover shadow silently dead — [VERIFIED]
Receipt: `src/components/RelapseRadar.jsx:1193` uses `hover:shadow-oura-glow-sm`; `tailwind.config.js:44-50` defines only `oura-glow-cyan|blue|purple` (no `-sm`), and it's not in `index.css`. The intended hover effect renders nothing. (This is the *real* "silently broken styling" bug the 2026-04-24 report was reaching for — it mis-named the token; see §F.)

### D-3. UTC vs local date-key divergence across ~9 sites → cross-module "today" mismatch — [VERIFIED]
Receipt: canonical local helper `localDateKey()` exists at `src/utils/dailyBrief.js:54-59` (uses `getFullYear/Month/Date`), but many sites inline UTC `new Date().toISOString().slice(0,10)`: `src/hooks/useKillTargets.js:28-29`, `src/pages/KillList.jsx:194,204,232,255,471,1869`, `src/pages/HardLessons.jsx:384,389`, `src/utils/detectDriftSignals.js:36`, `src/pages/Dashboard.jsx:90`. For users west of UTC after evening local time, the UTC key rolls to "tomorrow" while local logic stays "today," so "is this from today?" checks disagree across modules. Consolidate onto the local helper.

### D-4. Scar Inventory submit has no synchronous re-entry guard → duplicate scar stubs — [VERIFIED]
Receipt: `src/pages/HardLessons.jsx:211-244`. `submitScarInventory` gates only on async `setSavingScars(true)` (`:215`); a fast double-click before re-render runs the write loop (`:219`) twice. No `useRef` set synchronously at entry, unlike sibling handlers. First-run-only flow, so blast radius is small.

### D-5. Relapse entries allow empty content (`reflection` never required) → inflated metrics — [VERIFIED]
Receipt: `src/components/RelapseRadar.jsx:440-497,942-974,1078-1084`. Step 2's `!selectedSelf` guard only blocks advancing past step 2; `reflection` is never required at submit; a relapse bridges to Hard Lessons with `eventDescription: reflection || ''` (`:516`). Empty-content records inflate `daysSinceLastRelapse`, archetype frequency, and Synthesis signal delta. (Kill List `:604,616` and Hard Lessons `:543-577` *do* validate — Relapse is the gap.)

### D-6. KillList "Target Name" input has no associated label — [VERIFIED]
Receipt: `src/pages/KillList.jsx:1932-1943` — `<label>` lacks `htmlFor`; `<input>` lacks `id`/`aria-label`. The module's primary creation field is unlabeled for screen readers. (Journal's textarea is correctly wired: `Journal.jsx:1152`.)

### D-7. EmergencyButton modal cannot be dismissed with Escape — [VERIFIED]
Receipt: `src/components/EmergencyButton.jsx:139` has `role="dialog"`/`aria-modal` and a working focus trap (`:48`) but no Escape keydown handler, unlike OracleModal (`OracleModal.jsx:228-233`). On the highest-stakes surface, keyboard users can't dismiss.

### D-8. KillClosureModal: Escape inert during the form-fill phase — [VERIFIED]
Receipt: `src/components/KillClosureModal.jsx:74` — `if (e.key === 'Escape' && oraclePhase !== 'idle')`. Esc does nothing while typing the closure. Partly intentional (don't lose input) but inconsistent with other modals.

### D-9. Relapse wizard toggle grids lack `aria-pressed` / group semantics — [VERIFIED]
Receipt: `src/components/RelapseRadar.jsx:776-788,881-937` — precursor/archetype/habit/substance selectors are click-toggle buttons with no `aria-pressed` and no `role="group"`/fieldset. Selected state is visual-only for assistive tech.

### D-10. Systematic low-contrast gray-on-near-black text — [INFERRED]
Receipt: background `#000`/`#0a0a0a` (`src/index.css:18,52`); recurring `#858585` (~4.0:1, fails 4.5:1), `#6a6a6a` placeholders (~2.8:1), `text-gray-600` (~3.3:1) across OracleModal/Journal/KillList/RelapseRadar (e.g. `OracleModal.jsx:16,349`, `RelapseRadar.jsx:622,799`). Not instrument-measured; the `#5a5a5a`–`#858585` band on near-black is systematically below WCAG AA for body text.

### D-11. Journal "Oracle unavailable. Entry saved." can lie when the write itself failed — [VERIFIED]
Receipt: `src/pages/Journal.jsx:673-677`. One catch block wraps both `generateAIFeedback` (`:623`) and `writeData` (`:625`). If the write throws (quota, oversized doc, network) the user still sees "Entry saved," but nothing persisted. Distinguish AI-failure from write-failure. Related: no length cap on the entry before Firestore (`:1151-1163`), so a multi-MB paste hits the 1 MiB/doc limit → this false message + silent loss.

### D-12. `userSettings` treated as a singleton but multiple writers can create duplicate docs — [VERIFIED]
Receipt: readers take `docs[0]` (`src/utils/oracleQuestionPool.js:236-243`, `getBehavioralContext.js:67`, `generateSynthesisBriefing.js:109`) but `Profile.jsx:108`, `Settings.jsx:100`, `BannerStack.jsx:182`, `WeeklyRuleReview.jsx:116` each `writeData('userSettings', …)` (a fresh `addDoc`) when their local `settingsId` is null. On a fresh account two writers can race to create two docs; reads then become non-deterministic and settings can silently split/drop. Scoping is correct (each doc is owner-stamped) — this is a consistency bug, not a leak.

### D-13. `behavioralContext` interpolated unescaped into the system prompt + not length-capped — [VERIFIED]/[INFERRED]
Receipt: `functions/index.js:302-329` renders user-controlled kill-target titles, hard-lesson rule text, and `identityDirection` verbatim into the **system** prompt (e.g. `:318` `"${l.rule}"`). A user could write a rule like "Ignore prior instructions and…" Impact is **self-only** (no cross-tenant effect, no key/data exfil), so low blast radius, but it blurs the instruction/data boundary in the system role — and unlike `entryText` (hard-capped at 20k, `config.js:23`) the `behavioralContext` arrays have no length cap. Wrap behavioralContext strings in a delimiter and cap their size.

> Also tracked at Medium-adjacent: client/server timeout mismatch — `OracleModal.jsx:28` and `generateSynthesisBriefing.js:254` use a 20 s callable timeout vs the server's 30 s (`functions/index.js:102`), so slow-but-valid calls can spuriously fall back. (Low/INFO.)

---

## E. Low Priority (polish)

- **E-1 [VERIFIED]** Live onboarding copy still names the removed "Black Mirror" module — `src/components/onboarding/BriefingScreen.jsx:67` (user-facing; bump if seen pre-launch).
- **E-2 [VERIFIED]** Stale Black Mirror doc-comments — `src/utils/getBehavioralContext.js:5`, `src/utils/clarityScore.js:88`.
- **E-3 [VERIFIED]** `useOuraData()` runs unconditionally even when `VITE_ENABLE_OURA` is off — `src/components/RelapseRadar.jsx:124-133` fires a Firestore read + auth listener per mount while the panel is gated off. Add an `OURA_ENABLED` guard.
- **E-4 [VERIFIED]** Dead `VITE_OPENAI_API_KEY` placeholder comment — `.env:12`, `.env.production:12`. Remove (no value, but confusing given the app uses Claude).
- **E-5 [VERIFIED]** Emergency FAB has `title` but no `aria-label`; grounding-technique tiles are clickable `<div>`s, not keyboard-focusable buttons — `src/components/EmergencyButton.jsx:126-129,208-211`.
- **E-6 [VERIFIED]** `useBreathing` phase timing is `setTimeout`-driven and ignores `prefers-reduced-motion` (the CSS visual transition is suppressed, the phase cycle still runs) — `src/hooks/useBreathing.js:25-37`. The global reduced-motion guard at `index.css:284-293` covers all CSS animation otherwise (good).
- **E-7 [VERIFIED]** Mobile nav hardcoded to `grid-cols-6` with a stale "dynamic 5/6/7" comment (dead since Black Mirror removal) — `src/components/Navbar.jsx:84-85`. Six 9px-label cells at 360px are cramped but functional.
- **E-8 [VERIFIED]** Positional `key={i}` on prepend-mutated lists forces remounts — `src/pages/Journal.jsx:984`, `src/pages/KillList.jsx:1877`. (Main lists correctly use `key={entry.id}`.)
- **E-9 [VERIFIED]** Optimistic local prepend uses a client `new Date()` while Firestore stores `serverTimestamp()` — `Journal.jsx:639-640`, `RelapseRadar.jsx:499-500`. Cosmetic reorder on refresh under clock skew; not a lost write.
- **E-10 [VERIFIED]** Build emits 2 dynamic-import warnings (`clarityScore.js`, `firebase.js` statically+dynamically imported) and a `firebase-firestore` chunk of ~434 KB (gzip 106 KB) loaded pre-paint — architectural, hard to defer given real-time listeners are core. Pages are correctly `React.lazy`-split (`App.jsx:29-40`).
- **E-11 [VERIFIED]** `killTargets` composite index in `firestore.indexes.json:3-20` is dead config — no live query uses that ordering (queries dropped `orderBy` per `useKillTargets.js:48`). Harmless.
- **E-12 [VERIFIED/INFO]** Rate-limit counter increments *before* the Claude call (`functions/rateLimit.js:46-68`), so a transient upstream 5xx consumes a slot with no refund. Deliberate anti-abuse tradeoff; noted for awareness.

---

## F. File-by-File Findings & Corrections to the Prior Report (2026-04-24)

Three findings in the prior `audit/PRE_SHIP_REVIEW.md` are now **invalid** — verify before acting on that document:

| Prior claim (2026-04-24) | Status now | Receipt |
|---|---|---|
| "No catch-all `<Route path="*">` fallback" | **FIXED** — catch-all present | `src/App.jsx:303-307` |
| "`bg-oura-darker` Tailwind token is undefined" | **FALSE** — it *is* defined | `tailwind.config.js:14` (`darker: '#050505'`). The real undefined token is `shadow-oura-glow-sm` (D-2). |
| "`/hard-lessons` broken link" | Verify against current `KillList.jsx` | route is `/hardlessons`; recheck the cited link still exists |
| Journal `loadError` "may be set but never rendered" (raised this pass) | **NOT a bug** — fully wired | error + Retry UI at `src/pages/Journal.jsx:1386-1395` |

Confirmed-safe paths (receipts), so they are *not* re-flagged:
- Double-submit guards on Journal (`Journal.jsx:579`), Relapse wizard (`RelapseRadar.jsx:441`), Kill List add (`KillList.jsx:600`), Hard Lessons lesson (`HardLessons.jsx:659`), Synthesis (server 1-hr cooldown, `generateSynthesisBriefing.js:79-84`) — **all present**. The gaps are specifically `dailyCheckIn`/`submitAutopsy` (C-3) and `submitScarInventory` (D-4).
- Kill List add no longer double-counts via optimistic+snapshot — `KillList.jsx:692-695`.
- Canonical doc-id handling (path id wins over stale field) — `firebaseUtils.js:142-153,207-218`.
- Every read filters by `userId`; every write stamps `userId:user.uid` — `firebaseUtils.js:139,191,41-46,76-81`.
- userProfiles/dailyBriefs doc-id models used consistently — `userProfile.js:9`, `dailyBrief.js:61,451-457`.
- Archive writes preserve `userId` — `archiveUtils.js:31-40,61-71`.
- Oura OAuth uses PKCE with **no** client secret client-side — `ouraService.js:35-97`.
- Analytics carries no entry text or email — `analytics.js:29,45-59`, `App.jsx:89-90`.
- Model id `claude-sonnet-4-6` is valid/current — `functions/index.js:160,245` **[VERIFIED-EXTERNAL]** against the Claude model catalog.

---

## G. Recommended Patches (DO NOT APPLY — proposals only)

### G-1 → C-3: make kill-confirmation atomic + add re-entry guard
Numbered steps (safest fix):
1. Add a synchronous ref at the top of `dailyCheckIn`, mirroring `addTarget`:
   ```diff
   // src/pages/KillList.jsx — near other refs
   + const checkingInRef = useRef(new Set());
   ```
   ```diff
     const dailyCheckIn = useCallback(async (targetId, held, note = '') => {
   +   if (checkingInRef.current.has(targetId)) return;
   +   checkingInRef.current.add(targetId);
       try {
         const target = targetsRef.current.find(t => t.id === targetId);
         if (!target) return;
   @@
       } catch (error) {
         logger.error('Error during check-in:', error);
         if (redirectIfAuthLost(error)) return;
         ouraToast.error('Check-in failed. Please try again.');
   +   } finally {
   +     checkingInRef.current.delete(targetId);
       }
     }, []);
   ```
2. Make the kill branch atomic — replace the separate `writeData`+`deleteData` (`:820-821`) with a Firestore `writeBatch` (or `runTransaction`) so the create+delete commit together. Sketch:
   ```diff
   - await writeData('confirmedKills', { ...targetFields, ...targetUpdate, killedAt, activeDuration });
   - await deleteData('killTargets', targetId);
   + const db = await getDb();
   + const batch = writeBatch(db);
   + const killRef = doc(collection(db, 'confirmedKills'));
   + batch.set(killRef, { ...targetFields, ...targetUpdate, userId: user.uid, killedAt, activeDuration, timestamp: serverTimestamp() });
   + batch.delete(doc(db, 'killTargets', targetId));
   + await batch.commit();
   ```
   (Mirror the `userId` stamping `writeData` does; confirm `confirmedKills` create rule `firestore.rules:132-137` passes with the explicit `userId`.)
3. Apply the same `submittingRef` pattern to `submitAutopsy` (`:846`).

### G-2 → C-4: bound the read layer
Numbered steps:
1. Add an options arg to `readUserData`/`subscribeToUserData` (`firebaseUtils.js:128,178`) accepting `{ limit, orderByField = 'timestamp', direction = 'desc' }`; build the query with `query(colRef, where(...), orderBy(orderByField, direction), limit(n))`.
2. Default callers that only show recent data (Dashboard, Journal first page) to `limit(50)` + a "load more" cursor; keep aggregate utils (getBehavioralContext, Synthesis) on explicit windows.
3. Add the matching composite indexes to `firestore.indexes.json` (`userId ASC, timestamp DESC` per collection) and deploy them.
4. Wire `VirtualizedList` (`src/components/VirtualizedList.jsx`) into Journal (`:1398`) and KillList (`:2262`) render paths.
> Pre-deploy is the right window (CLAUDE.md: "aggressive changes are safe"). Treat as one focused change with its own QA pass.

### G-3 → C-1 / C-2: privacy + erasure (product-gated)
1. Add a privacy/data-handling statement: what's stored, that journal text is sent to Anthropic for Oracle feedback, retention, and access. Surface it in onboarding (consent) + a `/privacy` route + Settings link.
2. Add "Delete account & all data" in Settings: re-authenticate, batch-delete every `where('userId','==',uid)` collection (+ archives, `userProfiles/{uid}`, `dailyBriefs`), then `deleteUser`. Add a "Export my data" (JSON of the same collections).
> These are product/legal decisions — surface for Bo, not an agent auto-fix.

### G-4 → D-1: reconcile the rate-limit documentation
```diff
- | `oracle` | Secure Claude API proxy. Auth-gated, rate-limited (20/day). ...
+ | `oracle` | Secure Claude API proxy. Auth-gated, rate-limited (ORACLE_DAILY_LIMIT, prod=100/day; ~5 calls per journal save). ...
```
(`CLAUDE.md` Cloud Functions table. Or lower `functions/.env:10` to the intended cap — a product call.)

### G-5 → D-2: fix or remove the dead shadow token
```diff
- className="... hover:shadow-oura-glow-sm ..."   // src/components/RelapseRadar.jsx:1193
+ className="... hover:shadow-oura-glow-cyan ..."
```
(or add `'oura-glow-sm'` to `boxShadow` in `tailwind.config.js:44-50`.)

### G-6 → D-5: require relapse content before write
In `src/components/RelapseRadar.jsx` submit (`:440-497`), gate on `selectedSelf` and a non-empty trimmed `reflection` before `writeData`; disable the step-5 Submit button until satisfied (mirror `KillList.jsx:604,616`).

### G-7 → D-6 / D-7: quick a11y fixes
```diff
- <label className="...">Target Name</label>           // KillList.jsx:1932
- <input ... />                                          // KillList.jsx:1939
+ <label htmlFor="kill-target-name" className="...">Target Name</label>
+ <input id="kill-target-name" ... />
```
```diff
// EmergencyButton.jsx — add Escape handler mirroring OracleModal.jsx:228-233
+ useEffect(() => {
+   if (!open) return;
+   const onKey = (e) => { if (e.key === 'Escape') onClose(); };
+   window.addEventListener('keydown', onKey);
+   return () => window.removeEventListener('keydown', onKey);
+ }, [open, onClose]);
```

---

## H. Launch Confidence Score

**7 / 10 (closed beta) — ~5 / 10 (unrestricted public launch).**

Rationale, tied to §B/§C:
- **+** Clean build, 299/299 tests, clean lint, clean dev boot, no client key exposure, no committed secrets, sound owner-gated rules, correct double-submit guards on the main create paths, code-splitting + reduced-motion handled. These are the things that usually sink a launch, and they're solid.
- **−2 (to 8→...)** for the privacy/erasure gap (C-1, C-2): acceptable to defer for a *closed* beta with warned testers, disqualifying for *public* launch.
- **−1** for the kill-ledger data-integrity bug (C-3): narrow trigger (double-tap) but corrupts a score CLAUDE.md requires be non-gameable.
- **−1 latent** for unbounded reads (C-4): invisible at small scale, the cheapest possible fix now, and a guaranteed problem later.
- The Medium band (a11y labels/Escape/contrast, rate-limit docs, date-key drift, dead style token) is real but none of it blocks a careful beta.

Net: ship a **closed beta** after C-3 (and ideally C-4 while changes are cheap); treat C-1/C-2 as the gate that converts beta → public.

---

## Verification limits (honesty notes)

- **Emulator rule probe NOT executed** — the Firestore emulator is a Java process and **no JDK is installed on the host** (`java` absent; no JDK in common install paths; no `emulators` block in `firebase.json`). Cross-user isolation is therefore **[INFERRED]** from a full static read of `firestore.rules` + every call site, not emulator-proven. To promote to [VERIFIED]: install a JDK, add an emulator block, and run a two-account `@firebase/rules-unit-testing` probe (B reads/writes A's docs across every owner-gated collection).
- **In-browser runtime console NOT captured** — the dev server boots clean (HTTP 200) but there is no local browser-driver available in this environment to capture first-render console across the authenticated flows; runtime-render claims that weren't reproduced statically are labeled **[INFERRED]**.
- All build/test/lint/dev-boot results are **[VERIFIED]** (run this session; raw output below).

---

## Appendix — Raw build / test / lint / boot output

### `npm test` (node:test)
```
ℹ tests 299
ℹ suites 64
ℹ pass 299
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 747.8446
```

### `npm run lint` (eslint . --ext .js,.jsx --report-unused-disable-directives --max-warnings 0)
```
> inner-ops@1.0.0 lint
> eslint . --ext .js,.jsx --report-unused-disable-directives --max-warnings 0
(no output — exit 0, zero warnings/errors)
```

### `npm run build` (vite build) — exit 0
```
vite v5.4.21 building for production...
✓ 438 modules transformed.

(!) src/utils/clarityScore.js is dynamically imported by src/utils/dailyBrief.js but also
    statically imported by SignalReport.jsx, Dashboard.jsx — dynamic import will not move
    module into another chunk.
(!) src/firebase.js is dynamically imported by App.jsx, dailyBrief.js but also statically
    imported by App.jsx, KillListDashboard.jsx, RelapseRadar.jsx, useKillTargets.js,
    useOuraData.js, SynthesisBriefing.jsx, archiveUtils.js, authService.js, firebaseUtils.js,
    ouraService.js, userProfile.js — dynamic import will not move module into another chunk.

dist/assets/index-*.css                 61.15 kB │ gzip:  10.40 kB
dist/assets/SynthesisBriefing-*.js      12.18 kB │ gzip:   3.79 kB
dist/assets/Relapse-*.js                40.19 kB │ gzip:  11.40 kB
dist/assets/Journal-*.js                47.01 kB │ gzip:  13.23 kB
dist/assets/HardLessons-*.js            54.02 kB │ gzip:  12.71 kB
dist/assets/KillList-*.js               78.73 kB │ gzip:  19.62 kB
dist/assets/Dashboard-*.js             100.87 kB │ gzip:  28.16 kB
dist/assets/index-*.js                 140.45 kB │ gzip:  44.54 kB
dist/assets/vendor-react-*.js          182.71 kB │ gzip:  60.23 kB
dist/assets/firebase-auth-*.js         231.80 kB │ gzip:  48.92 kB
dist/assets/firebase-firestore-*.js    434.60 kB │ gzip: 106.30 kB

(!) Some chunks are larger than 100 kB after minification.
✓ built in 9.82s

PWA v0.20.5 — generateSW — precache 38 entries (1443.53 KiB) — dist/sw.js, dist/workbox-*.js
```

### `npm run dev` (vite) — clean boot
```
VITE v5.4.21  ready in 365 ms
➜  Local:   http://localhost:5177/   (5173–5176 were already in use)
HTTP probe: HTTP 200
<title>Inner Ops - Clarity Over Comfort</title>
```
