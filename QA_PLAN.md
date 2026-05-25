# Inner Ops — Pre-Ship Manual QA Plan

**Purpose:** First-user shakedown of every v1 feature before deploy. Bo runs the app; Claude tracks issues and fixes them in-session.

**Scope:** Journaling · Kill List · Hard Lessons · Relapse Radar · Synthesis · Dashboard · Auth · Cloud Functions · Mobile parity · Firestore rules.

**Out of scope:** Black Mirror (deferred; verify gated off only).

---

## How we'll run this

1. **One module at a time.** Don't jump around — each module has dependencies on prior data (e.g., Synthesis needs Journal + Kill List + Hard Lessons data first).
2. **Test in this order** so cross-module data flows naturally:
   `Auth → Journal → Kill List → Hard Lessons → Relapse Radar → Dashboard → Synthesis → Cloud Functions → Mobile sweep → Pre-deploy gates`
3. **For each step:** check the box if it works as described. If it doesn't, paste the symptom into chat — Claude diagnoses, fixes it in-session, and we resume the plan.
4. **Test on real Firebase project**, not emulators. We need production rules + production Cloud Functions exercised.
5. **Run desktop pass first**, then a focused mobile pass at the end (Section 9). Don't switch back and forth mid-module.
6. **Have devtools open.** Network tab for Cloud Function calls, Console for errors. Flag any red console errors even if the UI looks fine.

**Severity labels for issues:**
- 🔴 **Blocker** — broken core flow, data loss risk, security issue. Must fix before ship.
- 🟡 **Quality** — works but feels wrong (copy, layout, latency). Fix before ship if quick.
- 🔵 **Polish** — nice to have. Log and defer.

---

## Section 0 — Pre-flight

- [ ] `npm run build` completes clean — no warnings beyond Vite's expected output
- [ ] `npm test` — all node:test suites pass (aiFeedback, clarityScore, dailyBrief, oracleQuestionExtractor, dateUtils, detectDriftSignals, getBehavioralContext, generateSynthesisBriefing)
- [ ] `.env` has production Firebase config + `VITE_ENABLE_BLACK_MIRROR=false` (or unset)
- [ ] Firebase Functions has `ANTHROPIC_API_KEY` secret set
- [ ] Firestore rules deployed and current (`firebase deploy --only firestore:rules`)
- [ ] Cloud Functions deployed (`firebase deploy --only functions`)
- [ ] **Verify Cloud Functions actually invoke** via `firebase functions:log` — deploy success ≠ runtime success. Make one real Oracle call from the app, then tail logs to confirm a 200 response

---

## Section 1 — Auth ([src/components/AuthForm.jsx](src/components/AuthForm.jsx))

### 1.1 Sign-up
- [ ] Email + password + display name → account creates, lands on Dashboard
- [ ] Email already in use → clear error message, form stays usable
- [ ] Password < 6 chars → Firebase rejection surfaces as readable error
- [ ] Password confirm mismatch → blocked before submit
- [ ] Display name empty → defaults to email prefix (verify in profile)
- [ ] Network drop mid-submit → no half-created account, retry works

### 1.2 Sign-in
- [ ] Valid creds → lands on Dashboard
- [ ] Wrong password → clear error
- [ ] Unknown email → clear error
- [ ] Forgot password → reset email sent, link works

### 1.3 Session
- [ ] Reload page while signed in → stays signed in (no flash to /auth)
- [ ] Sign out → redirected to /auth, can't navigate back to /dashboard via URL
- [ ] Open in second tab → both tabs sync auth state

### 1.4 Profile
- [ ] Edit display name → persists across reload
- [ ] Profile read works from [src/utils/authService.js](src/utils/authService.js)

---

## Section 2 — Journal ([src/pages/Journal.jsx](src/pages/Journal.jsx))

### 2.1 Create entry
- [ ] Type entry, pick mood category (Grounded/Energized/Challenged), pick specific mood (12 options), set intensity 1–5 → submit succeeds
- [ ] "When did this happen?" datetime picker accepts past times, blocks future
- [ ] Submit → Oracle feedback modal opens with real Claude response (not template)
- [ ] Oracle response includes closing question
- [ ] Voice input button transcribes and appends to entry (if browser supports)
- [ ] Dynamic AI insights tick under textarea as you type (~2s debounce)
- [ ] Rotating prompts cycle every ~3s; pause when textarea focused; tap prompt inserts it

