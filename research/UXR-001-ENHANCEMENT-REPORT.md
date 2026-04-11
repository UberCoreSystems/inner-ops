# UXR-001 — Product Enhancement Opportunity Analysis
**Inner Ops | Product Research Division | ÜberCore Systems**
**Date:** 2026-04-09
**Author:** Product Researcher Agent (BER-123)
**Status:** Final — Ready for SSE Handoff

---

## Executive Summary

Inner Ops has correctly identified a market gap: the high-agency individual who has rejected wellness-culture framing. The five core modules — Journaling, Kill List, Hard Lessons, Relapse Radar, Black Mirror — each carry genuine conceptual weight. The implementation is functionally solid but philosophically incomplete.

The primary failure: the app collects behavioral intelligence across five separate silos and does almost nothing with it. Users pour in high-signal data — escape post-mortems, archetype patterns, pain costs, screen time correlations — and the system returns isolated feedback. The Oracle speaks from a single module's context. The modules don't talk to each other. The behavioral intelligence the user has already provided sits inert.

This is not a feature gap. It is a core product promise gap.

The secondary failure: Relapse Radar promises early warning but delivers post-collapse logging. Black Mirror promises attention reclamation but only measures index. Kill List promises behavioral elimination but lacks the intervention logic to survive the first slip. These are modules that describe their ambition but don't yet execute it.

The 15 opportunities below are ranked by their impact on closing the gap between what Inner Ops claims to be and what it currently delivers.

---

## Section 1 — Ranked Opportunity List

| # | Opportunity Title | Module(s) | Vector | Impact | Rationale |
|---|---|---|---|---|---|
| 1 | Cross-Module Behavioral Synthesis Engine | ALL | V3, V4 | **HIGH** | The system's most valuable unrealized asset — user data from five modules sits siloed; correlation is the core intelligence promise |
| 2 | Oracle Context Expansion (Cross-Module Awareness) | ALL | V1, V3, V4 | **HIGH** | Oracle currently operates from one module's snapshot; it must synthesize the full behavioral record to deliver confrontation, not commentary |
| 3 | Kill List: If-Then Implementation Intentions | Kill List | V2 | **HIGH** | Implementation intentions (if X triggers, I will do Y) are the most evidence-backed intervention for behavioral discontinuation; currently absent |
| 4 | Relapse Radar: True Drift Detection | Relapse Radar | V2, V4 | **HIGH** | Module promises early warning but only logs post-event; precursor pattern capture converts it from archive to alarm |
| 5 | Kill List: Abstinence Violation Effect Circuit Breaker | Kill List | V2, V3 | **HIGH** | All-or-nothing streak model amplifies the AVE — users who slip once often abandon entirely; the streak system needs philosophical rework that preserves weight without catastrophizing a single breach |
| 6 | Hard Lessons Rules Library | Hard Lessons | V2, V3, V4 | **HIGH** | Finalized lessons are locked but never aggregated; a callable rules library converts isolated wisdom into a living decision framework |
| 7 | Hard Lessons → Kill List Rule Violation Bridge | Hard Lessons, Kill List | V3, V4 | **HIGH** | When a finalized rule is violated, it must generate Kill List action; a rule in writing that doesn't produce behavioral warfare is decoration |
| 8 | Kill List Autopsy Pattern Intelligence | Kill List | V2, V4 | **MEDIUM** | Autopsy data (context, rationalization, prevention intent) is captured but never surfaced as aggregate patterns — highest-fidelity behavioral data in the system, currently inert |
| 9 | Black Mirror: Trigger Context Capture | Black Mirror | V2, V4 | **MEDIUM** | Index measures outcome but not cause; capturing what preceded compulsive use is the only path to reclamation, not just measurement |
| 10 | Relapse → Kill List Pattern Trigger | Relapse Radar, Kill List | V3, V4 | **MEDIUM** | Archetype frequency data should auto-surface which Kill List targets are most at risk when a given archetype manifests |
| 11 | Black Mirror ↔ Relapse Correlation Report | Black Mirror, Relapse Radar | V2, V4 | **MEDIUM** | High BMI days correlating with Relapse entries reveals whether digital compulsion is a precursor or a symptom — currently invisible |
| 12 | Oracle: Regeneration and Follow-Up Interrogation | ALL | V1, V4 | **MEDIUM** | Oracle feedback is currently terminal — no regeneration, no follow-up questions; high-agency users interrogate, they don't just receive |
| 13 | Identity Direction Layer | ALL | V3, V1 | **MEDIUM** | No module tracks the positive identity vector — who the user is becoming; the archetype system maps dysfunction but not the sovereignty being built |
| 14 | Confrontation Honesty Signal (Oracle Calibration) | Journal, Hard Lessons | V2, V3 | **LOW** | Linguistic markers of avoidance vs. accountability exist in the reflection literature; Oracle prompts could calibrate to the level of evasion detected in the user's language |
| 15 | Check-In Timestamp Proximity Integrity | Relapse Radar, Journal | V2 | **LOW** | Ecological Momentary Assessment research consistently shows that check-in accuracy degrades with time since event; timestamping when an entry is about is distinct from when it was written |

