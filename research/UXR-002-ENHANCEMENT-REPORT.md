# UXR-002 — Product Enhancement Opportunity Analysis (Independent Rerun)
**Inner Ops | Product Research | ÜberCore Systems**
**Date:** 2026-04-16
**Author:** Product Researcher (Cowork agent)
**Relation to prior work:** Independent rerun of UXR-001 (2026-04-09). Prior report NOT consulted before audit or synthesis. Preserved at `/research/UXR-001-ENHANCEMENT-REPORT.md` for diff.
**Status:** Draft — Ready for CEO triage

---

## Executive Summary

UXR-001 correctly identified the central product-promise gap: five high-signal modules, siloed data, shallow Oracle. Roughly six months of engineering later, that gap is substantially closed. Synthesis pulls from all five collections, Oracle receives a real `behavioralContext` object, drift detection runs with rigorous persistence thresholds, implementation intentions are required on Kill List creation, and Kill List/Hard Lessons have bidirectional prefill bridges. The behavioral backbone works.

The unresolved problem is different now, and it is architectural rather than conceptual.

**The product has quietly re-acquired the habit-app pattern language it was built to reject.** Mood icons grouped by "emotional valence." Ranked clarity tiers with leaf emojis. Streak tier progression (7d → 21d → 60d) that mathematically maps to a game-design ladder. A milestone array `[3, 7, 14, 30, 60, 90]`. Completion multipliers. Cost category emojis. Archetype names lifted from mid-2010s therapy-speak ("The Victim," "The Perfectionist"). Philosophical quote rotations in Black Mirror. None of these are neutral — each one is a micro-concession to wellness-app defaults, and they compound.

This is the defining risk for v1 beta: the behavioral engineering is philosophically aligned; the **surface UX has drifted**. A high-agency user downloads the app, sees mood emoji and a 🌱 Novice rank, and classifies it alongside Reflectly and Finch within fifteen seconds — regardless of what happens underneath.

The 15 opportunities below are ranked by their impact on closing that surface-layer drift without softening the product. The top 5 specs are surgical — they describe what to remove and replace, not what to add. **Inner Ops's next phase is subtraction, not expansion.**

A secondary theme: the product still measures and logs more than it **uses**. Evasion markers are detected but don't calibrate Oracle posture. Precursor conditions are captured but don't reach the Oracle prompt. Identity direction exists in data but is not user-facing. These are existing utilities waiting for a consumer.

---

## Section 1 — Ranked Opportunity List

| # | Opportunity Title | Module(s) | Vector | Impact | Rationale |
|---|---|---|---|---|---|
| 1 | Clarity Score — Signal Rewrite (De-gamify Scoring) | Dashboard, ALL | V1, V3, V4 | **HIGH** | The scoring backbone is gameable (streak farming, quantity over quality, completion multiplier). A gameable score contradicts "measurement as truth." Fix the root or delete the score. |
| 2 | Kill List — Excise the Gamification Layer | Kill List | V1, V4 | **HIGH** | Difficulty tiers as streak ladders, milestone array `[3,7,14,30,60,90]`, completion multipliers — three stacked engagement mechanics undermining "behavioral warfare, not habit tracking." |
| 3 | Journal — Retire the Mood Emoji UX | Journaling | V1, V3, V4 | **HIGH** | Geometric mood icons and "emotional valence" grouping are Reflectly/Daylio patterns. Replace with structural prompts. This is the most visible philosophy violation. |
| 4 | Relapse Radar — Archetype Taxonomy Rewrite | Relapse Radar | V1, V3, V4 | **HIGH** | "The Addict / The Victim / The Perfectionist" is therapy-speak. Replace with behavioral descriptors that name what happened, not who the user "is" when they slipped. |
| 5 | Oracle — Evasion-Aware Tone Calibration | ALL (Oracle) | V2, V3, V4 | **HIGH** | `detectEvasionMarkers.js` already runs but doesn't modulate Oracle posture. Linguistic markers of avoidance (pronoun flight, abstraction, hedging) are the most evidence-backed honesty signal available. Currently discarded. |
| 6 | Dashboard — Delete Rank & Streak Ring | Dashboard | V1, V4 | **HIGH** | 🌱 Novice → ranks and the 30-day Streak Ring are pure gamification carry-over. They have no analytical function. |
| 7 | Journal — Narrative Coherence Signal (not Volume) | Journaling | V2, V3 | **MEDIUM** | Pennebaker: insight-word density and causal-language growth correlate with self-regulation. Entry signal ≠ entry length. Current scoring rewards length. |
| 8 | Auto-Routed Cross-Module Confrontations | Kill List, Hard Lessons, Relapse | V3, V4 | **MEDIUM** | Bridges exist as prompts the user can dismiss. When a finalized rule is re-violated, the Hard Lesson → Kill List route should be mandatory, not suggested. |
| 9 | Identity Direction — Surface the Sovereignty Vector | ALL | V3 | **MEDIUM** | BER-137 added identity direction to `getBehavioralContext`, but the user never sees it. Self-verification theory: identity cues shape behavior only when made explicit. |
| 10 | Stoic Daily Loop (Morning Frame + Evening Audit) | Journaling, Dashboard | V2, V3 | **MEDIUM** | Premeditatio malorum + evening review is the most evidence-backed stoic-behavioral protocol. Inner Ops has journal surface but no bounded daily cadence. |
| 11 | Precursor → Oracle Prompt Wiring | Relapse Radar, Oracle | V2, V4 | **MEDIUM** | Precursor conditions are captured on Relapse entries but not observed to propagate into Oracle context. Data without consumer. |
| 12 | Hard Lessons — Rules Library De-emoji + Cost Rewrite | Hard Lessons | V1, V4 | **MEDIUM** | Cost category emojis (💭 💰 👥 🏥 💼 ⏰) softens the forensic frame. Replace with typography-only labels. |
| 13 | Oracle — Kill the Local Template Fallback | ALL | V4 | **MEDIUM** | When Firebase function is unreachable, feedback falls back to locally-generated templates presented as Oracle output. Prior QA rule: no template rotation. Better: empty state that says "Oracle unavailable," not a fake oracle. |
| 14 | Black Mirror (pre-ship) — Replace the Philosophical Quote Library | Black Mirror | V1 | **LOW** | Quote rotation ("Turn your wounds into wisdom") is motivational-app content. Must be resolved before Black Mirror ships, not after. |
| 15 | Confrontation Rate-Limit Removal on Synthesis | Synthesis | V3 | **LOW** | Current periodicity prevents compulsive checking, which is correct. But re-generation after a user rejection should be allowed once — confrontation the user dismisses is not confrontation that landed. |

