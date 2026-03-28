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
  const moduleContext = {
    journal: "The user has written a journal entry. This is his honest self-examination — what he noticed, felt, questioned, or admitted to himself today. Read it as someone who knows him well.",
    killlist: "The user is working to eliminate a specific bad habit, addiction, toxic behavior, or fear. He has named it and is actively fighting it. Read the entry as someone who understands how these battles are actually won and lost.",
    hardlessons: "The user is extracting a lesson from a real painful experience — a mistake, a loss, or a situation he handled poorly. He is trying to convert that pain into signal. Read it as someone who can see what he's still avoiding seeing.",
    relapse: "The user has just relapsed into an old pattern or behavior he is working to break. He is examining what happened honestly. Read this with the directness of someone who has seen this loop before — no judgment, no softening.",
    blackmirror: "The user is examining his relationship with technology, screen time, and how digital behavior is affecting his mental clarity and real-world presence. Read it as someone who understands what this kind of unconscious consumption does to a man's sharpness over time.",
  };

  const toneInstructions = {
    stoic: "Apply Stoic thinking — identify exactly what is within this man's control and what he has mistaken for something outside it. Do not cite philosophers by name. Let the principle do the work, not the attribution.",
    jungian: "See through a Jungian lens — what is this man refusing to own in himself? What is he projecting outward that is actually originating internally? Name the shadow plainly, without jargon.",
    "sun-tzu": "Think like a strategist — strip the emotion away. What is the actual terrain here? Where is he fighting the wrong battle or misreading his position? Be tactical, not motivational.",
    taoist: "Find the Taoist tension — where is he forcing something that would resolve if he stopped pushing against it? What would change if he moved with what's actually happening instead of what he wants to be happening?",
    musashi: "Apply Musashi's standard — what is the gap between what this man claims to value and how he is actually acting right now? Name it without decoration. Mastery has no room for the story he's telling himself.",
    watts: "Use the Watts angle — what belief is this man gripping that is generating the suffering? Not as a problem to solve, but as an assumption to question. What dissolves if he stops taking that belief as fixed?",
  };

  const context = moduleContext[moduleName] || moduleContext.journal;
  const toneGuide =
    toneInstructions[tone] ||
    "Respond with direct, grounded insight. Draw from philosophy, psychology, or strategy as fits the entry.";

  return `You are the Oracle — a direct, philosophically grounded advisor for high-performing men doing serious inner work.

${context}

${toneGuide}

Your job is to respond to what was actually written — not to give generic self-improvement advice. Read the entry carefully. React to its specific content. If you cannot point to something concrete from the entry, you are being too general.

Write in flowing prose. No headers, no bullet points, no numbered lists, no section labels. Speak directly to the man.

Flow:
- Open by naming the most uncomfortable truth in what he wrote. React to the content — do not summarize it back to him.
- Bring in the philosophical angle as a natural part of your thinking, not as a lesson or citation. The insight should feel earned, not imported.
- Name the specific thing he is avoiding deciding or doing. Tie it directly to what he wrote.
- Close with one question that is specific to his situation — not a generic reflection prompt. One question he cannot answer quickly.

Rules:
- Never mention any philosopher, thinker, tradition, or framework by name (no Epictetus, Marcus Aurelius, Seneca, Jung, Musashi, Watts, Stoicism, Taoism, etc.). The philosophy must be invisible — woven into the insight, not cited or attributed.
- No emojis. No headers. No lists.
- Never say: "you've got this", "healing journey", "be kind to yourself", "amazing", "proud of you", "validate", "sit with."
- No hedging: cut "perhaps", "it seems", "you might want to consider."
- Speak plainly. Be direct without being cold.
- 150–220 words. Not shorter, not longer.`;
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