---

## Section 2 — Module-by-Module Improvement Report

---

### Journaling

**Current State Assessment**

The most functionally complete module. Mood + intensity capture, guided prompt rotation, pain signal detection, Oracle feedback, and virtualized entry history are all present. The architecture is coherent. Dynamic insights generation (debounced at 2000ms) is partially implemented.

The module correctly limits freeform dumping via mood selection and category framing, though it does not enforce structural prompting on the main content area — users can still use it as a free-text diary.

**Identified Gaps**

1. **No structural constraints on content** — The main textarea accepts any content. The module is positioned as "guided and intentional" but the only structure is mood/intensity selection. Entry quality is entirely user-discretion.
2. **Pain signal detection exists but under-delivers** — Regex matching for words like "mistake" and "regret" triggers a suggestion to create a Hard Lessons entry. This is a one-time, undismissable UI element that doesn't learn from whether the user acted on it.
3. **Oracle feedback is generic** — Generated from entry content and mood alone; has no access to the user's historical patterns, Kill List status, or recent Relapse data.
4. **No distinction between high-signal and low-signal entries** — A 50-character entry that says "felt bad today" earns the same points as a structured, forensic reflection. The scoring threshold exists but quality isn't surfaced back to the user.
5. **Dynamic insights shown during writing are discarded** — Contextual AI insights generated while writing are not stored or surfaced in the Oracle feedback; the work is thrown away.

**Specific Improvement Recommendations**

- Add optional structured frames: one-sentence "What am I actually dealing with?" required before opening the main field
- Pain signal detection should persist and stack — if a user writes about the same topic twice without creating a Hard Lesson, prompt escalation, not repetition
- Oracle must have read access to the last 30 days of cross-module data
- Surface an "entry signal strength" indicator (not a score) that reflects depth of reflection, not volume of text — this serves accountability, not reward

**Philosophy Alignment Check**

Partially aligned. Mood selection and intensity tracking create structure. Oracle feedback moves toward confrontation. However: the free-text main field undermines "guided and intentional," and the Oracle operates without behavioral context, making its confrontation shallow. Current implementation is closer to a sophisticated mood diary than a signal extraction system.

---

### Kill List

**Current State Assessment**

Conceptually the strongest module. The target → daily check-in → autopsy → milestone → kill flow is architecturally sound. Data captured on escapes (context, rationalization, prevention intent) is unusually rich. The difficulty tiers (Surface/Deep/Core) create appropriate weight differentiation. The all-or-nothing streak model creates genuine stakes.

**Identified Gaps**

1. **Autopsy data is captured and abandoned** — Users record what triggered an escape, what they told themselves, and what they'll do differently. None of this is ever aggregated, surfaced back, or used to modify the Oracle prompt on future escapes. This is the highest-fidelity behavioral data in the system — it is currently inert.
2. **No implementation intentions** — The module tracks what the user wants to eliminate but provides no structured "if X, then Y" response plan. Behavioral science is unambiguous: naming the trigger-response plan dramatically improves discontinuation outcomes. (Gollwitzer, 1999; Webb & Sheeran, 2006)
3. **Streak model amplifies Abstinence Violation Effect** — A single escape resets the streak to zero. For Core-level (60-day) targets, this is catastrophic — one slip after 59 days of discipline destroys the entire visible record. AVE research shows this catastrophizing is the primary mechanism by which people abandon behavioral change after a single breach. The model needs nuance without losing weight.
4. **No pattern detection across targets** — Users often escape multiple targets in the same context (e.g., "when I'm tired and alone"). This cross-target escape correlation is invisible.
5. **No connection to Hard Lessons** — When a target is escaped repeatedly, it should generate a Hard Lessons entry prompt. Repeated escape is a pattern, and patterns are lessons.
6. **Celebration animation (Confetti) violates philosophy** — Confetti on kill completion is a reward mechanic. A behavioral kill is not a celebration; it is the baseline expectation. This is the clearest current example of philosophy drift.

