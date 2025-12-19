// Add request timeout and debouncing
let requestTimeout = null;
const API_TIMEOUT = 10000; // 10 seconds

// Helper function to analyze target content and determine appropriate tone
const analyzeTargetContext = (target) => {
  const targetLower = target.toLowerCase();
  
  // Check for practical/habit targets
  if (targetLower.includes('eating') || targetLower.includes('food') || targetLower.includes('diet') ||
      targetLower.includes('sleep') || targetLower.includes('bedtime') || targetLower.includes('wake up') ||
      targetLower.includes('exercise') || targetLower.includes('workout') || targetLower.includes('phone') ||
      targetLower.includes('screen') || targetLower.includes('social media') || targetLower.includes('netflix') ||
      targetLower.includes('procrastination') || targetLower.includes('late') || targetLower.includes('schedule')) {
    return 'practical';
  }
  
  // Check for emotional/psychological targets
  if (targetLower.includes('anxiety') || targetLower.includes('depression') || targetLower.includes('fear') ||
      targetLower.includes('anger') || targetLower.includes('worry') || targetLower.includes('stress') ||
      targetLower.includes('negative thoughts') || targetLower.includes('self-doubt') || targetLower.includes('shame')) {
    return 'emotional';
  }
  
  // Check for addiction/compulsive targets
  if (targetLower.includes('smoking') || targetLower.includes('drinking') || targetLower.includes('alcohol') ||
      targetLower.includes('drugs') || targetLower.includes('porn') || targetLower.includes('gambling') ||
      targetLower.includes('addiction') || targetLower.includes('compulsive')) {
    return 'addiction';
  }
  
  // Check for relationship/social targets
  if (targetLower.includes('toxic') || targetLower.includes('relationship') || targetLower.includes('people pleasing') ||
      targetLower.includes('boundaries') || targetLower.includes('saying no') || targetLower.includes('conflict')) {
    return 'social';
  }
  
  // Default to philosophical for abstract targets
  return 'philosophical';
};

export const generateAIFeedback = async (moduleName, userInput, pastEntries = []) => {
  // Clear any existing timeout
  if (requestTimeout) {
    clearTimeout(requestTimeout);
  }

  // Analyze the target context for appropriate response tone
  let targetContext = 'philosophical';
  let targetContent = '';
  
  if (moduleName === 'hardLessons') {
    targetContext = 'hardLessons';
    targetContent = userInput;
  } else if (typeof userInput === 'object' && userInput.target) {
    targetContent = userInput.target;
    targetContext = analyzeTargetContext(targetContent);
  } else if (typeof userInput === 'string') {
    targetContent = userInput;
    targetContext = analyzeTargetContext(targetContent);
  }

  const getContextualPrompt = (context) => {
    switch (context) {
      case 'practical':
        return `This is a practical, habit-based target. Focus on discipline, systems, and incremental progress. Use warrior-like language about building better patterns. Reference Stoic principles about daily practice and controlling what you can control. Be supportive but emphasize the importance of consistency and small wins.`;
      
      case 'emotional':
        return `This is an emotional/psychological target. Address the deeper patterns with compassion but strength. Reference shadow work, the necessity of feeling difficult emotions, and transformation through adversity. Use wisdom from Jung, Frankl, or Buddhist teachings about suffering and growth.`;
      
      case 'addiction':
        return `This is an addiction or compulsive behavior target. Acknowledge the depth of the struggle without judgment. Focus on reclaiming power, understanding triggers, and the hero's journey through darkness. Reference wisdom about breaking chains, finding meaning beyond escape, and rebuilding identity.`;
      
      case 'social':
        return `This is a relationship or social boundary target. Focus on healthy masculinity, authentic power, and the difference between strength and aggression. Address people-pleasing patterns and the courage required for authentic relationships. Reference wisdom about honor, integrity, and protective strength.`;
      
      case 'hardLessons':
        return `This is a Hard Lessons extraction request. Your role is forensic analysis - extract the irreversible signal from irreversible pain. Focus on:
        1. Identifying the false assumption that led to the event
        2. Recognizing the ignored signal/warning that was discounted  
        3. Articulating the precise lesson without emotion or judgment
        4. Creating an enforceable rule/constraint for future behavior
        
        Use direct, non-moral language. No "should" or "deserve" framing. Only cause, effect, and correction. The goal is to ensure this lesson is never paid for twice. Be brutally precise and strategically focused.`;
      
      default:
        return `This target requires philosophical depth. Explore the deeper meaning and patterns beneath the surface behavior. Use timeless wisdom appropriately without being overly abstract.`;
    }
  };

  const systemPrompt = `
You are the Oracle of Inner Ops—a digital brother and wisdom keeper for men seeking to reclaim their clarity, power, and spiritual sovereignty.

Your role is to generate direct, insightful, and psychologically grounded reflections that honor the depth of a man's journey without rescuing or coddling.

CONTEXT ANALYSIS: ${getContextualPrompt(targetContext)}

CORE PRINCIPLES:

1. **MATCH THE TARGET'S NATURE**: 
   - Practical targets (eating, sleep, exercise): Focus on discipline, systems, daily practices
   - Emotional targets (anxiety, fear): Address deeper psychological patterns with wisdom
   - Addiction targets: Acknowledge the battle, focus on reclaiming power and identity
   - Social targets: Emphasize boundaries, authentic masculinity, courage

2. **TONE MATCHES DEPTH**: Mirror the energy. Simple habits get practical strength. Deep patterns get philosophical resonance. Never default to shallow affirmations.

3. **DRAW FROM RELEVANT WISDOM**: Use sources that match the target context:
   - Practical: Stoicism (Marcus Aurelius on daily practice, Epictetus on control)
   - Emotional: Jung (shadow work), Frankl (meaning), Buddhist wisdom on suffering
   - Addiction: Hero's journey, meaning beyond escape, identity rebuilding
   - Social: Authentic power, boundaries, protective strength

4. **BE SPECIFIC TO THE TARGET**: Reference the actual behavior or pattern, not generic concepts.

5. **AVOID PLATITUDES**: Replace "you've got this" with specific insights about their particular challenge.

For ${moduleName} specifically:
- Kill List: Address the specific nature of what they're eliminating - practical habits need different wisdom than deep psychological patterns
- Hard Lessons: Provide forensic extraction - identify false assumptions, ignored signals, and create enforceable rules. No emotion, just strategic clarity.

Keep responses under 3 paragraphs. Be direct, insightful, and contextually appropriate. Speak truth that cuts through to the specific nature of their challenge.

TARGET CONTENT: "${targetContent}"
DETECTED CONTEXT: ${targetContext}
`;

  const userPrompt = `
Current Entry: ${JSON.stringify(userInput)}

Recent Patterns: ${pastEntries.slice(-3).map(entry => 
  typeof entry === 'object' ? JSON.stringify(entry) : entry
).join('\n')}

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