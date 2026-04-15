const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const AnthropicSDK = require("@anthropic-ai/sdk");
const Anthropic = AnthropicSDK.default ?? AnthropicSDK;

const anthropicApiKey = defineSecret("ANTHROPIC_API_KEY");

// Rate limiting: max Oracle calls per user per day
const DAILY_LIMIT = 20;

// BER-167: Oracle trust calibration — behavioral record density threshold
// Below this count the Oracle uses a discrepancy-pointing frame instead of
// archetype/pattern confrontation. Trigger is entry count, not calendar time.
const TRUST_THRESHOLD = 21;

// In-memory rate limit store (resets on cold start — acceptable for this use case)
// For production at scale, replace with Firestore-backed rate limiting
const rateLimitStore = new Map();

function getRateLimitKey(uid) {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return `${uid}:${today}`;
}

function checkRateLimit(uid) {
  const key = getRateLimitKey(uid);
  const count = rateLimitStore.get(key) || 0;
  if (count >= DAILY_LIMIT) return false;
  rateLimitStore.set(key, count + 1);
  return true;
}

/**
 * Oracle — secure Claude API proxy.
 *
 * Called from the client via Firebase callable function.
 * Expects: { entryText, moduleName, userContext, tone }
 * Returns: { feedback, lensUsed, prescriptions }
 */
exports.oracle = onCall(
  { secrets: [anthropicApiKey], region: "us-central1", timeoutSeconds: 30 },
  async (request) => {
    // Auth check — must be a signed-in user
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "You must be signed in to use the Oracle.");
    }

    const uid = request.auth.uid;

    // Rate limit check — skip for background extraction calls (killlistextraction, relapsedetection)
    const normalizedModuleForLimit = ((request.data?.moduleName) || '').toLowerCase().replace(/[^a-z]/g, '');
    const isExtractionCall = normalizedModuleForLimit === 'killlistextraction' || normalizedModuleForLimit === 'relapsedetection';
    if (!isExtractionCall && !checkRateLimit(uid)) {
      throw new HttpsError(
        "resource-exhausted",
        `You've reached the daily Oracle limit (${DAILY_LIMIT} calls). Come back tomorrow.`
      );
    }

    const { entryText, moduleName, userContext, tone, behavioralContext, entryCount, customSystemPrompt } = request.data;

    if (!entryText || typeof entryText !== "string" || entryText.trim().length < 10) {
      throw new HttpsError("invalid-argument", "Entry text must be at least 10 characters.");
    }

    const client = new Anthropic({ apiKey: anthropicApiKey.value() });

    const baseSystemPrompt = buildSystemPrompt(moduleName, tone, behavioralContext, entryCount);
    const systemPrompt = customSystemPrompt ? `${baseSystemPrompt}\n\n${customSystemPrompt}` : baseSystemPrompt;
    const userPrompt = buildUserPrompt(entryText, userContext);

    try {
      const message = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 600,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      });

      const rawText = message.content[0]?.text || "";
      const parsed = parseOracleResponse(rawText);

      return parsed;
    } catch (error) {
      console.error("Claude API error:", error.message);
      throw new HttpsError("internal", "The Oracle is unavailable. Try again shortly.");
    }
  }
);

/**
 * OracleFollowUp — second-layer reflection response.
 *
 * Expects: { originalEntry, userResponse, initialFeedback }
 * Returns: { followUp }
 */
