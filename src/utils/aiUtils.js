export const aiUtils = {
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
};