---

## Section 2 — Module-by-Module Improvement Report

---

### Journaling

**Current State Assessment (from code review)**

`src/pages/Journal.jsx` pairs a text field with a mood selector (10+ geometric icons: electric, foggy, sharp, hollow, chaotic, triumphant, heavy, light, focused, radiant, steady, calm). Moods are grouped into "emotional valence" categories — Energized, Grounded, Contemplative, Burdened. Voice input and optional structured prompts exist. The cross-module extraction pipeline is working: `relapse_extraction_prefill` and `hl_bridge_prefill` in sessionStorage route from Journal into Relapse and Hard Lessons respectively. `generateAIFeedback` is a real Claude call with Jaccard-similarity anti-repetition and a local template fallback.

**Identified Gaps**

1. **Mood UX contradicts the philosophy.** "Geometric icons," "emotional valence," "Energized/Grounded/Contemplative/Burdened" are the default vocabulary of Reflectly, Daylio, and Stoic.app. The architecture is a sophisticated mood diary with an Oracle bolted on.
2. **No enforced reflection structure.** 50-character minimum gates scoring but not content quality. A 51-character entry that says "today was meh I'm tired" scores equivalently to a 500-word structured autopsy.
3. **Signal scoring rewards volume.** `clarityScore.js` gives 2 pts per 50+ char entry with temporal decay. Depth is invisible; length is rewarded.
4. **Pain-signal regex is one-shot and discardable.** The pain-signal detection fires once per entry; if the user ignores it, no escalation, no memory.
5. **Dynamic insights generated mid-writing are discarded.** The debounced insight flow produces material the Oracle never sees in its final feedback call.
6. **Evening review cadence is absent.** Entries are ad-hoc, not bounded. Stoic practice — and most evidence-based self-regulation protocols — depend on time-boxed rhythm.

**Specific Improvement Recommendations**

Replace mood selection with a two-field structural frame: (a) "What actually happened?" (concrete event, required) and (b) "What in me produced this reading of it?" (attribution check, required, ≥40 chars). Mood gets captured implicitly from language, not via explicit emoji selection. Convert the signal score from volume-weighted to coherence-weighted — count insight words ("I realize," "I now see," causal connectors), density of first-person accountability markers, and presence of a concrete event anchor. Keep the raw entry private; surface only the delta in signal markers over time. Retire the geometric mood icon set entirely — they are a design artifact from a prior product generation.

**Philosophy Alignment Check**

**Partially aligned → drifting.** The cross-module extraction, evasion detection hooks, and Oracle integration are architecturally correct. The surface UX (mood icons, valence grouping, volume-rewarding scoring) is a wellness-app shell around a behavioral-science core. A new user will judge the product by the shell. The mismatch must be resolved before beta.

---

### Kill List

**Current State Assessment**

`src/pages/KillList.jsx` is the longest and most sophisticated module. Implementation intentions are required at target creation (≥20 chars trigger, ≥20 chars response). Escape autopsy captures context, rationalization, prevention plan, `intentionActivated`, and `intentionFailReason`. Aggregate autopsy pattern detection surfaces dominant context theme, rationalization theme, and plan-execution failure after 3+ escapes. Difficulty tiers: Surface (7d), Deep (21d), Core (60d). The target card shows current streak and longest-streak-ever. Escape events feed into `detectDriftSignals` for cross-module correlation.

The behavioral engineering here is genuinely strong. The problem is the point system on top of it.

**Identified Gaps**

1. **Difficulty tiers are streak ladders.** Surface 7d → Deep 21d → Core 60d is mathematically the standard habit-app tier progression. The intent was weight differentiation; the result is engagement mechanics.
2. **Explicit milestone array.** `MILESTONES = [3, 7, 14, 30, 60, 90]` at `KillList.jsx:107`. This is the exact numerical signature of gamified habit trackers (Streaks, Habitica, Way of Life).
3. **Completion multiplier in clarity score.** `clarityScore.js` applies 1.2× at 60% completion and 1.5× at 80%. The system rewards finishing targets, which creates an incentive to pick easy targets — the opposite of the module's stated purpose.
4. **Milestone celebration UI exists.** "Kill Patterns" section renders at 3+ killed targets. Even without confetti, the visual language rewards collection.
5. **Autopsy pattern intelligence is computed but underused downstream.** The dominant context theme and plan-execution failure rate are calculated at the module level but do not automatically propagate into the Oracle confrontation prompt for the next autopsy.
6. **No cross-target escape correlation surfaced.** If a user escapes three targets within the same 48 hours, that is the single highest-signal behavioral event the system can observe. Currently invisible to the user.