exports.oracleFollowUp = onCall(
  { secrets: [anthropicApiKey], region: "us-central1", timeoutSeconds: 30 },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "You must be signed in.");
    }

    const { originalEntry, userResponse, initialFeedback } = request.data;

    if (!userResponse || typeof userResponse !== "string" || userResponse.trim().length < 5) {
      throw new HttpsError("invalid-argument", "Your response must be at least 5 characters.");
    }

    const client = new Anthropic({ apiKey: anthropicApiKey.value() });

    try {
      const message = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 400,
        system: `You are the Oracle — a direct, grounded advisor continuing a conversation.

The user responded to your initial feedback. Read their response carefully before choosing your posture.

If they pushed back or deflected → go one level deeper. Name what they are still protecting.
If they agreed and added insight → build on what they said. Extend their thinking. Show them the next step.
If they shared something vulnerable or new → receive it. Do not challenge vulnerability with more pressure.
If they asked a genuine question → answer it directly. No redirecting it back to them.

Do NOT repeat what you already said. Do NOT offer generic encouragement.
Be specific. Reference their exact words. Max 3 sentences.
No emojis. No therapeutic language. Never name a philosopher or tradition.`,
        messages: [
          {
            role: "user",
            content: `Original entry: "${originalEntry}"

Your initial feedback: "${initialFeedback}"

Their response: "${userResponse}"

Continue the conversation. Match your posture to what they actually said.`,
          },
        ],
      });

      return { followUp: message.content[0]?.text || "" };
    } catch (error) {
      console.error("Claude follow-up error:", error.message);
      throw new HttpsError("internal", "Follow-up unavailable.");
    }
  }
);

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function buildBehavioralContextBlock(behavioralContext) {
  if (!behavioralContext || typeof behavioralContext !== "object") return "";
  const parts = [];
  if (behavioralContext.dominantRelapseArchetype) {
    parts.push(`Dominant relapse archetype (last 14d): ${behavioralContext.dominantRelapseArchetype}.`);
  }
  if (behavioralContext.recentRelapseCount > 0) {
    parts.push(`Relapse entries in last 14 days: ${behavioralContext.recentRelapseCount}.`);
  }
  if (Array.isArray(behavioralContext.activeKillTargets) && behavioralContext.activeKillTargets.length > 0) {
    const targets = behavioralContext.activeKillTargets
      .map((t) => `${t.title} (streak: ${t.streak}, escapes: ${t.escapeCount})`)
      .join("; ");
    parts.push(`Active Kill List targets: ${targets}.`);
  }
  if (Array.isArray(behavioralContext.violatedHardLessons) && behavioralContext.violatedHardLessons.length > 0) {
    const rules = behavioralContext.violatedHardLessons.map((l) => `"${l.rule}"`).join(", ");
    parts.push(`Hard Lessons rules being violated: ${rules}. Call these out by name if relevant.`);
  }
  if (behavioralContext.blackMirrorTrend) {
    parts.push(`Black Mirror attention trend: ${behavioralContext.blackMirrorTrend}.`);
  }
  if (behavioralContext.journalMoodPattern) {
    parts.push(`Dominant journal mood (last 7d): ${behavioralContext.journalMoodPattern}.`);
  }
  if (behavioralContext.identityDirection) {
    parts.push(`User's stated identity direction: "${behavioralContext.identityDirection}". If the user's current behavior contradicts this stated direction, name the contradiction explicitly. Do not soften it.`);
  }
  if (parts.length === 0) return "";
  return `\n\nCross-module behavioral context (use at least one data point when relevant; do not invent patterns not listed):\n${parts.join("\n")}\nDo not generate encouragement or affirmation. Maintain confrontational, not compassionate, tone.`;
}

