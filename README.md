# Inner Ops

**A system for turning self-awareness into self-command.**

Inner Ops is not a habit tracker, wellness app, or motivational tool. It is a personal self-governance system — a dark, focused command center for men who want to govern their own minds rather than be managed by them.

## v1 Modules

- **Journal** — structured logging for pattern detection, not catharsis
- **Kill List** — behavioral elimination contracts with implementation intentions
- **Hard Lessons** — forensic extraction of irreversible signal from irreversible pain

Dashboard aggregates all three into a Clarity Score — a measure of behavioral self-command, not wellness.

## Stack

React 18 · Vite · Firebase (Auth + Firestore) · Tailwind · Framer Motion · Sentry · PostHog

AI feedback routes through a Firebase Cloud Function proxy to the Claude API — keys are never exposed client-side.

## Scripts

```bash
npm run dev      # Vite dev server
npm run build    # production build
npm test         # node:test on aiFeedback and clarityScore
```

## Status

Live since 2026-07-25 (closed beta). v1 scope is locked to Journaling, Kill List, Hard Lessons, Relapse Radar, and Synthesis.