### 2.2 Oracle feedback quality
- [ ] Feedback feels written for the entry, not generic
- [ ] **No wellness/motivational language** — challenge or grounding only (per CLAUDE.md)
- [ ] User can react (emoji buttons), reaction persists
- [ ] User can reply → oracleFollowUp generates second response that doesn't soften pushback
- [ ] Entry written 12h+ after the event → Oracle tone shifts to "reconstructed memory" (proximity flag)

### 2.3 List / search / mood calendar
- [ ] Past entries render in reverse-chronological order
- [ ] Search by content / mood label / category → filters correctly, empty result state shown
- [ ] 30-day mood calendar renders colors for days with entries; empty for days without
- [ ] Mood history mini-viz shows 5 most recent moods as dots

### 2.4 Edit / archive / restore
- [ ] Edit entry → content/mood/intensity update; Oracle feedback preserved
- [ ] Cancel edit → no changes saved
- [ ] Archive entry → disappears from main list
- [ ] Archive tab shows archived entries
- [ ] Restore from archive → reappears in main list
- [ ] Permanently delete → confirm modal, then doc gone from `journalEntriesArchive`

### 2.5 Cross-module extraction
- [ ] Entry classified after save → "Extract Lesson" / "Extract Kill Target" / "Extract Signal Precursor" cards appear when relevant
- [ ] Tap extraction card → prefilled form on destination module
- [ ] Dismiss extraction card → does not reappear for same entry
- [ ] Classification failure → retry button works
- [ ] Backfill: load page → up to 5 old unclassified entries (last 14d) get classified silently

### 2.6 Edge cases
- [ ] Very short entry (<50 words) → still submits, AI insights reflect length
- [ ] Very long entry → textarea grows, doesn't break layout
- [ ] Network drop during Oracle call → entry still saves, "Oracle unavailable" toast, retry available
- [ ] Submit twice rapidly → no duplicate entries (double-submit guard)
- [ ] **Console clean** — no errors during full flow

---

## Section 3 — Kill List ([src/pages/KillList.jsx](src/pages/KillList.jsx))

### 3.1 Create target
- [ ] Form requires: title, category (7 types), threshold (21–60+), implementation intention (When/I Will, each ≥20 chars)
- [ ] Duplicate title (active targets) → blocked with clear message
- [ ] Title > 60 chars → blocked
- [ ] Submit → target appears in list with streak 0
- [ ] Implementation intention example rotates on ↻ tap

### 3.2 Daily check-in: Held
- [ ] Tap "Held" → streak +1, progress bar advances toward threshold
- [ ] Streak hits threshold → target archives to `confirmedKills`, kill toast shows
- [ ] Cannot check-in twice on same calendar day (verify with double-tap)

### 3.3 Daily check-in: Escaped
- [ ] Tap "Escaped" → autopsy form opens
- [ ] Autopsy requires: context, rationalization, prevention plan, implementation intention activation
- [ ] Submit autopsy → **3s AVE circuit-breaker pause** before Oracle feedback (this is intentional)
- [ ] Oracle responds with confrontation on escape pattern; **does not soften**
- [ ] Oracle "Try different angle" → regenerates with different lens, no repetition
- [ ] After 3+ escapes on same target → autopsy pattern aggregation surfaces top tokens from prior contexts

### 3.4 Reactivate / re-contract
- [ ] Escaped target → "Reactivate" with optional new threshold (≥21)
- [ ] "Re-contract" → archives old target, prefills new form

### 3.5 Inline edits
- [ ] Edit title (≤60 chars) inline → persists
- [ ] Edit implementation intention → persists
- [ ] Reflection notes save/edit/persist

### 3.6 Backfill missed check-ins
- [ ] Gap of 2+ days → "Reconcile Gap" card appears
- [ ] "All held" → streak updates, may trigger archive
- [ ] "Log escape on day X" → autopsy prefilled with that date; held days before counted
- [ ] "Log each day individually" → step-through dialog, first escape stops progression

### 3.7 Archive / search / filter
- [ ] Archive → disappears from active list
- [ ] Restore → returns to active
- [ ] Permanent delete → confirm modal, gone
- [ ] Filter: all / active / escaped works
- [ ] Search by title works

### 3.8 Edge cases
- [ ] **Console clean** through full flow
- [ ] No duplicate writes when double-submitting
- [ ] **Streak not gameable** — try logging held twice in one day, backfilling future dates, etc.

---

## Section 4 — Hard Lessons ([src/pages/HardLessons.jsx](src/pages/HardLessons.jsx))