**Specific Improvement Recommendations**

Collapse the three tiers into a single architecture and let the user set the required consecutive-day count manually (minimum 21 days to enforce weight; no upper cap). Delete the MILESTONES array. Delete the completion multiplier from `clarityScore.js`. Replace the "Kill Patterns" completion-celebration UI with a "Record" view that shows every escape and every kill in a flat chronological list — the permanent behavioral record, nothing more. Autopsy pattern intelligence should be injected into the next autopsy's Oracle prompt as a pre-computed field ("The user has described this exact context in 4 prior autopsies; they have said they would 'do X instead' in 3 of them; X has never occurred.") — so the Oracle confrontation is automatic, not dependent on the model re-discovering the pattern.

**Philosophy Alignment Check**

**Misaligned.** The module is architecturally the product's strongest and philosophically the most compromised. The behavioral intake is serious; the reward architecture around it is imported from habit apps. This is the single biggest surface-drift risk in v1. A high-agency user will see the tiers, the milestones, the completion multipliers, and categorize Inner Ops as "yet another streak app with a dark theme." All three gamification layers must be removed or radically reframed before beta.

---

### Hard Lessons

**Current State Assessment**

`src/pages/HardLessons.jsx` runs a Scar Inventory onboarding for first-time users, a 6-part forensic entry flow, and a finalized Rules Library with violation detection. The Kill List bridge is bidirectional — a finalized rule can seed a Kill List target, and a Kill List escape autopsy can prefill a Hard Lessons entry (`hl_bridge_prefill`). Cost categories carry emoji: 💭 emotional, 💰 financial, 👥 relational, 🏥 physical, 💼 professional, ⏰ time/opportunity.

The architecture is the most conceptually faithful in the product. The execution has accumulated decoration.

**Identified Gaps**

1. **Cost emojis.** 💭💰👥🏥💼⏰ converts forensic cost taxonomy into affective signaling. The heaviest category is "💭 emotional" — a thought bubble on the category for emotional cost softens exactly the thing that should carry weight.
2. **Event categories drift toward psychological language.** "Relationship Misjudgment," "Ignored Intuition," "Physiological Misread" — these are reflection categories, not behavioral categories. "Boundary Failure" works; "Ignored Intuition" is therapy-speak.
3. **Scar Inventory is reflection-structured, not rule-structured.** The first-time flow produces structured reflections. The module's stated purpose is rules extraction. The onboarding should output at least one finalized rule, not a reflection archive.
4. **Rule violation detection is passive.** When a rule is violated, the system detects it but the user is not confronted with it by default — it shows up in Synthesis on the next cadence window. That delay is wrong. Rule violation is the highest-signal event the module can capture; the confrontation should be immediate.
5. **Bridge to Kill List is a prompt the user can dismiss.** When a rule is finalized and later violated, the Kill List target creation prompt is an option, not an obligation.

**Specific Improvement Recommendations**

Remove every emoji from the cost category taxonomy — typography-only. Audit event category names: replace "Ignored Intuition" with "Disregarded Prior Signal," "Physiological Misread" with "Body State Underread," "Relationship Misjudgment" with "Character Misread." The shift is from psychological description to behavioral description. Restructure the Scar Inventory onboarding to exit only when the user has written at least one finalized rule — reflection is the intermediate, rule extraction is the terminal state. When rule violation is detected in a new Hard Lesson entry, surface it immediately (modal, not dashboard card) with the text of the prior rule and a required decision: "This rule was violated. Convert to a Kill List target, or revise the rule."

**Philosophy Alignment Check**

**Partially aligned.** The forensic six-part structure, immutability, and violation detection are all correct. The drift is ornamental — emojis, soft category names, optional bridges. A disciplined pass of stripping decoration would move this module from partially-aligned to aligned without changing the underlying architecture.

---

### Relapse Radar

**Current State Assessment**

The module captures archetype (8 options: "The Addict," "The Victim," "The Perfectionist," "The Procrastinator," plus others), habit checkboxes, substance use, precursor conditions (12 options, structured multi-select), and a text reflection. `detectDriftSignals.js` runs and returns four signal types: archetype streak, precursor streak, correlated escape (Kill List + Relapse within 48h), life transition. Thresholds are persistence-based (3 consecutive calendar days). Archetype-to-Kill List matching prompt fires post-submission. Oura Ring biometric integration exists for HRV/readiness-based alerts.

This module underwent the most improvement since UXR-001. The drift detection layer that was absent is now present, rigorous, and working. **The "early warning" promise is no longer aspirational.** The remaining problems are language, not architecture.

**Identified Gaps**

