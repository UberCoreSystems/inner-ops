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
    logger.info("Generating local Oracle feedback (client-side external API calls disabled)");
    return generateLocalFeedback(
      moduleName,
      userInput,
      targetContext,
      moodContext,
      intensityContext,
      pastEntries
    );
  } catch (error) {
    if (import.meta.env.DEV) {
      logger.error("Error generating local AI feedback:", error);
    }
    return "The Oracle senses an unexpected disturbance in the flow... The wisdom must wait for clearer channels.";
  } finally {
    if (requestTimeout) {
      clearTimeout(requestTimeout);
      requestTimeout = null;
    }
  }
};

/**
 * Generate contextual feedback locally without API calls
 * Philosophy-aligned, length-matched, module-specific
 */
const generateLocalFeedback = (moduleName, userInput, targetContext, moodContext, intensityContext, pastEntries) => {
  const inputText = typeof userInput === 'string' ? userInput : JSON.stringify(userInput);
  const inputLower = inputText.toLowerCase();
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  const wordCount = inputText.trim().split(/\s+/).filter(Boolean).length;

  const getLengthPlan = () => {
    if (wordCount < 25) return { paragraphs: 1, sentences: 3 };
    if (wordCount < 75) return { paragraphs: 1, sentences: 4 };
    if (wordCount < 150) return { paragraphs: 2, sentences: 6 };
    if (wordCount < 300) return { paragraphs: 2, sentences: 8 };
    return { paragraphs: 3, sentences: 10 };
  };

  const extractKeyPhrases = () => {
    const sentences = inputText
      .split(/(?<=[.!?])\s+/)
      .map(s => s.trim())
      .filter(Boolean);

    if (sentences.length === 0) return [];

    const weighted = sentences.map((s) => {
      const score =
        (/(\bfeel\b|\bfeeling\b|\bafraid\b|\banxious\b|\bstress\b|\banger\b|\bgrief\b|\bshame\b)/i.test(s) ? 2 : 0) +
        (/(\bshould\b|\bmust\b|\bneed\b|\bcan't\b|\bwon't\b|\bfailed\b|\brelapse\b|\bslip\b)/i.test(s) ? 2 : 0) +
        (/(\bbecause\b|\bwhen\b|\bafter\b|\bbefore\b|\bso that\b|\btherefore\b)/i.test(s) ? 1 : 0) +
        Math.min(s.length / 80, 2);
      return { sentence: s, score };
    });

    return weighted
      .sort((a, b) => b.score - a.score)
      .slice(0, 2)
      .map(s => s.sentence);
  };

  const detectLens = () => {
    const lenses = [];

    if (/(anxious|fear|worry|panic|overwhelmed|stress|fragile|breakdown)/i.test(inputLower)) {
      lenses.push('stoic');
    }
    if (/(empty|hollow|stillness|present|now|breath|awareness|peace)/i.test(inputLower)) {
      lenses.push('zen');
    }
    if (/(weak|lazy|avoid|procrastinate|coward|comfort|soft)/i.test(inputLower)) {
      lenses.push('nietzsche');
    }
    if (/(meaningless|absurd|purpose|why|exist|freedom|choice)/i.test(inputLower)) {
      lenses.push('existential');
    }
    if (/(shadow|projection|mask|archetype|childhood|wound)/i.test(inputLower)) {
      lenses.push('jung');
    }
    if (/(strategy|enemy|battle|power|control|discipline|plan|war)/i.test(inputLower)) {
      lenses.push('strategic');
    }
    if (/(flow|nature|let go|surrender|yield|water|way)/i.test(inputLower)) {
      lenses.push('tao');
    }

    if (moodContext && ['foggy', 'hollow', 'heavy', 'chaotic'].includes(moodContext)) {
      lenses.push('zen');
    }
    if (moodContext && ['focused', 'sharp', 'triumphant'].includes(moodContext)) {
      lenses.push('stoic');
    }

    if (lenses.length === 0) lenses.push('stoic');
    return Array.from(new Set(lenses)).slice(0, 2);
  };

  const lensLines = {
    stoic: [
      'Distinguish what you can control from what you cannot, then invest all force in the former.',
      'Your judgment is the lever. Move the mind, and the rest follows.',
      'As Epictetus would insist, the event is neutral; your verdict is the battle.'
    ],
    zen: [
      'Return to direct experience. The mind’s noise settles when you stop feeding it.',
      'Let the moment be complete before you decide what it means.',
      'As Thich Nhat Hanh taught, peace is available when you stop chasing it.'
    ],
    tao: [
      'Force creates resistance; alignment creates momentum. Choose the path with least friction.',
      'Flow is not passivity. It is precision without strain.',
      'Lao Tzu would call this the water path: soft, exact, unstoppable.'
    ],
    nietzsche: [
      'If weakness is steering you, name it and refuse the steering wheel.',
      'Your strength is forged by the weight you decide to carry.',
      'Nietzsche would ask: are you choosing comfort, or choosing becoming?'
    ],
    existential: [
      'Meaning is not found; it is authored. Your choice is the brush.',
      'Freedom is heavy, but it is yours. Act from it.',
      'Camus would say: the absurd isn’t a wall; it is a test of your defiance.'
    ],
    jung: [
      'The shadow does not disappear; it integrates when you face it without flinching.',
      'What you resist in others often mirrors what you have not claimed in yourself.',
      'Jung would call this the call to integrate, not to deny.'
    ],
    strategic: [
      'Strategy is the discipline of choosing battles that compound power.',
      'Every move should reduce future friction and increase optionality.',
      'Sun Tzu would remind you: the best win is the one you script in advance.'
    ]
  };

  const summarizePastEntries = () => {
    if (!pastEntries || pastEntries.length === 0) return '';
    const recent = pastEntries.slice(-3).map((entry) => {
      if (typeof entry === 'string') return entry;
      if (typeof entry === 'object') return entry.content || entry.entry || entry.text || JSON.stringify(entry);
      return '';
    }).filter(Boolean).join(' ').toLowerCase();

    if (!recent) return '';

    const themes = [
      { key: 'avoidance', re: /avoid|escape|numb|scroll|procrastin/i },
      { key: 'pressure', re: /pressure|stress|overwhelm|too much/i },
      { key: 'isolation', re: /alone|isolated|lonely|withdraw/i },
      { key: 'anger', re: /angry|rage|irritat/i },
      { key: 'grief', re: /grief|loss|mourning|sad/i }
    ];

    const hit = themes.find(t => t.re.test(recent));
    if (!hit) return '';

    const lines = {
      avoidance: 'A pattern of avoidance keeps surfacing. Name the cost of the escape.',
      pressure: 'The pressure theme keeps returning. What boundary would lower the load without lowering your standards?',
      isolation: 'Isolation shows up more than once. Is it protection, or is it a slow leak of strength?',
      anger: 'Anger repeats in the background. What boundary keeps getting crossed, and who needs to hear it?',
      grief: 'Grief echoes across entries. Let it speak without turning it into a verdict.'
    };

    return lines[hit.key] || '';
  };

  const moduleDirectives = {
    journal: [
      'Name the specific shift they’re experiencing and translate it into a next action.',
      'Make the insight practical: one behavior to keep, one behavior to stop.',
      'Turn the reflection into a concrete next step and a boundary to protect it.'
    ],
    killList: [
      'Frame the target as a system to dismantle; highlight triggers and replacement behavior.',
      'Reduce the target to a loop: trigger → urge → action. Break one link today.',
      'Name the replacement behavior so the old pattern has nowhere to land.'
    ],
    relapse: [
      'Treat relapse as data; identify trigger → impulse → action chain and a single interrupt.',
      'Locate the first weak link and strengthen it with one clear safeguard.',
      'Remove the biggest trigger you control and add a replacement ritual.'
    ],
    hardLessons: [
      'Extract assumption, ignored signal, lesson, and rule. No moral language.',
      'Convert the pain into a rule you can enforce on your next decision.',
      'State the precise failure point and the constraint that prevents repeat.'
    ],
    emergency: [
      'Short, grounding, immediate action, then a single reframe question.',
      'Stabilize first, then choose one small action that interrupts the urge.',
      'Keep it simple: breathe, move, change environment, then decide.'
    ],
    'black mirror': [
      'Expose attention leaks; name the cost and the smallest boundary.',
      'Call out the leak and seal it with one rule you can keep for 24 hours.',
      'Name the attention drain and choose the smallest constraint that works.'
    ]
  };

  const getModuleName = () => (moduleName || '').toLowerCase();
  const moduleKey = getModuleName();

  if (moduleKey === 'hardlessons' || moduleKey === 'hard lessons' || moduleKey === 'hardlessonsmodule' || targetContext === 'hardLessons') {
    const phrases = extractKeyPhrases();
    const assumption = phrases[0] ? `Assumption: ${phrases[0]}` : 'Assumption: Identify the belief that proved false.';
    const signal = phrases[1] ? `Ignored Signal: ${phrases[1]}` : 'Ignored Signal: Name the early warning you discounted.';
    const lesson = 'Lesson: State the precise cause-effect you must remember.';
    const rule = 'Rule: Convert the lesson into a constraint you can enforce.';
    return [assumption, signal, lesson, rule].join('\n');
  }

  if (moduleKey === 'emergency') {
    return [
      'You did the hard part: you paused. This urge will crest and fall—breathe and let it pass through without acting.',
      'Do one small interrupt now: stand up, drink water, and change your environment for five minutes.',
      'What is the deeper need underneath this impulse that you can meet without breaking your standards?'
    ].join(' ');
  }

  const keyPhrases = extractKeyPhrases();
  const lenses = detectLens();
  const { paragraphs, sentences } = getLengthPlan();

  const openerVariants = keyPhrases[0]
    ? [
        `You named: “${keyPhrases[0]}”. That isn’t a small detail—it’s the hinge.`,
        `The core of it is here: “${keyPhrases[0]}”. That’s the pivot.`,
        `This line matters most: “${keyPhrases[0]}”. Build from there.`
      ]
    : [
        'Say it plainly: what you wrote is the hinge point of your pattern.',
        'The core is there even if unnamed—find it and say it out loud.',
        'Your entry already contains the answer; isolate it and act.'
      ];

  const contextVariants = keyPhrases[1]
    ? [
        `And this matters: “${keyPhrases[1]}”. That’s where the leverage hides.`,
        `This line has weight: “${keyPhrases[1]}”. That’s your leverage.`,
        `Notice the consequence here: “${keyPhrases[1]}”. That’s the handle.`
      ]
    : [
        'The leverage is buried in the exact moment you described—return to it.',
        'Look at the trigger point you described—that’s where the change starts.',
        'The pattern lives in the moment before the choice. Go back there.'
      ];

  const opener = pick(openerVariants);
  const contextLine = pick(contextVariants);

  const lensStack = lenses
    .map((lens) => lensLines[lens]?.[0])
    .filter(Boolean)
    .slice(0, 2);

  const lensFollow = lenses
    .map((lens) => lensLines[lens]?.[1])
    .filter(Boolean)
    .slice(0, 1);

  const signatureLine = lenses
    .map((lens) => lensLines[lens]?.[2])
    .filter(Boolean)
    .slice(0, 1);

  const moduleLine = pick(moduleDirectives[moduleKey] || moduleDirectives.journal);

  const actionLines = [
    'Next action: choose one concrete step you will take within 24 hours and schedule it.',
    'Make it measurable: decide the exact time, place, and duration for the next step.',
    'Reduce friction: remove one obstacle today so tomorrow is easier.',
    'Do this next: one small action today that proves the pattern is changing.'
  ];

  const questions = [
    'What is the smallest action you can take in the next 24 hours that proves you mean it?',
    'If you remove one excuse, which one collapses the whole pattern?',
    'What boundary, if enforced once, would change everything?'
  ];

  const question = pick(questions);
  const actionLine = pick(actionLines);

  const plainLine = keyPhrases[0]
    ? `Plainly: this is about “${keyPhrases[0]}”. Name it, then act on it once today.`
    : 'Plainly: pick one behavior to change today, and prove it with a small action.';

  const responseStyles = [
    { name: 'direct', order: ['opener', 'context', 'module', 'action', 'plain', 'lens', 'question'] },
    { name: 'coach', order: ['opener', 'module', 'context', 'plain', 'lens', 'action', 'question'] },
    { name: 'reflective', order: ['opener', 'lens', 'context', 'module', 'plain', 'question', 'action'] },
    { name: 'strategic', order: ['opener', 'context', 'module', 'lens', 'plain', 'action', 'question'] }
  ];
  const style = pick(responseStyles);

  const pastLine = summarizePastEntries();

  const blocks = {
    opener,
    context: contextLine,
    lens: [...lensStack, ...lensFollow, ...signatureLine].filter(Boolean).join(' '),
    past: pastLine,
    module: moduleLine,
    action: actionLine,
    plain: plainLine,
    question
  };

  const bodySentences = style.order
    .map((key) => blocks[key])
    .filter(Boolean);

  if (blocks.past && !bodySentences.includes(blocks.past)) {
    bodySentences.splice(2, 0, blocks.past);
  }

  const targetCount = Math.max(sentences, 4);
  const sliced = bodySentences.slice(0, Math.min(bodySentences.length, targetCount));

  if (paragraphs === 1) {
    return sliced.join(' ');
  }

  const splitIndex = Math.ceil(sliced.length / 2);
  const first = sliced.slice(0, splitIndex).join(' ');
  const second = sliced.slice(splitIndex).join(' ');
  if (paragraphs === 2) return `${first}\n\n${second}`;

  const third = lensFollow.length ? lensFollow.join(' ') : 'Hold the line and let the results educate you.';
  return `${first}\n\n${second}\n\n${third}`;
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