**Specific Improvement Recommendations**

- Required "if X, then Y" implementation intention on target creation (what is the specific trigger, what is the specific counter-behavior)
- Autopsy pattern surfacing: after 3+ escapes on a target, Oracle uses aggregated autopsy data to confront the pattern directly
- Rework streak display to show "longest maintained" alongside "current" — discipline is measured over the long arc, not destroyed by a single breach
- Replace confetti with a weight-appropriate confirmation (spare, grave acknowledgment — not celebration)
- Auto-generate Hard Lessons prompt after 3+ escapes on a single target

**Philosophy Alignment Check**

Partially misaligned. "Behavioral warfare, not passive habit tracking" is the stated standard. The module is close — the autopsy modal, difficulty tiers, and streak stakes are correct. But the confetti celebration, lack of autopsy pattern intelligence, and the AVE-amplifying streak model undercut the warfare framing. Passive hope that users will "try again" is not warfare.

---

### Hard Lessons

**Current State Assessment**

The most philosophically rigorous module. The 6-part forensic structure (Event → Assumption → Signal Ignored → Cost → Lesson → Rule) is correct. Immutability of finalized lessons is the right architectural decision. The scar inventory onboarding flow is a strong first-time experience. Temporal decay scoring (lessons have urgency) is sophisticated.

The module is functionally complete but epistemologically isolated. Lessons are locked and forgotten.

**Identified Gaps**

1. **Finalized rules are not callable** — Every finalized lesson contains a "rule going forward." These rules should compose into a decision framework the user can consult before high-stakes choices. Currently: written, locked, never referenced again.
2. **No violation detection** — The module has no way to know if a rule has been violated again. A violated rule is the most important data point in the system — it means the lesson was insufficient or the behavioral root wasn't addressed. Currently invisible.
3. **No Kill List bridge** — When a rule is violated, it should surface an immediate Kill List target creation prompt. The rule violation is the behavioral enemy to be named.
4. **Oracle extraction assistance is one-shot** — The Oracle helps extract the lesson but can't be re-engaged after finalization. If the user gains new context months later, there's no mechanism to deepen the existing lesson.
5. **Cost patterns are uncommunicated** — Cost frequency charts are present but not analyzed. If emotional cost appears in 70% of a user's lessons, this is a significant pattern that should be surfaced explicitly, not left for the user to notice.

**Specific Improvement Recommendations**

- Rules Library: aggregated view of all "rules going forward" from finalized lessons, searchable, categorized by cost type and event category
- Rule Violation Prompt: when a user creates a Hard Lesson whose event description semantically matches a prior finalized lesson, surface the prior rule and ask if it was violated
- Kill List bridge: button on finalized lessons to "add to Kill List" with the rule as the target title pre-filled
- Cost pattern narrative: Oracle-generated synthesis of the user's top cost categories and what they indicate about their behavioral blind spots

**Philosophy Alignment Check**

Well aligned. The forensic structure, immutability, and "no victim positioning" constraints are correct. The gap is not philosophical drift but incomplete execution: lessons are crystallized but not weaponized. "Converts suffering into structure" requires that structure be usable — a locked archive is not a weapon.

---

### Relapse Radar

**Current State Assessment**

The module captures archetype, habit, substance, and reflection data post-event. Pattern data surfaces: top archetype, top habit trigger, days since last relapse, weekly frequency. Oracle delivers feedback. The 4-step entry flow creates appropriate friction without excessive burden.

The foundational problem: this module is called "Radar" but it only tracks what has already landed. True radar detects approach.

**Identified Gaps**

