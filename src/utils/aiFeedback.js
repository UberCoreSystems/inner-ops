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
  
  // Extract mood and intensity from journal entries
  let moodContext = null;
  let intensityContext = null;
  
  if (typeof userInput === 'string') {
    // Parse mood from format "Mood: Label (X/5)\nContent"
    const moodMatch = userInput.match(/^Mood:\s*(\w+)\s*\((\d)\/5\)/i);
    if (moodMatch) {
      moodContext = moodMatch[1].toLowerCase();
      intensityContext = parseInt(moodMatch[2]);
    }
  }
  
  // Build mood-aware guidance for the Oracle
  const getMoodGuidance = () => {
    if (!moodContext) return '';
    
    const moodInsights = {
      electric: { energy: 'high-voltage', approach: 'Channel this crackling energy. Ask what ignited it and where it wants to be directed.' },
      foggy: { energy: 'obscured', approach: 'The fog is not emptiness—it\'s a veil. Gently inquire what is being hidden or processed beneath.' },
      sharp: { energy: 'focused', approach: 'Honor this clarity. Help them cut through to what matters most while the blade is keen.' },
      hollow: { energy: 'depleted', approach: 'Emptiness signals something was lost or given away. Explore what needs to be reclaimed or mourned.' },
      chaotic: { energy: 'turbulent', approach: 'Chaos is unintegrated energy seeking form. Help them find the pattern within the storm.' },
      triumphant: { energy: 'victorious', approach: 'Celebrate without inflation. Help them understand what made victory possible so it can be repeated.' },
      heavy: { energy: 'burdened', approach: 'Weight has sources. Help them identify what they\'re carrying that isn\'t theirs, or what needs to be set down.' },
      light: { energy: 'buoyant', approach: 'Lightness is a reward for work done. Help them notice what released and savor it without grasping.' },
      focused: { energy: 'concentrated', approach: 'This is sacred attention. Reinforce the power of directed will and help them protect this state.' },
      radiant: { energy: 'luminous', approach: 'Inner light is shining outward. Explore what opened this channel and how to share it wisely.' }
    };
    
    const mood = moodInsights[moodContext] || { energy: moodContext, approach: 'Reflect this emotional state back with wisdom.' };
    
    const intensityFraming = intensityContext >= 4 
      ? 'The intensity is HIGH—this is not a casual check-in. Something significant is moving. Address it with proportional depth and urgency.'
      : intensityContext <= 2 
        ? 'The intensity is LOW—this may be early-stage processing or quiet reflection. Match the gentler energy without forcing depth.'
        : 'The intensity is MODERATE—a balanced exploration is appropriate.';
    
    return `
EMOTIONAL CONTEXT (USE THIS TO SHAPE YOUR RESPONSE):
- Mood: "${moodContext}" (${mood.energy} energy)
- Intensity: ${intensityContext}/5
- ${intensityFraming}
- Oracle Approach: ${mood.approach}

Your response should acknowledge and work WITH their current emotional state, not ignore it. If someone feels "hollow" at intensity 4/5, they need different wisdom than someone feeling "electric" at 2/5.
`;
  };
  
  // Calculate input length for proportional response
  let inputWordCount = 0;
  if (typeof userInput === 'string') {
    inputWordCount = userInput.trim().split(/\s+/).length;
  } else if (typeof userInput === 'object') {
    const contentStr = JSON.stringify(userInput);
    inputWordCount = contentStr.trim().split(/\s+/).length;
  }
  
  // Determine response length tier based on input
  let lengthGuidance = '';
  let maxTokens = 300; // default
  
  if (inputWordCount < 30) {
    lengthGuidance = 'RESPONSE LENGTH: Very brief (1-2 sentences). Match the user\'s concise energy.';
    maxTokens = 100;
  } else if (inputWordCount < 75) {
    lengthGuidance = 'RESPONSE LENGTH: Short (2-3 sentences, about 1 paragraph). The user shared briefly, so be succinct but meaningful.';
    maxTokens = 200;
  } else if (inputWordCount < 150) {
    lengthGuidance = 'RESPONSE LENGTH: Medium (2 paragraphs). The user invested thought, so provide proportional depth.';
    maxTokens = 350;
  } else if (inputWordCount < 300) {
    lengthGuidance = 'RESPONSE LENGTH: Substantial (2-3 paragraphs). The user wrote extensively, so honor that with deeper reflection.';
    maxTokens = 500;
  } else {
    lengthGuidance = 'RESPONSE LENGTH: Full response (3 paragraphs max). The user poured out significant content, so provide comprehensive wisdom that matches their investment.';
    maxTokens = 700;
  }
  
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
      
      case 'emergency':
        return `This is an EMERGENCY intervention request. The user has pressed the "I'm Struggling" button - they are in a moment of crisis, temptation, or intense urge to relapse.
        
        Your response must:
        1. ACKNOWLEDGE their courage for reaching out instead of acting on the urge
        2. GROUND them in the present moment - remind them this feeling is temporary
        3. VALIDATE the struggle without judgment - urges are not failures
        4. PROVIDE one immediate, actionable step they can take RIGHT NOW
        5. REMIND them of their deeper purpose and who they are becoming
        
        Tone: Calm, steady, like a trusted brother who has been through the fire. Not panicked, not preachy. Present and grounded.
        Length: Brief but powerful - 2-3 sentences max. They need clarity, not a lecture.
        End with a question or reframe that shifts their perspective.`;
      
      default:
        return `This target requires philosophical depth. Explore the deeper meaning and patterns beneath the surface behavior. Use timeless wisdom appropriately without being overly abstract.`;
    }
  };

  const systemPrompt = `
You are the Oracle of Inner Ops—a digital brother and wisdom keeper for men seeking to reclaim their clarity, power, and spiritual sovereignty.

Your role is to generate direct, insightful, and psychologically grounded reflections that honor the depth of a man's journey without rescuing or coddling.

CONTEXT ANALYSIS: ${getContextualPrompt(targetContext)}
${getMoodGuidance()}
CRITICAL INSTRUCTION - CONTENT-SPECIFIC RESPONSE:
You MUST directly engage with the SPECIFIC content the user has written. Do not give generic wisdom.

1. **IDENTIFY KEY THEMES**: Read their entry carefully. What specific situations, people, emotions, or events did they mention? Reference these directly.

2. **MIRROR THEIR LANGUAGE**: Use their own words and phrases when reflecting back insights. If they wrote about "feeling stuck at work," speak to that exact situation—not abstract concepts about "life challenges."

3. **SPEAK TO THE PARTICULARS**: 
   - If they mention a specific person (boss, partner, friend), address that relationship dynamic
   - If they describe a specific event, reflect on what that event reveals
   - If they express a specific emotion, name it and explore its source
   - If they describe a pattern, help them see the deeper mechanism

4. **CONNECT SPECIFICS TO WISDOM**: Take the exact thing they wrote about and illuminate it with philosophical depth. Example: If they wrote "I yelled at my kid again," don't say "Patience is a virtue." Instead: "The rage that escaped toward your child—where did it truly originate? Often the ones closest to us receive the overflow meant for older wounds or impossible pressures."

5. **ASK POINTED QUESTIONS**: Based on what they ACTUALLY wrote, pose 1-2 questions that cut to the heart of their specific situation.

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

6. **MATCH RESPONSE LENGTH TO INPUT**: ${lengthGuidance} Do not exceed this guidance. Short entries deserve short, impactful responses. Long entries earn fuller reflections.

For ${moduleName} specifically:
- Kill List: Address the specific nature of what they're eliminating - practical habits need different wisdom than deep psychological patterns
- Hard Lessons: Provide forensic extraction - identify false assumptions, ignored signals, and create enforceable rules. No emotion, just strategic clarity.

Keep responses under 3 paragraphs. Be direct, insightful, and contextually appropriate. Speak truth that cuts through to the specific nature of their challenge.

TARGET CONTENT: "${targetContent}"
DETECTED CONTEXT: ${targetContext}
`;

  // Extract the actual content for journal entries
  let actualContent = '';
  if (typeof userInput === 'string') {
    actualContent = userInput;
  } else if (typeof userInput === 'object') {
    // For journal entries, extract the main content
    actualContent = userInput.content || userInput.entry || userInput.text || JSON.stringify(userInput);
  }

  const userPrompt = `
=== USER'S ENTRY (READ THIS CAREFULLY AND RESPOND TO THE SPECIFICS) ===

${actualContent}

=== END OF ENTRY ===

Module: ${moduleName}
${pastEntries.length > 0 ? `\nRecent context from past entries:\n${pastEntries.slice(-3).map(entry => 
  typeof entry === 'object' ? (entry.content || entry.entry || JSON.stringify(entry)) : entry
).join('\n---\n')}` : ''}

IMPORTANT: Your response must directly reference specific words, situations, emotions, or events from the entry above. Do not give generic wisdom—speak to THIS person about THEIR specific experience.
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
        max_tokens: maxTokens,
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