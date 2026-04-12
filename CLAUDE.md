# Inner Ops — CLAUDE.md

## Project State

- **Status:** Pre-deploy. Nothing is live. No migrations, no hotfix urgency. Aggressive changes are safe.
- **Build:** Clean, ~390 modules. BER-1 through BER-13 closed.
- **v1 Scope (locked):** Journaling + Kill List + Hard Lessons
- **Deferred (do not build unless explicitly unblocked by Bo):**
  - Relapse Radar — pending cross-module dependency check
  - Black Mirror — complex 3-layer analytics architecture (Signal Capture, Pattern Recognition, Identity Reflection in `src/utils/blackMirrorAnalytics.js`), confirmed post-launch
- **Open items (post-launch):** Oracle UI redesign, engagement notifications, MCP/skills integration

## Product Language — Non-Negotiable

Inner Ops is "a system for turning self-awareness into self-command."

It is **not** a habit tracker, wellness app, or motivational tool. Enforce this everywhere:

- No wellness framing. No "self-care" or "mindfulness" language.
- No motivational copy. No "you got this," no encouragement, no affirmations.
- Emergency/crisis surfaces use **grounding language**, not inspirational messaging (ref: EmergencyButton fix).
- Philosophical precision is required. When in doubt, err toward stark clarity over softness.
- Identity Frameworks v2 is part of the product definition — reference it for tone and conceptual alignment.

## Stack

- React 18 + Vite, JavaScript (not TypeScript despite the devDep)
- Firebase Auth + Firestore (real-time listeners, no Redux)
- Tailwind CSS + Framer Motion
- Sentry (error tracking), PostHog (analytics)
- Claude API via Firebase Cloud Function proxy — **never expose API keys client-side**

## Modules

Journal · Kill List · Hard Lessons · Relapse Radar · Black Mirror · Dashboard (Clarity Score)

Source layout: `src/components/`, `src/pages/`, `src/hooks/`, `src/utils/`, `src/firebase.js`

## Commands

- `npm run dev` — Vite dev server
- `npm run build` — production build
- `npm test` — runs node:test on `aiFeedback.test.js` and `clarityScore.test.js`

## Agent Pipeline (Paperclip)

Three-agent system, all Claude Max:

|Role|Scope|Escalation|
|----|-----|----------|
|**QA Engineer**|Finds issues, creates BER tickets assigned to SSE|Systemic patterns → CEO|
|**Senior Software Engineer (SSE)**|Executes BER tickets|Ambiguous scope or architectural questions → CEO|
|**CEO**|Operational hub. Triages, routes, escalates to Bo|Anything requiring product/scope decisions → Bo|

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

`C:\Users\boliv\OneDrive\One Drive 2\OneDrive\Desktop\UberCore Systems\inner-ops`
