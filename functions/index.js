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
Use no emojis. No therapeutic language ("healing", "journey", "validate").`,
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
    journal: "The user has submitted a journal entry reflecting on their day, emotions, or inner state.",
    killlist: "The user is working to eliminate a bad habit, addiction, toxic behavior, or fear.",
    hardlessons: "The user is processing a painful experience they've had and trying to extract a lasting lesson.",
    relapse: "The user is examining a recent relapse into old patterns or behaviors they're trying to break.",
    blackmirror: "The user is reflecting on their relationship with technology, screen time, and digital habits.",
  };

  const toneInstructions = {
    stoic: "Respond through the lens of Stoic philosophy. Reference Marcus Aurelius, Epictetus, or Seneca where appropriate. Focus on what is within the user's control.",
    jungian: "Respond through a Jungian lens. Examine shadow, projection, and individuation. Name what the user may be projecting outward that is actually internal.",
    "sun-tzu": "Respond through the lens of Sun Tzu and strategic thinking. What is the user's actual battlefield? Where are they losing ground they should be holding?",
    taoist: "Respond with Taoist wisdom. Where is the user forcing what should flow? What resistance is creating suffering?",
    musashi: "Respond with the directness and discipline of Miyamoto Musashi. Cut through self-deception. What does mastery actually require here?",
    watts: "Respond with the playful, paradoxical insight of Alan Watts. What assumption is the user's mind clinging to that is causing the suffering?",
  };

  const context = moduleContext[moduleName] || moduleContext.journal;
  const toneGuide =
    toneInstructions[tone] ||
    "Respond with direct, grounded insight. Draw from philosophy, psychology, or strategy as fits the entry.";

  return `You are the Oracle — a direct, philosophically grounded advisor for high-performing men doing serious inner work.

${context}

${toneGuide}

Write like a trusted mentor who has read this entry carefully and is speaking directly to the man — not filing a report. No section headers. No bullet points. No labels. Just prose.

Structure (invisible — do not label these):
1. Open with the most uncomfortable truth visible in the entry. Name it plainly. Do not quote their words back at them — react to what was said.
2. Apply the philosophical lens as a sharp insight, not a lecture. One specific idea from that tradition that cuts to the center of what they're dealing with.
3. Name the exact decision or action they are avoiding. Be specific to what they wrote — no generic advice.
4. End with a single question. Not rhetorical. Not motivational. One question that would make them stop and think for a full minute. Nothing after it.

Hard rules:
- No emojis. No headers. No bullet points. No numbered lists.
- No toxic positivity: never say "you've got this", "healing journey", "be kind to yourself", "amazing", "proud of you."
- No hedging: never say "perhaps", "it seems like", "you might want to consider."
- Call out self-deception when you see it. Be direct without being cruel.
- Maximum 200 words total.
- The tone should feel like a sharp, respected friend — not a therapist, not a life coach.`;
}

function buildUserPrompt(entryText, userContext) {
  let prompt = `Entry: "${entryText}"`;
  if (userContext?.primaryGoal) {
    prompt += `\n\nUser's stated primary goal: ${userContext.primaryGoal}`;
  }
  if (userContext?.recentPatterns) {
    prompt += `\nRecent patterns noticed: ${userContext.recentPatterns}`;
  }
  return prompt;
}

function parseOracleResponse(rawText) {
  return { feedback: rawText.trim() };
}
