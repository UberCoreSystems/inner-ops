# Inner Ops Repo Audit — 2026-05-05

Read-only static audit. No files were modified. All findings cite file paths and reasoning. Bo to direct deletions/refactors in a follow-up pass.

## Summary

- **Tracked files in repo:** 113
- **Total findings:** 47
- **Recommended deletions (working tree, gitignored bloat):** 16 files / dirs (~325 KB local, 0 KB committed)
- **Recommended deletions (tracked):** 7 files (1 source, 6 docs/configs)
- **Recommended dependency removals:** 9 (7 deps + 2 devDeps)
- **Files flagged for SPLIT:** 4 (KillList, HardLessons, Journal, RelapseRadar)
- **Files flagged for REVIEW:** 5
- **Estimated repo cleanup:**
  - Working tree: ~325 KB of agent artifacts + ~2.7 MB of `dist`/`dist-check` clutter (already gitignored)
  - Tracked: ~155 KB of stale/duplicate docs (research + agents/), ~9 deps cleared from package.json, ~1700 lines of deferred Black Mirror code can be branched out

---

## Critical (ship-blocking or risk)

- **None.** Pre-deploy checklist items in CLAUDE.md (Black Mirror gate in App.jsx and Navbar.jsx) are already remediated via `BLACK_MIRROR_ENABLED` flag. CSP, Firestore rules, secrets, and rate limits all addressed in prior QA passes.

## High Priority (clear wins, low risk)

1. **Delete unused dependencies** — 7 production deps + 2 devDeps never imported. See §1.3.
2. **Delete `src/index.jsx`** — one-line file never imported; entry is `index.html` → `/src/main.jsx`. See §1.1.
3. **Delete or branch out deferred Black Mirror code** — 4 files / ~1,725 lines for a feature that is feature-flagged off and deferred post-launch. See §8.
4. **Delete locally-bloating gitignored agent artifacts** — `DAILY_REVIEW.md` (94 KB), `DEAD_CODE_REPORT.md`, 4 × `QA_REVIEW_REPORT*.md`, `WEEKLY_HEALTH.md`, 8 × `vite.config.js.timestamp-*.mjs`, `dist/`, `dist-check/`. None are committed; all are noise in the working tree. See §3.
5. **Fix corrupted `agents/product-researcher/AGENTS.md`** — lines 1-200 are valid; lines 200-575 are escaped-markdown duplication of UXR-001. See §4.
6. **Remove dead chunk references in `vite.config.js`** — `framer-motion` and `openai` referenced in `manualChunks` but not in `package.json` and not imported. See §1.3.
7. **Delete unused Cloud Function `oracleFollowUp`** — exported from `functions/index.js:277` but never invoked from the app (no `httpsCallable('oracleFollowUp')`). See §1.4.
8. **Stop committing & shipping `dist-check/`** — older sibling of `dist/`, both already gitignored, but the working tree carries 2.7 MB of stale build artifacts. See §3.

## Medium Priority (judgment calls)

9. **Split four mega-files** — `pages/KillList.jsx` (2184 LOC), `pages/HardLessons.jsx` (1622), `pages/Journal.jsx` (1450), `components/RelapseRadar.jsx` (1170). See §5.1.
10. **Extract duplicated date/timestamp helper** — same `toMs(entry.createdAt) ?? entry.timestamp ?? 0` shape exists in 4 files (clarityScore, generateSynthesisBriefing, getBehavioralContext, blackMirrorAnalytics). See §2.1.
11. **Extract Firestore cross-module reader** — `Promise.all([readUserData(...)])` for the same 5–6 collections is repeated in 4 utils. See §2.2.
12. **Reduce `OracleModal.jsx` prop count** — 21 props is a code smell; consider grouping or sub-component split. See §5.7.
13. **Decide on `src/utils/firebaseAdmin.js`** — intentionally retained for "one-off recovery work" but never imported in production paths. Either move to a `scripts/` folder or delete. See §1.1.
14. **Fix CLAUDE.md drift** — `useKillTargets` hook is described as "removed — logic in component" but `src/hooks/useKillTargets.js` is alive and used by `KillListDashboard`. See §9.
15. **Consolidate QA reports** — keep `audit/PRE_SHIP_REVIEW.md` (canonical 2026-04-24); the 4 `QA_REVIEW_REPORT_PASS_*.md` files are precursor passes whose unique findings already migrated. See §4.