### 4.1 Scar Inventory (first visit)
- [ ] First visit with 0 lessons → 3 scar-stub inputs shown
- [ ] Save scar stubs → 3 draft lessons created, isScarStub=true
- [ ] If any stub is Oracle-extracted + unfinalized → auto-opens for completion on next mount

### 4.2 Create lesson manually
- [ ] All 7 required fields: event category (9 types), event description, my assumption, signal ignored, costs (multi-select 6 types), cost description, extracted lesson, rule going forward
- [ ] Progress bar (7 steps) turns green as fields complete
- [ ] Save as draft → editable later
- [ ] Finalize → locked immutable, rule added to library
- [ ] Try to edit finalized → blocked with info toast

### 4.3 Oracle extraction
- [ ] Event description ≥30 chars → "Ask Oracle to extract" button enabled
- [ ] Extraction populates: suggestedCategory, myAssumption, signalIgnored, costDescription, extractedLesson, ruleGoingForward, suggestedCosts
- [ ] Extraction failure → error toast, isOracleFailed flag set, warning in form, user can still fill manually

### 4.4 Rule violation detection
- [ ] Blur event description after typing → simple keyword match against finalized rules
- [ ] If similarity ≥ threshold → "This may violate rule: …" prompt shown
- [ ] "Mark rule broken" → adds entry to violations[] array on rule doc (1/day dedupe)
- [ ] Inline context note panel optional, saves with violation

### 4.5 Rules Library
- [ ] All finalized rules listed with violation count (legacy isRuleViolation docs + direct violations[] array summed)
- [ ] Filter by cost type, event category, search text
- [ ] Cost pattern narrative generation → AI summarizes aggregated pattern across rules
- [ ] Cost frequency chart renders correctly

### 4.6 Bridge to Kill List
- [ ] Finalize lesson with isRuleViolation → bridge prompt appears
- [ ] "Add to Ledger" → Kill List form prefilled with rule title + threshold (editable)
- [ ] Dismiss bridge → does not reappear for same lesson (sessionStorage)

### 4.7 Archive / restore
- [ ] Archive draft only (finalized blocked) → moves to `hardLessonsArchive`
- [ ] Restore → returns
- [ ] Permanent delete → confirm + gone

### 4.8 Edge cases
- [ ] **Finalized lesson immutability** — try every edit path (browser back, refresh mid-edit, etc.)
- [ ] **Console clean**

---

## Section 5 — Relapse Radar ([src/pages/Relapse.jsx](src/pages/Relapse.jsx))

### 5.1 Log entry
- [ ] Select archetype (dropdown), set intensity 1–5, add description, optional context notes → submit
- [ ] Date picker accepts past dates for backfill
- [ ] Entry appears in list with timestamp

### 5.2 Drift signals (from [src/utils/detectDriftSignals.js](src/utils/detectDriftSignals.js))
- [ ] Log 3+ entries with same archetype within 7 days → archetype-frequency warning card appears
- [ ] Repeat similar context across entries → precursor-recurrence card appears
- [ ] Log Kill List escape + Relapse entry within 48h → correlation card appears
- [ ] Dismiss card → does not reappear today
- [ ] Same card reappears next day (per-day sessionStorage dedupe)

### 5.3 Evasion markers (from [src/utils/detectEvasionMarkers.js](src/utils/detectEvasionMarkers.js))
- [ ] Behavioral evasion pattern triggers → marker card displays
- [ ] Dismiss works

### 5.4 Search / archive / restore
- [ ] Search by archetype, intensity, description → filters correctly
- [ ] Archive → removed from main list
- [ ] Restore works
- [ ] Permanent delete works

### 5.5 High-intensity styling
- [ ] Intensity 4–5 entries visually emphasized vs 1–3

---

## Section 6 — Dashboard ([src/pages/Dashboard.jsx](src/pages/Dashboard.jsx))

### 6.1 First load
- [ ] First-login user → onboarding gate blocks content
- [ ] Returning user → all sections render without crash
- [ ] Skeleton loaders show during data fetch

### 6.2 Signal Report
- [ ] Renders clarity score-adjacent metrics
- [ ] **Clarity score not gameable** — try farming fake relapses, dummy lessons; score should not jump (per [src/utils/clarityScore.js](src/utils/clarityScore.js))
- [ ] Behavioral record density renders entry-volume trend

### 6.3 Morning brief / DailyPrompt ([src/components/DailyPrompt.jsx](src/components/DailyPrompt.jsx))
- [ ] Prompt rotates daily
- [ ] "Journal This" → QuickJournalModal opens, prefilled
- [ ] Submit quick journal → daily prompt marked answered, entry appears in Journal list
- [ ] Marked-answered state persists across reload