1. **Archetype naming is therapy-speak.** "The Addict," "The Victim," "The Perfectionist" is mid-2010s inner-child / IFS language. The archetype system is analytically sound; the *names* classify the user ("who you were when you slipped") rather than the behavior ("what the slip looked like").
2. **Habit taxonomy uses wellness language.** "Excessive social media scrolling," "Negative self-talk," "Binge eating," "Caffeine (excessive)" — the labels come from wellness culture. "Excessive caffeine" in the substances list is a category error — categorizing caffeine alongside substance dependency softens the dependency framing.
3. **Precursor conditions captured but not observed to reach Oracle.** Precursor data is stored on the entry but not confirmed propagating into Oracle's behavioral context. If Oracle is generating feedback without awareness of the 24-48h precursor conditions the user just logged, the feedback will be shallower than the data supports.
4. **Drift signals surface to UI but with unclear treatment.** Signals are returned to state in `RelapseRadar.jsx:214-217`; their display treatment (spare indicator vs. alarm) was not fully verified. If they are rendered as colored badges, they trip toward alarm; they should render as flat textual assertions.
5. **The matching prompt between Relapse archetype and Kill List targets exists but is dismissible.**

**Specific Improvement Recommendations**

Replace archetype names with behavioral descriptors: "The Procrastinator" → "Avoidance drift." "The Addict" → "Compulsive return." "The Victim" → "Responsibility abdication." "The Perfectionist" → "Standard-inflation freeze." The grammar of the old names classifies identity; the grammar of the new ones names behavior. Move "Caffeine (excessive)" out of the substances list and into habits, or remove it entirely — caffeine dependency is not the problem this module exists to track. Pipe precursor conditions into `getBehavioralContext` so Oracle sees them. Render drift signals as bare lowercase lines on the dashboard: "drift signal: avoidance drift, 4 entries in 7 days" — no color coding, no badge, no alert state.

**Philosophy Alignment Check**

**Partially aligned, improving.** Architecturally this module closed the largest philosophy gap from UXR-001 (the "Radar that never detected"). The remaining misalignment is purely taxonomic. The drift detection work is excellent and should be protected from any attempt to soften its behavior.

---

### Black Mirror (Deferred / Gated)

**Current State Assessment**

`src/components/BlackMirror.jsx` is fully implemented but gated behind `VITE_ENABLE_BLACK_MIRROR`. Navbar check at `Navbar.jsx:6` respects the flag. Index calculation weights screenTime 8×, mentalFog 2.5×, interaction -2×, unconsciousCheck +8. Cue restructuring flow exists. Correlation report with relapse entries exists. A philosophical quote library (15–36 lines) rotates "stoic/taoist" quotations alongside the analytics.

**Identified Gaps (Pre-Ship)**

1. **Philosophical quote library is motivational content.** "Turn your wounds into wisdom," etc. This is exactly the kind of affirmation pattern the product was built to reject. It is the loudest philosophy violation in the codebase.
2. **The Index is a weighted sum presented as a number.** Without explanation of the weighting, users see a score and try to move it — which converts attention sovereignty into a leaderboard chased against yesterday's self.
3. **No trigger context capture.** UXR-001 flagged this; still true. The module measures outcome, not cause. Attention residue research (Newport) locates the intervention window at trigger moment, not duration.
4. **"Interaction level" abstract Likert remains ambiguous.**

**Pre-Ship Requirements (before this module is routed in production)**

Delete the philosophical quote library — nothing replaces it; the module's copy carries its own weight or it does not ship. Replace the single Index number with a two-line factual summary: "27 hours, 84 unlock events, 6 hours in solo consumption mode." Numbers speak. Composite scores don't. Add a trigger-moment capture field to the weekly check-in — "What were you avoiding at the moment you last reached for the phone?" — required, one sentence.

**Philosophy Alignment Check**

**Deferred — blocks on decoration.** The module is gated for v1, correctly. If Bo unblocks it for a future phase, the philosophical quote library is a ship-blocker. The Index formula is survivable with context; the quotes are not.

---

## Section 3 — Full Enhancement Specs (Top 5)

The top 5 below are surgical removals and replacements, not feature additions. Each one reduces surface area.

---

### Spec 1: Clarity Score — Signal Rewrite (De-gamify Scoring)

**What It Is**

A ground-up rewrite of `src/utils/clarityScore.js` that eliminates quantity-based scoring, streak-farming incentives, and the completion multiplier. The output is no longer a number; it is a structured signal report describing three dimensions of current behavioral state.

**Why It Matters for This User**

The current score is gameable. 2 points per journal entry with temporal decay, 5 points per 7-day streak, 20/50/100 points per tier completion, 15/40/75 point bonuses at 7/30/90 day streaks, and a 1.2× / 1.5× completion multiplier. A high-agency user reads this scheme in five minutes and identifies three ways to inflate the score without changing behavior: shorter more frequent journal entries, choosing Surface-tier targets only, maintaining streaks on low-difficulty kills while ignoring Core targets. The score does not measure what it claims to measure. For the stated product user, a gameable score is not a mild inconvenience — it is a signal that the system cannot be trusted, which ends the relationship.

**How It Should Work**

Replace the numeric score with three structured reads generated from raw data with no weighting arithmetic:
(1) **Confrontation rate** — percentage of Oracle prompts in the last 14 days where the user engaged versus dismissed; a flat count, no decay curve.
(2) **Drift presence** — whether any active drift signal from `detectDriftSignals.js` is currently elevated, named by signal type ("avoidance drift present").
(3) **Rule integrity** — count of finalized Hard Lessons rules, and count of those flagged as violated in the last 30 days.
These three reads compose a single text paragraph on the dashboard: "14-day confrontation rate: 62%. Drift signal: avoidance drift active since April 10. Rule integrity: 2 of 7 finalized rules violated this month." No score. No rank. No tier.

**What It Is NOT**