## Low Priority (nice-to-have)

16. Update stale `package.json` description: "React TypeScript on Replit, using Vite bundler" — project is JS, not Replit. See §6.
17. Update `package.json` `test` script — runs 4 test files but CLAUDE.md only lists 2. See §6.
18. Add test files for `detectDriftSignals.js`, `blackMirrorAnalytics.js`, `getBehavioralContext.js`, `generateSynthesisBriefing.js`. See §2.
19. Centralize `DailyPrompt.jsx` 150+ inline prompt templates. See §5.5.
20. Externalize cloud function magic numbers (`DAILY_LIMIT`, `TRUST_THRESHOLD`, `MAX_*_CHARS`). See §5.5.

---

## Findings by Category

### 1. Dead Code

#### 1.1 Unreferenced files

| File | Evidence | Recommendation |
|---|---|---|
| [src/index.jsx](src/index.jsx) | 1-line file: `import './main.jsx';`. `index.html:25` references `/src/main.jsx` directly; nothing imports `index.jsx`. | **DELETE** |
| [src/utils/firebaseAdmin.js](src/utils/firebaseAdmin.js) (328 LOC) | Not imported anywhere in `src/`. Dashboard.jsx:167 + 754 contain comments stating it's retained "for one-off recovery work." | **REVIEW** — move to `scripts/` or delete |

#### 1.2 Unused exports

No truly orphaned exports detected by grep cross-check across `src/utils`, `src/hooks`, `src/components`. Every named export has at least one importer.

#### 1.3 Unused dependencies (`package.json`)

Verified by `grep "from ['\"]<pkg>"` across `src/` and `functions/` (no source imports any of these):

