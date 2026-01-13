// AI utilities for generating reflections, insights, and feedback
import logger from './logger';

export const aiUtils = {
  // Generate journal reflection prompts based on mood and content
  generateJournalReflection: (mood, intensity, content) => {
    const reflections = {
      happy: [
        "What specific actions or thoughts contributed to this positive feeling?",
        "How can you recreate these conditions in the future?",
        "What gratitude can you express for this moment?"
      ],
      sad: [
        "What underlying need isn't being met right now?",
        "How can you show yourself compassion during this difficult time?",
        "What support systems can you reach out to?"
      ],
      angry: [
        "What boundary was crossed or value was violated?",
        "How can you channel this energy constructively?",
        "What would a calm, centered version of yourself do right now?"
      ],
      anxious: [
        "What specifically are you worried about?",
        "Which of these concerns are within your control?",
        "What grounding techniques can help you find peace?"
      ],
      tired: [
        "What has been draining your energy lately?",
        "How can you better honor your need for rest?",
        "What boundaries do you need to set to protect your energy?"
      ],
      calm: [
        "What practices helped you achieve this state of peace?",
        "How can you maintain this centeredness throughout challenges?",
        "What wisdom emerges from this calm perspective?"
      ],
      thoughtful: [
        "What insights are emerging from this reflection?",
        "How might these thoughts guide your future actions?",
        "What patterns are you noticing about yourself?"
      ],
      confused: [
        "What information or clarity do you need right now?",
        "Who could offer helpful perspective on this situation?",
        "What would happen if you sat with this uncertainty for now?"
      ]
    };

    const baseReflections = reflections[mood] || reflections.thoughtful;
    const intensityMultiplier = intensity > 3 ? 2 : 1;

    return baseReflections.slice(0, intensityMultiplier);
  },

  // Analyze kill list patterns and provide insights
  analyzeKillListPatterns: (targets) => {
    if (targets.length === 0) return [];

    const categoryCount = targets.reduce((acc, target) => {
      acc[target.category] = (acc[target.category] || 0) + 1;
      return acc;
    }, {});

    const insights = [];

    // Most common category
    const topCategory = Object.entries(categoryCount).sort((a, b) => b[1] - a[1])[0];
    if (topCategory) {
      const categoryInsights = {
        habit: "You're focusing heavily on changing daily patterns. Consider implementing replacement habits alongside elimination.",
        thought: "Your mental patterns seem to be a priority. Mindfulness and cognitive restructuring techniques could be powerful allies.",
        behavior: "You're targeting behavioral changes. Focus on understanding the triggers that lead to these behaviors.",
        addiction: "Breaking addictive patterns requires both willpower and environmental changes. Consider professional support.",
        fear: "Fear-based patterns are holding you back. Gradual exposure and building confidence could help.",
        relationship: "Relationship boundaries seem important to you. Practice assertive communication and self-worth building.",
        excuse: "You're recognizing self-limiting beliefs. Challenge these thoughts with evidence and alternative perspectives."
      };

      insights.push(`Primary Focus Area: ${topCategory[0]} - ${categoryInsights[topCategory[0]] || 'Keep building awareness in this area.'}`);
    }

    // Progress patterns
    const completedTargets = targets.filter(t => t.status === 'completed').length;
    const completionRate = (completedTargets / targets.length * 100).toFixed(1);

    if (completionRate > 70) {
      insights.push("Excellent progress! You're successfully eliminating negative patterns. Consider adding more challenging targets.");
    } else if (completionRate > 40) {
      insights.push("Good momentum. Focus on understanding what made your successful eliminations work.");
    } else {
      insights.push("Progress takes time. Consider breaking down larger targets into smaller, more manageable steps.");
    }

    return insights;
  },

  // Generate compass check insights
  generateCompassInsights: (values, previousEntries = []) => {
    const insights = [];
    const { authenticity, courage, discipline, growth, service } = values;
    const overall = (authenticity + courage + discipline + growth + service) / 5;

    // Overall assessment
    if (overall >= 8) {
      insights.push("🌟 You're living in strong alignment with your values. This is the foundation of authentic fulfillment.");
    } else if (overall >= 6) {
      insights.push("⚖️ You're on a positive path. Focus on the areas where you scored lowest for maximum impact.");
    } else {
      insights.push("🔄 This is a time for recalibration. Choose one value to focus on improving this week.");
    }

    // Individual value insights
    const valueInsights = {
      authenticity: {
        low: "Consider: Are you compromising your true self to please others? Practice expressing your genuine thoughts and feelings.",
        high: "Your authenticity shines through. This genuine presence is your superpower in relationships and life."
      },
      courage: {
        low: "Growth happens at the edge of your comfort zone. What's one small brave action you could take today?",
        high: "Your courage to face challenges head-on is admirable. Channel this strength to help others find their bravery."
      },
      discipline: {
        low: "Discipline is built through small, consistent actions. Choose one daily practice to commit to this week.",
        high: "Your self-discipline is strong. Consider how you can use this strength to tackle bigger challenges."
      },
      growth: {
        low: "Comfort zones are cozy but limiting. What's one area where you could stretch yourself this week?",
        high: "Your commitment to growth is evident. Share your learning journey to inspire others."
      },
      service: {
        low: "Contributing to others often brings unexpected fulfillment. How could you help someone else today?",
        high: "Your service to others creates ripple effects of positive change. This generosity enriches your own life."
      }
    };

    Object.entries(values).forEach(([key, value]) => {
      if (value <= 4) {
        insights.push(`${key.charAt(0).toUpperCase() + key.slice(1)}: ${valueInsights[key].low}`);
      } else if (value >= 8) {
        insights.push(`${key.charAt(0).toUpperCase() + key.slice(1)}: ${valueInsights[key].high}`);
      }
    });

    // Trend analysis if previous entries exist
    if (previousEntries.length > 0) {
      const lastEntry = previousEntries[0];
      const trend = overall - (lastEntry.authenticity + lastEntry.courage + lastEntry.discipline + lastEntry.growth + lastEntry.service) / 5;

      if (trend > 0.5) {
        insights.push("📈 Positive trend! You're moving in the right direction. Keep building on this momentum.");
      } else if (trend < -0.5) {
        insights.push("📉 Recent dip noticed. This is normal - consider what support or adjustments you might need.");
      }
    }

    return insights;
  },

  // Analyze relapse patterns and provide recovery insights
  analyzeRelapsePatterns: (relapseEntries) => {
    if (relapseEntries.length === 0) {
      return ["🌱 No relapse entries yet. Focus on building strong preventive habits and self-awareness."];
    }

    const insights = [];

    // Common relapse selves
    const selvesCount = relapseEntries.reduce((acc, entry) => {
      acc[entry.selectedSelf] = (acc[entry.selectedSelf] || 0) + 1;
      return acc;
    }, {});

    const topSelf = Object.entries(selvesCount).sort((a, b) => b[1] - a[1])[0];
    if (topSelf) {
      const selfInsights = {
        'The Addict': 'Your addictive patterns need comprehensive support. Consider professional help and building strong accountability systems.',
        'The Victim': 'Notice when you shift into victim mentality. Practice taking responsibility for what you can control.',
        'The Procrastinator': 'Break tasks into smaller steps and focus on progress over perfection.',
        'The Pessimist': 'Challenge negative thoughts with evidence. Practice gratitude and positive reframing.',
        'The Perfectionist': 'Embrace "good enough" and celebrate progress. Perfection often prevents completion.',
        'The People-Pleaser': 'Your worth isn\'t determined by others\' approval. Practice setting healthy boundaries.',
        'The Imposter': 'Recognize your actual accomplishments. You belong and have valuable contributions to make.',
        'The Self-Saboteur': 'Notice the voice that undermines your success. Ask what it\'s trying to protect you from.'
      };

      insights.push(`Most Common Pattern: ${topSelf[0]} - ${selfInsights[topSelf[0]]}`);
    }

    // Common habits
    const allHabits = relapseEntries.flatMap(entry => entry.selectedHabits || []);
    const habitCount = allHabits.reduce((acc, habit) => {
      acc[habit] = (acc[habit] || 0) + 1;
      return acc;
    }, {});

    const topHabit = Object.entries(habitCount).sort((a, b) => b[1] - a[1])[0];
    if (topHabit) {
      insights.push(`Primary Trigger Habit: ${topHabit[0]} - Create specific strategies to interrupt this pattern.`);
    }

    // Recovery recommendations
    if (relapseEntries.length >= 3) {
      insights.push("🔄 Multiple entries show you're building self-awareness. This recognition is the first step to lasting change.");
      insights.push("💪 Consider what worked during your longest streak and how to recreate those conditions.");
    }

    return insights;
  },

  // AI-powered insights and feedback system
  generateActionSteps: (userData) => {
    const steps = [];

    if (userData.recentMood === 'sad' || userData.recentMood === 'anxious') {
      steps.push("Consider a mindfulness or grounding exercise to center yourself.");
      steps.push("Reflect on what specific thoughts are driving these feelings.");
    }

    if (userData.killListProgress < 30) {
      steps.push("Focus on one small action toward your primary target today.");
      steps.push("Break down your largest obstacle into smaller, manageable steps.");
    }

    if (userData.compassOverall < 4) {
      steps.push("Identify one core value you want to embody more fully this week.");
      steps.push("Consider where you might be compromising your authentic self.");
    }

    // Growth-oriented suggestions inspired by self-overcoming philosophy
    steps.push("What would your highest self do in today's challenges?");
    steps.push("Challenge yourself to act from courage rather than fear today.");

    return steps.slice(0, 3); // Return max 3 action steps
  },

  // Generate AI feedback using local intelligent responses
  generateAIFeedback: async (moduleName, userInput, pastEntries = []) => {
    // SECURITY: Removed direct OpenAI API calls from client-side
    // This prevents API key exposure in browser
    logger.info("Generating local AI feedback (API calls removed for security)");
    
    try {
      return generateLocalAIResponse(moduleName, userInput, pastEntries);
    } catch (error) {
      logger.error("Error generating AI feedback:", error);
      return "Continue your practice with inner discipline and honest reflection.";
    }
  }
};