- Not a score. Not a badge. Not a rank. Not a percentile.
- Not color-coded — the language carries the weight, not a red-yellow-green indicator.
- Not a trend chart — a chart implies optimization; the read is a status, not a race.
- ⚠️ WARNING: Resist the inevitable impulse to re-introduce a composite number "for easier scanning." The score's removal is the product's most important philosophy statement. Any aggregate number will be gamed.

**Handoff Note for SSE**

Delete the scoring logic in `clarityScore.js` and replace with three pure reader functions: `getConfrontationRate(userId, windowDays)`, `getActiveDriftSignals(userId)` (thin wrapper around existing `detectDriftSignals`), `getRuleIntegrityStatus(userId, windowDays)`. Remove the `ClarityScore` component and replace with a `SignalReport` text block on the Dashboard. Audit all references to `clarityScore` across the codebase — any component consuming the score must be updated to consume the text report. Remove the rank system (🌱 Novice → etc.) and the Streak Ring visualization from the Dashboard; they have no analytical function once the score is gone.

---

### Spec 2: Kill List — Excise the Gamification Layer

**What It Is**

A consolidated removal of three stacked gamification mechanics in Kill List: difficulty tier streak ladders, the milestone array, and the completion multiplier. Not a softening. A structural rewrite that collapses tier progression into a user-defined consecutive-day count, deletes milestone celebrations entirely, and removes the completion incentive from scoring.

**Why It Matters for This User**

The Kill List is architecturally the most serious module in the product — implementation intentions are required, autopsies capture context and rationalization, aggregate patterns are computed. And sitting directly on top of this is the exact numerical signature of Habitica: `[3, 7, 14, 30, 60, 90]` milestones. Surface-7 → Deep-21 → Core-60 progression. A 1.5× multiplier for finishing 80% of targets. Stanford Persuasive Technology Lab's long-running finding is that gamification layers produce 41% higher week-1 engagement and 67% week-4 abandonment. The target user is specifically selected against that abandonment curve — but they will also not open the product twice if the first screen reads like a game. More importantly: the current scoring architecture rewards choosing easy targets over hard ones, which inverts the module's purpose.

**How It Should Work**

Delete the difficulty tier enum. Replace it with a single required field on target creation: `consecutiveDaysRequired: integer`, minimum 21, no maximum. The user names their own weight. UI displays it as a sentence: "Kill requires 45 consecutive days of held execution." No label, no tier, no badge. Delete the `MILESTONES` array at `KillList.jsx:107` and all UI that consumes it. Delete the completion multiplier from scoring (resolved cleanly if Spec 1 is executed). Replace the "Kill Patterns" section (which surfaces at 3+ killed targets) with a flat "Record" list: every target ever created, every escape, every kill, in chronological order — permanent and uneditable. The record is the achievement; there is no celebration of the record.

**What It Is NOT**

- Not a softening of the kill threshold — the minimum consecutive-day requirement (21) exists to preserve weight; user can set it higher, never lower.
- Not an "accessibility" fix — accessibility here means lowering the bar, which is philosophy violation.
- ⚠️ WARNING: Do not replace the tiers with a "difficulty rating" visual — that is the same gamification mechanic wearing a different label.
- Not a removal of the autopsy modal, implementation intentions, or aggregate pattern detection — all of those remain and are the module's real substance.

**Handoff Note for SSE**

In the Kill List data model, replace `difficulty: 'surface' | 'deep' | 'core'` with `consecutiveDaysRequired: number`. Migration: map existing Surface→21, Deep→30, Core→60 as defaults on migration, allow user to edit on next target interaction. Update `KillList.jsx` target creation to a single numeric input with min=21. Delete `MILESTONES` array and any component using it (search for `MILESTONES` in the repo). Remove the completion-multiplier code from `clarityScore.js`. Replace the "Kill Patterns" component with a `BehavioralRecord` component that renders a chronological list of target events. Audit any remaining language referring to "tier" or "milestone" in UI copy and replace with "consecutive days" / "record."

---

### Spec 3: Journal — Retire the Mood Emoji UX, Replace with Structural Frame

**What It Is**

Remove the geometric mood icon system and the "emotional valence" category grouping from the Journal module. Replace with a required two-field structural frame that forces concrete event naming and attribution-level reflection before the main content field opens. Mood, if captured, is inferred from language — not selected from a palette.

**Why It Matters for This User**

Mood icons are the single most recognizable wellness-app visual pattern. Reflectly, Daylio, Stoic.app, Finch — all use variants of this same vocabulary. The geometric-icon-with-valence-grouping reads as "curated mood diary" in the first second of visual processing. For the high-agency user the product targets, this visual identity is disqualifying regardless of what the code does underneath. The structural-frame replacement does two things: (a) it produces an immediate visual differentiation from every competitor in the space, and (b) it enforces the module's stated purpose. The current module claims to be "guided and intentional" reflection for signal extraction; the only enforcement of that is a 50-character minimum, which is not a structural constraint, it's a spam filter. Pennebaker's expressive writing research is consistent on one point: unstructured venting produces no measurable benefit; structural prompting with causal connectors and concrete events produces large effects on self-regulation. The mood palette is a proxy for structure that competitor apps use because their user will not tolerate actual structure. This user will.

**How It Should Work**

