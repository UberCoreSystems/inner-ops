import logger from './logger';

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
    // SECURITY: Removed direct OpenAI API calls from client-side
    // This prevents API key exposure in browser
    logger.info("Generating local AI feedback (API calls removed for security)");
    
    // Generate intelligent local feedback based on context analysis
    return generateLocalFeedback(moduleName, userInput, targetContext, moodContext, intensityContext, pastEntries);

  } catch (error) {
    logger.error("Error generating feedback:", error);
    return getFallbackResponse(moduleName);
  }
};

/**
 * Generate intelligent feedback locally without API calls
 * Uses pattern matching and context analysis
 */
const generateLocalFeedback = (moduleName, userInput, targetContext, moodContext, intensityContext, pastEntries) => {
  const inputText = typeof userInput === 'string' ? userInput.toLowerCase() : JSON.stringify(userInput).toLowerCase();
  
  // Extract key themes and patterns
  const patterns = {
    struggle: /struggle|difficult|hard|tough|can't|unable|failing/i,
    progress: /better|improvement|progress|success|achieved|accomplished/i,
    relapse: /relapse|fell|slip|gave in|failed/i,
    determination: /will|determined|committed|going to|must|need to/i,
    reflection: /realize|understand|learned|noticed|aware/i,
    emotional: /feel|feeling|emotion|angry|sad|anxious|stressed|happy|grateful/i
  };

  const detectedPatterns = Object.keys(patterns).filter(key => patterns[key].test(inputText));
  
  // Mood-aware responses
  const moodResponses = {
    electric: [
      "This vibrant energy is powerful. What ignited this spark, and where do you want to direct it?",
      "Channel this intensity. What breakthrough is trying to emerge through this electric state?"
    ],
    foggy: [
      "The fog isn't emptiness—it's a processing state. What needs time to clarify beneath this veil?",
      "Confusion often precedes clarity. What question is this fog protecting you from rushing to answer?"
    ],
    sharp: [
      "This clarity is a gift. What insight is cutting through right now? Capture it while the blade is keen.",
      "Sharp focus reveals truth. What are you seeing clearly that you couldn't see before?"
    ],
    hollow: [
      "Emptiness signals something was lost or given away. What needs to be mourned or reclaimed?",
      "This hollow space might be making room for something new. What's ready to release, and what wants to enter?"
    ],
    heavy: [
      "This weight has sources. What are you carrying that isn't yours, or what needs to be set down?",
      "Burdens reveal what matters. What responsibility is real, and what is self-imposed?"
    ],
    chaotic: [
      "Chaos is unintegrated energy seeking form. What pattern is trying to emerge from this storm?",
      "Turbulence signals transformation. What old structure is breaking down to make space for the new?"
    ],
    triumphant: [
      "Victory earned through struggle deserves recognition. What made this possible, and how can you repeat it?",
      "This success is data. What did you do differently that worked? Capture the formula."
    ],
    light: [
      "Lightness is a reward for releasing what doesn't serve. What let go, and how can you protect this freedom?",
      "This buoyancy is precious. What opened, and how do you maintain this state without grasping?"
    ],
    focused: [
      "Sacred attention is your superpower. What's capturing your focus, and is it worthy of this energy?",
      "This concentration is rare. Protect it fiercely and direct it toward what truly matters."
    ],
    radiant: [
      "Inner light shining outward is a sign of alignment. What opened this channel?",
      "This luminosity wants to be shared. How can you express it without depleting yourself?"
    ]
  };

  // Pattern-based responses
  const patternResponses = {
    struggle: [
      "Struggle reveals what you're unwilling to abandon. What are you fighting for that's worth this resistance?",
      "Difficulty is information. What's this challenge teaching you about your edges and capacity?",
      "The hard path often leads somewhere worth reaching. What would make this struggle meaningful?"
    ],
    progress: [
      "Progress compounds. What small win today builds toward your larger transformation?",
      "Improvement is evidence you're learning. What shifted, and how can you amplify it?",
      "Success leaves clues. What worked here that you can apply elsewhere?"
    ],
    relapse: [
      "A slip is not a fall—it's data. What triggered it, and what does that teach you about your system?",
      "Every relapse reveals an unaddressed need. What was underneath the urge?",
      "Return to the path without shame. What boundary needs strengthening, or what pain needs processing?"
    ],
    determination: [
      "Commitment is powerful, but systems outlast motivation. What structure will support this intention?",
      "Will is the spark; discipline is the fuel. What daily practice will carry this forward when willpower fades?",
      "Your determination is noted. Now what's the smallest next action that proves it?"
    ],
    reflection: [
      "Awareness is the first transformation. What understanding is emerging?",
      "The observer sees what the doer missed. What pattern are you recognizing?",
      "Meta-awareness creates choice. What do you now see that you can change?"
    ],
    emotional: [
      "Emotions are messengers, not meanings. What is this feeling trying to tell you?",
      "Name the emotion, honor it, then ask: what does it need from me?",
      "Feeling deeply means you're alive and engaged. What action does this emotion want to inspire?"
    ]
  };

  // Module-specific guidance
  const moduleGuidance = {
    journal: [
      "Your words today are breadcrumbs for your future self. What truth are you leaving behind?",
      "The unexamined life stays unchanged. What are you seeing now that demands action?",
      "Writing creates distance from pain, turning it into wisdom. What shifts when you witness your own story?"
    ],
    killList: [
      "Naming the target is half the battle. Every addiction protects something—what pain is it masking?",
      "You don't need to be perfect; you need to be persistent. What's one more day of resistance teaching you?",
      "The thing you're trying to kill is trying to keep you. What does freedom from this pattern look like?"
    ],
    relapse: [
      "Honesty about the fall is the first step back up. No shame, just data—what happened?",
      "Each reset sharpens your awareness. What warning sign did you miss this time?",
      "The gap between trigger and action is where freedom lives. How can you widen that space?"
    ],
    hardLessons: [
      "Pain that isn't transformed gets transmitted. What wisdom is this suffering trying to birth?",
      "Hard lessons earn their name. What won't you forget after this?",
      "Extracting meaning from pain is how you avoid repeating it. What's the takeaway you can't afford to lose?"
    ]
  };

  // Build response
  let response = "";
  
  // Add mood-specific insight if present
  if (moodContext && moodResponses[moodContext]) {
    const moodOptions = moodResponses[moodContext];
    response += moodOptions[Math.floor(Math.random() * moodOptions.length)] + "\n\n";
  }
  
  // Add pattern-based insight
  if (detectedPatterns.length > 0) {
    const primaryPattern = detectedPatterns[0];
    const patternOptions = patternResponses[primaryPattern] || [];
    if (patternOptions.length > 0) {
      response += patternOptions[Math.floor(Math.random() * patternOptions.length)] + "\n\n";
    }
  }
  
  // Add module guidance
  const moduleOptions = moduleGuidance[moduleName] || moduleGuidance.journal;
  response += moduleOptions[Math.floor(Math.random() * moduleOptions.length)];
  
  return response;
};

