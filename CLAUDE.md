# Inner Ops — CLAUDE.md

## Project State

- **Status:** Pre-deploy. Nothing is live. No migrations, no hotfix urgency. Aggressive changes are safe.
- **Build:** Clean. BER-1 through BER-13 closed. QA and CI agents operational.
- **v1 Scope (locked):** Journaling + Kill List + Hard Lessons + Relapse Radar + Synthesis
- **Deferred (do not build unless explicitly unblocked by Bo):**
  - Black Mirror — complex 3-layer analytics architecture (Signal Capture, Pattern Recognition, Identity Reflection in `src/utils/blackMirrorAnalytics.js`), confirmed post-launch
- **Open items (post-launch):** Oracle UI redesign, engagement notifications, AI interaction layer (Command Brief — extends Synthesis cross-module reading to session-level prompts), MCP/skills integration
- **Black Mirror nav visibility:** Route and nav link exist in the codebase. Remove or feature-flag before beta deploy — module is not in v1 scope.

## Product Language — Non-Negotiable

Inner Ops is "a system for turning self-awareness into self-command."

It is **not** a habit tracker, wellness app, or motivational tool. Enforce this everywhere:

- No wellness framing. No "self-care" or "mindfulness" language.
- No motivational copy. No "you got this," no encouragement, no affirmations.
- Emergency/crisis surfaces use **grounding language**, not inspirational messaging (ref: EmergencyButton fix).
- Philosophical precision is required. When in doubt, err toward stark clarity over softness.
- Identity Frameworks v2 is part of the product definition — reference it for tone and conceptual alignment.

## Stack

- React 18 + Vite, JavaScript
- Firebase Auth + Firestore (real-time listeners, no Redux)
- Tailwind CSS (animations via Tailwind utilities and CSS keyframes — no animation library)
- Sentry (error tracking), PostHog (analytics)
- Claude API via Firebase Cloud Function proxy — **never expose API keys client-side**

## Modules (v1)

| Module | Page | Key Utils |
|--------|------|-----------|
| **Journaling** | `src/pages/Journal.jsx` | `aiFeedback.js` |
| **Kill List** | `src/pages/KillList.jsx` | `useKillTargets.js` (used by `KillListDashboard.jsx`) |
| **Hard Lessons** | `src/pages/HardLessons.jsx` | Lesson extraction via Oracle cloud function |
| **Relapse Radar** | `src/pages/Relapse.jsx` → `RelapseRadar.jsx` | `detectDriftSignals.js`, `detectEvasionMarkers.js` |
| **Synthesis** | `src/pages/SynthesisBriefing.jsx` | `generateSynthesisBriefing.js`, `getBehavioralContext.js` |
| **Dashboard** | `src/pages/Dashboard.jsx` | `clarityScore.js`, `KillListDashboard.jsx`, `DailyPrompt.jsx` |

### Deferred (not v1)

| Module | Status |
|--------|--------|
| **Black Mirror** | Component and route exist. Nav link present. Do not QA, do not surface to beta testers. Gate or remove before deploy. |

## Cross-Module Architecture

Synthesis and Oracle both read across all modules via `readUserData`. Key data flows:

- **`generateSynthesisBriefing.js`** — Pulls journalEntries, killTargets, hardLessons, relapseEntries, blackMirrorEntries, userSettings. Computes convergence point, violated rules, signal delta. Cadence-enforced (weekly/biweekly). Confrontation question via Oracle with local fallback.
- **`getBehavioralContext.js`** — 5-minute cached cross-module snapshot injected into Oracle calls. Gives Oracle awareness of active kill targets, relapse archetypes, drift signals, rule violations, and identity direction.
- **`detectDriftSignals.js`** — Rules-based early warning. Archetype frequency (3+ in 7d), precursor pattern recurrence, correlated Kill List escape + relapse within 48h.
- **`detectEvasionMarkers.js`** — Behavioral evasion detection layer.

## Cloud Functions

| Function | Purpose |
|----------|---------|
| `oracle` | Secure Claude API proxy. Auth-gated, rate-limited (20/day). Module-aware system prompts with posture matching (challenge/build/ground/clarify/receive). Receives behavioral context. |
| `oracleFollowUp` | Second-layer conversational response. Reads user's reply to initial Oracle feedback and adapts posture. |

## Commands

- `npm run dev` — Vite dev server
- `npm run build` — production build
- `npm test` — runs node:test on `aiFeedback.test.js`, `clarityScore.test.js`, `dailyBrief.test.js`, `oracleQuestionExtractor.test.js`, `dateUtils.test.js`, `detectDriftSignals.test.js`, `getBehavioralContext.test.js`, and `generateSynthesisBriefing.test.js`

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
- **Clarity Score must not be gameable.** When touching `src/utils/clarityScore.js`, verify new inputs can't be farmed (fake relapses, dummy hard lessons, etc.).
- **Mobile nav must work.** `src/components/Navbar.jsx` historically used `hidden md:flex` with no mobile fallback — verify any nav change renders on mobile.
- **Visualize what you track.** If a module stores data, it must be surfaced somewhere (trends, history, rates). Flag gaps when you see them.
- **No speculative generality.** Don't add features, abstractions, or infrastructure beyond the task.

## Pre-Deploy Checklist

- [x] Remove or feature-flag Black Mirror from Navbar and App.jsx routes — gated by `VITE_ENABLE_BLACK_MIRROR` env var (default off)
- [x] Add Firebase Hosting config to `firebase.json`
- [ ] Verify `.env` / environment variables are set for production Firebase project
- [ ] Run `npm run build` and confirm clean production build
- [ ] Deploy Firestore rules (`firestore.rules`)
- [ ] Deploy Cloud Functions (oracle, oracleFollowUp)
- [ ] Set `ANTHROPIC_API_KEY` secret in Firebase Functions config
- [ ] Smoke test: auth flow, journal CRUD, Kill List operations, Hard Lessons extraction, Relapse Radar entry, Synthesis briefing generation

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