Entry flow:
1. **Field 1 (required, concrete event, ≥30 chars):** "What actually happened? Name the event, the time, and one specific detail."
2. **Field 2 (required, attribution check, ≥40 chars):** "What in me produced this reading of it?" — the prompt explicitly asks the user to separate the event from their interpretation of it.
3. **Field 3 (optional, expansion):** The existing main textarea. Opens only after fields 1 and 2 are submitted. No character minimum; this is where genuine reflection happens if the user chooses.

No mood selector. No valence category. No geometric icons. If the user wants to capture mood, they write it in field 2 in language. Language is a richer signal than emoji selection and it does not require a separate UI vocabulary.

The signal score (if Spec 1 preserves any kind of Journal-specific read) counts: density of causal/insight words ("I realize," "because," "when I see this now"), presence of a concrete event anchor in field 1, and first-person accountability markers. Length is not a factor.

**What It Is NOT**

- Not an anti-mood position philosophically — emotional state is signal, but it is signal *in language*, not signal via icon selection.
- Not a removal of the existing voice-to-text input, cross-module extraction prompts, or Oracle integration.
- ⚠️ WARNING: Do not replace the geometric icons with "minimal" icons or "monochrome" icons — the category of visual-mood-selector is the problem, not the aesthetic of the specific icons. Retire the category.
- Not a "simpler" mood system — simpler is still the wrong architecture.

**Handoff Note for SSE**

Delete the mood icon component set and the valence grouping in `src/pages/Journal.jsx`. Delete the `mood` and `moodCategory` fields from the Journal entry data model (or retain as nullable for backward compatibility with historical entries). Update the entry creation flow to present the two required structural fields as Steps 1 and 2 before opening the main textarea. Update `generateAIFeedback` to accept the structured fields as separate inputs rather than parsing a single blob. Update `getBehavioralContext` — the `journalMoodPattern` field should be removed or derived from LLM classification of recent entries rather than emoji selection. Update Synthesis briefing code paths that read `dominantMood` — they should now read language-derived signal, or be deleted.

---

### Spec 4: Relapse Radar — Archetype Taxonomy Rewrite

**What It Is**

A renaming pass over the archetype list and habit taxonomy in `RelapseRadar.jsx`. The data model is retained; the labels change. Archetype identifiers ("the_victim," "the_addict") stay stable in the data layer; user-facing labels move from identity nouns to behavioral descriptors.

**Why It Matters for This User**

"The Victim" / "The Addict" / "The Perfectionist" is the vocabulary of 2010s inner-child work, Internal Family Systems pop adaptations, and Enneagram pop-psych. The grammar is identity categorization — *who* the user "becomes" when they slip. That frame violates two of the product's stated positions simultaneously. First, philosophically: "self-governance over self-help" is incompatible with a taxonomy that hands the user a cast of characters to identify with. Second, behaviorally: self-verification theory (Swann) shows that labels consistent with negative self-views become self-reinforcing; a user tagged as "The Addict" across 40 relapse entries is rehearsing that identity with every entry. The research converges: name the behavior, not the person. The slip was *avoidance drift* — something that happened — not *you becoming The Procrastinator* — something you are.

**How It Should Work**

Rename pass:
- "The Procrastinator" → "Avoidance drift"
- "The Addict" → "Compulsive return"
- "The Victim" → "Responsibility abdication"
- "The Perfectionist" → "Standard-inflation freeze"
- "The Imposter" → "Signal-suppression mode"
- "The People-Pleaser" → "Approval-contingent action"
- "The Martyr" → "Cost-absorption reflex"
- "The Critic" → "Prosecution mode"

(The specific replacements above are illustrative; the pattern is the deliverable. Each name is a behavioral-noun phrase that describes *what happened* in the slip, not *who the user is.*)

In parallel: rewrite the habit taxonomy. "Excessive social media scrolling" → "Scroll-state compulsion." "Negative self-talk" → "Internal prosecution." "Binge eating" → "Consumption dysregulation." Move "Caffeine (excessive)" out of the substances list — it is not a substance dependency at the severity the module is designed to track. Remove it or move it to habits.

Update the archetype-to-Kill-List matching prompt copy to reference the new names. Preserve the underlying archetype IDs in the data model for backward compatibility — historical Relapse entries do not need a data migration, only a display mapping.

**What It Is NOT**

- Not a softening — behavioral descriptors are harder, not softer, because they prohibit the identification move.
- Not a deletion of the archetype concept — the concept of patterned relapse behaviors is useful; the identity framing of them is not.
- ⚠️ WARNING: Resist the impulse to re-add a "Shadow" or "Inner Critic" label out of sentimentality. Those labels classify the user; the rewrite classifies the behavior.
- Not a rewrite of the drift detection logic — `detectDriftSignals` consumes archetype IDs, not labels, and continues to work.

**Handoff Note for SSE**

In `RelapseRadar.jsx`, separate the archetype ID (stable) from the display label (mutable). Create a display-label map at the top of the file or in a config module. Apply the rename pass above as the default map. Apply the same pattern to the habit taxonomy. Remove "Caffeine (excessive)" from the substances list. Update any string references to the old names in Synthesis generation, Oracle prompts, or dashboard views to use the new labels via the map. No data migration required — existing entries continue to reference archetype IDs and resolve to new labels on read.

---

### Spec 5: Oracle — Evasion-Aware Tone Calibration

**What It Is**

Wire the existing `detectEvasionMarkers.js` utility into the Oracle feedback pipeline so that the model's posture (challenge / build / ground / clarify / receive) is calibrated to the detected level of evasion in the user's journal or Hard Lessons language. Currently the markers are computed but discarded.

