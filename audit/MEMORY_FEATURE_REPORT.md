# Long-Term Memory for the Oracle — Feature Report

**Status:** Implemented, not deployed. Rules suite green (318/318), app suite green (303/303), memory unit suite green (10/10), production build clean. No deploy performed — commands at the end; you deploy.

---

## 1. What this gives the Oracle

Before: a 5-minute cached snapshot of **aggregates** (`getBehavioralContext.js`) — counts, dominant archetype, violated rule names. The Oracle knew the user's signals, not their story.

After: a **layered, user-visible, user-controlled memory**. The Oracle confronts with **receipts** — the user's own exact, dated words ("On May 14 you wrote you were done blaming the schedule; this entry blames the schedule"). Memory passes the same banned-tone regime, stays in cold observational register, and is fetched **server-side** so the receipts it quotes are guaranteed real.

---

## 2. Recon map (the decisions it forced)

**Finalization triggers (cite):** Journal [Journal.jsx:665](../src/pages/Journal.jsx#L665); Kill Contract autopsy [KillList.jsx:900](../src/pages/KillList.jsx#L900) (`status==='escaped'`); Hard Lesson [HardLessons.jsx:706](../src/pages/HardLessons.jsx#L706) (**`isFinalized===true` only** — the `submitLesson(false)` draft path at :704 never fires); Relapse/Signal [RelapseRadar.jsx:509](../src/components/RelapseRadar.jsx#L509).

**Injection is server-side (key finding):** the client's `buildPrompt` never reaches Claude. `callLLM` ([aiFeedback.js:606](../src/utils/aiFeedback.js#L606)) ships only `{entryText, moduleName, userContext, tone, behavioralContext, entryCount, …}`; the **server** rebuilds the system prompt in `buildSystemPrompt` ([functions/index.js:354](../functions/index.js#L354)) and treats client-passed context as untrusted (guillemet-clamps it). → Memory is fetched and rendered server-side by verified `uid`. This is the architecturally correct place for receipts-must-be-real, and it eliminates a client-injection vector.

**Storage convention:** the genuine server-write-only template already in the rules is `users/{uid}/biometrics` (`read: isOwner; write: false`). Memory follows it exactly. The commented `aiMemory` root stub was *client-writable* and did not fit server-only writes — not used.

---

## 3. Data model + rules

**Path:** `users/{uid}/memory/{docId}`, `docId ∈ {global, journal, killList, hardLessons, relapse}` (5 docs/user).

**Doc shape:**
```js
{
  content: string,                  // date-stamped thematic statements
  receipts: [{ date, quote, sourceModule, sourceEntryId }],  // ≤25 words, ≤5/module
  updatedAt, entryCount, userEdited: bool, version,
  processedEntryIds: string[],      // idempotency, FIFO-capped at 50
  lastGlobalRefreshAt?: timestamp   // on the `global` doc only
}
```
Caps: module content ≤3,200 chars (~800 tok), global ≤4,800 chars (~1,200 tok).

**Rules diff** — [firestore.rules](../firestore.rules), after the `biometrics` block:
```
match /users/{userId}/memory/{docId} {
  allow read: if isOwner(userId);
  allow write: if false;            // server (admin SDK) only
}
```
Generation, edit, receipt-deletion, and wipe all route through callables → **every** client write is denied. Account deletion already clears memory via `deleteUserData`'s recursive delete of `users/{uid}`.

**Rules tests** — extended [firestore.rules.test.mjs](../rules-tests/firestore.rules.test.mjs) with a `memory` suite (5 docIds × 6 cases = 30 new): owner read allowed; owner write/update/delete denied; non-owner read denied; unauthenticated read denied. **348/348 pass** (was 318 before the suite, 288 before this feature).

---

## 4. Updater design (Cloud Functions) — [functions/memory.js](../functions/memory.js)

**Model:** `claude-haiku-4-5` (`HAIKU_MODEL`), all memory calls. Compression, not reasoning. Sonnet stays for Oracle feedback.

**`updateMemory(module, entryId)` callable — authenticity by construction:**
1. **Reads the real entry doc by id** via admin SDK and verifies `userId===uid`. The client never supplies entry text — so it can't fabricate the source a quote is validated against. Drafts are rejected here too (Hard Lesson `isFinalized!==true` → no-op; killList non-`escaped` → no-op).
2. **Idempotency:** module dedupe key is `entryId` (journal/hardLessons/relapse) or `${id}:${escapeCount}` (killList, so each distinct escape is one event); if seen in `processedEntryIds`, no-op. Guards double-fires.
3. **Merge-forward:** prior memory is fed to Haiku; `userEdited` content is the new base — never regenerated from scratch.
4. **Receipt validation (non-negotiable):** every Haiku-returned receipt tagged `"new"` must be a whitespace-normalized substring of the real entry text; `"prior"` must exactly match a receipt already on the doc (so wiped/edited-out content can't resurrect). Failures are **dropped silently**. Proven by [functions/memory.test.js](../functions/memory.test.js) (10 tests: real quote validates, fabricated dropped, prior preserved, cap of 5, word-limit, dedup).
5. **Banned-tone filter:** the same `BANNED_TONE_REGEX` as `aiFeedback.js`, ported server-side, runs over `content` before save.
6. **Logging discipline:** logs `{module, contentBytes, receiptsValidated, receiptsDropped, inputTokens, outputTokens, latencyMs}` — never entry text or memory text.

**Global refresher — debounce choice = time-based, 6 hours.** After a module update, `global` rebuilds from the four module docs only (second-stage compression, no raw entries) iff `lastGlobalRefreshAt` is older than `MEMORY_GLOBAL_REFRESH_HOURS` (6). *Why this over "every 3rd update":* no counter state to maintain, predictable cost ceiling (≤4 refreshes/day/user), and the through-line is slow-moving — it doesn't need real-time freshness. Runs inline at the end of `updateMemory`, wrapped so its failure never affects the module update.

**Trigger wiring = explicit callable, fire-and-forget.** Matches the codebase convention (callables, no Firestore triggers) and gives finalization precision (drafts/cancels excluded by construction). At each site: `updateMemory(module, entryId)` — never awaited, `.catch()`-swallowed, so a failed memory update never blocks or errors the user's save. Wrapper: [src/utils/updateMemory.js](../src/utils/updateMemory.js).

**Abuse guard:** a **separate** daily counter (`memory_{day}`, `MEMORY_DAILY_LIMIT=80`), off the Oracle pool — memory generation never drains the user's feedback budget.

---

## 5. Injection into AI feedback (server-side)

In the `oracle` `onCall` handler ([functions/index.js](../functions/index.js)), after auth: `fetchMemoryForInjection(uid, moduleName)` reads `global` + the calling module's doc (or, for `moduleName==='synthesis'`, global + all four). `buildSystemPrompt(..., memoryBlocks)` renders a delimited MEMORY section via `buildMemoryBlock`:

> *"MEMORY — your accumulated observations and the user's own dated words: … These are receipts, not summaries. Use a receipt when it exposes a contradiction with the current entry — quote it exactly, with its date. If memory conflicts with what the user writes today, name the conflict; do not silently prefer either."*

- **Token budget:** caps bound it; if combined render exceeds `MEMORY_INJECTION_MAX_CHARS` (8,000 ≈ ≤2,000 input tokens), global is dropped first, then module truncated.
- **Synthesis:** `generateSynthesisBriefing` already calls oracle with `moduleName:'synthesis'` — the CF injects global + all four. No client change.
- **Graceful degradation:** missing/empty docs → `buildMemoryBlock` returns `""` → the Oracle behaves exactly as today. Zero regression for new users (verified: `buildMemoryBlock([])` / `null` → `""`).
- **Emergency module deliberately excluded** — memory is injected only into the main confrontation return path, not the acute-crisis grounding path.

---

## 6. UI — "The Record" (a section in Settings)

[src/components/TheRecord.jsx](../src/components/TheRecord.jsx), rendered inside [Settings.jsx](../src/pages/Settings.jsx) between Personal Context and Privacy & Data. **Placement rationale:** no mobile-nav disruption (bottom nav stays `grid-cols-6`), sits with the other data-control actions, reached via the existing gear icon.

- Shows **global + each module** memory: themes, receipts (each with its date), last-updated, an `edited` badge when `userEdited`. Matches the app's card vocabulary (`bg-[#0a0a0a] rounded-2xl border-[#1a1a1a]`, `#ef4444` destructive accent).
- **Edit themes:** inline edit → `editMemory` callable (server validates ownership, applies banned-tone filter, sets `userEdited:true`). Client never writes directly.
- **Receipts:** individually removable (`deleteMemoryReceipt`) — not hand-editable (a receipt is a quote: removable, not rewritable).
- **Wipe-all:** typed `WIPE` confirmation (the app's reveal→confirm destructive pattern) → `wipeMemory('all')`. Deletes the docs; rebuilds organically from future entries only.
- Copy in-register: *"What the mirror has on record. Edit it and it argues from your edit. Wipe it and it starts blind."*

---

## 7. Verification

| Check | Result |
|---|---|
| `npm run test:rules` (incl. new memory suite) | **348 pass / 0 fail** |
| `npm test` (app unit suites) | **303 pass / 0 fail** — zero regression |
| `node --test functions/memory.test.js` (receipt validation) | **10 pass / 0 fail** |
| `npm run build` (production) | **clean** |
| ESLint (all changed client + functions files) | **clean** |
| `buildMemoryBlock([])` / `null` graceful degradation | returns `""` (verified) |

**Negative tests (covered by the unit suite + code structure):**
- Fabricated quote not in entry → dropped (test: *"a fabricated quote … is dropped silently"*).
- Hard Lesson draft / cancel → `loadEntryFacts` returns `null` on `isFinalized!==true` → no update.
- Double-fire same entry → `processedEntryIds` no-op.
- Memory CF failure → client call is `.catch()`-swallowed and never awaited → save still succeeds.

**Not run here (requires deploy + `ANTHROPIC_API_KEY`):** live Haiku end-to-end against the Functions emulator and the manual receipts script below. These make real paid model calls and need the secret, so they are **your** post-deploy step — flagged honestly, not claimed.

### Manual receipts script (run after deploy)
1. **Day 1:** write a Journal entry A asserting a commitment, verbatim — e.g. *"I'm done blaming the schedule for skipping training."* Save.
2. Open **Settings → The Record** → confirm the Journal memory shows a receipt quoting A with today's date.
3. **Write entry B** that contradicts it — e.g. *"Work ran late again so I skipped the gym; the schedule is just brutal right now."* Save and read the Oracle's feedback.
4. **Expected:** the Oracle's response on B quotes A back ("On [date] you wrote you were done blaming the schedule…") and names the contradiction.
5. **Wipe test:** Settings → The Record → Wipe the record (type `WIPE`). Confirm docs disappear and the next entry's Oracle feedback no longer references prior receipts.

After deploy, confirm runtime success via logs (not deploy success):
```
firebase functions:log --only updateMemory,oracle | Select-String "memory.call","oracle.call"
```

---

## 8. Cost projection (Haiku 4.5 — $1.00/MTok in, $5.00/MTok out)

| Call | Input tok (est) | Output tok (est) | Cost |
|---|---|---|---|
| Module update | ~2,000 | ~600 | ~$0.005 |
| Global refresh (≤4/day) | ~3,500 | ~700 | ~$0.007 |

- **Typical DAU** (1–2 finalizations/day, 1 global refresh): ≈ **$0.30–0.45 / user / month** — under the ≈$0.50 target.
- **Heavy DAU** (3 finalizations/day, 2 refreshes): ≈ **$0.85 / user / month**.
- **Hard ceiling:** `MEMORY_DAILY_LIMIT=80` Haiku calls/day caps worst case at ~$0.48/user/day; raise/lower via env without redeploy.
- **Oracle injection adds** ≤2,000 input tokens/feedback call on Sonnet ($3/MTok) ≈ **$0.006/call** — marginal, and only once memory exists.

All token counts are logged per call (`memory.call`), so real cost can be measured against these estimates after a week of real traffic.

---

## 9. Deploy commands (you run — no deploy performed)

```powershell
# 1. Rules (verify first)
npm run test:rules
firebase deploy --only firestore:rules

# 2. Functions — new callables + memory injection (deploy functions ALONE; never combine with indexes)
firebase deploy --only functions:updateMemory,functions:editMemory,functions:deleteMemoryReceipt,functions:wipeMemory,functions:oracle

# 3. Confirm runtime success via logs (deploy success ≠ runtime success)
firebase functions:log --only updateMemory | Select-String "memory.call"

# 4. Frontend
npm run build
firebase deploy --only hosting
```
`ANTHROPIC_API_KEY` is already the secret used by `oracle`/`oracleFollowUp`; the memory functions reuse the same `defineSecret("ANTHROPIC_API_KEY")`, so no new secret to set. Optional env overrides (set on the functions if you want to retune without code): `MEMORY_DAILY_LIMIT`, `MEMORY_GLOBAL_REFRESH_HOURS`, `MEMORY_MAX_RECEIPTS`, `MEMORY_INJECTION_MAX_CHARS`.

---

## 10. Follow-ups (with effort estimates)

| Item | Why | Effort |
|---|---|---|
| **Resurrect-from-history** | Wipe is permanent this pass; a backfill that replays past finalized entries through `updateMemory` would rebuild memory on demand. | M (~0.5d) — batch reader + the existing updater; watch the rate cap. |
| **Confirmed-kill + QuickSignalLog triggers** | Excluded this pass (autopsy/full-relapse carry the confrontational text). Confirmed kills are wins worth a receipt; quick signals are minimal precursors. | S (~0.25d) — two more fire-and-forget call sites + per-module text extractors. |
| **Server-side schema validation** | Memory docs are written only by our CFs, but a Zod/struct guard before save would harden against a malformed Haiku response slipping a bad shape through. | S (~0.25d). |
| **RAG / embeddings v2** | Themes+receipts is lossy by design. Embedding past entries and retrieving the top-k most-relevant receipts per current entry would sharpen confrontation on large histories. | L (multi-day) — embedding store, retrieval, cost model; revisit only if the themes+receipts model proves too coarse in practice. |
| **Scheduled cleanup of `memory_*` rate-limit docs** | Same as the existing `oracle_*` cleanup TODO in `rateLimit.js` — a daily CF could prune stale day-keyed counters. | S. |

---

## Files

**New:** `functions/memory.js`, `functions/memory.test.js`, `src/utils/memoryConstants.js`, `src/utils/updateMemory.js`, `src/components/TheRecord.jsx`, this report.
**Edited:** `functions/index.js`, `functions/config.js`, `firestore.rules`, `rules-tests/firestore.rules.test.mjs`, `src/pages/Journal.jsx`, `src/pages/KillList.jsx`, `src/pages/HardLessons.jsx`, `src/components/RelapseRadar.jsx`, `src/pages/Settings.jsx`.

## Scope note
No refactors outside the memory feature. One adjacent observation surfaced: `rateLimit.js` already carries a TODO for scheduled cleanup of day-keyed counter docs — the new `memory_*` counters inherit the same (benign, unbounded-doc-count) gap and are listed as a follow-up above.