/**
 * Generate intelligent local AI responses without external API calls
 */
const generateLocalAIResponse = (moduleName, userInput, pastEntries = []) => {
  const inputLower = userInput.toLowerCase();
  
  // Detect themes
  const themes = {
    fear: /fear|afraid|anxious|worry|scared|nervous/i.test(inputLower),
    anger: /angry|furious|mad|frustrated|irritated|rage/i.test(inputLower),
    procrastination: /procrastinat|delay|avoid|putting off|later/i.test(inputLower),
    suffering: /pain|hurt|suffer|difficult|hard|struggle/i.test(inputLower),
    purpose: /purpose|meaning|why|point|worth/i.test(inputLower),
    discipline: /disciplin|habit|routine|consistency|practice/i.test(inputLower),
    relapse: /relapse|fail|gave in|slip|broke/i.test(inputLower),
    progress: /progress|better|improv|success|achiev/i.test(inputLower)
  };
  
  const detectedThemes = Object.keys(themes).filter(key => themes[key]);
  const primaryTheme = detectedThemes[0] || 'general';
  
  // Philosophical responses by theme
  const responses = {
    fear: [
      "Fear shows you what you value. The things you're afraid to lose reveal what matters most. But ask yourself: is this fear protecting you, or imprisoning you? Courage isn't the absence of fear—it's acting despite it.",
      "Your fear is a threshold guardian. Every meaningful transformation requires passing through anxiety. What lies on the other side of this fear? That's where your growth lives.",
      "The Stoics taught that we suffer more in imagination than in reality. Most of what you fear will never happen. And what does happen, you'll handle—because you always have."
    ],
    anger: [
      "Anger is energy seeking direction. It's neither good nor evil—it's power. The question isn't whether to feel it, but where to aim it. What injustice or boundary violation sparked this? Address that, not the symptom.",
      "Your anger reveals violated expectations. Something didn't go as it 'should.' But who wrote that rule? Examine whether your expectations serve you, or whether they're the real enemy.",
      "Rage is a teacher if you listen. It tells you where your boundaries are, what you won't tolerate, what you're unwilling to compromise on. Honor the message, then release the heat."
    ],
    procrastination: [
      "You're not lazy—you're conflicted. Part of you wants the outcome, another part resists the process. Which part is wiser? Sometimes procrastination protects you from misaligned goals. Sometimes it's just fear wearing a mask.",
      "Delaying action creates more suffering than taking it. The gap between knowing and doing is where self-respect erodes. Start smaller if you must, but start. Momentum creates clarity that thinking never will.",
      "What you resist persists. The task you're avoiding doesn't shrink with time—it grows teeth. Do the hard thing first, and watch how lightness returns to your day."
    ],
    suffering: [
      "Suffering without meaning is unbearable. But suffering with purpose transforms you. What is this pain teaching you that nothing else could? Extract the wisdom, or repeat the lesson.",
      "You can't control whether you suffer, but you can control what you become through it. Will this harden you or deepen you? Brittleness or resilience—that choice is always yours.",
      "Pain is inevitable; suffering is optional. One is what happens to you, the other is your relationship with it. You're adding a story to the sensation. What story are you telling, and does it serve you?"
    ],
    purpose: [
      "Meaning isn't found—it's created through commitment. You don't discover your purpose like a hidden treasure. You forge it through consistent action toward what calls to you, even faintly.",
      "The question 'what is my purpose?' is paralyzing. Ask instead: 'what am I willing to suffer for?' Your answer reveals your values. Purpose emerges from living those values daily.",
      "You don't need a grand purpose to live well. Start with who you are today: be honest, be disciplined, be useful. Meaning compounds from small actions consistently taken."
    ],
    discipline: [
      "Discipline is freedom. Every boundary you set, every temptation you resist, every promise you keep to yourself—these are deposits in the bank of self-trust. You're building a self you can rely on.",
      "You don't rise to your goals; you fall to your systems. Motivation is a spark. Discipline is the structure that keeps the fire burning when the spark fades. Build the structure.",
      "The gap between who you are and who you want to become is crossed through daily practice. Not heroic acts, not perfect days—just showing up when you don't feel like it. That's where transformation lives."
    ],
    relapse: [
      "A slip is not a fall. It's data. What triggered it? What was underneath the urge? Every relapse is a teacher if you ask the right questions. Shame is useless. Analysis is everything.",
      "You didn't lose progress—you revealed where the system needs strengthening. The weak point is now visible. Fortify it. Adjust the approach. Resume the path. This is how mastery is built.",
      "The path is not linear. Expect setbacks, but don't normalize them. Each relapse shows you what you haven't yet integrated. The question isn't 'why did I fail?' but 'what did I miss?'"
    ],
    progress: [
      "Progress is fractal—the same patterns that got you here will get you further. What worked? Why did it work? Codify it. Repeat it. Growth compounds when you understand its mechanics.",
      "Success is evidence of change, but don't let it breed complacency. The next level requires a new version of you. What got you here won't get you there. Keep evolving.",
      "Celebrate without inflating. Progress is real, but fragile. Momentum can reverse quickly. The mark of wisdom isn't hitting the peak—it's staying consistent when it's easy to coast."
    ],
    general: [
      "The unexamined life stays unchanged. You're here because something in you wants more—more clarity, more strength, more truth. That wanting is sacred. Honor it with action.",
      "Every entry you write is a conversation with your future self. What wisdom are you leaving behind? What pattern are you breaking? This work compounds invisibly until one day, you turn around and barely recognize who you used to be.",
      "Transformation doesn't announce itself with trumpets. It happens in the small moments—the choice made, the boundary held, the truth spoken. You're building something here. Trust the process."
    ]
  };
  
  // Get response for primary theme
  const themeResponses = responses[primaryTheme] || responses.general;
  const selectedResponse = themeResponses[Math.floor(Math.random() * themeResponses.length)];
  
  return selectedResponse;
};