**Why It Matters for This User**

The linguistic-markers-of-self-deception literature (Pennebaker, Hancock, Loconte 2025) is consistent on the measurable signals: reduction in first-person pronouns, increase in abstraction and hedging ("sort of," "kind of," "it just happened"), loss of concrete detail, increase in generalizations. These markers are reliably present when a person is writing about an event they are unwilling to fully own. The product already detects them. It does not use them. This means the Oracle speaks in the same posture to a user who just wrote a forensic, first-person, concrete entry as to a user who wrote a hedged, agency-displacing, abstract entry about the same event. The confrontation that would land on one user is the wrong posture for the other. Calibration is not softness; it is precision. A user writing with full accountability does not need to be challenged on avoidance; challenging them anyway is noise. A user writing with heavy evasion needs the Oracle to name it; receiving a build-posture response is a missed signal. The existing posture-matching system (challenge/build/ground/clarify/receive) was designed for this; evasion-marker density is the variable it was missing.

**How It Should Work**

Before Oracle invocation, compute the evasion score (existing utility). Map score thresholds to posture preference:
- **High evasion (>threshold_high):** Force "challenge" posture. Oracle system prompt includes: "The user's entry shows markers of avoidance (pronoun displacement, abstraction, hedging). Name the evasion pattern directly by citing their own language. Do not offer reframes or build content. Ask one specific question that cannot be answered without taking a position on what they did."
- **Moderate evasion:** Oracle system prompt receives the evasion markers as a note; model is instructed to reference them if relevant to the feedback.
- **Low evasion:** Existing posture selection proceeds unchanged.

The user is never shown the evasion score. The calibration happens server-side via the Cloud Function proxy. The only visible difference is that Oracle's voice is more precisely matched to the entry.

**What It Is NOT**

- Not an evasion "grade" surfaced to the user — that creates incentive to write in ways that evade the detector, which is anti-signal.
- Not a new feature addition — the utility exists; the spec is the wiring.
- ⚠️ WARNING: Do not set the high-evasion threshold too sensitive. Over-triggering produces Oracle responses that confront evasion when the user was simply writing briefly. The threshold should catch patterns, not single markers. Validate on historical entries before deploying.
- Not a replacement for the existing posture selection logic — it is an input to it.

**Handoff Note for SSE**

In `src/utils/aiFeedback.js`, before the posture selection (current lines ~282-293), call `detectEvasionMarkers(content)` and receive the evasion score. Add a new branch in posture selection: if evasion score is above threshold_high, override selected posture to "challenge" and append the evasion-awareness instruction to the system prompt. If moderate, pass the marker data as a structured field alongside the behavioral context. Keep the existing anti-repetition system untouched. Log the evasion score with each Oracle call (server-side only, not surfaced to user) to enable threshold tuning after beta. Coordinate with QA to validate the thresholds on at least 50 historical entries before enabling the override in production.

---

## Appendix A — What Inner Ops Must Not Do (Competitive Intelligence, 2026)

Updated from UXR-001's appendix, adjusted for the current competitor landscape:

| Pattern | Who Does It | Why Inner Ops Must Not |
|---|---|---|
| Geometric mood icons with valence grouping | Reflectly, Daylio, Stoic.app | The visual vocabulary of curated-mood-diary is the category Inner Ops was built to exit |
| Ranked clarity tiers with nature emoji | Duolingo, Forest, Finch | Rank gamification is incompatible with "measurement as truth, not reward" |
| Milestone number arrays `[3, 7, 14, 30, 60, 90]` | Habitica, Streaks, Way of Life | Milestone celebration is the core engagement loop of the category being rejected |
| AI companion pet / character | Finch, Replika, Wysa | Product does not have characters; relationship is with the user's own behavioral record |
| Philosophical quote rotation | Stoic.app, Daily Stoic, Calm | Motivational content by definition; the user does not need quotes, they need signal |
| Streak-tier progression (7d → 21d → 60d → 90d) | All major habit apps | The exact game-design mechanic being imported under the cover of "difficulty tiers" |
| Completion-percentage rewards | Duolingo, Strava, Fitbit | Incentivizes choosing easy targets over hard ones; inverts the Kill List's purpose |
| "You're on a 12-day streak!" framing | All habit apps | The cognitive frame that produces AVE — one breach catastrophizes the record |
| Inner-child / IFS archetype language | Most therapy apps, many journal apps | Identity classification rehearses the identity; behavioral description names the behavior |
| Badges / achievements / level-up animations | Habitica, Duolingo, Forest | External reinforcement; user's own behavioral record is the only legitimate reinforcement |
| Social sharing of progress | Strava, Habitica, BeReal-style integrations | Self-governance is private; public commitment is a different (and weaker) mechanism |
| Onboarding "easy wins" | Nearly all apps | Establishes the wrong expectation — this product does not produce easy wins by design |

**Innovations worth referencing without copying their frame:**

- **Rosebud's insight extraction pattern** — extracting structured insights from freeform entries is good NLP UX; Inner Ops already does this via `extractInsights` + cross-module prefill, and should continue to deepen it
- **Mindsera's "make the user do more work"** approach — Mark Manson's Purpose app and Mindsera both lean into user-labor as the product; this is directionally correct for the target user
- **Bearable's multi-dimensional correlation reports** — still the strongest analytical UX in the space; Inner Ops's Synthesis Engine is architecturally similar and should be protected

---

## Appendix B — Behavioral Science Foundation