### 6.4 KillListDashboard embed ([src/components/KillListDashboard.jsx](src/components/KillListDashboard.jsx))
- [ ] Active targets summary correct (streaks, threshold progress)
- [ ] Quick check-in from Dashboard works (Held/Escaped)
- [ ] Newly-killed target shows in Monday kill report

### 6.5 Pattern confrontation card
- [ ] Shows once per 24h based on criteria
- [ ] Swipe / dismiss → sessionStorage dedupe holds for 24h
- [ ] Reappears next day if criteria still met

### 6.6 Weekly Rule Review (Sunday-anchored, 3-day carryover)
- [ ] Sun/Mon/Tue/Wed with ≥1 finalized rule and not yet reviewed this Sunday window → card renders
- [ ] Thu/Fri/Sat → card hidden regardless of state (week is skipped if not caught by Wed)
- [ ] Mark each rule Held or Broke it → Submit button enables when all marked
- [ ] Submit → violations[] entries written for "Broke it" rules; `userSettings.lastReviewedSunday` stamped to current Sunday's YYYY-MM-DD (e.g. `2026-05-31`)
- [ ] Skip → no rule writes, but `lastReviewedSunday` still stamped
- [ ] After submit or skip → card hides for the rest of the week
- [ ] Next Sunday → card reappears (new Sunday anchor)
- [ ] Zero finalized rules → card never renders

### 6.7 Sunday autopsy (Sundays only)
- [ ] Sticky input renders on Sunday
- [ ] Submit → creates hardLessons stub
- [ ] Non-Sunday → hidden

### 6.8 Monday kill report (Mondays only)
- [ ] Lists targets killed in last 7 days
- [ ] Non-Monday → hidden

### 6.9 Black Mirror gate
- [ ] `VITE_ENABLE_BLACK_MIRROR=false` (or unset) → no nav link, route `/black-mirror` does not mount (try direct URL)
- [ ] Mirror Stack section not rendered on Dashboard

---

## Section 7 — Synthesis ([src/pages/SynthesisBriefing.jsx](src/pages/SynthesisBriefing.jsx))

**Run AFTER you have populated Journal + Kill List + Hard Lessons + Relapse data above. Synthesis is meaningless without cross-module data.**

### 7.1 Cadence + data gate
- [ ] Select Weekly or Biweekly
- [ ] With zero active kill targets / finalized rules / relapse entries → "Generate Now" disabled with tooltip explaining boilerplate risk
- [ ] With sufficient data → "Generate Now" enabled

### 7.2 Generation
- [ ] Click "Generate Now" → loading spinner, briefing appears within ~30s
- [ ] Briefing references real data from your modules (active targets by name, recent rules, mood trend)
- [ ] Convergence point reads like genuine multi-module synthesis, not generic
- [ ] Signal delta (improving/stable/deteriorating) reflects actual recent activity
- [ ] Violated rules list matches Hard Lessons violations in window
- [ ] Confrontation question generated and feels pointed
- [ ] **No wellness language**; tone matches Inner Ops product definition

### 7.3 Archive + lifecycle
- [ ] Past briefings list sorted newest first
- [ ] Open briefing → modal with full text + metrics
- [ ] Mark as read → readAt set, isNew=false
- [ ] After 25th briefing, oldest auto-pruned (MAX_STORED_BRIEFINGS=24)

### 7.4 Behavioral context cache
- [ ] Generate two briefings in quick succession → second call uses cached context (~5 min)
- [ ] After 5 min → fresh cross-module snapshot used

### 7.5 Failure modes
- [ ] Cloud Function timeout (>30s) → error toast, no half-saved briefing
- [ ] Network drop mid-generation → clean error, retry works
- [ ] Generation failure → no briefing persisted in `syntheses`

---

## Section 8 — Cloud Functions ([functions/index.js](functions/index.js))

Run these from the app, then verify via `firebase functions:log`.

### 8.1 Oracle
- [ ] Signed-out call → blocked client-side, would 401 server-side
- [ ] Valid call with 10–1000 char entryText → returns `{ text, lensUsed, metacognitiveDepth, closingQuestion }`
- [ ] entryText < 10 chars → invalid-argument error
- [ ] entryText > 1000 chars → invalid-argument error
- [ ] Invalid module name → invalid-argument error
- [ ] Client tries to inject `customSystemPrompt` → rejected
- [ ] 30s timeout on slow Claude API → clean timeout error to client

