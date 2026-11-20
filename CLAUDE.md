# Inner Ops — CLAUDE.md

## Project State

- **Status:** Live — deployed 2026-07-25 (closed beta), on custom domain **https://innerops.io** since 2026-08-04 (Namecheap DNS → Firebase Hosting; www redirects to apex; old .web.app URL still serves). `VITE_FIREBASE_AUTH_DOMAIN=innerops.io`. Production Firestore holds real user data: schema changes need migration thinking, and rules/functions changes must be deployed and verified via logs, not just merged.
- **Build:** Clean. BER-1 through BER-13 closed. QA and CI agents operational.
- **v1 Scope (locked):** Journaling + Kill List + Hard Lessons + Relapse Radar + Synthesis
- **Open items (post-launch):** Oracle UI redesign, engagement notifications, AI interaction layer (Command Brief — extends Synthesis cross-module reading to session-level prompts), MCP/skills integration
- **Black Mirror — removed (2026-05-31):** the module, its analytics engine, cue-restructuring, routes/nav, and all `blackMirror*` data reads were fully excised from the codebase. Oura remains built but flagged off (`VITE_ENABLE_OURA`).

## Product Language — Non-Negotiable

Inner Ops is "a system for turning self-awareness into self-command."

It is **not** a habit tracker, wellness app, or motivational tool. Enforce this everywhere:

- No wellness framing. No "self-care" or "mindfulness" language.
- No motivational copy. No "you got this," no encouragement, no affirmations.
- The Protocol (grounding tools on The Signal) uses **grounding language**, not inspirational messaging.
- Philosophical precision is required. When in doubt, err toward stark clarity over softness.
- Identity Frameworks v2 is part of the product definition — reference it for tone and conceptual alignment.

## Stack

- React 18 + Vite, JavaScript
- Firebase Auth + Firestore (real-time listeners, no Redux)
- Tailwind CSS (animations via Tailwind utilities and CSS keyframes — no animation library)
- Sentry (error tracking), PostHog (analytics)
- Claude API via Firebase Cloud Function proxy — **never expose API keys client-side**
- Capacitor 8 iOS shell (`ios/`, Swift Package Manager) around the same `dist/` build — see iOS Shell

## Modules (v1)

| Module | Page | Key Utils |
|--------|------|-----------|
| **Journaling** | `src/pages/Journal.jsx` | `aiFeedback.js` |
| **Kill List** | `src/pages/KillList.jsx` | `useKillTargets.js` (used by `KillListDashboard.jsx`) |
| **Hard Lessons** | `src/pages/HardLessons.jsx` + `src/components/hardLessons/LessonForm.jsx` (controlled; the page owns the draft and every write). A draft needs only the event; locking needs every field and goes through a review sheet. The Oracle (`lessonExtraction`) fills category/assumption/signal/cost, marked in `oracleFilled`; the lesson and rule are never auto-written, its versions ride `oracleSuggestion` until taken. An event that matches a locked rule asks inline "Did this break it?"; **It broke** appends `{date, source:'lesson', lessonId}` to that rule's `violations[]` (the legacy `isRuleViolation` flag is no longer written; old docs keep it), and locking the lesson closes that break from the user's own text only. Bridge prefills (`hl_bridge_prefill` from Signal landed, Journal, Ledger) and the unsaved form (localStorage) never write a doc without a tap. | `lessonDraft.js`, `ruleState.js`, `crossModuleExtraction.js` (`extractHardLessonDirect` → `{status, extraction}`) |
| **Relapse Radar** | `src/pages/Relapse.jsx` → `RelapseRadar.jsx`; the Protocol (`GroundingProtocol.jsx`, grounding tools behind the header pill, deep-linked from Dashboard Early Warning via `?protocol=1`) logs a signal entry with `protocolRun`. All four tools run to a finish (`protocolTools.js`: 5-4-3-2-1 steps through, cold water and movement count down, breathing paces a round); a tool counts in `protocolRun.toolsUsed` only once it gets there, and leaving a tool stops it. Every `relapseEntries` doc is a signal: the "Actual relapse" entry type was removed 2026-10-25 (legacy docs closed as landed by `scripts/migrate-legacy-relapse-entries.mjs`, marked `legacyRelapse`). Logging ends on a receipt (window closing time, **Done**, a link that opens the tools in place); it never asks held or landed. A signal opens a 72h window and closes only by the user's answer on the Signal Debrief card (`SignalDebriefCard.jsx`, on Dashboard and The Signal; walks pending signals oldest first, then live ones with a countdown; the one place that question is asked), and a landed signal bridges to Hard Lessons via `bridgeSignalToHardLessons.js`, which records the slip. Hard Lesson violations are the failure event for the forecast (`relapseForecast.js`), Dashboard early warning, Mirror reading and behavioral record. | `detectDriftSignals.js`, `detectEvasionMarkers.js`, `buildProtocolEntry.js`, `protocolTools.js`, `signalDebrief.js` |
| **Synthesis** | `src/pages/SynthesisBriefing.jsx` | `generateSynthesisBriefing.js`, `getBehavioralContext.js` |
| **Dashboard** | `src/pages/Dashboard.jsx` | `clarityScore.js`, `KillListDashboard.jsx`, `DailyPrompt.jsx` |

