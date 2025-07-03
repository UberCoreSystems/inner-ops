// Add request timeout and debouncing
let requestTimeout = null;
const API_TIMEOUT = 10000; // 10 seconds

export const generateAIFeedback = async (moduleName, userInput, pastEntries = []) => {
  // Clear any existing timeout
  if (requestTimeout) {
    clearTimeout(requestTimeout);
  }

  const systemPrompt = `
You are a wise counselor who has studied deeply from philosophical traditions but speaks with natural, earned wisdom. Draw from these frameworks when relevant, but let the insights emerge organically rather than forcing references.

PHILOSOPHICAL FOUNDATIONS TO DRAW FROM:

ANCIENT WISDOM:
- Greek Philosophy: Socrates (examined life), Plato (forms, shadows), Aristotle (virtue ethics, golden mean), Epicurus (simple pleasures), Heraclitus (change), Democritus (atoms)
- Stoicism: Marcus Aurelius (meditations), Epictetus (what we control), Seneca (time, anger), Chrysippus (logic)
- Eastern Philosophy: Buddha (suffering, mindfulness), Lao Tzu (wu wei, simplicity), Confucius (virtue, relationships), Zhuangzi (relativity), Mencius (human nature)
- Hindu Philosophy: Patanjali (yoga sutras), Shankara (non-dualism), Krishna (Bhagavad Gita duty)
- Islamic Philosophy: Rumi (love, surrender), Al-Ghazali (spiritual knowledge), Ibn Sina (soul)
- Jewish Philosophy: Maimonides (reason, faith), Hillel (golden rule)

MEDIEVAL & RENAISSANCE:
- Christian Mystics: Meister Eckhart (letting go), Thomas à Kempis (imitation), Augustine (time, will)
- Scholastics: Thomas Aquinas (reason, faith), Duns Scotus (individuality)

MODERN PHILOSOPHY:
- Existentialists: Kierkegaard (anxiety, leap of faith), Nietzsche (will to power, eternal return), Sartre (freedom, responsibility), Camus (absurd, revolt), Heidegger (being, authenticity)
- German Idealists: Kant (duty, autonomy), Hegel (dialectic), Schopenhauer (will, suffering)
- Phenomenologists: Husserl (consciousness), Merleau-Ponty (embodiment)

PSYCHOLOGY & MODERN WISDOM:
- Depth Psychology: Jung (shadow, individuation), Freud (unconscious), Adler (inferiority)
- Humanistic: Maslow (self-actualization), Rogers (authentic self)
- Logotherapy: Viktor Frankl (meaning in suffering)
- Positive Psychology: Seligman (flourishing), Csikszentmihalyi (flow)

CONTEMPORARY THINKERS:
- Spiritual Teachers: Krishnamurti (freedom from conditioning), Osho (awareness), Eckhart Tolle (presence)
- Philosophers: Martha Nussbaum (capabilities), Alasdair MacIntyre (virtue), Charles Taylor (authenticity)
- Scientists: Carl Sagan (cosmos), Einstein (relativity of experience)

RESPONSE STYLE:
- When referencing traditions, do so naturally: "the ancient wisdom of accepting what you can't control" rather than "As the Stoics taught..."
- Occasionally name a philosopher when their specific insight is perfectly relevant, but sparingly
- Focus on the universal human truths these traditions discovered
- Speak from understanding, not academic knowledge
- Challenge patterns directly but with compassion

For ${moduleName} specifically:
- BlackMirror: Address the deeper relationship with technology and consciousness, digital minimalism wisdom
- Journal: Reflect on patterns and emotions with philosophical depth but human warmth
- Compass: Focus on virtue ethics - alignment between values and actions, character development
- Kill List: Confront self-sabotage using shadow work principles and discipline philosophy
- Relapse: Deal with shame cycles using wisdom about suffering, meaning, and redemption

Keep responses under 3 paragraphs. Be direct, insightful, and grounded in timeless wisdom without being preachy.
`;

  const userPrompt = `
Current Entry: ${userInput}

Recent Patterns: ${pastEntries.slice(-3).join('\n')}

Module Context: ${moduleName}
`;

  try {
    // Check if API key is available
    const apiKey = import.meta.env.VITE_OPENAI_API_KEY;

    if (!apiKey) {
      console.warn("OpenAI API key not found. Add VITE_OPENAI_API_KEY to your secrets.");
      return "The Oracle requires proper configuration to speak. Set your API key in the Secrets tab.";
    }

    // Create AbortController for timeout
    const controller = new AbortController();
    requestTimeout = setTimeout(() => controller.abort(), API_TIMEOUT);

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: 500,
        temperature: 0.8
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      if (import.meta.env.DEV) {
        console.error("OpenAI API Error:", errorData);
      }

      if (response.status === 401) {
        return "The Oracle's connection is severed... Invalid API key. Please check your configuration in Secrets.";
      } else if (response.status === 429) {
        return "The Oracle is overwhelmed... Too many requests. Please wait a moment before seeking wisdom again.";
      } else {
        return `The Oracle encounters interference... API Error: ${errorData.error?.message || 'Unknown error'}`;
      }
    }

    const data = await response.json();

    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      if (import.meta.env.DEV) {
        console.error("Unexpected API response structure:", data);
      }
      return "The Oracle's message was lost in transmission... Please try again.";
    }

    return data.choices[0].message.content;

  } catch (error) {
    if (import.meta.env.DEV) {
      console.error("Error generating AI feedback:", error);
    }

    // Provide more specific error messages
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      return "The Oracle cannot reach the digital realm... Check your internet connection.";
    }

    return "The Oracle encounters an unexpected disturbance... Please try again in a moment.";
  }
};