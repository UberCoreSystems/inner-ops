/**
 * relapseTaxonomy — recovery-tradition vocabulary for Signal Module patterns.
 *
 * Labels are drawn from CBT cognitive distortions, AA character defects, and
 * NA precursor language so the categories are immediately recognizable to
 * anyone with recovery exposure. Internal IDs are preserved (still the
 * original identity-noun strings) so historical entries and drift-detection
 * archetype counts continue to work without a data migration. The resolver
 * functions translate ID → display label at render time.
 *
 * Habit labels intentionally mirror the IDs verbatim — plain English instead
 * of jargon — because the original IDs are already clear behavioral
 * descriptions ("Excessive social media scrolling", "Isolation").
 */

export const ARCHETYPE_IDS = [
  'The Addict',
  'The Victim',
  'The Procrastinator',
  'The Pessimist',
  'The Perfectionist',
  'The People-Pleaser',
  'The Imposter',
  'The Self-Saboteur',
];

export const ARCHETYPE_LABELS = {
  'The Addict': 'Craving / Urge',
  'The Victim': 'Blaming',
  'The Procrastinator': 'Avoidance',
  'The Pessimist': 'Catastrophizing',
  'The Perfectionist': 'Perfectionism',
  'The People-Pleaser': 'People-pleasing',
  'The Imposter': 'Denial / Minimizing',
  'The Self-Saboteur': 'Self-sabotage',
};

export function resolveArchetypeLabel(value) {
  return (value && ARCHETYPE_LABELS[value]) || value || '';
}

export const HABIT_IDS = [
  'Excessive social media scrolling',
  'Binge eating',
  'Procrastination',
  'Negative self-talk',
  'Isolation',
  'Overthinking',
  'Comparing myself to others',
  'Avoiding responsibilities',
];

// Habit labels mirror their IDs — plain English already; no re-jargoning.
export const HABIT_LABELS = {
  'Excessive social media scrolling': 'Excessive social media scrolling',
  'Binge eating': 'Binge eating',
  'Procrastination': 'Procrastination',
  'Negative self-talk': 'Negative self-talk',
  'Isolation': 'Isolation',
  'Overthinking': 'Overthinking',
  'Comparing myself to others': 'Comparing myself to others',
  'Avoiding responsibilities': 'Avoiding responsibilities',
};

export function resolveHabitLabel(value) {
  return (value && HABIT_LABELS[value]) || value || '';
}

// Substances: 'Caffeine (excessive)' was removed from the active list as a
// category error. Legacy entries still resolve via the map below.
export const SUBSTANCE_OPTIONS = [
  'Alcohol',
  'Nicotine',
  'Cannabis',
  'Sugar (excessive)',
  'None',
];

export const SUBSTANCE_LEGACY_LABELS = {
  'Caffeine (excessive)': 'Caffeine dependency (legacy)',
};

export function resolveSubstanceLabel(value) {
  return (value && SUBSTANCE_LEGACY_LABELS[value]) || value || '';
}

/**
 * formatDriftSignalText — renders a drift signal as bare lowercase prose.
 * UXR-002 Spec 4: drift signals are rendered without colored badges, alarm
 * icons, or alert-state visuals. The language carries the weight.
 */
export function formatDriftSignalText(signal) {
  if (!signal) return '';
  if (signal.type === 'archetype_frequency') {
    const label = resolveArchetypeLabel(signal.archetype);
    const days = signal.streak != null ? `, ${signal.streak} consecutive days` : '';
    return `drift signal: ${label} active${days}`;
  }
  if (signal.type === 'precursor_pattern') {
    const days = signal.streak != null ? `${signal.streak} consecutive days` : 'multiple days';
    return `drift signal: ${signal.condition} present before ${days} of relapses`;
  }
  if (signal.type === 'correlated_escape') {
    const archetypeLabel = signal.entryArchetype ? resolveArchetypeLabel(signal.entryArchetype) : null;
    const archetypeSuffix = archetypeLabel ? `, archetype: ${archetypeLabel}` : '';
    return `drift signal: kill list escape and relapse entry within 48h — target: ${signal.targetTitle}${archetypeSuffix}`;
  }
  if (signal.type === 'life_transition') {
    const days = signal.streak != null ? `${signal.streak} consecutive days` : 'multiple days';
    return `drift signal: routine disruption state across ${days}`;
  }
  const base = (signal.description || signal.type || '').toString();
  return base ? base.toLowerCase() : '';
}
