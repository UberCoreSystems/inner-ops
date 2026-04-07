// AI utilities for generating reflections, insights, and feedback
import logger from './logger';
import { generateAIFeedback as generateOracleFeedback } from './aiFeedback';

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
        'bad-habit': "You're focusing heavily on changing daily patterns. Consider implementing replacement habits alongside elimination.",
        'negative-thought': "Your mental patterns seem to be a priority. Identify the specific thought loops driving this category.",
        'toxic-behavior': "You're targeting behavioral changes. Focus on understanding the triggers that lead to these behaviors.",
        addiction: "Breaking addictive patterns requires both willpower and environmental changes. Consider professional support.",
        fear: "Fear-based patterns are holding you back. Gradual exposure and building confidence could help.",
        procrastination: "Procrastination is often avoidance in disguise. What are you protecting yourself from by not starting?",
        other: "You're naming patterns that don't fit a clean category. Keep defining them precisely."
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
    logger.info("Generating local AI feedback (API calls removed for security)");

    try {
      return generateOracleFeedback(moduleName, userInput, pastEntries);
    } catch (error) {
      logger.error("Error generating AI feedback:", error);
      return "Continue your practice with inner discipline and honest reflection.";
    }
  }
};