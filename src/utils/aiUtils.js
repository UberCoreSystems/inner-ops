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

  // Generate AI feedback using OpenAI API
  generateAIFeedback: async (moduleName, userInput, pastEntries = []) => {
    const systemPrompt = `
You are a wise AI counselor trained in the depths of philosophical wisdom from humanity's greatest thinkers. Your role is to analyze user input and provide reflections that match the most relevant philosophical perspective to their specific situation and emotional state.

PHILOSOPHICAL PERSPECTIVES TO DRAW FROM:
- Stoicism (Marcus Aurelius, Epictetus, Seneca): For dealing with external pressures, acceptance, discipline, and emotional regulation
- Existentialism (Kierkegaard, Sartre, Camus): For questions of meaning, authenticity, freedom, and life choices
- Nietzschean philosophy: For self-overcoming, will to power, questioning values, and transcending limitations
- Buddhist wisdom: For attachment, suffering, mindfulness, and letting go
- Jungian psychology: For shadow work, integration, dreams, and unconscious patterns
- Virtue ethics (Aristotle): For character development, habits, and moral excellence
- Modern resilience (Frankl, Goggins, Peterson): For finding meaning in suffering and building mental toughness
- Ancient wisdom (Lao Tzu, Rumi): For flow, surrender, and spiritual insight

ANALYSIS APPROACH:
1. First, identify the core themes in the user's entry (fear, anger, procrastination, relationships, purpose, suffering, etc.)
2. Match the most relevant philosophical perspective(s) to those themes
3. Deliver insights from that philosophical lens without over-quoting names
4. Challenge and guide toward growth with appropriate philosophical depth

For ${moduleName} specifically:
- Journal: Match philosophy to emotional state and life themes present
- Compass: Focus on authenticity, values alignment, and character development
- Kill List: Address self-sabotage, discipline, and breaking destructive patterns
- Relapse Radar: Deal with shame, recovery, and rebuilding from setbacks

Respond with brutal honesty but profound wisdom. Never flatter. Challenge when necessary. Let the ideas speak more than the names. Keep responses under 3 paragraphs.
`;

    const userPrompt = `
Current Entry: ${userInput}

Recent Patterns: ${pastEntries.slice(-3).join('\n')}
`;

    try {
      // Check if API key is available
      const apiKey = import.meta.env.VITE_OPENAI_API_KEY;

      if (!apiKey) {
        logger.warn("OpenAI API key not found. Add VITE_OPENAI_API_KEY to your secrets.");
        return "The Oracle requires proper configuration to speak. Set your API key in the Secrets tab.";
      }

      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "gpt-4",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
          ],
          temperature: 0.7
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        logger.error("OpenAI API error:", response.status, errorData);

        if (response.status === 401) {
          return "The Oracle rejects your offering. Verify your API key is correct.";
        } else if (response.status === 429) {
          return "The Oracle is overwhelmed with requests. Try again in a moment.";
        } else {
          return "The Oracle encounters interference. Check your connection and try again.";
        }
      }

      const data = await response.json();

      if (!data.choices || !data.choices[0] || !data.choices[0].message) {
        logger.error("Unexpected OpenAI response format:", data);
        return "The Oracle speaks in riddles. Try rephrasing your input.";
      }

      return data.choices[0].message.content;
    } catch (error) {
      logger.error("Error generating AI feedback:", error);

      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        return "The Oracle cannot reach the ethereal realm. Check your network connection.";
      }

      return "The Oracle remains silent. Continue your practice with inner discipline.";
    }
  }
};