1. **No early warning mechanism** — The module description says "catches drift and slippage before full regression." Currently: it logs post-collapse. There is no detection logic, no precursor capture, no trigger forecasting. The name is aspirational; the implementation is retrospective.
2. **No trigger context capture** — What was happening before the relapse? The entry captures what happened (archetype, habits) but not the conditions that made it possible (isolation, sleep deprivation, stress context). Without precursors, there's no early warning to give.
3. **Archetype frequency without intervention routing** — Knowing "The Procrastinator" appears 8 times doesn't route the user to action. Pattern visibility without action routing is noise.
4. **No Kill List linkage** — When a relapse archetype correlates with an active Kill List target, that connection should be explicit and automatic.
5. **Scoring cap (20 entries) may discourage honest logging** — Once the user has logged 20 entries, further logging has no score weight. For users who are primarily intrinsically motivated this is fine; for users who use the score as accountability, the cap may suppress continued logging. This is worth monitoring but not changing without data.

**Specific Improvement Recommendations**

- Add precursor context capture to the entry flow: brief structured field ("What was the context that made this possible? Sleep, stress, isolation, avoidance of something?")
- Drift signals: if the user has had 3+ relapses in 7 days with the same archetype, surface a warning indicator on the dashboard — not a notification, not an encouragement, a factual signal
- Archetype-to-Kill List routing: pattern card should show which active Kill List targets are most associated with the dominant archetype
- Rename internal step language to reinforce early detection frame, not post-collapse documentation

**Philosophy Alignment Check**

Misaligned at the product architecture level. "Early warning detection system" is the stated promise. "Post-collapse logging" is the current reality. This is the largest gap between module definition and implementation in the product. Closing it requires adding precursor capture and building basic drift signal logic — not a full ML system, but a rules-based frequency alert.

---

### Black Mirror

**Current State Assessment**

Weekly check-in captures screen time, mental fog, interaction depth, and unconscious use boolean. Black Mirror Index is calculated and color-coded. Oracle feedback is provided. An analytics report view exists. The index formula is reasonably constructed.

The module measures attention loss after it has occurred. It does not help the user reclaim attention.

**Identified Gaps**

1. **No trigger capture** — The index measures the outcome (how much, how foggy) but not the cause (what precipitated the compulsive use). Without knowing the trigger, reclamation is impossible.
2. **No correlation with Relapse Radar** — High BMI days almost certainly correlate with Relapse entries. This is the most obvious cross-module signal in the system and it is currently invisible.
3. **No intervention logic** — When the index is in red/orange zone, the module shows a number. It does not prompt the user to identify what reclamation looks like for them specifically.
4. **"Interaction level" framing is ambiguous** — Rating "social/relational depth" on a 1-10 scale during a weekly check-in is too abstract. Users will interpret this inconsistently across weeks, making trend analysis unreliable.
5. **Philosophical note:** The "unconscious check" boolean is the correct framing — compulsive use is not about duration, it's about intention. This is philosophically sound. Build on it.

**Specific Improvement Recommendations**

- Add trigger context field to weekly check-in: "What were you avoiding when you reached for your phone?" — one required sentence, not optional reflection
- BMI ↔ Relapse correlation report: show the relationship between high-index weeks and relapse frequency — let the user see if their digital behavior is a warning signal or a symptom
- Intervention prompt: when BMI exceeds threshold for second consecutive week, Oracle uses that data explicitly — "Your index has been red for two consecutive weeks. What specifically will you restrict?"
- Clarify interaction level: replace abstract 1-10 with concrete descriptors ("Was most of your screen use solo consumption or intentional connection?") — binary or 3-point scale is more reliable than 10-point

**Philosophy Alignment Check**

Partially aligned. "Attention sovereignty tracker" requires both measurement AND reclamation logic. The measurement is present. The reclamation logic is absent. The philosophical frame ("stolen attention," not "screen time management") is correct in copy but not expressed in the UX flow — the module still feels like a wellness check, not a sovereignty audit.

---

## Section 3 — Full Enhancement Specs (Top 5)

---

### Spec 1: Cross-Module Behavioral Synthesis Engine

**What It Is**

A data layer that aggregates signals across all five modules and surfaces pattern correlations the user cannot see by looking at individual modules. The synthesis is not a dashboard widget — it is a structured, periodically generated behavioral briefing that confronts the user with what their own data reveals across domains.