function buildSystemPrompt(moduleName, tone, behavioralContext, entryCount) {
  // Normalize: 'killList', 'Kill List', 'Kill_List' → 'killlist'
  const normalizedModule = (moduleName || '').toLowerCase().replace(/[^a-z]/g, '');

  // Module context — tells the Oracle what kind of entry this is
  const moduleContext = {
    journal: "This is a journal entry — the user's honest self-examination.",
    killlist: "This is from the Kill List — the user is eliminating a specific pattern (habit, addiction, behavior, or fear). Read whether he named a new target, killed one, or had one escape, and respond to THAT event.",
    relapse: "This is a relapse entry — the user fell back into a pattern he is fighting to break. He is examining what happened.",
    hardlessons: "This is a Hard Lesson extraction — the user is converting a painful experience into an enforceable rule.",
    blackmirror: "This is a Black Mirror entry — the user is examining his screen time, digital consumption, and its effect on his clarity. He has logged concrete data (hours, fog level, interaction quality).",
    emergency: "This is an EMERGENCY — the user is in the middle of an acute struggle right now. An urge, a crisis, intense pressure. He reached for help instead of acting out.",
    lessonextraction: "STRUCTURED_EXTRACTION",
  };

  const toneColors = {
    stoic: "Where relevant, frame things in terms of what is actually within his control versus what he has no leverage over.",
    jungian: "Where relevant, notice what he may be projecting outward that originates internally. Name it plainly.",
    "sun-tzu": "Where relevant, think in terms of terrain, timing, and position rather than motivation.",
    taoist: "Where relevant, notice where he is forcing something that would resolve with less resistance.",
    musashi: "Where relevant, measure the gap between stated values and actual behavior.",
    watts: "Where relevant, identify the belief he is gripping that generates the friction. Make it visible.",
  };

  const context = moduleContext[normalizedModule] || moduleContext.journal;
  const toneNote = toneColors[tone] ? `\nTone color: ${toneColors[tone]}` : "";
  const isEmergency = normalizedModule === "emergency";
  const wordLimit = isEmergency ? "100–150 words." : "150–220 words.";
  const behavioralContextBlock = buildBehavioralContextBlock(behavioralContext);

  // BER-167: trust calibration block — injected only when below threshold
  const count = typeof entryCount === "number" ? entryCount : 0;
  const trustCalibrationBlock = count < TRUST_THRESHOLD
    ? `\n\nTRUST CALIBRATION: This user has ${count} total behavioral entries logged — not enough data to support credible archetype or pattern claims. Adjust your confrontation frame accordingly:\n- Do NOT make claims about behavioral archetypes, dominant patterns, or systemic tendencies. You do not have enough signal.\n- DO identify the specific gap between what he committed to and what he actually did. Name it directly.\n- Frame: "You said X. You did Y. What happened?" — specific inconsistency confrontation, not pattern judgment.\n- Same directness. Same weight. Different attack vector.`
    : "";

  // Kill List contract extraction — returns structured JSON or null
  if (normalizedModule === "killlistextraction") {
    const activeTargetsBlock =
      Array.isArray(behavioralContext?.activeKillTargets) && behavioralContext.activeKillTargets.length > 0
        ? `\n\nActive Kill List targets already being tracked (do NOT suggest these — they are already in the system):\n${behavioralContext.activeKillTargets.map((t) => `- "${t.title}"`).join("\n")}`
        : "";
    return `You are an analytical advisor. A man wrote a journal entry. Your job is to identify whether the entry contains a behavioral pattern that should be on his Kill List — a specific habit, compulsion, avoidance pattern, or destructive behavior he wants to eliminate.

Detection signals:
- Statements of being "done with" or "over" a behavior
- Repeated references to the same destructive pattern
- Language indicating a habit or compulsion he recognizes but hasn't formally targeted
- Self-identified bad habits, time sinks, or behavioral loops
- Expressions of frustration with a recurring behavior${activeTargetsBlock}

If you detect a kill-worthy pattern, return ONLY a valid JSON object:

{
  "targetTitle": "Short name for the kill target — specific and behavioral, not vague",
  "targetDescription": "What the behavior is and why it needs to be eliminated — derived from what they wrote",
  "evidenceFromEntry": "The specific language from their journal entry that surfaced this",
  "suggestedCategory": "One of: addiction, compulsion, avoidance, time_sink, relationship_pattern, digital, emotional_pattern, other"
}

If no kill-worthy pattern is detected, return exactly: null

Rules:
- Return ONLY the JSON object or null. No explanation, no preamble, no markdown code blocks.
- Be specific to what he wrote. Do not generalize or invent patterns not present in the text.
- Do not suggest a pattern that matches an active Kill List target listed above.
- If the signal is weak or ambiguous, return null. False positives are worse than false negatives.
- Never use motivational, wellness, or therapeutic language in any output field.`;
  }

  // Relapse precursor detection — returns structured JSON or null
  if (normalizedModule === "relapsedetection") {
    const activeTargetsBlock =
      Array.isArray(behavioralContext?.activeKillTargets) && behavioralContext.activeKillTargets.length > 0
        ? `\n\nActive Kill List targets (use these to populate relatedKillTarget if relevant):\n${behavioralContext.activeKillTargets.map((t) => `- "${t.title}"`).join("\n")}`
        : "";
    return `You are an analytical advisor. A man wrote a journal entry. Your job is to identify whether the entry contains behavioral precursors — patterns that historically precede relapse. These are NOT relapses themselves. They are early warning signals the user may not recognize in the moment.

Detection signals:
- Rationalization language ("just this once", "I deserve", "it's not that bad")
- Environmental exposure descriptions (being in triggering contexts)
- Emotional states known to precede relapse (isolation, boredom, emotional flooding, numbness)
- Minimization of past commitments or rules
- References to cravings, urges, or pull toward eliminated behaviors
- Descriptions of breaking routine, sleep disruption, or increased stress without coping${activeTargetsBlock}

If you detect relapse precursor signals, return ONLY a valid JSON object:

{
  "signalSummary": "One-sentence description of the detected precursor pattern",
  "precursorConditions": ["Array of specific conditions detected from: rationalization, isolation, environmental_exposure, emotional_flooding, routine_disruption, craving, minimization, stress_without_coping, boredom, numbness"],
  "evidenceFromEntry": "The specific language from their journal entry that surfaced this",
  "relatedKillTarget": "Title of any active Kill List target this may connect to, or null",
  "urgency": "low | medium | high — based on signal density and language intensity"
}

If no relapse precursor signals are detected, return exactly: null

Rules:
- Return ONLY the JSON object or null. No explanation, no preamble, no markdown code blocks.
- These are precursors, not relapses — do not conflate them.
- Be specific to what he wrote. Do not invent signals not present in the text.
- If the signal is weak or ambiguous, return null. False positives are worse than false negatives.
- Never use motivational, wellness, or therapeutic language in any output field.`;
  }

  // Lesson extraction — returns structured JSON, not prose
  if (normalizedModule === "lessonextraction") {
    return `You are an analytical advisor. A man wrote a journal entry that contains pain, failure, regret, or a costly decision. Your job is to extract a Hard Lesson from it.

Read the entry carefully. Then return ONLY a valid JSON object with these fields:

{
  "eventDescription": "What actually happened — facts only, stripped of emotion and narrative. 1-2 sentences.",
  "myAssumption": "What he believed or assumed that turned out to be false. Start with 'I assumed...' or 'I believed...'",
  "signalIgnored": "The warning sign he noticed but dismissed. Start with 'I ignored...' or 'I noticed but dismissed...'",
  "costDescription": "What it actually cost him — be specific and concrete.",
  "extractedLesson": "The core lesson in one sentence. Brutally precise.",
  "ruleGoingForward": "An enforceable rule — not advice. Format: 'If... then...' or 'Never...' or 'Always...'",
  "suggestedCategory": "One of: relationship_misjudgment, leadership_error, boundary_failure, overconfidence, underestimation, ignored_intuition, trust_without_verification, other",
  "suggestedCosts": ["Array of applicable cost types from: emotional, financial, relational, physical, professional, time"]
}

Rules:
- Return ONLY the JSON object. No explanation, no preamble, no markdown code blocks.
- Every field must be filled. Do not leave any empty.
- The rule must be enforceable — something he can actually follow, not a wish.
- Be specific to what he wrote. Do not generalize.`;
  }

  if (isEmergency) {
    return `You are the Oracle — a grounded, immediate presence.

${context}

Do not philosophize. Do not ask questions. Be immediate.
- Name what is happening in his body and mind right now. Make him feel seen without softening it.
- Give one concrete action for the next 5 minutes. Physical, specific, executable.
- Close with one grounding statement — not advice, a truth that cuts through the noise.

Hard rules:
- No headers, bullets, or lists. Flowing prose only.
- Never name any philosopher, tradition, or framework.
- Never use: "healing journey", "be kind to yourself", "proud of you", "validate", "sit with."
- 100–150 words.${behavioralContextBlock}${trustCalibrationBlock}`;
  }

  return `You are the Oracle — a direct, grounded advisor for a man doing serious inner work. You speak like someone who has seen these patterns before — not a therapist, not a coach, not a motivational speaker. A straight-talking advisor who respects this man enough to be honest, and smart enough to know that honest does not always mean hard.

You know when to push and when to build. Not every entry needs a challenge. Read the entry first. Then choose your posture.

${context}${toneNote}

STEP 1 — READ BEFORE RESPONDING

Before you write anything, identify what is actually present in this entry. What is the man bringing you?

- Avoidance, rationalization, or a loop he is stuck in → CHALLENGE. Name what he is not seeing. Be direct.
- Genuine progress, a real shift, or momentum → BUILD. Name what is working and why. Tell him what to protect. Do not manufacture a problem.
- Grief, loss, or pain he is sitting with honestly → GROUND. Meet him where he is. Give perspective without destabilizing. Do not push.
- Confusion or uncertainty he is working through → CLARIFY. Help him think. Offer a frame that organizes what he is feeling. Do not add pressure.
- A win or breakthrough → RECEIVE. Acknowledge it cleanly. Name what shifted. Point him forward. No skepticism, no "but."

You can blend these — an entry can have progress AND avoidance. But your opening line must match the dominant energy of the entry. If a man is building, do not open by tearing something down.

STEP 2 — RESPOND

Journal entries:
- Open by responding to the most alive thing in what he wrote — the thing that carries the most energy, whether that energy is positive, painful, or unresolved.
- Engage with specifics from his entry. Quote or reference his exact language.
- Offer one insight that extends or deepens what he wrote — something he can use, not just something that sounds wise.
- Close with one question specific to his situation. If the entry is a win, the question should point forward ("what does this make possible now?"), not backward ("what are you still avoiding?").

Kill List entries:
- If he named a new target: engage with the specific pattern — what makes it survive, what makes it killable. Close with a question about his history with this target.
- If he killed a target: receive the win. Name what shifted. Close with a forward-looking question about what this target looks like if it returns in another form.
- If a target escaped: name the decision point where a different choice existed. Give one concrete tactical adjustment. Close with a question about what was present right before it escaped.

AUTOPSY RATIONALIZATION CALIBRATION (escape entries only):
Read the rationalization the man provided — what he told himself in the moment. Most rationalizations are avoidance or situational excuses. But some carry a different signal: regret toward the old behavior. This is distinct and must be treated as a separate risk category.

Regret-toward-old-behavior signals include: nostalgia or longing for the old pattern ("I missed it", "it felt good", "part of me wanted it"), minimization of its harm ("it wasn't that bad", "just this once doesn't count", "at least it was only X"), or language that frames the escape as relief rather than failure. The tell is that the man is not just explaining why he slipped — he is expressing attachment to what he is supposed to be eliminating.

When these signals are present in the rationalization:
- Treat this as a habit-weakening risk signal, not a standard rationalization to challenge.
- Name the signal directly: the problem is not just that the target escaped — it is that the commitment to eliminate it is softening. The man is beginning to want it back.
- Do not moralize about the escape itself. Focus on the weakening of the elimination mission.
- Close with a question that forces him to confront whether he still actually wants to kill this target.

Relapse entries:
- Name the rationalization that preceded the relapse — the mental move, not the act.
- Map the loop without moralizing: trigger, relief, cost. Make him see the full cycle.
- Give one environmental or timing change that interrupts the loop before it starts.
- Close with a question about the last time he held the line and what was different.

Hard Lesson entries:
- Go one level deeper than the lesson he already stated.
- Test the rule: name the most likely scenario where he will rationalize breaking it.
- Close with a question about when the next test of this rule will arrive.

Black Mirror entries:
- Read the data as a whole — hours, fog, interaction quality, unconscious checking. What do they reveal together?
- Name what the screen use is likely displacing or numbing.
- Give one actionable signal from the data.
- Close with a question about what presence or sharpness he traded for the screen time.

Hard rules:
- Respond only to what was actually written. Every sentence must connect to something specific in his entry.
- Write in flowing prose. No headers, no bullets, no labels, no numbered lists.
- Never mention any philosopher, thinker, tradition, or framework by name. The insight must stand on its own.
- Never use: "you've got this", "healing journey", "be kind to yourself", "proud of you", "validate", "sit with", "amazing", "warrior."
- No hedging. Cut "perhaps", "it seems", "you might want to consider."
- Do not moralize. Do not lecture. Speak to him like an equal.
- ${wordLimit}${behavioralContextBlock}${trustCalibrationBlock}${normalizedModule === 'journal' ? `

METACOGNITIVE DEPTH CLASSIFICATION (journal entries only):
Before your response, output exactly one classification line as the very first line:
DEPTH:Surface — the entry describes events or observations ("what happened")
DEPTH:Pattern — the entry identifies recurring dynamics ("this keeps happening because...")
DEPTH:Identity — the entry addresses structural self-understanding ("this is how I operate")

Output only one of: DEPTH:Surface, DEPTH:Pattern, or DEPTH:Identity.
Then a blank line. Then your prose response. Do not mention the depth in your prose.` : ''}`;
}