### Deferred (not v1)

| Module | Status |
|--------|--------|
| **Oura Ring** | Built but flagged off (`VITE_ENABLE_OURA`, default off). `/oura/callback` route and the RelapseRadar connect button stay hidden until enabled. |

## Cross-Module Architecture

Synthesis and Oracle both read across all modules via `readUserData`. Key data flows:

- **`generateSynthesisBriefing.js`** — Pulls journalEntries, killTargets, hardLessons, relapseEntries, userSettings. Computes convergence point, violated rules, signal delta. Cadence-enforced (weekly/biweekly). Confrontation question via Oracle with local fallback.
- **`getBehavioralContext.js`** — 5-minute cached cross-module snapshot injected into Oracle calls. Gives Oracle awareness of active kill targets, relapse archetypes, drift signals, rule violations, and identity direction.
- **`detectDriftSignals.js`** — Rules-based early warning. Archetype frequency (3+ in 7d), precursor pattern recurrence, correlated Kill List escape + relapse within 48h.
- **`detectEvasionMarkers.js`** — Behavioral evasion detection layer.

## Cloud Functions

| Function | Purpose |
|----------|---------|
| `oracle` | Secure Claude API proxy. Auth-gated, rate-limited per user/UTC-day via `ORACLE_DAILY_LIMIT` (prod = 100, code default 50). One journal save costs ~5 Oracle calls (1 classifier + up to 3 extractors + feedback), so the effective budget is ~20 saves/day at 100. Module-aware system prompts with posture matching (challenge/build/ground/clarify/receive). Receives behavioral context (user-authored fields clamped + delimited server-side). In Journal a reading offers four responses, stored as `oracleFollowUpIntent`. **Push back** and **Go further** run a fixed 3-turn arc through this same function (a full arc adds 2 calls per save), the exchange packed into `entryText` as labeled sections by `src/utils/buildFollowUpEntryText.js`: turn 1 is `oracle_pushback` (his section `HIS PUSHBACK`; holds or concedes on the record) or `oracle_further` (his section `HIS DIRECTION`; deepens from where his words point, never defends), each giving one insight and closing on one tagged `<closing_question>` returned as `data.closingQuestion`; turn 2 is `oracle_close` for both (opens on a `VERDICT:answered|evaded` line returned as `data.verdict`, judges the answer, closes on one tagged `<commitment>` returned as `data.commitment` `{ text, pattern, trigger, action, check }`). **It landed** is one call, `oracle_landed` (two sections via `buildLandedEntryText`; a receipt of what he accepted in his own words, no VERDICT line, closes on the same tagged `<commitment>`). **Sit with this** makes no call: `oracleSitUntil` (7 days) and `oracleSitCount` are written, the reading returns through Today's Reflection and reopens the modal with the four responses. No key takes params; the user's words ride the user message only. Each follow-up key also appends its reply shape (paragraph and sentence counts, the clause caps) as the last line of the user message: the system-prompt override alone ran 175–210 words against a 140-word rule in live fixtures. Stored on the journal entry via `src/utils/followUpArc.js` (`ORACLE_FIELDS.FOLLOW_UP_*`, `oracleCommitment`, `oracleFollowUpOutcome` = answered / evaded / unanswered); a question left unanswered returns first as Today's Reflection. The legacy `oracleReaction` is left as written; the other surfaces keep their reaction row and "Go deeper" (a push back). The 30-day response counts ride the behavioral context and Synthesis carries one line on them. `oracle_challenge` is the legacy single-turn key, kept until `functions/scripts/readFollowUpArc.js` shows no calls for 7 days. Live fixtures: `functions/scripts/followUpFixture.js --fixture A..G`. |
| `signalReminders` | **Parked 2026-11-17, not deployed** (export removed from `functions/index.js`; no Settings toggle). Code and tests stay in `functions/signalReminders.js`: every 30 min, one email at +24h while the 72h window is open and one after it closes, stamped on the doc as `reminders.h24` / `reminders.close`. Gmail Workspace SMTP with an app password never authenticated (535) after two days; when revived, use a send-only transport (Resend), not the Workspace mailbox. The in-app Signal Debrief card covers open signals meanwhile. |