**Why It Matters for This User**

High-agency users are analytically minded. They track because they want signal. The current system makes them do the synthesis manually — they have to notice that they escape Kill List targets whenever The Procrastinator shows up in Relapse Radar, and that their BMI spikes the same week. No tool is doing this work for them. This user is not looking for insights they could arrive at themselves. They want the system to do the analysis and confront them with conclusions they might not want to see.

**How It Should Work**

- Runs a synthesis analysis on a user-configurable cadence (weekly or biweekly recommended)
- Pulls: last N relapse entries + archetype frequencies; active Kill List targets + escape counts + autopsy data; Hard Lessons finalized rules; Black Mirror index trend; Journal mood pattern over same period
- Generates a structured briefing with the following sections:
  1. **Convergence Point** — The behavioral pattern that appears across multiple modules (e.g., "The Procrastinator archetype appeared in 6 of your 9 relapses this month. Your Kill List target [X] was escaped 4 times. Your BMI averaged 31 in those same weeks.")
  2. **Violated Rules** — Any Hard Lessons rules semantically adjacent to current escape or relapse patterns
  3. **Signal Delta** — Whether your patterns are improving, stable, or deteriorating vs. the prior period (flat metrics, not praise)
  4. **One Confrontation** — A single focused question derived from the synthesis, not answerable with a yes or no
- Output: Stored as a permanent briefing record the user can reference; Oracle does not generate this — a separate synthesis prompt generates it from structured data, not conversational context
- User cannot request a briefing more than once per configured cadence — forced periodicity prevents compulsive checking of the briefing itself

**What It Is NOT**

- Not a dashboard summary (those are participation metrics)
- Not a score update or rank advancement notification
- Not a positive reinforcement mechanism — convergence points are not achievements
- Not real-time — this is a periodic structured confrontation, not a live feed
- Not AI-generated commentary on what to do — it presents patterns and asks one question; the user decides what to do

**Handoff Note for SSE**

The synthesis logic should be a pure data aggregation function (no LLM required for the core correlation logic). The "One Confrontation" question at the end should use the LLM with a strict prompt that prohibits advisory language, motivational framing, or suggested actions. Input: structured data object with cross-module aggregates. Output: one specific, uncomfortable question derived from the data. Store synthesis records in a `/syntheses` Firestore collection linked to the userId with generation timestamp and cadence metadata.

---

### Spec 2: Oracle Context Expansion (Cross-Module Awareness)

**What It Is**

An upgrade to the Oracle's context window. Currently, Oracle generates feedback from a single entry in a single module. This spec makes the Oracle aware of the user's full behavioral record when generating responses — not to provide therapy, but to produce confrontation that lands because it references real, specific, recent patterns.

**Why It Matters for This User**

Generic feedback is noise. The user who has escaped the same Kill List target three times, with the same archetype in Relapse Radar, does not need a reflection on willpower. They need the Oracle to say: "You've named this exact context in every autopsy since January. The prevention plan you wrote isn't being executed." That specificity requires cross-module context. Without it, Oracle is a chatbot with a dark UI.

**How It Should Work**

- Oracle context payload expands from `{ content, mood, moduleName }` to include a `behavioralContext` object:
  ```
  behavioralContext: {
    activeKillTargets: [ { title, streak, escapeCount, lastAutopsy } ],
    dominantRelapsArchetype: string,
    recentRelapseCount: number (last 14 days),
    blackMirrorTrend: "improving" | "stable" | "deteriorating",
    violatedHardLessons: [ { rule, violatedApprox } ],
    journalMoodPattern: string (dominant mood last 7 days)
  }
  ```
- Oracle system prompt instructs the model to: reference at least one cross-module data point when relevant; call out violated rules by name when present; not generate encouragement or affirmation; maintain confrontational not compassionate tone
- Oracle still responds to the current module's content first — cross-module context is used for depth, not redirection
- Cross-module context is fetched asynchronously before Oracle modal opens; loading state covers the delay

**What It Is NOT**