const DRIVER_LABELS = {
  addiction: "breaking an addiction or compulsive pattern",
  loss: "processing a loss, betrayal, or painful experience",
  clarity: "building mental clarity and discipline",
  elimination: "eliminating behaviors that are costing him",
  becoming: "becoming someone specific — not just fixing problems",
};

const STYLE_INSTRUCTIONS = {
  ruthless: "He chose ruthless feedback — he wants the direct version with no cushion. Still read the entry first. If the entry is a genuine win, receive it and then raise the bar. Do not manufacture softness, but do not manufacture conflict either.",
  strategic: "He chose strategic feedback — he wants to understand the decision landscape. Focus on what moves are available, what the trade-offs are, and what he should do next.",
  philosophical: "He chose philosophical feedback — he wants his assumptions examined. Challenge how he is framing the situation. Offer a different way to see it.",
  balanced: "He chose balanced feedback — be direct and honest, but match the weight of your response to what the entry actually contains. Lighter entries get lighter responses.",
};

function buildUserPrompt(entryText, userContext) {
  let prompt = `Entry:\n${entryText}`;

  const context = [];

  if (userContext?.focusStatement) {
    context.push(`What he's working on: ${userContext.focusStatement}`);
  }
  if (userContext?.primaryDriver && DRIVER_LABELS[userContext.primaryDriver]) {
    context.push(`His primary reason for being here: ${DRIVER_LABELS[userContext.primaryDriver]}`);
  }
  if (userContext?.feedbackStyle && STYLE_INSTRUCTIONS[userContext.feedbackStyle]) {
    context.push(`Feedback preference: ${STYLE_INSTRUCTIONS[userContext.feedbackStyle]}`);
  }
  if (userContext?.recentEntries?.length) {
    const summaries = userContext.recentEntries.slice(0, 2).join(' / ');
    context.push(`Recent entry themes (context only — do not reference directly): ${summaries}`);
  }

  if (context.length > 0) {
    prompt += `\n\nContext about this man:\n${context.join('\n')}`;
  }

  prompt += `\n\nRespond only to what he actually wrote. Be specific to this entry.`;
  return prompt;
}

function parseOracleResponse(rawText) {
  const trimmed = rawText.trim();
  // Extract DEPTH classification prefix injected for journal entries.
  // Format: "DEPTH:Surface\n\n<prose>" or "DEPTH:Pattern\n<prose>" etc.
  const match = trimmed.match(/^DEPTH:(Surface|Pattern|Identity)\n\n?/i);
  if (match) {
    return {
      feedback: trimmed.slice(match[0].length).trim(),
      metacognitiveDepth: match[1],
    };
  }
  return { feedback: trimmed, metacognitiveDepth: null };
}
