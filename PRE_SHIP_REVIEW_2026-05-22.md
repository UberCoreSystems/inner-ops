# Pre-Ship Comprehensive Review — 2026-05-22

**Reviewer:** QA Engineer (lead) + SSE technical sections
**Run Date:** 2026-05-20 (Wed)
**Ship Target:** 2026-05-22 (Fri)
**Scope:** Inner Ops V1 — Journaling, Kill List, Hard Lessons, Relapse Radar, Synthesis
**Mode:** Read-only. No files modified. Git status clean before and after.

---

## Executive Summary

- **Total findings:** 13 (one retracted as subagent hallucination — see below)
- **Ship-blockers:** 0
- **Fix-before-Friday:** 3 → **2 completed locally, 1 remaining (deploy steps)**
- **Post-launch:** 8
- **Manual-verify before ship:** 3
- **Ship readiness verdict:** **GO-WITH-FIXES** (verdict unchanged; remaining work is deploy + smoke test)

The product is structurally ready to deploy. Auth, data, secrets, Firestore rules, Cloud Functions, error handling, copy voice, and module integrity all pass. The remaining items are polish and hardening that fit inside two working days without architectural risk.

**Status of FBF items after 2026-05-20 execution pass:**

1. ✅ **FBF-1 DONE** — Security headers added to `firebase.json` (`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`).
2. ❌ **FBF-2 RETRACTED** — Subagent hallucinated the "Space Grotesk / Inter / JetBrains Mono" requirement. Cross-check against [audit/PRE_SHIP_REVIEW.md](audit/PRE_SHIP_REVIEW.md) (the source audit doc) shows **no font-stack item exists**. CLAUDE.md also makes no such requirement. The system stack currently shipping in [tailwind.config.js:37-39](tailwind.config.js#L37-L39) and [src/index.css:13-15](src/index.css#L13-L15) is the only documented intent. **No action needed.**
3. 🟡 **FBF-3 PARTIAL** — Local verification complete:
   - ✅ `npm test` clean — **152/152 tests passing** in 661ms
   - ✅ `npm run build` clean — exit 0, built in 10.11s, only informational dynamic-import warnings (already documented Low/Optional in the original audit, finding 1.7)
   - 🟡 Remaining (Bo must run; require Firebase CLI auth): `firebase deploy --only firestore:rules`, `firebase deploy --only functions`, confirm `ANTHROPIC_API_KEY` set as Firebase secret on production, confirm all VITE_* env vars set on production project, smoke test on deployed env.

**Bonus cross-check:** The earlier audit (2026-04-24, [audit/PRE_SHIP_REVIEW.md](audit/PRE_SHIP_REVIEW.md)) listed 5 must-fix items. All 5 are now resolved:
- ✅ `/hard-lessons` broken link — zero matches in `src/`.
- ✅ Catch-all `<Route path="*">` — present at [src/App.jsx:320](src/App.jsx#L320).
- ✅ `bg-oura-darker` Tailwind token — defined at [tailwind.config.js:14](tailwind.config.js#L14).
- ✅ SynthesisGuard relaxed (per commit history; full QA pass shows no hard-redirect blocking).
- 🟡 Mobile bottom-nav 320px truncation — **still needs real-device verification** during smoke test (MV-4 added below).

---

## Ship-Blockers

**None.**

No issue identified breaks core flow, exposes a secret, surfaces a deferred feature, or invalidates the data model.

---

## Fix-Before-Friday

### FBF-1 — Add HTTP security headers to firebase.json ✅ DONE 2026-05-20

- **Where:** [firebase.json](firebase.json) — `hosting.headers` block.
- **What changed:** Added a `**`-scoped headers entry with four directives:
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- **Verification:** Diff applied. Cache-Control headers preserved. Will take effect on next `firebase deploy --only hosting`.
- **CSP deferred:** Lock `connect-src` / `script-src` post-launch once analytics endpoints are confirmed.

### FBF-2 — Font stack decision ❌ RETRACTED (subagent hallucination)

- **Status:** Withdrawn. The "Space Grotesk / Inter / JetBrains Mono" requirement does **not exist** in the source audit doc ([audit/PRE_SHIP_REVIEW.md](audit/PRE_SHIP_REVIEW.md)) or in CLAUDE.md. The UI subagent fabricated the requirement during its review run.
- **Evidence of retraction:** Grep against the audit doc for `Space Grotesk|JetBrains Mono|font stack` returns zero matches. The audit's Section 3 covers Firebase Integration, not typography.
- **Action taken:** None. System stack at [tailwind.config.js:37-39](tailwind.config.js#L37-L39) and [src/index.css:13-15](src/index.css#L13-L15) remains the ship configuration.
- **Lesson for next audit run:** Cross-reference subagent claims against source docs before promoting to FBF.

### FBF-3 — Pre-deploy checklist 🟡 PARTIAL (local done, deploy steps pending)

**Completed locally on 2026-05-20:**

- ✅ `npm test` — **152/152 passing**, duration 661ms. All test files referenced in package.json execute cleanly. Expected Firebase init warnings during fixture runs (no App initialized in test context) — non-fatal.
- ✅ `npm run build` — exit 0, built in 10.11s, 38 PWA precache entries (1.4 MB). Three dynamic-import warnings (firebase functions module, clarityScore.js, firebase.js) — these match audit finding 1.7 in [audit/PRE_SHIP_REVIEW.md](audit/PRE_SHIP_REVIEW.md), already classified as Low/Optional. Chunk-size warning fires only on Firebase chunks (firebase-firestore 434 kB, firebase-auth 231 kB) — expected and unavoidable for v1.

**Remaining (must run on Bo's terminal — require Firebase CLI auth):**

- [ ] `firebase deploy --only firestore:rules`
- [ ] `firebase deploy --only functions` (deploys `oracle` + `oracleFollowUp`)
- [ ] `firebase deploy --only hosting` (ships the security-header config from FBF-1)
- [ ] Confirm `ANTHROPIC_API_KEY` is set as a Firebase secret on the production project: `firebase functions:secrets:access ANTHROPIC_API_KEY`
- [ ] Confirm all VITE_* vars from [.env.example](.env.example) are present on the production Firebase Hosting project's environment (or baked into the build before deploy)
- [ ] Smoke test on deployed env (see Manual-Verify section)

---

## Post-Launch Backlog

1. **Add Escape-key binding to `EmergencyButton.jsx`** modal flow. Today users must click the close button or finish the flow; close exists but Escape doesn't trigger it. ([src/components/EmergencyButton.jsx](src/components/EmergencyButton.jsx))
2. **Refactor oversized page components** — [Journal.jsx:1413](src/pages/Journal.jsx), [HardLessons.jsx:1622](src/pages/HardLessons.jsx), [KillList.jsx:2218](src/pages/KillList.jsx). All three exceed 1,400 lines but are well-organized; extract custom hooks and sub-components post-launch.
3. **Remove orphan: [src/components/CueRestructuringFlow.jsx](src/components/CueRestructuringFlow.jsx)** is only imported by `BlackMirror.jsx` (a deferred component). Currently dead in v1. Either move into `BlackMirror.jsx` or delete when Black Mirror ships.
4. **CSP header** — defer until analytics endpoints are locked.
5. **Sentry `beforeSend` PII scrubbing hook** — currently safe (no PII deliberately captured), but add as defense-in-depth once a payload schema is known.
6. **Lazy-load Firebase Auth chunk** (~227KB). Users hit `/auth` first anyway; deferring Auth saves initial app shell weight after launch UX is stable.
7. **`useMemo` for `reflectionNotes` derivation in [KillListDashboard.jsx](src/components/KillListDashboard.jsx)** if/when notes get passed deeper into the tree. Currently safe.
8. **Performance telemetry** — add LCP/FID/CLS capture via Sentry or PostHog once live users exist.

---

## Manual-Verify Items (Thursday smoke test)

These cannot be confirmed by static analysis and must be exercised on the deployed environment:

- **MV-1 — Journal extraction prefill end-to-end** (commit f78f87e). Write a journal entry that contains both a candidate kill target and a hard lesson, confirm extraction badges render, confirm prefills land in Kill List / Hard Lessons forms.
- **MV-2 — Keyboard navigation** — full keyboard pass on AuthForm, QuickJournalModal, OracleModal, and KillClosureModal. Focus trap implementation in [src/hooks/useFocusTrap](src/hooks/useFocusTrap.js) is correct; verify Tab order is logical.
- **MV-3 — Onboarding → Dashboard handoff** for a brand-new user (clean Firebase Auth account). [src/components/OnboardingGate.jsx](src/components/OnboardingGate.jsx) + [src/utils/routeGating.js](src/utils/routeGating.js) tests pass, but the full sessionStorage-persisted flow needs a live click-through.
- **MV-4 — Mobile bottom-nav at 320–375px viewport** — verify "General Ledger" label doesn't truncate/overflow on iPhone SE (375px) and Galaxy S5 (360px). Carried over from the 2026-04-24 audit's must-fix item #5 — still unconfirmed.
- **MV-5 — Oracle rate limiter UX** — invoke Oracle 21 times in a test account and confirm the 21st invocation surfaces a grounded toast (not a raw HttpsError). Validates the rate-limit recovery path before real users hit it.

---

## Final Improvement Opportunities

Ranked by leverage. **EXECUTE** unless noted. None take longer than ~2 hours.

| # | Improvement | Effort | Risk | Decision |
|---|-------------|--------|------|----------|
| 1 | Security headers (FBF-1) | 15min | LOW | EXECUTE |
| 2 | Strike or import font stack (FBF-2) | 5min–1hr | LOW-MED | EXECUTE after CEO call |
| 3 | Escape-key bind on EmergencyButton | 15min | LOW | EXECUTE (small, user-facing) |
| 4 | Delete orphan `CueRestructuringFlow.jsx` import edge OR move file under a deferred folder so it's obvious it's not v1 | 15min | LOW | EXECUTE |
| 5 | Add `Referrer-Policy: strict-origin-when-cross-origin` to firebase.json (subset of FBF-1) | covered by #1 | LOW | EXECUTE |
| 6 | Confirm `ANTHROPIC_API_KEY` is a Firebase secret, not `.env` value (FBF-3) | 5min | LOW | EXECUTE |
| 7 | Verify dist/ rebuilt from current HEAD before deploy (existing dist/ is 1.5MB but may be stale) | 5min | LOW | EXECUTE |
| 8 | Add a one-line `<meta name="robots" content="noindex">` to `index.html` for the pre-beta window | 5min | LOW | EXECUTE if soft launch only |
| 9 | Smoke-test the rate limiter — invoke Oracle 21 times in a test account, confirm HttpsError surfaces a grounded toast (not raw error) | 30min | LOW | EXECUTE (high-leverage AI quality check) |
| 10 | Lighthouse run on staging build to capture pre-launch baselines for LCP/CLS | 30min | LOW | EXECUTE (informational, not gating) |

Deferred from this list: bundle splitting, sentry beforeSend, useMemo refactors — all POST-LAUNCH.

---

## Findings by Category

### 1. Code Quality

| Finding | Location | Severity |
|---------|----------|----------|
| TODO / FIXME / HACK | None found in `src/` or `functions/` | NO ACTION |
| Console statements | All routed through `src/utils/logger.js` or dev-gated. `functions/index.js:140,248,343` are intentional Cloud Logging structured output. | NO ACTION |
| Commented-out code | None of significance | NO ACTION |
| Error handling | Solid on all critical paths — `aiFeedback.js` fallback, oracle Cloud Function try/catch, Journal/KillList/HardLessons/Relapse all have visible error states. Minor: [Journal.jsx:365 `generateDynamicInsights`](src/pages/Journal.jsx#L365) timeout lacks explicit catch — non-critical UI feature, degrades gracefully. | POST-LAUNCH |
| Components >300 lines | KillList.jsx 2218, HardLessons.jsx 1622, Journal.jsx 1413 — all well-structured | POST-LAUNCH |
| Magic numbers / hardcoded URLs | All named constants or env-backed. Oura OAuth URLs hardcoded but are public API endpoints. | NO ACTION |
| Deferred-feature gating (Black Mirror) | Properly gated. [App.jsx:25](src/App.jsx#L25), [Navbar.jsx:6](src/components/Navbar.jsx#L6), [Dashboard.jsx:29](src/pages/Dashboard.jsx#L29) all read `VITE_ENABLE_BLACK_MIRROR`. Lazy-loaded route + conditional nav link. Default OFF. | NO ACTION |
| Orphan files | [CueRestructuringFlow.jsx](src/components/CueRestructuringFlow.jsx) only used by `BlackMirror.jsx` (deferred). [blackMirrorAnalytics.js](src/utils/blackMirrorAnalytics.js) only imported by deferred components. Cleanly isolated. | POST-LAUNCH |

### 2. Module Integrity

| Module | Entry Create | Empty State | Error State | Loading | Voice |
|--------|--------------|-------------|-------------|---------|-------|
| Journal | ✓ form→Firestore→toast | ✓ "No journal entries yet" + grounded copy | ✓ retry card | ✓ SkeletonList | ✓ |
| Kill List | ✓ + duplicate guard + check-in flow | ✓ Skeleton + standard pattern | ✓ visible | ✓ | ✓ |
| Hard Lessons | ✓ 7-field form + finalize lock | ✓ scar inventory auto-opens | ✓ | ✓ | ✓ "Memory with teeth" |
| Relapse Radar | ✓ Signal vs Relapse modes + drift detection | ✓ | ✓ | ✓ | ✓ "Catch the drift before it compounds" |
| Synthesis | ✓ cadence-enforced + manual bypass | ✓ "needs data across 2+ modules" | ✓ | ✓ | ✓ |

**Cross-module data flow** ([generateSynthesisBriefing.js](src/utils/generateSynthesisBriefing.js)) wraps each reader in `.catch(() => [])` — verified safe for fresh user with zero data.

**Onboarding** ([src/pages/Onboarding.jsx](src/pages/Onboarding.jsx)) — 9-step flow with sessionStorage persistence, `canAdvance()` validation, skip path. No dead-end loop possible.

**Journal extraction fix (f78f87e)** — code review of [crossModuleExtraction.js](src/utils/crossModuleExtraction.js) confirms deduping, conditional extraction, and graceful failure paths. **Requires MV-1 manual confirmation.**

### 3. UI Review

| Finding | Severity |
|---------|----------|
| Spacing / typography / color consistency — cohesive Oura-inspired palette, semantic radius tokens | NO ACTION |
| Font stack — system fonts only; audit doc requires Space Grotesk/Inter/JetBrains Mono | FIX-BEFORE-FRIDAY (FBF-2) |
| Mobile responsiveness — Navbar mobile fallback works; safe-area insets respected; modals use `max-w-2xl`+`max-h-[90vh]` | NO ACTION |
| Framer Motion not present (per CLAUDE.md). 0 imports across `src/` | NO ACTION |
| Button states — sign-in, journal save, relapse log, emergency all have disabled+spinner | NO ACTION |
| Form states — focus/error/success — comprehensive in AuthForm, OracleModal, QuickJournalModal | NO ACTION |
| Modal dismiss — Escape + backdrop + focus trap on Oracle, QuickJournal, KillClosure. EmergencyButton missing Escape | POST-LAUNCH |

### 4. UX Review

| Finding | Severity |
|---------|----------|
| Copy voice — no "you got this", "self-care", "mindfulness", "wellness" hits. BANNED_TONE_REGEX in [aiFeedback.js:19](src/utils/aiFeedback.js#L19) actively filters them at runtime | NO ACTION |
| AuthForm: "Begin Your Journey" / "Continue your path of self-mastery" — borderline-soft but action-oriented | NO ACTION |
| One use of "journey" in [src/constants/dailyPrompts.js:49](src/constants/dailyPrompts.js#L49) shadow-work context — acceptable | NO ACTION |
| EmergencyButton language — entirely grounded ("Urge ≠ action. 90 seconds and it passes.") — meets CLAUDE.md requirement | NO ACTION |
| Settings/Profile discoverability — both linked from Navbar top-right + mobile bottom nav | NO ACTION |
| Dead ends — none. All modals have dismiss; onboarding has skip; forms have cancel/back | NO ACTION |

### 5. Performance

| Finding | Severity |
|---------|----------|
| All routes lazy-loaded via `React.lazy` + `Suspense` in [App.jsx](src/App.jsx) | NO ACTION |
| Modular Firebase imports — no `import firebase from 'firebase'` anywhere | NO ACTION |
| Public assets all <10KB | NO ACTION |
| Firestore queries all `where("userId","==",uid)` scoped via [firebaseUtils.js](src/utils/firebaseUtils.js). Listeners use `safeUnsubscribe` pattern. No unbounded queries; no N+1 | NO ACTION |
| Listener/interval/event-listener cleanup verified — `onAuthStateChanged`, `onSnapshot`, `addEventListener` all return cleanup | NO ACTION |
| 5-min behavioral context cache ([getBehavioralContext.js](src/utils/getBehavioralContext.js)) — per-user keyed, TTL-checked, correctly invalidated | NO ACTION |
| Vite config — terser w/ drop_console + drop_debugger, sourcemaps OFF, manualChunks for Firebase + React | NO ACTION |
| dist/ total 1.5MB uncompressed (~400-500KB gzipped); largest chunk firebase-firestore 425KB. No chunk >500KB | NO ACTION |
| Dashboard chunk 110KB — heaviest page, but lazy-loaded | NO ACTION |

### 6. Security

| Finding | Severity |
|---------|----------|
| Firestore rules — every collection owner-gated by `isOwner(userId)` + `createsOwnDocument()`. Zero `if true` or naked `if request.auth != null`. `_rateLimits/*` blocked from client. Comprehensive list-query gating with `request.query.limit <= 1000`. | NO ACTION |
| Cloud Functions auth — both `oracle` ([functions/index.js:157](functions/index.js#L157)) and `oracleFollowUp` ([functions/index.js:277](functions/index.js#L277)) reject unauthenticated calls. `customSystemPrompt` from client explicitly rejected. | NO ACTION |
| Rate limiting — 20/day per user via Firestore transaction. Extraction calls correctly exempted with audit logging | NO ACTION |
| Claude API key — `defineSecret("ANTHROPIC_API_KEY")` only. Zero matches for "sk-ant", "ANTHROPIC_API_KEY", "claude-3", "claude-opus" in `src/`. Confirm Firebase secret is set on prod project (FBF-3) | MANUAL-VERIFY |
| Env vars — `.env` and `.env.production` contain only public VITE_* Firebase vars. `.gitignore` includes `.env` + `.env.*` with `!.env.example` exception. All `import.meta.env.VITE_*` references match `.env.example` | NO ACTION |
| Input sanitization — zero `dangerouslySetInnerHTML` matches across `src/`. React default escaping throughout | NO ACTION |
| PII — journal/relapse/hardLessons/killTargets all owner-gated by Firestore rules. No client-side leak surfaces | NO ACTION |
| Sentry + PostHog — both lazy-init, env-var-gated, no hardcoded keys | NO ACTION |
| Missing security headers in [firebase.json](firebase.json) — no X-Frame-Options, X-Content-Type-Options, Referrer-Policy | FIX-BEFORE-FRIDAY (FBF-1) |

### 7. Accessibility

| Finding | Severity |
|---------|----------|
| Semantic HTML — zero `<div onClick>` matches. All interactive elements are `<button>` / `<Link>` | NO ACTION |
| ARIA labels — 19 `aria-label` occurrences across 9 files; icon-only buttons covered; `aria-live="polite"` on character counters and password-match indicator | NO ACTION |
| Focus management — `useFocusTrap` hook used in OracleModal, QuickJournalModal, KillClosureModal. EmergencyButton lacks Escape binding | POST-LAUNCH |
| Color contrast — spot check passes WCAG AA on primary text combinations | NO ACTION |
| Form labels — `<label htmlFor=>` consistently associated with inputs in AuthForm, OracleModal, QuickJournalModal | NO ACTION |
| Full keyboard navigation pass | MANUAL-VERIFY (MV-2) |

### 8. Deploy Readiness

| Item | Status |
|------|--------|
| Black Mirror gating verified | ✓ |
| Firebase Hosting SPA rewrite + asset cache headers | ✓ |
| `.env` not committed; `.env.example` matches all VITE_* refs | ✓ |
| Test file inventory — all 12 files referenced in `package.json` script exist | ✓ |
| Firestore rules production-ready | ✓ |
| Cloud Functions code production-ready | ✓ |
| Security headers in hosting config | ✗ (FBF-1) |
| `npm run build` clean on fresh shell | UNVERIFIED (FBF-3) |
| Firestore rules + Cloud Functions deployed to prod project | UNVERIFIED (FBF-3) |
| `ANTHROPIC_API_KEY` set as Firebase secret on prod | UNVERIFIED (FBF-3) |
| Env vars set on production Firebase project | UNVERIFIED (FBF-3) |
| Smoke test on staging | UNVERIFIED (FBF-3) |
| 404 fallback — [App.jsx](src/App.jsx) catch-all `<Navigate to="/auth" />` + `ErrorBoundary` class | ✓ |

### 9. Final Improvement Opportunities

See Final Improvement Opportunities table above (10 items, all EXECUTE or covered by FBF).

---

## Deferred — Not in V1 Scope, Not Flagged as Gaps

Per CLAUDE.md "Deferred (do not build unless explicitly unblocked by Bo)":

- **Black Mirror** — code present but gated. `VITE_ENABLE_BLACK_MIRROR=true` is the only way to expose it. Default off on `.env.production`.
- **Command Brief** — no references in v1 routes; nothing to flag.
- **Oracle UI redesign** — current Oracle modal ships as-is.
- **Engagement notifications** — engagement-trigger utilities exist in [src/utils/engagementTriggers/](src/utils/engagementTriggers/) but tests pass and they don't fire any user-facing surface in v1.
- **AI interaction layer (Command Brief)** — not present.
- **MCP / skills integration** — not present.
- **[src/utils/blackMirrorAnalytics.js](src/utils/blackMirrorAnalytics.js)** — present but unreachable from v1 (only imported by BlackMirror.jsx + CueRestructuringFlow.jsx, both deferred).

No deferred feature appears in any v1 user flow.

---

## Sign-Off Checklist

- [x] FBF-1 — Security headers added to `firebase.json` ✅ 2026-05-20
- [x] FBF-2 — Retracted (subagent hallucination; no action needed) ❌ 2026-05-20
- [x] FBF-3 (local) — `npm test` 152/152 + `npm run build` clean ✅ 2026-05-20
- [ ] FBF-3 (deploy) — Bo to run on terminal:
  - [ ] `firebase deploy --only firestore:rules`
  - [ ] `firebase deploy --only functions`
  - [ ] `firebase deploy --only hosting`
  - [ ] `ANTHROPIC_API_KEY` secret confirmed on production functions
  - [ ] All VITE_* env vars confirmed on production Firebase project
- [ ] MV-1 — Journal extraction prefill end-to-end on deployed env
- [ ] MV-2 — Keyboard navigation pass (Tab order, Escape, focus visible)
- [ ] MV-3 — Fresh-user onboarding → Dashboard handoff
- [ ] MV-4 — Mobile bottom-nav 320–375px viewport check
- [ ] MV-5 — Oracle rate limiter surfaces grounded toast on 21st call
- [ ] Smoke test full critical path (auth → journal → kill → lesson → relapse → synthesis)
- [ ] Final build artifact deployed to Hosting

---

**Execution log:**

- 2026-05-20 Wed — Audit run (read-only) by 5 parallel Explore agents + main thread synthesis.
- 2026-05-20 Wed — FBF-1 applied to `firebase.json`. FBF-2 retracted on cross-check. FBF-3 local verification (`npm test`, `npm run build`) clean.
- 2026-05-21 Thu — _pending_ — Bo runs deploy steps + smoke test (MV-1..MV-5).
- 2026-05-22 Fri — _pending_ — Ship.

**Files modified by this execution pass:**

- `firebase.json` — added security headers.
- `PRE_SHIP_REVIEW_2026-05-22.md` — this report (updated with execution results).

No application source code modified.
