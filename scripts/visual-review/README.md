# Visual-review harness

Renders every core screen against seeded data in the Firebase emulators and
captures screenshots at mobile + desktop widths, populated + empty. Built for
pre-ship visual QA; doubles as a lightweight visual-regression harness.

## What it does

1. Starts the **Auth + Firestore emulators** (`firebase emulators:exec`).
2. **Seeds** two accounts (`seed.mjs`): `operator@inner.local` (fully populated —
   journal, ledger, hard lessons, signals, profile) and `empty@inner.local`
   (onboarded but no module data, for empty states).
3. Boots **Vite in `--mode emulator`** (`.env.emulator` sets `VITE_USE_EMULATORS`,
   which routes Auth/Firestore to localhost — the real project is never touched).
4. **Captures** each route × {390px, 1440px} × {populated, empty} with Playwright
   (`capture.mjs`), signing in through the real auth UI. PNGs land in `shots/`
   (gitignored).

## Run

```bash
npm run visual-review          # if the npm script is added
# or directly:
firebase emulators:exec --only auth,firestore --project inner-ops-8ce36 \
  "node scripts/visual-review/run.mjs"
```

Output: `scripts/visual-review/shots/*.png` (e.g. `desktop-synthesis-populated.png`,
`mobile-ledger-empty.png`, `desktop-auth-intro.png`).

## Prereqs

- Java (Firebase emulator), Firebase CLI, `@playwright/test` + chromium
  (`npx playwright install chromium`).
- Base `.env` with the `VITE_FIREBASE_*` vars (values are irrelevant to the
  emulator but firebase.js requires them present).

## Notes / gotchas

- **Emulator-only.** The `VITE_USE_EMULATORS` gate is `&& DEV`, so the wiring
  in `src/firebase.js` is dead-code-eliminated from production builds.
- Cloud Functions (Oracle) are **not** run — screens that call them show their
  graceful fallback/degraded state (e.g. Dashboard "Brief unavailable"). That's
  expected; the harness reviews layout/typography/state polish, not AI output.
- Emulator data is ephemeral (fresh each run). To persist, add `--import/--export`.
- Auth on first visit shows the `BriefingScreen` intro; `capture.mjs` clicks
  through "Enter" before signing in.