## Commands

- `npm run dev` — Vite dev server
- `npm run build` — production build
- `npm test` — node:test unit suites in `src/utils` and `functions`, no emulators. Files are listed one by one in `package.json`, so a new `*.test.js` runs only once it is added there.
- `npm run test:rules` — Firestore rules tests plus `functions/eraseUserData.emulator.test.js`, against the emulators (needs Java).
- `npm run ios:sync` — production build, then `cap sync ios` copies it into the native project. `npm run ios:open` opens that project in Xcode.

## iOS Shell (Capacitor)

- `ios/` is a committed Capacitor 8 project: iPhone only, portrait, dark, iOS 15+. It bundles the same `vite build` output as the website and serves it from `capacitor://localhost`; there is no `server.url`. Two plugins, both for Export: `@capacitor/filesystem` 8.1.5 and `@capacitor/share` 8.0.3, pinned exact; Filesystem brings the native library `ion-ios-filesystem`, which Xcode fetches when it resolves packages. `capacitor.config.json` holds the app id `io.innerops.app`. A simulator build talks to the production Firebase project.
- Native differences sit behind `isNativePlatform()` (`src/utils/platform.js`; it reads the bridge global): Auth uses `initializeAuth` with IndexedDB persistence, App Check is skipped (no native provider yet), the voice button is hidden (no mic or speech usage strings), and Export goes out through the share sheet, because the web view cancels browser downloads (`src/utils/shareExportFile.js` writes the JSON to Library/Caches, shares it, and deletes it when the sheet closes; a dismissed sheet is not an error).
- The plugins' JS loads through a dynamic `import()` in that helper and is never fetched on the web: `vite.config.js` gives chunks built only from `@capacitor/*` a `capacitor-` prefix and keeps them out of the service worker precache. Do not give Capacitor a `manualChunks` rule (it pulls Vite's preload helper into that chunk, and every page then loads it). Never let a plugin object be what an async function returns: it answers `then` and is taken for a promise.
- `ios/App/App/PrivacyInfo.xcprivacy` declares the file-timestamp API (reason C617.1) that the Filesystem plugin requires, and no tracking. A plugin that uses another required-reason API needs its entry added there. `NSPrivacyCollectedDataTypes` is not declared yet: it has to match the App Store privacy label and is needed before the first upload.
- The service worker cannot register in the app: WebKit exposes that API to a web view only with App-Bound Domains and refuses worker scripts that are not http(s). Revisit if `server.url` or App-Bound Domains are ever introduced.
- Safe areas are plain `env(safe-area-inset-*)` CSS shared with the web: `overlay-safe` (`src/index.css`) on modal overlays, and sticky rows offset by the bar height plus the inset. The keyboard is the iOS default; there is no Keyboard plugin.
- Xcode 27: do not use `npx cap run ios` (Capacitor issue 8620), and decline "Update to recommended settings" and any project-format conversion (issue 8607). Keep `@capacitor/core`, `cli` and `ios` on one exact version: the CLI writes it into `ios/App/CapApp-SPM/Package.swift`, with one line per plugin.
- App icon and launch mark come from `node scripts/generate-pwa-icons.mjs ios`. iOS will not render a launch screen whose image decodes to more than 25 MB (Capacitor's template 2732px square is 29.9 MB and launches blank), so `LaunchScreen.storyboard` paints `#111827` itself and centres a 200pt mark. The simulator caches launch images per boot: restart it after changing them.

## Agent Pipeline (Paperclip)

Four-agent system, all Claude Max:

| Role | Scope | Escalation |
|------|-------|------------|
| **QA Engineer** | Finds issues, creates BER tickets assigned to SSE | Systemic patterns → CEO |
| **Senior Software Engineer (SSE)** | Executes BER tickets | Ambiguous scope or architectural questions → CEO |
| **CI Agent** | Continuous integration checks | Build failures → SSE |
| **CEO** | Operational hub. Triages, routes, escalates to Bo | Anything requiring product/scope decisions → Bo |

- Agent "personnel" issues are prompt/configuration problems — fix AGENTS.md, don't "rehire."
- CLAUDE.md and AGENTS.md are the high-leverage configuration points.
- CEO operates at the strategic/operational layer only. Execution detail stays in SSE/QA AGENTS.md files.

## Product Priorities

UI · UX · AI quality · feature completeness — **equal weight.**

**Mobile and desktop are equal targets** — never ship a desktop-only fix.

## Quality Rules

- **AI feedback must be real.** Do not reintroduce template rotation in `src/utils/aiFeedback.js` — route through the Claude proxy.
- **The Signal Report must not be gameable.** The numeric Clarity Score is removed and is not coming back. When touching `src/utils/clarityScore.js` (the Signal Report engine), verify new inputs can't be farmed (fake relapses, dummy hard lessons, etc.) and never reintroduce a numeric score, rank, or multiplier.
- **Mobile nav must work.** `src/components/Navbar.jsx` historically used `hidden md:flex` with no mobile fallback — verify any nav change renders on mobile.
- **Visualize what you track.** If a module stores data, it must be surfaced somewhere (trends, history, rates). Flag gaps when you see them.
- **No speculative generality.** Don't add features, abstractions, or infrastructure beyond the task.

## Deploy Status

Shipped 2026-07-25 — all launch items confirmed:

- [x] Add Firebase Hosting config to `firebase.json`
- [x] Verify `.env` / environment variables are set for production Firebase project
- [x] Run `npm run build` and confirm clean production build
- [x] Deploy Firestore rules (`firestore.rules`)
- [x] Deploy Cloud Functions (oracle)
- [x] Set `ANTHROPIC_API_KEY` secret in Firebase Functions config
- [x] Smoke test: auth flow, journal CRUD, Kill List operations, Hard Lessons extraction, Relapse Radar entry, Synthesis briefing generation

### Outstanding before public launch

- [ ] Email deliverability — fix in flight (2026-08-05): custom email domain `innerops.io` configured in Firebase Auth Templates; SPF TXT + both DKIM CNAMEs live at Namecheap and publicly resolving; awaiting Firebase verification (≤48h), after which sender becomes `noreply@innerops.io`. Remaining: end-to-end inbox test (Gmail throwaway — SPF/DKIM PASS, lands in inbox, links on innerops.io; repeat for password reset and a non-Gmail inbox). Auth toasts mention checking spam — drop that copy once deliverability is confirmed. If Gmail still spam-folders after DNS settles: testers hit "Not spam," re-test after a week, then escalate to Resend (separate plan). Original issue (2026-05-25): default `noreply@inner-ops-8ce36.firebaseapp.com` sender landed in Gmail spam.

## How Bo Works

- **Full picture before code** on non-trivial work. Audits, plans, and tradeoffs first. Use ExitPlanMode / plan files for anything structural.
- **Present options with tradeoffs** for exploratory questions, not a single decided path.
- **Concise responses.** No trailing summaries of what the diff already shows.
- **Root-cause fixes over workarounds.** No `--no-verify`, no bypasses.
- **Decisions are incremental and behavior-driven.** Scope and architecture evolve based on what the system reveals, not upfront planning alone.
- **Bo does not write code.** All execution is delegated to agents. If something needs human judgment, surface it clearly.
- **Challenge is productive; over-affirmation is not.** Direct pushback and honest evaluation over validation.

## Conventions

- No Redux — lift state or use Firebase real-time subscriptions.
- Keep comments minimal; name things well instead.
- Don't add features or abstractions beyond the task.
- Documentation should be balanced across components — no single module over-represented.

## Repo

`C:\Users\boliv\dev\inner-ops`
