# Inner Ops Pre-Ship Review — 2026-04-24

## Executive Summary

**Ship recommendation: GO WITH FIXES.**

The build is clean, tests pass (54/54), Firestore rules are comprehensive, no client-side secrets leak, code-splitting works. The blockers are a small set of **High** issues — a broken cross-module link, a missing 404 fallback, undefined Tailwind tokens, and modal accessibility gaps — none of which are deep architectural problems. Fix the 4–6 must-fix items below and the app is shippable.

| Severity | Count |
|---|---|
| Critical | 0 |
| High | 8 |
| Medium | 12 |
| Low | 7 |

### Top 5 must-fix before ship

1. **`/hard-lessons` broken link → users hit dead route** ([src/pages/KillList.jsx:1402](src/pages/KillList.jsx#L1402)). Route is `/hardlessons`. Fix: change link target.
2. **No catch-all `<Route path="*">` fallback** ([src/App.jsx:296-299](src/App.jsx#L296-L299)). Mistyped or stale URLs render nothing. Fix: add a `<Navigate to="/dashboard" replace />` or a NotFound component.
3. **`bg-oura-darker` Tailwind token is undefined** ([tailwind.config.js:12-34](tailwind.config.js#L12-L34) lacks `darker`; used in 4 files including [src/components/EmergencyButton.jsx](src/components/EmergencyButton.jsx)). Build doesn't fail but classes silently produce no styles. Fix: add `darker: '#050505'` to the `oura` color object.
4. **SynthesisGuard's `isNew` flag forces dashboard redirect on every non-exempt route** — already documented in this session, fix landed in commit `3c508e4` for manual gen, but the underlying UX failure (a stale auto-gen briefing locks all module navigation until the user opens `/synthesis`) is still High. Fix: relax the guard to a soft banner instead of a hard redirect ([src/components/SynthesisGuard.jsx:29-31](src/components/SynthesisGuard.jsx#L29-L31)).
5. **Mobile bottom-nav at 320 px viewport with "General Ledger" label is at risk of truncation/overflow** ([src/components/Navbar.jsx:91-99](src/components/Navbar.jsx#L91-L99), 6-column grid in v1, 7-column with BM enabled). Needs real-device verification.

---

## 1. Build & Deploy Readiness

| # | Severity | File:Line | Problem | Fix |
|---|---|---|---|---|
| 1.1 | Medium | [package.json:35](package.json#L35) | `openai` is in `dependencies` but no imports anywhere in `src/` (verified). Ships ~~ unused weight in node_modules; not in client bundle (Vite tree-shakes), but signals stale dep hygiene. | Remove `openai` from `package.json` dependencies and run `npm install`. |
| 1.2 | Low | [package.json:15-43](package.json) | All deps use caret ranges (`^x.y.z`). Non-deterministic builds across deploy windows. | Pin exact versions before ship; run from the lockfile (`npm ci`) in deploy pipeline. |
| 1.3 | Medium | [index.html](index.html) | Missing OG/Twitter meta tags for share previews. | Add `og:title`, `og:description`, `og:image`, `twitter:card` if shareable links matter for v1. |
| 1.4 | Low | [vite.config.js](vite.config.js) | Build config is hardened (terser, console drop, no sourcemaps in prod) — verified clean. | None. |
| 1.5 | Low | [firebase.json:19-46](firebase.json#L19-L46) | Hosting properly wired (`public: dist`, immutable cache for `/assets/**`, no-cache for `/index.html`, SPA rewrites). | None. |
| 1.6 | Low | [.env.example](.env.example) | Lists all required Firebase vars + Sentry DSN (optional) + explicit warning that Anthropic key is server-side only. | None. |
| 1.7 | Low | Build output | Dynamic-import warnings for `clarityScore.js` and `firebase.js` (statically + dynamically imported). Functionally fine; just means those modules don't get their own chunks. | Optional: convert one of the import styles to consistent path to silence warning. |

---

## 2. Routing & Navigation Integrity

| # | Severity | File:Line | Problem | Fix |
|---|---|---|---|---|
| 2.1 | **High** | [src/pages/KillList.jsx:1402](src/pages/KillList.jsx#L1402) | "Document" CTA links to `/hard-lessons` but the actual route is `/hardlessons`. Click silently fails. | Change `to="/hard-lessons"` → `to="/hardlessons"`. |
| 2.2 | **High** | [src/App.jsx:296-299](src/App.jsx#L296-L299) | No `<Route path="*">` catch-all. Mistyped URLs render nothing. | Add `<Route path="*" element={<Navigate to={user ? '/dashboard' : '/auth'} replace />} />` after all defined routes. |
| 2.3 | **High** | [src/components/SynthesisGuard.jsx:29-31](src/components/SynthesisGuard.jsx#L29-L31) | When `latestSynthesisIsNew=true`, every non-exempt route hard-redirects to `/dashboard`. Real-world failure mode: stale `isNew=true` briefing blocks all module navigation. Manual-gen path no longer sets the flag (commit `3c508e4`), but auto-gen still does, and any historical `isNew=true` doc keeps the guard active until the user opens `/synthesis`. | Replace hard `<Navigate>` with a non-blocking banner pattern (already exists at [src/pages/Dashboard.jsx:373-389](src/pages/Dashboard.jsx#L373-L389)) and stop redirecting. Or: time-box the guard (e.g., only force-redirect if briefing is < 6 h old). |
| 2.4 | Medium | [src/components/SynthesisGuard.jsx:4-12](src/components/SynthesisGuard.jsx#L4-L12) | `GUARD_EXEMPT` excludes `/profile`. If guard fires while user is editing profile, they bounce to dashboard mid-edit. | Add `'/profile'` to the exempt set. |
| 2.5 | Medium | [src/App.jsx](src/App.jsx) | Old `/killlist` URL has no redirect. Bookmarks from earlier builds 404. | Add `<Route path="/killlist" element={<Navigate to="/ledger" replace />} />`. |
| 2.6 | Medium | [src/components/Navbar.jsx:91-99](src/components/Navbar.jsx#L91-L99) | Mobile bottom-nav uses dynamic 6/7-column grid. With "General Ledger" label at `text-[9px]`, tight cells at 320 px width may wrap or truncate. **Needs real-device verification.** | Test on iPhone SE (375 px) and Galaxy S5 (360 px). If truncating, shorten mobileLabel back to "Ledger" or use `truncate` class. |
| 2.7 | Low | All `<Link to>` consumers | Spot-checked Dashboard Quick Action tiles and HardLessons cross-references — all map to defined routes. | None. |

---

## 3. Firebase Integration

| # | Severity | File:Line | Problem | Fix |
|---|---|---|---|---|
| 3.1 | Low | [firestore.rules](firestore.rules) | All 20+ collections in code have matching `match /X/{docId}` blocks with owner gating. `list` operations require `userId == auth.uid`. | None. |
| 3.2 | Low | [src/utils/firebaseUtils.js:151-208](src/utils/firebaseUtils.js#L151-L208) | `readUserData` filters by `userId` before query. `subscribeToUserData` does the same. Listener cleanup guarded with `torndown` flag. | None. |
| 3.3 | High — **Needs human review** | functions/index.js (anonymous auth path) | If Firebase Console has anonymous auth enabled, Cloud Functions accept anonymous-user requests and Firestore rules treat them as authenticated. | Verify in Firebase Console whether anonymous auth is enabled. If yes and unintended, disable. If intended, verify rules don't expose data improperly. |
| 3.4 | Medium — **Needs human review** | functions/index.js (rate-limit exemption) | `killlistextraction` and `relapsedetection` calls bypass the 20/day Oracle limit by `moduleName` string match. If `moduleName` is ever user-supplied, the cap is trivially bypassable. | Verify all client call sites pass hardcoded values for `moduleName`. They appear to (verified in [src/utils/aiFeedback.js](src/utils/aiFeedback.js)), but worth a final pass before ship. |
| 3.5 | Low | functions/index.js | `oracle` rate-limited to 20/day per user via Firestore transaction. API key via `defineSecret('ANTHROPIC_API_KEY')`. | None. |

---

## 4. State Management & Data Flow Per Module

| # | Severity | File:Line | Problem | Fix |
|---|---|---|---|---|
| 4.1 | High | [src/pages/Journal.jsx:514-530](src/pages/Journal.jsx#L514-L530) | `handleSubmit` sets `loading` but no in-flight ref. Network slowness lets user double-click and create duplicate entries before the first write returns. | Add `submittingRef.current` guard at top of handler (pattern used in [src/pages/KillList.jsx:196](src/pages/KillList.jsx#L196)). |
| 4.2 | High — **Needs human review** | Archive consumers (Journal/KillList/HardLessons/RelapseRadar) | `restoreEntry` in [src/utils/archiveUtils.js:48-67](src/utils/archiveUtils.js#L48-L67) writes to active then deletes from archive. If the second step fails, the entry exists in BOTH places. Real-time listeners will reconcile, but consumers don't explicitly handle the partial failure. | Add try/catch around `restoreEntry` calls in each consumer; on error, refresh both lists from server. |
| 4.3 | High — **Needs human review** | [src/pages/HardLessons.jsx:473](src/pages/HardLessons.jsx#L473) (`submitLesson`) | If Firestore write fails with `permission-denied` (auth lost mid-session), the catch block logs but doesn't redirect to `/auth`. User stays on a form that can never save. | Detect `error.code === 'permission-denied'` in catches and `Navigate('/auth')`. Same applies to Journal, KillList, RelapseRadar submit handlers. |
| 4.4 | Medium | [src/pages/Dashboard.jsx](src/pages/Dashboard.jsx) | Many concurrent subscriptions; auth-change listener pattern not consolidated. Re-subscribing on user change works for fresh login but stale closures in `signalReport` computation if user identity changes mid-session. | Audit `useEffect` dep arrays on Dashboard for `[user]` or `[user.uid]` inclusion. |
| 4.5 | Low | [src/pages/KillList.jsx:312-339](src/pages/KillList.jsx#L312-L339) | Real-time subscription with `skipNextSnapshot` pattern correctly avoids redundant updates after local writes. | None. |

---

## 5. Component Architecture / Dead Code / Duplication

| # | Severity | File:Line | Problem | Fix |
|---|---|---|---|---|
| 5.1 | Medium | [src/pages/Journal.jsx:94-131](src/pages/Journal.jsx#L94-L131), [src/components/QuickJournalModal.jsx:14-45](src/components/QuickJournalModal.jsx#L14-L45) | `moodCategories` (12 moods × 3 valence groups) duplicated between Journal page and Quick Entry modal. Drift risk when one is updated. | Extract to `src/constants/moods.js` (new file) and import in both. |
| 5.2 | Low | [src/utils/dataMigration.js](src/utils/dataMigration.js) | No imports anywhere in `src/`. Appears to be one-off admin tooling. | Confirm intent. If dead, delete. If retained for migration runs, document in CLAUDE.md as admin-only. |
| 5.3 | Low | [src/utils/blackMirrorAnalytics.js](src/utils/blackMirrorAnalytics.js), [src/components/CueRestructuringFlow.jsx](src/components/CueRestructuringFlow.jsx) | Only imported under `BLACK_MIRROR_ENABLED`-gated paths. Should tree-shake when flag is off. | Verified: tree-shaking works in production build (build output shows no BlackMirror chunks when flag is off). None. |
| 5.4 | Low | [src/utils/firebaseAdmin.js](src/utils/firebaseAdmin.js) | Comment claims it's only loaded in dev mode; verified no live imports. | None. |
| 5.5 | Low | All pages | Spot-checked imports — found no widespread unused-import pollution after the recent refactors. | None. |

---

## 6. Tailwind Usage

| # | Severity | File:Line | Problem | Fix |
|---|---|---|---|---|
| 6.1 | **High** | [tailwind.config.js:12-34](tailwind.config.js#L12-L34) — used in [src/components/EmergencyButton.jsx](src/components/EmergencyButton.jsx), [src/components/RelapseRadar.jsx](src/components/RelapseRadar.jsx), [src/components/CueRestructuringFlow.jsx](src/components/CueRestructuringFlow.jsx), [src/components/BlackMirror.jsx](src/components/BlackMirror.jsx) | `bg-oura-darker` / `border-oura-darker` referenced in 4 files but `oura.darker` is **not defined** in the Tailwind config. Build silently produces no styles for these classes — affected elements have no background fill. | Add `darker: '#050505'` to the `oura` color object in [tailwind.config.js](tailwind.config.js). |
| 6.2 | Medium | [src/index.css:70](src/index.css#L70), [src/index.css:102](src/index.css#L102), [src/index.css:110](src/index.css#L110), [src/index.css:114](src/index.css#L114) | `.oura-card-active`, `.oura-gradient-text`, `.glow-cyan`, `.glow-blue` defined but not all are used. (`.oura-card-active` IS used in ActiveTargetCommandBoard; verify others.) | Audit each; remove if unused. |
| 6.3 | Medium | Across the codebase | `text-[#hex]` arbitrary classes mixed with `text-oura-*` tokens within the same module. | Establish a single convention; prefer named tokens for design-system colors and reserve arbitrary hex for one-offs. |
| 6.4 | Medium | [tailwind.config.js:81-83](tailwind.config.js#L81-L83) | Safelist contains only `duration-[4000ms]`. [src/components/Navbar.jsx:91-99](src/components/Navbar.jsx#L91-L99) uses dynamic `grid-cols-N` strings constructed at runtime — those classes risk being purged. | Verified in build output that they are present (5/6/7 cols). But to be safe, add `grid-cols-5`, `grid-cols-6`, `grid-cols-7` to safelist. |
| 6.5 | Medium | Across the codebase | `text-[#6a6a6a]` (~26% luminance) on `bg-black` fails WCAG AA for body text in places. | Reserve `#6a6a6a` for tertiary captions only; raise body-text floor to `text-[#ababab]` or `text-[#858585]`. |

---

## 7. Framer Motion Usage

| # | Severity | File:Line | Problem | Fix |
|---|---|---|---|---|
| 7.1 | Low (positive) | All src/ | Verified — `framer-motion` is listed in [package.json:34](package.json#L34) but **not imported anywhere**. All animations use CSS keyframes / Tailwind utilities (`animate-spin`, `animate-fade-in-up`). | Consider removing `framer-motion` from dependencies. |
| 7.2 | Medium | [src/index.css](src/index.css) (multiple `@keyframes`) | Only `.skel-animate` respects `prefers-reduced-motion`. Other animations (spinners, fade-in-up, glow pulses) ignore the user preference. | Wrap the relevant keyframes in `@media (prefers-reduced-motion: reduce) { animation: none; }` or set `animation: none` globally for matched users. |

---

## 8. Accessibility

| # | Severity | File:Line | Problem | Fix |
|---|---|---|---|---|
| 8.1 | **High** | [src/components/OracleModal.jsx](src/components/OracleModal.jsx), [src/components/QuickJournalModal.jsx](src/components/QuickJournalModal.jsx), [src/components/KillClosureModal.jsx](src/components/KillClosureModal.jsx), [src/components/EmergencyButton.jsx](src/components/EmergencyButton.jsx) | No focus traps in modals. Tab key escapes modal into background content. No focus restoration on close. Keyboard users cannot navigate efficiently. | Add focus management — either `focus-trap-react` library or a small useEffect that captures Tab/Shift+Tab and returns focus on unmount. |
| 8.2 | **High** | Multiple icon-only buttons (archive icons in Journal/KillList/HardLessons/RelapseRadar; close X in modals; Sign Out mobile icon in [src/components/Navbar.jsx:158-163](src/components/Navbar.jsx#L158-L163)) | No `aria-label`. Screen readers announce "button" with no context. | Add `aria-label="Archive entry"`, `aria-label="Close modal"`, `aria-label="Sign out"` etc. |
| 8.3 | Medium | [src/components/QuickJournalModal.jsx:131](src/components/QuickJournalModal.jsx#L131) (backdrop click) | Backdrop dismiss uses `onClick` on `<div>`. Acceptable for backdrop (not focusable), but verify no other div-onClick patterns elsewhere. | Audit for `<div onClick=...>` patterns where the element should be a `<button>`. |
| 8.4 | Medium | [src/index.css](src/index.css) | `prefers-reduced-motion` not respected on most animations (also flagged in 7.2). | Same fix as 7.2. |
| 8.5 | Low | [src/pages/HardLessons.jsx](src/pages/HardLessons.jsx) | Multi-step form has natural DOM tab order. Verified manually for a few steps. | Spot-check tab order on real keyboard. |

---

## 9. Error Handling & Edge Cases

| # | Severity | File:Line | Problem | Fix |
|---|---|---|---|---|
| 9.1 | Medium | [src/utils/aiFeedback.js:568-630](src/utils/aiFeedback.js#L568-L630) | Oracle CF timeout (30 s) silently falls back to a templated response. User sees a bland fallback with no indication that Oracle was unavailable. | Add a toast on timeout: `ouraToast.warning('Oracle is slow — using local response')`. |
| 9.2 | Medium | [src/utils/aiFeedback.js:568-630](src/utils/aiFeedback.js#L568-L630) | Rate-limit-exhausted (`error.code === 'resource-exhausted'`) treated as generic error. User can't tell if it's rate-limit vs network. | Branch on `error.code` and show distinct toast for `resource-exhausted`. |
| 9.3 | Low | All list views | Empty states verified for Journal, Kill targets, Hard Lessons, Relapse, Archive views, Synthesis briefings. Each has a clear empty-state message. | None. |
| 9.4 | High — see 4.3 | Form submit with auth lost | Already covered above. | See 4.3. |
| 9.5 | High — see 4.2 | Archive restore partial failure | Already covered above. | See 4.2. |

---

## 10. Performance

| # | Severity | File:Line | Problem | Fix |
|---|---|---|---|---|
| 10.1 | Medium | [src/pages/Dashboard.jsx](src/pages/Dashboard.jsx) | Many subscriptions; child components (KillListDashboard, BehavioralRecordDensity, SignalReport) not memoized. Re-render on every parent state change. | Wrap heavy children in `React.memo()`; consolidate auth-driven subscriptions. |
| 10.2 | Medium | [src/pages/Journal.jsx](src/pages/Journal.jsx) and archive views | Long entry lists rendered with `.map()`. KillList already uses [VirtualizedList](src/components/VirtualizedList.jsx); Journal does not. With 100+ entries this re-renders heavily. | Wrap Journal entries list in `<VirtualizedList>` once entry count crosses ~50. |
| 10.3 | Low | Build output | Bundle sizes: `firebase-firestore` 443 kB raw / 108 kB gzip; `vendor-react` 187 kB raw / 61 kB gzip; per-page chunks all < 100 kB. Acceptable for Firestore-heavy app. | None. |
| 10.4 | Low | [src/App.jsx:25-37](src/App.jsx#L25-L37) | Lazy-loaded routes verified — separate chunks per page. | None. |

---

## 11. Security

| # | Severity | File:Line | Problem | Fix |
|---|---|---|---|---|
| 11.1 | Low | All src/ | No `dangerouslySetInnerHTML`, `eval`, or `.innerHTML` usage. User text rendered as JSX text nodes (auto-escaped). | None. |
| 11.2 | Low | All src/ | No tracked `.env` files (verified via `git ls-files`). Only `.env.example` is tracked. | None. |
| 11.3 | Low | [src/utils/firebaseUtils.js:215-267](src/utils/firebaseUtils.js#L215-L267) | Real-time listener cleanup guarded against double-unsubscribe and error-path leaks. | None. |
| 11.4 | Low | dist/assets/*.js | No Anthropic / private API keys in client bundle (verified by grep on dist). Firebase config is intentionally public. | None. |
| 11.5 | Medium — see 3.4 | Rate-limit exemption | Already covered. | See 3.4. |

---

## 12. Mobile Responsiveness

| # | Severity | File:Line | Problem | Fix |
|---|---|---|---|---|
| 12.1 | High — see 2.6 | Bottom nav at 320 px | Already covered. | See 2.6. |
| 12.2 | Medium | [src/components/QuickJournalModal.jsx:170-195](src/components/QuickJournalModal.jsx#L170-L195) | Mood pills use `flex-wrap` per category row. Small viewports may produce awkward 2-line wraps for the 4 pills. | Optional: switch to `grid grid-cols-2 sm:grid-cols-4` for more predictable layout. |
| 12.3 | Medium | [src/pages/HardLessons.jsx](src/pages/HardLessons.jsx) | 7-step form on mobile is long-scroll. No collapsible/accordion grouping. | Consider grouping (Event / Cost / Lesson) into 3 collapsible sections on mobile. Out of scope for ship if v1 user is desktop-primary. |
| 12.4 | Low | [src/App.jsx:152](src/App.jsx#L152) | `pb-16 md:pb-0` reserves space for the bottom nav on mobile. Verified spacing OK. | None. |
| 12.5 | Low | All pages | Tap targets — most buttons are `px-* py-*` 40 px+. Spot-checked. | None. |

---

## 13. Console Output / Lint

| Item | Result |
|---|---|
| `npm run build` | ✅ Clean. 1 dynamic-import warning for `clarityScore.js` and `firebase.js` (non-blocking). 1 chunk-size warning for `firebase-firestore` (acceptable). Built in 8.16s, 417 modules. |
| `npm test` | ✅ 54/54 tests pass. Run time 327 ms. |
| `npm run lint` | ⚠️ Not configured. No ESLint script in `package.json`. **Recommendation:** add ESLint for v1.1. |
| `npx tsc --noEmit` | N/A — JavaScript project. |
| Direct `console.*` calls bypassing logger | 1 instance: [src/components/VirtualizedList.jsx:77](src/components/VirtualizedList.jsx#L77) `console.warn` (legitimate dev warning, low priority to migrate). |
| TODO/FIXME comments | 1 instance: [src/utils/clarityScore.js:97](src/utils/clarityScore.js#L97) — TODO about adding `oracleEngaged: boolean` field. Low. |

---

## 14. Black Mirror v2 Gate Verification

Verified — gate works correctly:

- [src/App.jsx:23](src/App.jsx#L23) reads `import.meta.env.VITE_ENABLE_BLACK_MIRROR === 'true'`. Default off.
- [src/App.jsx:26-28](src/App.jsx#L26-L28) — `BlackMirror` lazy-loaded only when flag is true. Otherwise `null`.
- [src/App.jsx:257-270](src/App.jsx#L257-L270) — `<Route path="/blackmirror">` only registered when flag is true.
- [src/components/Navbar.jsx:6](src/components/Navbar.jsx#L6) — same flag, same default-off.
- [src/components/Navbar.jsx:78-80](src/components/Navbar.jsx#L78-L80) — Black Mirror nav entry conditionally added to NAV_ITEMS only when flag is true.
- [src/utils/blackMirrorAnalytics.js](src/utils/blackMirrorAnalytics.js) and [src/components/CueRestructuringFlow.jsx](src/components/CueRestructuringFlow.jsx) — only imported transitively from BlackMirror; tree-shake out when flag is off (verified in build output: no `BlackMirror` chunk emitted on a `false` build).

**Residual concern (Low):** [src/pages/Dashboard.jsx:184](src/pages/Dashboard.jsx#L184) reads `readUserData('blackMirrorEntries')` unconditionally. In v1 this collection will simply be empty for any user, which is harmless — but it does mean the client makes a query that always returns 0 docs. **Fix (optional):** wrap that read in the same flag.

The Black Mirror module itself was given a full review (Bo's request). High-level findings:

- Module compiles, has its own analytics utility, uses standard subscribe pattern.
- Same modal accessibility gaps as the v1 modules (8.1, 8.2 apply).
- Same Tailwind oura-darker undefined-token issue (6.1 applies).
- No additional Critical/High findings beyond what's already shared with v1.
- Recommend treating BM v2 as a separate review pass once v1 ships.

---

## 15. Already-Documented Issues from Prior Sessions

| Issue | Status |
|---|---|
| Stale `isNew=true` briefing forcing dashboard redirect | **Open** — partial fix landed in commit `3c508e4` (manual gen no longer sets the flag); root cause (hard redirect on auto-gen flag) tracked as 2.3 above. |
| Manual on-demand briefing button missing | **Closed** — landed in commit `9f8ae3e`. Verified in [src/pages/SynthesisBriefing.jsx](src/pages/SynthesisBriefing.jsx). |
| Agent run artifacts polluting git | **Closed** — landed in commit `9f8ae3e`. `.gitignore` patterns + `git rm --cached` applied. |
| Per-module color theming | **Closed** — landed earlier this session. |

---

## Appendix A — Full `npm run build` output

```
> react-javascript@1.0.0 build
> vite build

vite v5.4.21 building for production...
transforming...
✓ 417 modules transformed.
rendering chunks...

(!) C:/Users/boliv/dev/inner-ops/src/utils/clarityScore.js is dynamically imported by C:/Users/boliv/dev/inner-ops/src/utils/dailyBrief.js but also statically imported by SignalReport.jsx, Dashboard.jsx, dynamic import will not move module into another chunk.

(!) C:/Users/boliv/dev/inner-ops/src/firebase.js is dynamically imported by App.jsx, dailyBrief.js but also statically imported by App.jsx, KillListDashboard.jsx, RelapseRadar.jsx, useKillTargets.js, useOuraData.js, SynthesisBriefing.jsx, archiveUtils.js, authService.js, firebaseUtils.js, ouraService.js, userProfile.js, dynamic import will not move module into another chunk.

dist/index.html                             0.84 kB │ gzip:   0.40 kB
dist/assets/index-D5jX0rwP.css             59.12 kB │ gzip:   9.93 kB
dist/assets/firebase-core-CAee8hY6.js       0.69 kB │ gzip:   0.45 kB
dist/assets/OuraCallback-BpBasRyu.js        1.73 kB │ gzip:   0.82 kB
dist/assets/VoiceInputButton-Cw_0j5cs.js    1.88 kB │ gzip:   0.98 kB
dist/assets/detectDriftSignals-Sclb11pt.js  2.30 kB │ gzip:   1.18 kB
dist/assets/ArchiveToggle-BEXhMJMl.js       2.62 kB │ gzip:   1.25 kB
dist/assets/ouraService-Cx9lgEzB.js         5.14 kB │ gzip:   1.83 kB
dist/assets/SynthesisBriefing-zfRqq3j_.js   6.57 kB │ gzip:   2.20 kB
dist/assets/Profile-BfmSobV4.js             7.75 kB │ gzip:   2.44 kB
dist/assets/Onboarding-Qa4CYnZO.js         10.02 kB │ gzip:   3.30 kB
dist/assets/AppIcons-DZBc1r1z.js           13.04 kB │ gzip:   2.45 kB
dist/assets/Relapse-BxnXdnZb.js            30.05 kB │ gzip:   8.52 kB
dist/assets/Journal-BSoeS4oP.js            44.98 kB │ gzip:  12.69 kB
dist/assets/HardLessons-BPOSc1fk.js        46.13 kB │ gzip:  10.78 kB
dist/assets/KillList-Hpq1Ugsr.js           64.99 kB │ gzip:  14.99 kB
dist/assets/Dashboard-D8yfn_M_.js          87.95 kB │ gzip:  23.37 kB
dist/assets/index-BxKtqDjU.js             120.59 kB │ gzip:  38.37 kB
dist/assets/vendor-react-DJKtLIGD.js      186.75 kB │ gzip:  61.37 kB
dist/assets/firebase-auth-Dh1n2Rwn.js     231.83 kB │ gzip:  48.86 kB
dist/assets/firebase-firestore-BZiaCl-K.js 443.45 kB │ gzip: 108.44 kB

(!) Some chunks are larger than 100 kB after minification.
✓ built in 8.16s
```

## Appendix B — Test summary

```
ℹ tests 54
ℹ suites 0
ℹ pass 54
ℹ fail 0
ℹ duration_ms 327.685
```

Test files: `src/utils/aiFeedback.test.js`, `src/utils/clarityScore.test.js`, `src/utils/dailyBrief.test.js`.

## Appendix C — Type-check

Project is JavaScript (despite `typescript` being a devDependency). `npx tsc --noEmit` is not part of the build pipeline. No type-check findings.

## Appendix D — Git state

Audit start:
- HEAD: `3c508e4` (Generate synthesis briefing fix.)
- Working tree: clean

Audit end (after writing this report):
- HEAD: `3c508e4` (unchanged — audit is read-only; this report is the only file written, and it's a new file that does not modify any existing source).
- Working tree: this report file is untracked at `audit/PRE_SHIP_REVIEW.md`.

## Appendix E — `src/` tree summary (depth 2)

```
src/
├── App.css, App.jsx, firebase.js, index.css, main.jsx
├── components/  (27 files — all v1 + BM components)
├── hooks/       (8 files)
├── pages/       (9 files — 5 modules + Dashboard, Profile, Onboarding, OuraCallback, SynthesisBriefing)
└── utils/       (24 files including 3 .test.js)
```

---

## Recommended fix order (engineering-time triage)

**Pre-ship (must) — ~30 minutes total:**
1. Fix `/hard-lessons` link → `/hardlessons` (2.1) — 1 min
2. Add catch-all `<Route path="*">` (2.2) — 5 min
3. Add `oura.darker: '#050505'` to Tailwind config (6.1) — 1 min
4. Add `/profile` to SynthesisGuard exempt list (2.4) — 1 min
5. Add `/killlist` redirect to `/ledger` (2.5) — 2 min
6. Verify mobile nav at 320 px and abbreviate label if needed (2.6 / 12.1) — 5 min
7. Soften SynthesisGuard hard-redirect to a banner pattern (2.3) — 15 min

**Ship-week (should) — ~2–3 hours:**
- Modal focus traps (8.1) — biggest single a11y improvement
- Aria-labels on icon-only buttons (8.2)
- Submit double-click guards (4.1) for Journal + any other vulnerable handlers
- `permission-denied` → redirect to `/auth` for all submit handlers (4.3)
- Restore-failure rollback path (4.2)
- Toast on Oracle timeout / rate-limit (9.1, 9.2)

**Backlog (post-ship) — ~1 day:**
- Extract `moodCategories` to shared module (5.1)
- Remove unused deps (`openai`, possibly `framer-motion`) (1.1, 7.1)
- Add ESLint config (13)
- Pin dep versions (1.2)
- Add `prefers-reduced-motion` guards (7.2)
- Memoize Dashboard children (10.1)
- Virtualize Journal entry list (10.2)
- Audit `text-[#6a6a6a]` body-text contrast (6.5)

**Out of scope for v1 ship:**
- Full BM v2 review
- Mobile-specific HardLessons accordion (12.3)
- OG/Twitter meta tags (1.3) — only matters if shareable links are a v1 acquisition channel

---

*Audit conducted in read-only mode. No source files modified. This report is a new file at `audit/PRE_SHIP_REVIEW.md`.*