/**
 * Generate a deeper follow-up response from the Oracle based on the user's answer
 * to the Oracle's initial judgment question
 */
export const generateOracleFollowUp = async (originalInput, oracleJudgment, userResponse) => {
  if (requestTimeout) {
    clearTimeout(requestTimeout);
  }

  // SECURITY: Removed direct OpenAI API calls from client-side
  // Generate intelligent local follow-up based on context
  logger.info("Generating local Oracle follow-up (API calls removed for security)");
  
  try {
    return generateLocalFollowUp(originalInput, oracleJudgment, userResponse);
  } catch (error) {
    logger.error("Error generating Oracle follow-up:", error);
    return "The Oracle acknowledges your reflection. Integration happens in silence as much as in words. Carry this forward.";
  }
};

/**
 * Generate local follow-up responses
 */
const generateLocalFollowUp = (originalInput, oracleJudgment, userResponse) => {
  const responseLower = userResponse.toLowerCase();
  
  // Detect response patterns
  const hasInsight = /understand|realize|see|learned|aware|know|recognize/i.test(responseLower);
  const hasConfusion = /confused|unsure|don't know|not sure|unclear/i.test(responseLower);
  const hasCommitment = /will|going to|commit|promise|determined/i.test(responseLower);
  const hasResistance = /but|however|can't|difficult|hard|struggle/i.test(responseLower);
  const isShort = userResponse.split(' ').length < 10;
  
  let response = "";
  
  // Opening acknowledgment
  if (hasInsight) {
    response += "You see it now. That awareness is the first transformation—what you can name, you can change. ";
  } else if (hasConfusion) {
    response += "Not knowing is honest. Confusion often precedes breakthrough. Trust the process of unclear becoming clear. ";
  } else if (hasCommitment) {
    response += "Intention noted. But remember: the path between saying and doing is where most lose their way. ";
  } else if (hasResistance) {
    response += "Resistance is information—it shows you where the real work lives. Don't fight it; understand it. ";
  } else {
    response += "Your reflection is heard. ";
  }
  
  // Deepening based on response length and content
  if (isShort) {
    response += "Sometimes the simplest truths need no elaboration. ";
  } else {
    response += "The depth of your response reveals the work you're already doing beneath the surface. ";
  }
  
  // Closing wisdom
  const closings = [
    "What you've uncovered here becomes your compass. Return to it when the path gets unclear.",
    "This insight isn't the end—it's the beginning of a new pattern. Watch how it unfolds.",
    "You know what needs to happen next. The question isn't what, but when you'll begin.",
    "Understanding and transformation aren't the same. Knowledge alone changes nothing. Action is where wisdom lives.",
    "The Oracle doesn't give you answers—it helps you hear the ones you already have. Now listen.",
    "What you've written here will echo forward. Let it guide you when motivation fades and discipline must carry you.",
    "This too is part of the path. Not every moment needs to be profound—consistency matters more than intensity.",
    "You're building something here, one reflection at a time. Trust the accumulation of small insights."
  ];
  
  response += closings[Math.floor(Math.random() * closings.length)];
  
  return response;
};