The following frameworks directly inform the specs above. Evidence base cited where directly applicable.

**Habit Discontinuation (Kill List)**
- **Implementation Intentions.** Gollwitzer & colleagues' 2024 meta-analysis across 642 tests (European Review of Social Psychology) confirms effect sizes .27 – .66 across cognitive, affective, and behavioral outcomes. The 2025 sustainability-behavior meta-analysis found d=0.47 across final experimental studies. Inner Ops has this implemented (required trigger/response fields on target creation); no change needed, validates the architecture.
- **Abstinence Violation Effect.** Marlatt & Gordon's model (PMC 6760427; Collins & Witkiewitz review) remains the most-cited mechanism by which single breaches become full relapse. Cognitive restructuring — reframing lapses as learning, not moral failure — is the documented intervention. Inner Ops's current streak-reset-to-zero is an AVE-amplifying architecture; Spec 2's record-based rework is the mitigation.
- **Competing Response Activation.** Suppression alone fails (Wegner ironic process). Substitution succeeds. The implementation intention's "response" field is the competing response. Already correct.

**Early Warning Detection (Relapse Radar)**
- **Ecological Momentary Assessment.** 2025 JMIR review (Evaluation in 4 Digital Mental Health Trials) confirms EMA's validity for proximal precursor capture and relapse-risk modeling. The Inner Ops precursor-conditions multi-select is directly aligned; missing step is propagating that data into Oracle (Opportunity #11).
- **Stages of Change (Prochaska & DiClemente).** Regression follows cognitive → behavioral → environmental drift. Rules-based drift detection with persistence thresholds is the product's current implementation; this is validated by the research.

**Reflective Writing (Journaling)**
- **Pennebaker expressive writing.** 40-year bibliometric review (PMC 9611203) confirms that narrative coherence, causal connector density, and insight-word growth are the markers that correlate with outcome improvement. Volume alone does not. Spec 3 and Opportunity #7 derive directly from this.
- **Linguistic markers of deception / self-deception.** Pennebaker's LIWC work and the 2025 Loconte et al. review document pronoun shift, abstraction, and hedging as reliable avoidance markers. Spec 5 depends on this foundation.

**Pain-to-Pattern Conversion (Hard Lessons)**
- **Failure encoding.** Mangels et al. (2006) and subsequent work: negative events followed by explicit reframing produce stronger memory consolidation than success-based learning. Hard Lessons's six-part forensic structure is aligned.
- **Rule extraction as behavioral operationalization.** Consistent with implementation-intentions research: a lesson without a concrete behavioral rule produces recognition without prevention. Inner Ops finalizes rules; Opportunity #8 makes violations mandatory-route.

**Attention and Digital Compulsion (Black Mirror, deferred)**
- **Attention residue (Newport).** Interruption cost persists past the interruption; frequency of context switch matters more than duration. Trigger capture (deferred Pre-Ship requirement) is where intervention lives.
- **Variable reward schedules (Skinner; Harris / CHT).** Still the mechanism; framing remains reclamation, not management.

**Identity and Self-Concept (Cross-Module)**
- **Identity-based behavior change (Clear; Self-Perception Theory, Bem 1972).** "I am the type of person who does X" → observed action. Inner Ops tracks the negative direction (what the user is eliminating) but does not surface the positive identity vector to the user. Opportunity #9 (Identity Direction Surface) derives from this.
- **Self-Verification Theory (Swann).** Negative self-views are self-reinforcing when labels match. Archetype names like "The Victim" actively rehearse the negative self-view each time they're selected. Spec 4's rename pass resolves this.

**Cognitive Load and Self-Regulation**
- **Decision fatigue / PFC depletion (recent 2025 reviews, incl. Frontiers in Cognition).** Executive control degrades under load; defaults and heuristics dominate. The implementation-intention model (pre-deciding the response) is the evidence-backed intervention. This supports both the Kill List architecture and Spec 3's structural journal frame (low-load structure > high-load blank page).

---

## Appendix C — Delta from UXR-001

For continuity with the prior report. Items closed since the 2026-04-09 pass:

- **Cross-Module Synthesis Engine** — shipped (`generateSynthesisBriefing.js`, pulls from all 5 collections, cadence-gated, produces convergence-point + confrontation question via Oracle)
- **Oracle Context Expansion** — shipped (`getBehavioralContext.js`, 5-minute cache, injected into Oracle calls)
- **Kill List Implementation Intentions** — shipped (required trigger/response fields on creation, referenced at autopsy)
- **Relapse Radar Drift Detection** — shipped (`detectDriftSignals.js`, 4 signal types, persistence-based thresholds)
- **Hard Lessons Rules Library + Violation Detection** — shipped
- **Kill List ↔ Hard Lessons Bridge** — shipped (bidirectional prefill via sessionStorage)

Items from UXR-001 not yet fully resolved:
- **AVE Circuit Breaker** — partial. `longestStreak` is computed and displayed, which is the correct direction, but the milestone/tier architecture still produces AVE risk. Spec 2 in this report extends the UXR-001 AVE fix into the tier system itself.
- **Black Mirror Trigger Context Capture** — deferred with the module.
- **Identity Direction Layer** — data exists (BER-137) but not user-facing. Opportunity #9 addresses.

---

*Report prepared by Product Researcher agent — ÜberCore Systems, Cowork mode*
*Session: independent rerun of UXR-001 for diff comparison*
*All 5 specs above are scoped for SSE execution without further research*