| Package | Declared | Source imports | Recommendation |
|---|---|---|---|
| `framer-motion` | (only in `package-lock.json` and `vite.config.js:41`) — **NOT** in `package.json` | none | **DELETE chunk reference** in [vite.config.js:41](vite.config.js#L41) |
| `openai` | not in `package.json` | none | **DELETE chunk reference** in [vite.config.js:44](vite.config.js#L44) |
| `@firebase/auth` | [package.json:30](package.json#L30) | only `firebase/auth` (sub-path of `firebase`) is imported | **DELETE** — transitive of `firebase`, not directly needed |
| `@headlessui/react` | [package.json:31](package.json#L31) | none | **DELETE** |
| `@heroicons/react` | [package.json:32](package.json#L32) | none — project uses [src/components/AppIcons.jsx](src/components/AppIcons.jsx) (custom SVGs) | **DELETE** |
| `axios` | [package.json:35](package.json#L35) | none | **DELETE** |
| `file-saver` | [package.json:36](package.json#L36) | none | **DELETE** |
| `react-speech-recognition` | [package.json:43](package.json#L43) | none — [src/hooks/useVoiceInput.js:23](src/hooks/useVoiceInput.js#L23) uses native `window.SpeechRecognition` | **DELETE** |
| `react-refresh` | [package.json:41](package.json#L41) | typically a transitive of `@vitejs/plugin-react` | **REVIEW** — usually unneeded as a direct dep |
| `@types/react` | [package.json:17](package.json#L17) (devDep) | no `.ts/.tsx` files exist; CLAUDE.md confirms JS-only project | **DELETE** |
| `@types/react-dom` | [package.json:18](package.json#L18) (devDep) | same | **DELETE** |
| `typescript` | [package.json:26](package.json#L26) (devDep) | same | **DELETE** |

Legit-and-keep: `firebase`, `react`, `react-dom`, `react-router-dom`, `react-hot-toast`, `@sentry/react`, `posthog-js` (lazy-loaded in [analytics.js:23](src/utils/analytics.js#L23)), `tailwindcss`, `postcss`, `autoprefixer` (PostCSS pipeline), `terser` (vite minifier), `eslint*`, `@vitejs/plugin-react`.

#### 1.4 Unused Cloud Functions

| Function | Defined | Caller search | Recommendation |
|---|---|---|---|
| `oracle` | [functions/index.js](functions/index.js) | called via `httpsCallable(functions, 'oracle', ...)` in 5 places (aiFeedback.js:569, crossModuleExtraction.js:74, dailyBrief.js:408, OracleModal.jsx:28, generateSynthesisBriefing.js:224) | **KEEP** |
| `oracleFollowUp` | [functions/index.js:277](functions/index.js#L277) | grep for `httpsCallable('oracleFollowUp')` and `oracleFollowUp(` returns **zero call sites** in `src/`. The string `oracleFollowUp` appears only as a Firestore field name read on `entry.oracleFollowUp` in Journal.jsx | **DELETE** (or document as future use; CLAUDE.md still claims it's wired) |

#### 1.5 Commented-out code blocks

No 5+ line commented-out code blocks of consequence. Inline comments are explanatory, not dead code.

#### 1.6 Unreachable branches

None observed in spot-checks of the largest files.

---

### 2. Duplication

#### 2.1 Date/timestamp normalization (4 copies)

Identical Firestore-Timestamp → ms shape:

- [src/utils/clarityScore.js:55-61](src/utils/clarityScore.js#L55-L61) — `toMs()`
- [src/utils/generateSynthesisBriefing.js:34-35](src/utils/generateSynthesisBriefing.js#L34-L35) — `getTimestamp()`
- [src/utils/getBehavioralContext.js:32-33](src/utils/getBehavioralContext.js#L32-L33) — `getTimestamp()`
- [src/utils/blackMirrorAnalytics.js:111-115](src/utils/blackMirrorAnalytics.js#L111-L115) — `parseDate()`

**Recommendation:** EXTRACT into `src/utils/dateUtils.js`. If Firestore Timestamp handling ever changes, four edits are required today.

#### 2.2 Cross-module readUserData aggregator (4 copies)

Each fetches the same 5–6 collections with the same `Promise.all`/`Promise.allSettled` shape:

- [src/utils/clarityScore.js:114-120](src/utils/clarityScore.js#L114-L120)
- [src/utils/generateSynthesisBriefing.js:65-71](src/utils/generateSynthesisBriefing.js#L65-L71)
- [src/utils/getBehavioralContext.js:54-61](src/utils/getBehavioralContext.js#L54-L61)
- [src/utils/blackMirrorAnalytics.js:574-584](src/utils/blackMirrorAnalytics.js#L574-L584)

**Recommendation:** EXTRACT `fetchBehavioralCollections(userId, names[])` helper.

#### 2.3 Drift vs. evasion — confirmed orthogonal (KEEP)

[detectDriftSignals.js](src/utils/detectDriftSignals.js) is rules-based persistence detection; [detectEvasionMarkers.js](src/utils/detectEvasionMarkers.js) is linguistic pattern matching. Different inputs, different outputs — not duplicates.

#### 2.4 `debounce` vs. `performanceUtils.throttle` — confirmed distinct (KEEP)

#### 2.5 Page wrapper vs. component (KEEP)

[pages/Relapse.jsx](src/pages/Relapse.jsx) is intentionally a 74-line decorator around the 1170-line [components/RelapseRadar.jsx](src/components/RelapseRadar.jsx). Same pattern is fine.

#### 2.6 Test coverage gaps (not duplication, but adjacent)

| Util | Test file | Risk |
|---|---|---|
| `detectDriftSignals.js` | none | MEDIUM — rules-based detector silently breaks |
| `blackMirrorAnalytics.js` | none | LOW (deferred module, but 642 LOC) |
| `getBehavioralContext.js` | none | MEDIUM — feeds Oracle prompts |
| `generateSynthesisBriefing.js` | none | MEDIUM — user-visible briefing logic |

---

### 3. Orphaned & Unrecognized Files (working-tree clutter)

All of these are **gitignored** (per `.gitignore` lines 83–84, 139, 143–146) so they are NOT committed. They still exist in the working tree and inflate local navigation/grep noise.

| File / dir | Size | Status | Recommendation |
|---|---|---|---|
| [DAILY_REVIEW.md](DAILY_REVIEW.md) | 94 KB | gitignored agent artifact | **DELETE locally** |
| [DEAD_CODE_REPORT.md](DEAD_CODE_REPORT.md) | 20 KB | gitignored agent artifact (2026-04-08, superseded by this audit) | **DELETE locally** |
| [QA_REVIEW_REPORT.md](QA_REVIEW_REPORT.md) | 23 KB | gitignored | **DELETE locally** (rolled into `audit/PRE_SHIP_REVIEW.md`) |
| [QA_REVIEW_REPORT_PASS_2.md](QA_REVIEW_REPORT_PASS_2.md) | 27 KB | gitignored | **DELETE locally** |
| [QA_REVIEW_REPORT_PASS_3.md](QA_REVIEW_REPORT_PASS_3.md) | 20 KB | gitignored | **DELETE locally** |
| [QA_REVIEW_REPORT_PASS_4.md](QA_REVIEW_REPORT_PASS_4.md) | 13 KB | gitignored | **DELETE locally** |
| [WEEKLY_HEALTH.md](WEEKLY_HEALTH.md) | 6.8 KB | gitignored | **DELETE locally** |
| 8 × `vite.config.js.timestamp-*.mjs` | ~57 KB | gitignored Vite cache | **DELETE locally** |
| `dist/` | 1.4 MB | gitignored build output | **DELETE locally** (regenerate with `npm run build`) |
| `dist-check/` | 1.3 MB | gitignored, mtime 2026-04-19 (older than `dist/`) | **DELETE locally** — purpose unclear, probably a staging-build artifact |

No misplaced files (utility in `/components`, component in `/utils`, etc.) detected.

---

### 4. Documentation Bloat

Tracked `.md` files only:

| File | Size | Status | Reason |
|---|---|---|---|
| [CLAUDE.md](CLAUDE.md) | 7.5 KB | **KEEP** | Canonical project instructions; minor drift (see §9) |
| [README.md](README.md) | 1.1 KB | **KEEP** | Concise high-level intro |
| [SCORING.md](SCORING.md) | 3.6 KB | **REVIEW** | Single-purpose spec for `clarityScore.js`. Either keep as the source of truth referenced from the util, or merge into CLAUDE.md as a `## Scoring Weights` subsection. Currently neither util nor CLAUDE.md cite it. |
| [audit/PRE_SHIP_REVIEW.md](audit/PRE_SHIP_REVIEW.md) | 12 KB | **KEEP** | Canonical pre-ship audit (2026-04-24, supersedes 4 QA passes) |
| [agents/product-researcher/AGENTS.md](agents/product-researcher/AGENTS.md) | 575 lines | **FIX** | Lines 1-~200 are the valid Product Researcher role. Lines 200–575 are escaped-markdown content (`\#`, `\##`, `\*`) duplicating UXR-001 — visible at line 200 onwards. Truncate to `## Handoff` / `Done When` section or restore the original spec. |
| [research/UXR-001-ENHANCEMENT-REPORT.md](research/UXR-001-ENHANCEMENT-REPORT.md) | 16 KB | **KEEP** | Strategic post-v1 reference (2026-04-09) |
| [research/UXR-002-ENHANCEMENT-REPORT.md](research/UXR-002-ENHANCEMENT-REPORT.md) | 16 KB | **REVIEW** | "Independent rerun" of UXR-001 (2026-04-16). Top-5 findings differ (philosophy drift, mood emoji retirement, gamification audit). MERGE the differential findings as a `## Surface Alignment` section in UXR-001 and DELETE the rest. |
| [research/WEEKLY_INTELLIGENCE.md](research/WEEKLY_INTELLIGENCE.md) | 38 KB | **REVIEW** | 1007-line append-only research log. Useful as backlog, but 38 KB of one-time research output in a code repo is heavy. Consider moving the `research/` directory out of the app repo into a private notes repo. |

Stale-reference scan: no broken file paths, no obsolete agent names, no references to deleted modules. Black Mirror, Command Brief, Oura, Paperclip — all references are intentional and accurate.

**Net:** the docs that are committed are mostly fine; the bloat is in working-tree gitignored artifacts (§3) and one corrupted file (`agents/product-researcher/AGENTS.md`). Plus `research/` (~70 KB) is arguably out of scope for the source repo.

---

### 5. Code Quality Signals

#### 5.1 Files >400 lines

| File | LOC | Notes | Recommendation |
|---|---|---|---|
| [src/pages/KillList.jsx](src/pages/KillList.jsx) | 2184 | Page + multiple sub-components + 60+ helpers + autopsy + archive + AI feedback modal + backfill card all inline | **SPLIT** |
| [src/pages/HardLessons.jsx](src/pages/HardLessons.jsx) | 1622 | Lesson form + Scar Inventory flow + Kill List bridge + Rules Library detection + Oracle modal | **SPLIT** |
| [src/pages/Journal.jsx](src/pages/Journal.jsx) | 1450 | 10 inline mood SVGs + form + Oracle modal + voice input + archive + intensity ring | **SPLIT** (move SVGs/IntensityRing to `components/`) |
| [src/components/RelapseRadar.jsx](src/components/RelapseRadar.jsx) | 1170 | 13 state hooks + drift detection + precursor capture + archetype matching + bridge prompt | **SPLIT** |
| [src/utils/aiFeedback.js](src/utils/aiFeedback.js) | 1021 | Internally well-modularized (evasion, tokenization, similarity, fallback, prompt composition) | **KEEP** + JSDoc top exports |
| [src/components/BlackMirror.jsx](src/components/BlackMirror.jsx) | 891 | DEFERRED — see §8 | **BRANCH OUT** |
| [src/pages/Dashboard.jsx](src/pages/Dashboard.jsx) | 759 | Hub page; intentional density | **KEEP** |
| [src/utils/blackMirrorAnalytics.js](src/utils/blackMirrorAnalytics.js) | 642 | DEFERRED — see §8 | **BRANCH OUT** |
| [src/components/KillListDashboard.jsx](src/components/KillListDashboard.jsx) | 631 | KEEP |
| [src/utils/clarityScore.js](src/utils/clarityScore.js) | 474 | KEEP |
| [src/hooks/useKillTargets.js](src/hooks/useKillTargets.js) | 498 | KEEP |
| [src/utils/dailyBrief.js](src/utils/dailyBrief.js) | 460 | KEEP |
| [src/components/OracleModal.jsx](src/components/OracleModal.jsx) | 442 | See §5.7 — prop count |
| [src/components/EmergencyButton.jsx](src/components/EmergencyButton.jsx) | 380 | KEEP |
| [src/components/QuickJournalModal.jsx](src/components/QuickJournalModal.jsx) | 376 | KEEP |
| [src/pages/Profile.jsx](src/pages/Profile.jsx) | 353 | KEEP |
| [src/pages/Onboarding.jsx](src/pages/Onboarding.jsx) | 338 | KEEP |
| [src/components/DailyPrompt.jsx](src/components/DailyPrompt.jsx) | 331 | 150+ inline prompt templates → see §5.5 |
| [src/utils/firebaseAdmin.js](src/utils/firebaseAdmin.js) | 328 | See §1.1 — REVIEW |

#### 5.2 Functions >75 lines

- [src/utils/aiFeedback.js:468](src/utils/aiFeedback.js#L468) — `composeFeedback()` (~80 lines)
- [src/utils/dailyBrief.js:66](src/utils/dailyBrief.js#L66) — `loadDefaults()` (~160 lines)
- [src/utils/clarityScore.js:39](src/utils/clarityScore.js#L39) — `loadDefaults()` (~150 lines)
- All four mega-page bodies in §5.1 (KillList, HardLessons, Journal, RelapseRadar) effectively are giant single function bodies.

#### 5.3 TODO / FIXME / HACK / XXX

**Zero matches** in `src/` and `functions/`. Clean.

#### 5.4 `console.*` in production paths

All direct `console.*` calls are guarded:
- [src/utils/logger.js:18-21](src/utils/logger.js#L18-L21) — guarded by `__INNER_OPS_IS_DEV__` build-time flag (vite.config.js:62 + terser `drop_console: true`)
- [src/components/VirtualizedList.jsx:77](src/components/VirtualizedList.jsx#L77) — guarded by `import.meta.env.DEV`
- All other code routes through `logger`. ✓

#### 5.5 Hardcoded values that should be config

| File:Line | Value | Severity |
|---|---|---|
| [functions/index.js:11](functions/index.js#L11) | `DAILY_LIMIT = 20` | Low — externalize |
| [functions/index.js:16](functions/index.js#L16) | `TRUST_THRESHOLD = 21` | Low — externalize |
| [functions/index.js:19-23](functions/index.js#L19-L23) | `MAX_*_CHARS` caps | Low — externalize |
| [src/components/DailyPrompt.jsx](src/components/DailyPrompt.jsx) (~150 templates) | Static prompt copy | Medium — move to `src/constants/dailyPrompts.js` |
| [src/utils/aiFeedback.js:572-579](src/utils/aiFeedback.js#L572-L579) | Lens→tone map | Low — keep, document sync with server |

**No real credentials, emails, tokens, or PII detected.** ✓

#### 5.6 Naming inconsistency

Minor:
- Entry-type pluralization mixed: `journalEntries` / `relapseEntries` / `lessons` / `hardLessons`. Standardize to plural with module prefix.
- [src/components/OracleModal.jsx:57-58](src/components/OracleModal.jsx#L57-L58) accepts both `loading` and `isLoading: isLoadingProp` — pick one.

#### 5.7 Excessive props / nesting

- [src/components/OracleModal.jsx:51-71](src/components/OracleModal.jsx#L51-L71) — **21 props.** Group into `feedbackState`, `entryContext`, and event handlers; or split into `OracleModalCore` + `OracleFollowUpFlow` sub-components.
- No JSX nesting >5 deep observed in spot checks.

#### 5.8 Mixed module systems

Clean. `src/` is ESM throughout; `functions/index.js` uses CommonJS as required by Firebase Functions runtime. ✓

---

### 6. Configuration & Tooling Drift

| File | Issue | Recommendation |
|---|---|---|
| [package.json:5](package.json#L5) | Description: `"React TypeScript on Replit, using Vite bundler"` — project is JS, not on Replit | **EDIT** |
| [package.json:10](package.json#L10) | `test` script runs 4 test files; CLAUDE.md `## Commands` only lists 2 | **SYNC** CLAUDE.md or shorten script |
| [package.json:17-18,26](package.json#L17-L18) | `@types/react`, `@types/react-dom`, `typescript` declared but no `.ts*` files | **DELETE** |
| [vite.config.js:41,44](vite.config.js#L41) | `manualChunks` references `framer-motion` and `openai` — neither in deps, neither imported | **DELETE** chunk lines |
| [.eslintrc.json](.eslintrc.json) | Single root config, sensible | **KEEP** |
| [.env](.env) / [.env.production](.env.production) | gitignored (correctly) | **KEEP**, do not commit |
| [.env.example](.env.example) | Tracked, current | **KEEP** |
| [firebase.json](firebase.json) | Hosting config present (was a pre-deploy checklist item) | **KEEP** — checklist item resolved |
| `firestore.indexes.json` | Single small file | KEEP |
| `postcss.config.js` | Standard Tailwind setup | KEEP |
| `tailwind.config.js` | Standard | KEEP |

No conflicting/duplicate ESLint configs; no Prettier config (consistent — repo uses ESLint only).

---

### 7. Asset Bloat

Only one asset: [public/favicon.svg](public/favicon.svg). No `src/assets/`. No images, fonts, or icons committed elsewhere. ✓ Clean. (Application icons live in [src/components/AppIcons.jsx](src/components/AppIcons.jsx) as inline SVG components — that's why `@heroicons/react` is unused.)

---

### 8. Module-Specific Review

#### 8.1 v1 modules — clean

| Module | Page | Status |
|---|---|---|
| Journaling | [pages/Journal.jsx](src/pages/Journal.jsx) | Active. Needs split (§5.1). |
| Kill List | [pages/KillList.jsx](src/pages/KillList.jsx) | Active. Needs split (§5.1). |
| Hard Lessons | [pages/HardLessons.jsx](src/pages/HardLessons.jsx) | Active. Needs split (§5.1). |
| Relapse Radar | [pages/Relapse.jsx](src/pages/Relapse.jsx) → [components/RelapseRadar.jsx](src/components/RelapseRadar.jsx) | Active. Needs split (§5.1). |
| Synthesis | [pages/SynthesisBriefing.jsx](src/pages/SynthesisBriefing.jsx) + [utils/generateSynthesisBriefing.js](src/utils/generateSynthesisBriefing.js) | Active. Clean. Lacks tests. |
| Oracle | [functions/index.js](functions/index.js) `oracle` + [components/OracleModal.jsx](src/components/OracleModal.jsx) | Active. `oracleFollowUp` is dead (§1.4). |

#### 8.2 Deferred Black Mirror — in tree, ~1,725 lines

Route is correctly env-gated in [App.jsx:23,257-270](src/App.jsx#L23) and [Navbar.jsx:78-80](src/components/Navbar.jsx#L78-L80) — the pre-deploy checklist item from CLAUDE.md is **already satisfied**.

However, the code is still in the production bundle's import graph for any caller of related utilities and represents ~1,725 lines of dead weight in the v1 codebase:

| File | LOC | Used by |
|---|---|---|
| [src/components/BlackMirror.jsx](src/components/BlackMirror.jsx) | 891 | Lazy-loaded only when `VITE_ENABLE_BLACK_MIRROR=true` |
| [src/components/CueRestructuringFlow.jsx](src/components/CueRestructuringFlow.jsx) | 192 | Only by BlackMirror.jsx |
| [src/hooks/useCueRestructuring.js](src/hooks/useCueRestructuring.js) | 31 | Only by BlackMirror.jsx |
| [src/utils/blackMirrorAnalytics.js](src/utils/blackMirrorAnalytics.js) | 642 | BlackMirror.jsx (full) **and** [CueRestructuringFlow.jsx:3](src/components/CueRestructuringFlow.jsx#L3) (only `PATTERN_LABELS` const) |
| **Total** | **~1,756** | |

**Open question:** branch out to a `feature/black-mirror` branch until post-launch unblocks it, or accept the in-tree weight (it's tree-shaken at build time when the feature flag is off, but human cognitive load remains). Bo's call.

#### 8.3 No stray references to removed/deferred features

- "Command Brief" — only mentioned in CLAUDE.md as a deferred concept; no code references. ✓
- "Oracle UI redesign" — open item in CLAUDE.md; no leaked code. ✓
- "engagement notifications" — no code references. ✓
- "MCP/skills integration" — no code references. ✓

---

### 9. Other

1. **CLAUDE.md drift on `useKillTargets`.** [CLAUDE.md:39](CLAUDE.md#L39) says `useKillTargets.js (hook removed — logic in component)`. Reality: the file is alive at [src/hooks/useKillTargets.js](src/hooks/useKillTargets.js) (498 LOC) and used by [src/components/KillListDashboard.jsx:9](src/components/KillListDashboard.jsx#L9). Either CLAUDE.md is stale, or the hook should actually be removed. **REVIEW.**
2. **`agents/product-researcher/AGENTS.md` corruption.** Lines 200–575 are escaped-markdown duplicate of UXR-001. The agent spec was likely concatenated to itself with a bad copy. See §4.
3. **`research/` directory in source repo.** ~70 KB of one-off research output. Consider extracting to a separate notes repo if Bo wants a leaner code repo. Optional.
4. **Two `dist*` directories in working tree.** Both gitignored. `dist-check/` mtime is 2026-04-19, `dist/` is 2026-05-02. Purpose of `dist-check` unclear — was likely a staging compare artifact that was forgotten. Even though gitignored, both should be removed locally; `dist-check` mention should be removed from `.gitignore:84` if Bo confirms it's not a workflow.
5. **No CI configuration tracked.** No `.github/workflows`, no `.gitlab-ci.yml`, no `.circleci/`. CLAUDE.md mentions a "CI Agent" — that appears to be a Paperclip role, not a hosted CI. Confirm no CI config is missing if you want one before deploy.

---

## Files Recommended for Deletion (consolidated)

### Tracked (committed to repo) — needs `git rm`

1. [src/index.jsx](src/index.jsx) — never imported (§1.1)
2. Cloud function `oracleFollowUp` block in [functions/index.js:277](functions/index.js#L277) — uncalled (§1.4)

### Tracked but corrupted — repair, don't delete

3. [agents/product-researcher/AGENTS.md](agents/product-researcher/AGENTS.md) — truncate at line ~200 (§4)

### Working tree only (already gitignored — local cleanup)

4. [DAILY_REVIEW.md](DAILY_REVIEW.md)
5. [DEAD_CODE_REPORT.md](DEAD_CODE_REPORT.md)
6. [QA_REVIEW_REPORT.md](QA_REVIEW_REPORT.md)
7. [QA_REVIEW_REPORT_PASS_2.md](QA_REVIEW_REPORT_PASS_2.md)
8. [QA_REVIEW_REPORT_PASS_3.md](QA_REVIEW_REPORT_PASS_3.md)
9. [QA_REVIEW_REPORT_PASS_4.md](QA_REVIEW_REPORT_PASS_4.md)
10. [WEEKLY_HEALTH.md](WEEKLY_HEALTH.md)
11. `vite.config.js.timestamp-1776388522704-4db2628a4b402.mjs`
12. `vite.config.js.timestamp-1776388539200-43cdfdf103c52.mjs`
13. `vite.config.js.timestamp-1776388828298-74024bc2a3866.mjs`
14. `vite.config.js.timestamp-1776388951431-a84571094f282.mjs`
15. `vite.config.js.timestamp-1776391613757-09cdbe43d3715.mjs`
16. `vite.config.js.timestamp-1776391628450-d509dd60d4f06.mjs`
17. `vite.config.js.timestamp-1776392091488-6be4c42b5b93d.mjs`
18. `vite.config.js.timestamp-1776392220148-3860400e4e35b.mjs`
19. `dist/`
20. `dist-check/`

### Dependencies — `package.json` edits

Remove from `dependencies`:
- `@firebase/auth`
- `@headlessui/react`
- `@heroicons/react`
- `axios`
- `file-saver`
- `react-speech-recognition`
- `react-refresh` (verify; usually transitive)

Remove from `devDependencies`:
- `@types/react`
- `@types/react-dom`
- `typescript`

### `vite.config.js` edits

- Remove [vite.config.js:41](vite.config.js#L41) `framer-motion` chunk
- Remove [vite.config.js:44](vite.config.js#L44) `openai` chunk

### Conditional deletions (Bo to decide)

- [src/utils/firebaseAdmin.js](src/utils/firebaseAdmin.js) (328 LOC) — keep only if recovery script use case remains; otherwise delete or move to `scripts/`
- [research/UXR-002-ENHANCEMENT-REPORT.md](research/UXR-002-ENHANCEMENT-REPORT.md) — merge differential findings into UXR-001 then delete
- [SCORING.md](SCORING.md) — merge into CLAUDE.md or formally link from clarityScore.js
- Whole [research/](research/) directory — consider extraction to a separate notes repo
- Whole Black Mirror surface (4 files, ~1,725 LOC) — branch out vs. keep gated in tree

---

## Files Recommended for Merge / Refactor

| Group | Action |
|---|---|
| 4× date helpers (clarityScore, generateSynthesisBriefing, getBehavioralContext, blackMirrorAnalytics) | EXTRACT `src/utils/dateUtils.js` |
| 4× cross-module readUserData aggregators (same 4 files) | EXTRACT `src/utils/dataAggregation.js` (or extend `firebaseUtils.js`) |
| `pages/KillList.jsx` (2184 LOC) | SPLIT into `KillList` + `KillListAutopsyFlow` + `KillListBackfill` + `KillListArchive` |
| `pages/HardLessons.jsx` (1622 LOC) | SPLIT scar flow + rules library + bridge prompt |
| `pages/Journal.jsx` (1450 LOC) | EXTRACT mood SVGs to `components/MoodIcons.jsx` + `IntensityRing` to its own component |
| `components/RelapseRadar.jsx` (1170 LOC) | SPLIT archetype selector + precursor UI + drift display |
| `components/OracleModal.jsx` (442 LOC, 21 props) | EXTRACT `OracleFollowUpFlow` sub-component |
| `components/DailyPrompt.jsx` (~150 templates) | EXTRACT to `src/constants/dailyPrompts.js` |
| `QA_REVIEW_REPORT_PASS_*.md` (4 working-tree files) | SUPERSEDED by `audit/PRE_SHIP_REVIEW.md` — delete locally |
| CLAUDE.md commands section vs. package.json scripts | SYNC the `npm test` line |

---

## Open Questions for Bo

1. **`oracleFollowUp` Cloud Function** — defined and deployed but never called from the app. Is this an unfinished wiring (keep + finish), or genuinely dead (delete)? CLAUDE.md still describes it as active.
2. **`useKillTargets` hook** — CLAUDE.md says removed; the file is alive. Which is the source of truth? Was the hook re-added after the doc was written, or was it never removed?
3. **Black Mirror code in tree** — branch out to `feature/black-mirror` until post-launch, or accept ~1,725 LOC of feature-flagged-off code in `main`?
4. **`dist-check/`** — what was its purpose? Safe to remove from `.gitignore` line 84 and from disk?
5. **`research/` directory** — keep in code repo, or extract to a private notes repo? It's 70 KB of one-off output that doesn't change with code.
6. **`SCORING.md`** — make it a true source-of-truth for `clarityScore.js` (link from the util's docstring) or merge into CLAUDE.md?
7. **`firebaseAdmin.js`** — keep as a recovery utility (move to `scripts/`?), or delete entirely?
8. **CLAUDE.md `## Commands` drift** — package.json runs 4 test files; CLAUDE.md only lists 2. Update CLAUDE.md, or pare back the test script?
9. **CI** — no hosted CI config in repo. Was the "CI Agent" role intended to be the only CI, or is hosted CI intentionally deferred?
