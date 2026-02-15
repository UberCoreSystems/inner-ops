export const feedbackFixtures = [
  {
    name: 'Fear and avoidance at work',
    moduleName: 'journal',
    entryText: 'I keep avoiding the hard conversation with my manager. I tell myself tomorrow, then waste two hours scrolling and feel ashamed at night.',
    expectedThemes: ['fear_avoidance', 'shame'],
    expectedLenses: ['Stoicism', 'Musashi']
  },
  {
    name: 'Relapse risk and impulse',
    moduleName: 'relapse',
    entryText: 'Urge hit hard after dinner. I slipped back into the same loop, then justified it as stress relief. I feel like I reset everything.',
    expectedThemes: ['relapse_risk', 'impulse'],
    expectedLenses: ['Krishnamurti/Buddha', 'Musashi']
  },
  {
    name: 'Leadership and strategy failure',
    moduleName: 'hardLessons',
    entryText: 'I trusted a partner without verification, ignored two warning signs, and our team paid for it. I need a stronger rule for delegation.',
    expectedThemes: ['leadership', 'strategy'],
    expectedLenses: ['Sun Tzu', 'Machiavelli/Greene']
  }
];