- Not a comprehensive analysis of all user data (that's the Synthesis Engine)
- Not a therapeutic intervention or crisis resource
- Not an interrogation tool — Oracle speaks once; it does not ask follow-up questions in this spec (that's Spec 3)
- Not generic: if cross-module data is empty, Oracle reverts to single-module context — it should never hallucinate patterns that aren't there

**Handoff Note for SSE**

Create a `getBehavioralContext(userId)` utility function in `utils/` that queries Firestore for the relevant recent data and returns the structured object. This function should be cached for 5 minutes (like the clarity score cache) to avoid redundant reads. Update `generateAIFeedback` to accept the optional `behavioralContext` parameter and inject it into the system prompt conditionally.

---

### Spec 3: Kill List — If-Then Implementation Intentions

**What It Is**

A required structured field on Kill List target creation that captures the user's specific trigger-response plan: "If [specific triggering condition], I will [specific competing behavior]." This is added to the target record and referenced at every autopsy check-in.

**Why It Matters for This User**

Implementation intentions are the highest-evidence behavioral intervention in the discontinuation literature (effect size d=0.65 across meta-analyses; Gollwitzer, 1999; Webb & Sheeran, 2006). They work because they pre-decide behavior in high-risk moments, removing the cognitive load of deciding what to do when the trigger is already active. The Kill List's current model assumes the user will figure out the counter-behavior in the moment — which is the moment of maximum cognitive impairment. This is operationally naive. The implementation intention turns the target from a declaration into an operational plan.

**How It Should Work**

- On target creation (Step 2, after category and difficulty): add a required structured field below the main target name
  - Field label: "When [TRIGGER], I will [RESPONSE]"
  - Two sub-fields: `trigger` (text, required, ≥20 chars) and `response` (text, required, ≥20 chars)
  - Example placeholder: trigger: "I feel the urge to [X] after [context]"; response: "I will immediately [specific action] for at least [duration]"
- Target card displays the implementation intention in collapsed state, expandable
- Autopsy modal references the implementation intention: first field in autopsy is "Did your implementation intention activate? If not, why not?" — this is not optional
- If escape occurs and implementation intention was not activated, Oracle autopsy feedback addresses this specifically
- After 3 escapes where implementation intention did not activate, surface a prompt to revise the intention — the plan failed, not the person

**What It Is NOT**

- Not optional — a target without a plan is a wish
- Not a reflection on motivation ("why do I want to stop?") — this is operational, not psychological
- Not an affirmation ("I commit to...") — the grammar is conditional, not declarative
- Not a journaling field — short, specific, actionable; no word count incentive

**Handoff Note for SSE**

Add `implementationIntention: { trigger: string, response: string }` to the Kill List target data model. Update the target creation form to include the two sub-fields as a required step between category/difficulty selection and Oracle feedback generation. Update `KillList.jsx` and `KillListDashboard.jsx` to display the intention on target cards. Update the autopsy modal to reference and capture `intentionActivated: boolean | null` + `intentionFailureReason: string` when applicable.

---

### Spec 4: Relapse Radar — Drift Detection Layer

**What It Is**

A rules-based precursor capture system added to the Relapse Radar entry flow, plus a dashboard signal that surfaces when behavioral drift indicators cross threshold — without waiting for a full relapse entry to confirm the pattern.

**Why It Matters for This User**

The Stages of Change model (Prochaska & DiClemente) and behavioral drift research consistently show that regression follows a predictable sequence: cognitive drift (rationalization starts) → behavioral drift (avoidance, reduced self-monitoring) → environmental drift (pattern-enabling contexts) → relapse. Inner Ops currently captures only the final stage. Capturing the antecedent conditions converts the module from a post-event log into a genuine early warning system. This is the module's entire stated purpose and it is currently undelivered.

**How It Should Work**

- **Entry flow addition:** Step 0 (new, added before archetype selection): "What conditions were present in the 24-48 hours before this?" — structured multi-select (sleep deprived, isolated, high stress, major decision pending, social pressure, avoided something important, none of the above) + optional one-sentence context
- **Precursor data stored** on each entry alongside existing fields
- **Drift signal logic (rules-based, no ML required):**
  - Trigger 1: Same archetype logged 3+ times in any 7-day window → dashboard surface "Drift Signal: [Archetype] active" — no notification, dashboard indicator only
  - Trigger 2: 3+ entries in 7 days where the same precursor condition is marked → surface "Recurring condition: [X] present before [N] recent relapses"
  - Trigger 3: Kill List escape + Relapse entry with same archetype within same 48-hour window → link the two events in the timeline view
- **Timeline view upgrade:** Show Kill List escape events and Relapse entries on the same chronological axis so users can see their behavioral sequences, not isolated data points
- Dashboard drift signal: spare indicator, not alert — factual, not alarming ("Drift signal detected: 3 entries this week")

**What It Is NOT**

- Not predictive AI — this is rules-based threshold detection on the user's own data
- Not a warning that pathologizes normal fluctuation — thresholds should be configurable (default 3-in-7 but user-adjustable downward only — they can make it stricter, not looser)
- Not a crisis intervention tool — the EmergencyButton handles acute states; this handles drift
- Not a streak counter for "days without relapse" — that metric is already present and is not the point of this spec

**Handoff Note for SSE**

Add `precursorConditions: string[]` and `precursorContext: string` to the Relapse entry data model. Update the Relapse entry flow to include the new Step 0. Create a `detectDriftSignals(userId)` utility that queries recent Relapse entries and Kill List escapes to evaluate the three trigger conditions. Returns a `signals: DriftSignal[]` array, each with `type`, `description`, and `severity`. Surface on Dashboard component as a bare, dark UI element — no color coding that implies urgency or alarm.

---

### Spec 5: Kill List — Abstinence Violation Effect Circuit Breaker

**What It Is**

A philosophical and UX rework of the streak system that removes the catastrophic zero-reset without softening the accountability model. The core change: the behavioral record is never erased — an escape is logged, not hidden; but the motivational architecture no longer treats a single breach as equivalent to never having started.

**Why It Matters for This User**

The Abstinence Violation Effect (AVE) is one of the most replicated phenomena in behavioral change research (Marlatt & Gordon, 1985). When a person pursuing behavioral discontinuation experiences a single breach, the all-or-nothing framing of their effort ("I ruined my streak") is the primary mechanism through which temporary slippage becomes full relapse. The current Kill List model is architecturally designed to maximize AVE. A 59-day streak reset to zero after one escape is not accountability — it is a mechanism for abandonment disguised as rigor.

High-agency users are not protected from AVE by being high-agency. The research is clear: AVE activates across conscientiousness levels. The slip's cognitive interpretation — not the slip itself — determines whether recovery or collapse follows.

The fix does not reduce the weight of the system. It reframes the weight correctly: a breach is a data point and an obligation, not a verdict.

**How It Should Work**

- **Retain the streak count as "active consecutive days"** — this does not change
- **Add a second primary metric: "Behavioral Record" = total days tracked on this target** — shows on the target card alongside current streak; this is the number that cannot be reset, only extended
- **Escape language audit:** Replace any UI language that implies the streak is "broken" or "destroyed." The autopsy modal should open with "What happened?" — not a shame frame. The escape is entered into the record; it is not erased from it.
- **AVE Prompt in autopsy modal:** After autopsy is submitted, before the Oracle generates feedback, surface a single static line: *"One breach does not end the war. The autopsy is complete. Return to discipline tomorrow."* — this is hardcoded, not AI-generated; it appears once per escape and cannot be dismissed prematurely (3-second delay)
- **Kill threshold unchanged:** 7/21/60 consecutive days still required for Surface/Deep/Core kill — the kill requires consecutive execution; this is correct and must not change
- **Visual: "Longest Run" always visible** — target card shows longest streak ever maintained alongside current; this gives context to a current slip without erasing the historical record

**What It Is NOT**

- Not a "forgiveness" system — the escape is fully documented; the autopsy is required; nothing is minimized
- Not a streak freeze or "grace day" mechanic — WARNING: grace days are a classic engagement-retention mechanism from habit-app design; do not implement them here
- Not motivational reframing ("you got this" after an escape) — the AVE prompt is factual, not encouraging
- Not a reduction in the kill thresholds — the behavioral standard is unchanged; only the interpretive frame shifts

**Handoff Note for SSE**

Add `totalTrackedDays: number` to the Kill List target data model, incremented on every check-in regardless of escape/held. Update target card display to show both `streak` (current) and `totalTrackedDays` (permanent record). Add `longestRun` computed field (already exists as `longestStreak` — verify this is populated correctly). Add the static AVE prompt to the autopsy modal as a timed display (3-second lock before Oracle proceeds). Audit all UI copy for streak-as-verdict language and replace with streak-as-measurement language.

---

## Appendix A — What Inner Ops Must Not Do (Competitive Intelligence)

The following patterns from the competitor landscape represent the product's clearest failure modes:

| Pattern | Who Does It | Why Inner Ops Must Not |
|---|---|---|
| Streak celebrations / confetti animations | Habitica, Streaks, Finch | Behavioral achievements are not occasions for celebration — they are the expected baseline |
| Motivational push notifications | Reflectly, Finch, Fabulous | Motivation is external dependency; Inner Ops serves self-command |
| Emoji mood logging | Reflectly, Daylio | Diminishes the weight of emotional states; precision requires language |
| Compassionate AI companions | Replika, Finch, Wysa | Empathy delivery is not the product; confrontation is |
| Streak freeze purchases | Duolingo, Streaks | Paying to hide failure is the antithesis of accountability |
| "You're doing great!" feedback frames | Most habit apps | Affirmation is noise; pattern recognition is signal |
| Social sharing of progress | Habitica, Bereal integrations | Self-governance is private; performance is incompatible with accountability |
| Onboarding "wins" designed to feel good quickly | Almost all | The early UX must establish that this is hard, not gamified |

**Genuine innovations worth referencing (without copying their frame):**

- **Bearable's symptom correlation reports** — multi-variable correlation across tracked dimensions is good analytical UX; Inner Ops should build this between Black Mirror and Relapse Radar
- **Day One's timeline view** — chronological behavioral event sequencing creates narrative coherence; applicable to cross-module event linking
- **Notion's block-based structure** — progressive disclosure of complexity is good cognitive load management; applicable to Hard Lessons entry form

---

## Appendix B — Behavioral Science Foundation

The following evidence-based frameworks directly inform the enhancement specs above:

**Habit Discontinuation (Kill List)**
- Implementation Intentions (Gollwitzer, 1999; Webb & Sheeran, 2006): Pre-specified if-then plans reduce the cognitive load of in-moment decision-making, dramatically improving discontinuation rates
- Abstinence Violation Effect (Marlatt & Gordon, 1985): All-or-nothing framing after a single breach is the primary mechanism of full relapse; cognitive reframing without reducing standards is the evidence-backed intervention
- Competing Response Activation: Substituting a specific behavior for the eliminated one is more effective than pure suppression (suppression paradox — Wegner, 1994)

**Early Warning Detection (Relapse Radar)**
- Stages of Change (Prochaska & DiClemente): Regression follows cognitive → behavioral → environmental drift before full relapse; the precursor stage is the window for intervention
- Ecological Momentary Assessment: Capturing context at or near the time of occurrence produces significantly more accurate behavioral data than retrospective recall

**Reflective Journaling (Journaling)**
- Expressive Writing (Pennebaker & Beall, 1986): Structured emotional processing with coherent narrative outperforms freeform venting on insight generation and behavioral outcomes
- Coherence as Signal: Narrative coherence — the ability to construct a causal account of one's own behavior — correlates with behavioral self-regulation capacity

**Pain-to-Pattern Conversion (Hard Lessons)**
- Failure Encoding: Negative experiences followed by active reframing produce stronger and more generalizable memory consolidation than success-based learning (Mangels et al., 2006)
- Implementation Intentions from Learning: Translating a lesson into an explicit if-then rule operationalizes it; lessons without behavioral rules produce recognition without recurrence prevention

**Attention and Digital Compulsion (Black Mirror)**
- Variable Reward Loops (Skinner; Tristan Harris): Phone compulsion is driven by unpredictable reward schedules — the same mechanism as slot machines; understanding this is prerequisite to reclamation
- Attention Residue (Newport, 2016): Cognitive cost of digital interruption persists after the phone is put down; the damage is not duration but frequency of context switch
- Limbic Capitalism (Courtwright, 2019): Digital compulsion is commercially engineered; the correct frame is reclamation of agency, not management of a health metric

---

*Report prepared by Product Researcher Agent — ÜberCore Systems*
*Issue: [BER-123](/BER/issues/BER-123)*
*Ready for SSE handoff review of top 5 enhancement specs*