### 8.2 oracleFollowUp
- [ ] User replies in OracleModal → followUp call generates confrontational second response
- [ ] Does not soften or affirm user pushback (per product language rules)

### 8.3 Rate limit ([functions/rateLimit.js](functions/rateLimit.js))
- [ ] Counter increments on each oracle/oracleFollowUp call (verify in `users/{uid}/_rateLimits`)
- [ ] 21st call in a day → resource-exhausted error returned
- [ ] Counter resets at day boundary (UTC or configured tz — verify which)
- [ ] Counter shared across oracle + oracleFollowUp (not separate pools)

### 8.4 Log verification
- [ ] `firebase functions:log --only oracle` shows successful 200s for each real call you made
- [ ] No silent 500s; no Claude API errors hidden from logs

---

## Section 9 — Mobile sweep

Test on real phone (or Chrome devtools device mode at 375x667 minimum). **Do not skip — mobile and desktop are equal targets per CLAUDE.md.**

### 9.1 Navbar ([src/components/Navbar.jsx](src/components/Navbar.jsx))
- [ ] All 6 v1 tabs render on mobile (no `hidden md:flex` regression)
- [ ] Black Mirror tab NOT present (env flag off)
- [ ] Active tab visually distinct
- [ ] Bottom safe-area padding clears the iOS home indicator
- [ ] Settings/Profile icons render (text may be hidden)

### 9.2 Per-page mobile checks
- [ ] **Auth** — form fits viewport, no horizontal scroll
- [ ] **Journal** — sticky submit button above nav, mood icons 4-col grid, textarea grows, prompt full-width
- [ ] **Kill List** — category icons + labels readable, inline edit works via touch, autopsy modal scrollable
- [ ] **Hard Lessons** — 7-field form scrolls cleanly, progress bar compact, bridge prompt modal usable
- [ ] **Relapse Radar** — intensity ring centered, drift signal cards stack vertically
- [ ] **Dashboard** — sections stack, KillListDashboard full-width, morning brief readable
- [ ] **Synthesis** — briefing modal full-screen, metrics 2-col

### 9.3 Touch interactions
- [ ] Tap targets ≥ 44px (iOS HIG)
- [ ] No hover-only states blocking mobile users
- [ ] Voice input button works on mobile (if browser supports)

---

## Section 10 — Firestore Rules ([firestore.rules](firestore.rules))

**Per memory: passing build/tests ≠ verified rules.** Test with real client reads/writes.

### 10.1 Auth gates
- [ ] Signed-out client cannot read any user collection
- [ ] User A cannot read User B's `journalEntries`, `killTargets`, `hardLessons`, `relapseEntries`, `syntheses`
- [ ] User A cannot write to User B's collections

### 10.2 Write shape validation
- [ ] Client cannot create journal entry with arbitrary userId (must match auth.uid)
- [ ] Client cannot write to `_rateLimits` collection (server-only)
- [ ] Client cannot write `syntheses` with arbitrary fields (or, if client-write allowed, only shape-validated fields per recent commit 02cbf70)

### 10.3 Archive collections
- [ ] Same auth gates apply to all `*Archive` collections

---

## Section 11 — Pre-deploy gates

Final checklist before pushing to production.

- [ ] Section 0 pre-flight green
- [ ] All 🔴 Blockers resolved (see Issue log below)
- [ ] All 🟡 Quality items resolved or explicitly deferred with Bo's sign-off
- [ ] `npm run build` clean
- [ ] Production `.env` reviewed — no dev values, no leaked keys
- [ ] `VITE_ENABLE_BLACK_MIRROR` confirmed off/unset
- [ ] Firebase Functions secrets confirmed (`ANTHROPIC_API_KEY`)
- [ ] Firestore rules re-verified with live client read after deploy
- [ ] Cloud Functions logs show real invocations succeeding post-deploy
- [ ] Smoke test on production URL: sign in → journal entry → Oracle response → Synthesis generation, all working

---

## Issue log (append as we find them)

| # | Module | Severity | Symptom | Fix summary | Status |
|---|--------|----------|---------|-------------|--------|
| 1 | Dashboard / Weekly Rule Review | 🟡 Quality | Card appeared every day until interacted with; mismatched Bo's preferred cadence | Replaced once-per-ISO-week gate with Sunday-anchored (Sun-Wed render window) + new `userSettings.lastReviewedSunday` field. Old `lastWeeklyRuleReviewWeek` kept vestigial. Live-verified 2026-05-24: Skip → write → hard refresh → card stayed hidden. | ✅ Resolved |
