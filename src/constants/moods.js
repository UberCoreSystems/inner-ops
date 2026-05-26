// Mood taxonomy — shared between the Journal page and the Today's Reflection modal.
// Three valence categories × four moods each. Colors are mood-semantic
// (Energized blue, Grounded grey, Challenged amber) and intentionally
// distinct from the per-module accent palette so a journal entry's mood
// reads independently of which surface it was captured from.

export const moodCategories = [
  {
    name: 'Energized',
    color: '#4da6ff',
    bgColor: 'bg-[#4da6ff]/10',
    borderColor: 'border-[#4da6ff]',
    moods: [
      { label: 'Electric', value: 'electric', description: 'Charged and alive' },
      { label: 'Light', value: 'light', description: 'Unburdened and free' },
      { label: 'Radiant', value: 'radiant', description: 'Glowing from within' },
      { label: 'Triumphant', value: 'triumphant', description: 'Victorious and proud' },
    ],
  },
  {
    name: 'Grounded',
    color: '#8a8a8a',
    bgColor: 'bg-[#1a1a1a]',
    borderColor: 'border-white/40',
    moods: [
      { label: 'Focused', value: 'focused', description: 'Clear and intentional' },
      { label: 'Sharp', value: 'sharp', description: 'Precise and alert' },
      { label: 'Steady', value: 'steady', description: 'Balanced and stable' },
      { label: 'Calm', value: 'calm', description: 'Peaceful and still' },
    ],
  },
  {
    name: 'Challenged',
    color: '#b45309',
    bgColor: 'bg-[#b45309]/10',
    borderColor: 'border-[#b45309]',
    moods: [
      { label: 'Heavy', value: 'heavy', description: 'Weighed down' },
      { label: 'Hollow', value: 'hollow', description: 'Empty inside' },
      { label: 'Foggy', value: 'foggy', description: 'Unclear and hazy' },
      { label: 'Chaotic', value: 'chaotic', description: 'Scattered energy' },
    ],
  },
];

export const moodOptions = moodCategories.flatMap(cat =>
  cat.moods.map(m => ({ ...m, category: cat.name, color: cat.color }))
);

export const intensityLevels = [
  { value: 1, label: 'Subtle', description: 'A whisper in the background', rings: 1 },
  { value: 2, label: 'Present', description: 'Noticeable but manageable', rings: 2 },
  { value: 3, label: 'Strong', description: 'Commanding your attention', rings: 3 },
  { value: 4, label: 'Overwhelming', description: 'Hard to ignore', rings: 4 },
  { value: 5, label: 'Consuming', description: 'All-encompassing', rings: 5 },
];
