/**
 * Daily prompt static fallback library + per-source UI metadata.
 *
 * The Oracle question pool drives daily prompts when the user has Oracle
 * responses on record. This library is the deterministic fallback for new
 * users (or when the pool is unavailable). The "150+ templates" claim in
 * the audit was high — actual count is 48 across 6 categories.
 *
 * Categories are intentionally aligned with Inner Ops product language
 * (no wellness framing, no motivational copy). Edit here, not in the
 * component.
 */

export const PROMPT_LIBRARY = {
  selfAwareness: [
    "What pattern keeps showing up in your life that you've been ignoring?",
    "What lie do you keep telling yourself to avoid change?",
    "What would your future self thank you for doing today?",
    "What are you pretending not to know about yourself?",
    "What emotion have you been avoiding feeling?",
    "Where in your life are you settling for less than you deserve?",
    "What old story about yourself needs to die?",
    "What part of yourself have you been hiding from others?",
  ],
  actionOriented: [
    "What's one small win you can secure before the day ends?",
    "What have you been procrastinating on that would take less than 10 minutes?",
    "What boundary do you need to set or reinforce today?",
    "What would you do today if you weren't afraid of failing?",
    "What's the most important thing you can do for your future self today?",
    "What habit have you been meaning to start? Start it now, imperfectly.",
    "Who do you need to have an honest conversation with?",
    "What would make today feel like a victory?",
  ],
  shadowWork: [
    "What triggers you most in others? What does that reveal about you?",
    "What do you judge in others that you secretly fear exists in yourself?",
    "What wound from your past are you still protecting?",
    "What part of yourself have you been at war with?",
    "What failure are you still carrying shame about?",
    "What do you fear others would think if they knew the real you?",
    "Where are you still seeking approval you don't need?",
    "What anger are you holding that's actually protecting deeper pain?",
  ],
  gratitude: [
    "What strength got you through your hardest moment this week?",
    "What challenge has secretly been a gift in disguise?",
    "Who in your life has believed in you when you didn't believe in yourself?",
    "What part of your journey are you proud of that others don't see?",
    "What lesson have you learned that you wouldn't trade for anything?",
    "What simple thing brought you unexpected peace recently?",
    "What ability do you take for granted that others would treasure?",
    "What past version of you would be amazed by who you are now?",
  ],
  clarity: [
    "What do you actually want? Not what you think you should want.",
    "If you couldn't fail, what would you be doing with your life?",
    "What needs to end for something new to begin?",
    "What's the difference between who you are and who you're becoming?",
    "What are you tolerating that's draining your energy?",
    "What decision have you been avoiding because you already know the answer?",
    "What would your life look like if you stopped people-pleasing?",
    "What does your ideal day look like? How far is today from that?",
  ],
  recovery: [
    "What trigger have you been blind to that keeps catching you off guard?",
    "What void are you trying to fill with destructive behavior?",
    "What would you tell someone you love who's in your exact situation?",
    "What moment of strength can you draw from when the urge hits?",
    "What are you running from when you reach for your vice?",
    "What has your addiction cost you that you're ready to reclaim?",
    "What small promise to yourself can you keep today to rebuild trust?",
    "What would 'one year sober you' say to you right now?",
  ],
};

// Per-source meta for Oracle-sourced prompts. `recovery` is the closest fit
// for relapse/kill modules' palette; `clarity` for synthesis; `shadowWork`
// for hard lessons. Journal stays on `selfAwareness`.
export const ORACLE_SOURCE_META = {
  journalEntries: { icon: 'search', label: 'From Your Journal', color: '#a855f7' },
  hardLessons: { icon: 'bolt', label: 'From a Hard Lesson', color: '#f59e0b' },
  relapseEntries: { icon: 'shield', label: 'From a Relapse Log', color: '#ef4444' },
  killTargets: { icon: 'target', label: 'From a Kill Escape', color: '#ef4444' },
  confirmedKills: { icon: 'target', label: 'From a Kill Closure', color: '#22c55e' },
  syntheses: { icon: 'clarity', label: 'From a Synthesis Briefing', color: '#00d4aa' },
};

export const STATIC_CATEGORY_META = {
  selfAwareness: { icon: 'search', label: 'Self-Awareness', color: '#a855f7' },
  actionOriented: { icon: 'bolt', label: 'Take Action', color: '#22c55e' },
  shadowWork: { icon: 'moon', label: 'Shadow Work', color: '#6366f1' },
  gratitude: { icon: 'heart', label: 'Gratitude', color: '#f59e0b' },
  clarity: { icon: 'clarity', label: 'Clarity', color: '#00d4aa' },
  recovery: { icon: 'shield', label: 'Recovery', color: '#ef4444' },
};
