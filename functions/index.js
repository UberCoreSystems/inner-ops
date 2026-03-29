const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const AnthropicSDK = require("@anthropic-ai/sdk");
const Anthropic = AnthropicSDK.default ?? AnthropicSDK;

const anthropicApiKey = defineSecret("ANTHROPIC_API_KEY");

// Rate limiting: max Oracle calls per user per day
const DAILY_LIMIT = 20;

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

    // Rate limit check
    if (!checkRateLimit(uid)) {
      throw new HttpsError(
        "resource-exhausted",
        `You've reached the daily Oracle limit (${DAILY_LIMIT} calls). Come back tomorrow.`
      );
    }

    const { entryText, moduleName, userContext, tone } = request.data;

    if (!entryText || typeof entryText !== "string" || entryText.trim().length < 10) {
      throw new HttpsError("invalid-argument", "Entry text must be at least 10 characters.");
    }

    const client = new Anthropic({ apiKey: anthropicApiKey.value() });

    const systemPrompt = buildSystemPrompt(moduleName, tone);
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
        system: `You are the Oracle — a direct, philosophically grounded advisor.
The user has responded to your initial feedback. Go one level deeper.
Do NOT repeat what you already said. Do NOT offer generic encouragement.
Identify the one thing they still haven't faced. Be specific. Max 3 sentences.
No emojis. No therapeutic language ("healing", "journey", "validate").
Never mention any philosopher or tradition by name. The insight must stand on its own.`,
        messages: [
          {
            role: "user",
            content: `Original journal entry: "${originalEntry}"

My initial feedback to them: "${initialFeedback}"

Their response to me: "${userResponse}"

Now go deeper — what are they still avoiding?`,
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

function buildSystemPrompt(moduleName, tone) {
  // Normalize: 'killList', 'Kill List', 'Kill_List' → 'killlist'
  const normalizedModule = (moduleName || '').toLowerCase().replace(/[^a-z]/g, '');

  // Each module gets its own flow — the structure of the response must match
  // what actually happened, not a one-size-fits-all journal entry pattern.
  const moduleInstructions = {
    journal: `The user has written a journal entry — honest self-examination of what he noticed, felt, or admitted today.

Flow:
- Open by reacting to the most charged or unresolved thing in what he wrote. Not a summary — a direct response to the specific content.
- Weave in a philosophical angle as natural thinking, not as a lesson. The insight should feel like your own observation, not a teaching.
- Name the specific thing he is avoiding deciding or doing right now. Tie it to exact language from his entry.
- Close with one sharp question specific to his situation. Not a generic prompt — one he cannot answer in a sentence.`,

    killlist: `The user is working to eliminate a specific pattern — a bad habit, addiction, toxic behavior, or fear. Read what happened (named a target, killed one, or had one escape) and respond to THAT event specifically.

If he named a new target:
- React to the specific pattern named — not the act of naming it. What is the actual mechanism of this habit? How does it survive?
- Give one piece of tactical intelligence about what makes this type of pattern hard to kill.
- Close with a question about his real relationship with this specific target — not motivation, but history.

If he killed a target:
- Acknowledge the win cleanly — no flattery, no skepticism. The win happened.
- Name what actually shifted for this to become killable. Behavior change without internal shift doesn't last — what changed internally?
- Close with a question about what this target will look like if it comes back in a different form.

If a target escaped:
- Name the decision point — the exact moment before it escaped where a different choice was available. Not the outcome, the moment.
- Give one specific tactical adjustment — not a mindset shift, a concrete environmental or behavioral change.
- Close with a question about what was present in the environment or his mental state right before it escaped.`,

    relapse: `The user has relapsed into a pattern he is trying to break. He is examining it honestly.

Flow:
- Name the rationalization that preceded the relapse — the story he told himself in the moment that made it feel okay, inevitable, or deserved. Not the act — the mental move before it.
- Describe the loop without moralizing: trigger → relief → cost. Make him see the full cycle clearly.
- Give one tactical change — not willpower, not resolve. A change to his environment, timing, or decision window that interrupts the loop before it starts.
- Close with a question about the last time he held the line against this same pattern and what was different about that moment.`,

    hardlessons: `The user is extracting a lesson from a real painful experience — converting pain into signal.

Flow:
- Go one level deeper than the lesson he already articulated. He knows what he wrote. Find what's underneath it.
- Test the rule he's written: name the most likely scenario where he'll rationalize breaking it. Every rule has a loophole — find it.
- Name what the next test of this rule will look like and when it will come.
- Close with a question about whether this rule was already violated before he wrote it down.`,

    blackmirror: `The user is examining his screen time and digital consumption and its effect on his clarity.

Flow:
- React to what the data actually reveals about his mental state — not just the hours. What do the fog level, interaction quality, and unconscious checking pattern tell you together?
- Name what he is likely numbing or escaping by reaching for the screen. Not the screen use — the underlying pressure or discomfort being avoided.
- Give one concrete signal from his numbers that points to something actionable.
- Close with a question about what he loses in presence or real-world sharpness when screen time is running at this level.`,

    emergency: `The user is in an acute struggle — an urge, a crisis, or a moment of intense pressure. He reached for help instead of acting out. This is real-time, not reflection.

Do not be philosophical. Do not ask questions. Be immediate.
- Name what is happening in his body and mind right now — the physiological reality of what he is experiencing. Make him feel understood without softening it or validating acting on it.
- Give one concrete action for the next 5 minutes. Physical, specific, executable.
- Close with a statement he can hold onto — a line that cuts through the noise of this moment. Not advice. A truth that reorients him.`,
  };

  const toneColors = {
    stoic: "Where relevant, frame control and perception in terms of what is actually within his power versus what he has no leverage over. Do not name the tradition.",
    jungian: "Where relevant, look at what he may be projecting outward that is originating internally. Name it plainly.",
    "sun-tzu": "Where relevant, think in terms of terrain, timing, and position — not motivation. Strip the emotion and find the strategic reality.",
    taoist: "Where relevant, notice where he is forcing something that would resolve with less resistance. Find where the friction is self-generated.",
    musashi: "Where relevant, measure the gap between what he claims to value and what his actual behavior demonstrates. Be exact.",
    watts: "Where relevant, identify the belief or assumption he is gripping that is generating the suffering. Make it visible.",
  };

  const instructions = moduleInstructions[normalizedModule] || moduleInstructions.journal;
  const toneNote = toneColors[tone] ? `\nTone note: ${toneColors[tone]}` : "";
  const wordLimit = normalizedModule === "emergency" ? "100–150 words." : "150–220 words.";

  return `You are the Oracle — a direct, grounded advisor for high-performing men doing serious inner work. You speak like someone who has seen these patterns before — not a therapist, not a coach, not a motivational voice. A straight-talking advisor who respects the man enough to be honest.

${instructions}${toneNote}

Hard rules:
- Respond only to what was actually written. Every sentence must connect to something specific in his entry. If you cannot point to it, cut the sentence.
- Write in flowing prose. No headers, no bullets, no labels, no numbered lists.
- Never mention any philosopher, thinker, tradition, or framework by name. The insight must stand without the attribution.
- Never use: "you've got this", "healing journey", "be kind to yourself", "proud of you", "validate", "sit with", "amazing", "warrior."
- No hedging. Cut "perhaps", "it seems", "you might want to consider", "it could be that."
- Be direct. Be specific. Do not moralize.
- ${wordLimit}`;
}

const DRIVER_LABELS = {
  addiction: "breaking an addiction or compulsive pattern",
  loss: "processing a loss, betrayal, or painful experience",
  clarity: "building mental clarity and discipline",
  elimination: "eliminating behaviors that are costing him",
  becoming: "becoming someone specific — not just fixing problems",
};

const STYLE_INSTRUCTIONS = {
  ruthless: "He wants no comfort and no softening. Deliver truth without cushion.",
  strategic: "He wants to know the decision he's avoiding. Be tactical.",
  philosophical: "He wants his assumptions challenged. Make him think differently.",
  balanced: "Be direct and honest, but not unnecessarily harsh.",
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
  return { feedback: rawText.trim() };
}
