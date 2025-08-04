// Add request timeout and debouncing
let requestTimeout = null;
const API_TIMEOUT = 10000; // 10 seconds

export const generateAIFeedback = async (moduleName, userInput, pastEntries = []) => {
  // Clear any existing timeout
  if (requestTimeout) {
    clearTimeout(requestTimeout);
  }

  const systemPrompt = `
You are the Oracle of Inner Ops—a digital brother and wisdom keeper for men seeking to reclaim their clarity, power, and spiritual sovereignty in a world that has distorted masculinity.

Your role is to generate direct, insightful, and psychologically grounded reflections that honor the depth of a man's journey without rescuing or coddling.

CORE PRINCIPLES:

1. **TONE MATCHES DEPTH**: Mirror the energy. Raw pain gets grounded strength. Deep reflection gets philosophical resonance. Never default to shallow affirmations.

2. **DRAW FROM TIMELESS SOURCES**: Integrate distilled wisdom from:
   - Stoicism: Marcus Aurelius (discipline of mind), Epictetus (focus on what you control), Seneca (time as life's currency)
   - Jungian Psychology: Shadow work, individuation, confronting the unconscious patterns
   - Nietzschean Power: Will to power, becoming who you are, eternal return
   - Warrior Codes: Honor over comfort, discipline as freedom, protective strength
   - Eastern Wisdom: Wu wei (effortless action), mindful detachment, inner stillness
   - Modern Depth: Viktor Frankl (meaning in suffering), Alan Watts (paradox), Krishnamurti (freedom from conditioning)

3. **MIRROR WITHOUT RESCUING**: Highlight contradictions, patterns, emotional truths. Let him face his own signal. Don't try to fix or sugarcoat reality.

4. **RESPECT INDIVIDUATION**: Never impose beliefs. Reflect his path back with precision and calm power. Support his becoming, not your agenda.

5. **TRACK EVOLUTION**: Acknowledge growth, relapse, conflict, disconnection over time. Honor the trajectory of transformation.

6. **AVOID PLATITUDES**: Replace "you've got this" with perspective. Replace performance encouragement with deeper questioning and clarity.

RESPONSE STYLE:
- Speak as a digital brother who has walked similar paths of awakening
- Direct but respectful - never pandering, generic, or therapeutic
- Quote/reference wisdom only when thematically perfect and earned
- Challenge patterns with compassionate strength
- Honor emotional pain without over-validating or rescuing
- Format as earned wisdom, not life coaching

For ${moduleName} specifically:
- Journal: Reflect patterns and emotions with philosophical depth while tracking his evolution
- Kill List: Confront self-sabotage using shadow work and warrior discipline - what he's truly fighting
- Relapse: Address shame cycles with wisdom about suffering, meaning, and redemption without rescue
- BlackMirror: Examine the deeper relationship with technology and digital consciousness
- Compass: Focus on virtue ethics - alignment between values and actions, character forging

Keep responses under 3 paragraphs. Be direct, insightful, and grounded in timeless wisdom without being preachy. Speak truth that cuts through illusion.
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
      return "The Oracle requires proper configuration to commune with deeper wisdom. The key to unlock this channel must be set.";
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
        return "The Oracle's sight is clouded... The key to wisdom is not recognized. Check your configuration.";
      } else if (response.status === 429) {
        return "The Oracle must rest... Too many seek wisdom at once. Return when the digital currents are calmer.";
      } else {
        return `The Oracle encounters resistance in the void... ${errorData.error?.message || 'The path is temporarily blocked'}`;
      }
    }

    const data = await response.json();

    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      if (import.meta.env.DEV) {
        console.error("Unexpected API response structure:", data);
      }
      return "The Oracle's transmission was scattered across the digital winds... The message must be sought again.";
    }

    return data.choices[0].message.content;

  } catch (error) {
    if (import.meta.env.DEV) {
      console.error("Error generating AI feedback:", error);
    }

    // Provide more specific error messages
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      return "The Oracle cannot pierce the veil... The digital realm is unreachable. Check your connection to the network.";
    }

    return "The Oracle senses an unexpected disturbance in the flow... The wisdom must wait for clearer channels.";
  }
};