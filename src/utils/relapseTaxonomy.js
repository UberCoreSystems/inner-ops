/**
 * relapseTaxonomy — UXR-002 Spec 4
 *
 * Behavioral-descriptor labels for the Relapse Radar archetype and habit
 * taxonomy. Separates stable IDs (what is persisted on
 * relapseEntries.selectedSelf / .selectedHabits) from mutable display labels.
 *
 * Why this split exists: identity-noun labels like "The Victim" / "The Addict"
 * rehearse a negative self-view every time the user selects one. Per
 * self-verification theory (Swann), negative self-views are self-reinforcing
 * when labels match. The module names the event (Responsibility abdication,
 * Compulsive return), not the actor.
 *
 * Backward compatibility: archetype and habit IDs are the original display
 * strings. Historical entries continue to match without migration; the
 * resolver functions simply translate the ID to the behavioral-descriptor
 * label at render time. Drift detection continues to receive IDs.
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
  'The Addict': 'Compulsive return',
  'The Victim': 'Responsibility abdication',
  'The Procrastinator': 'Avoidance drift',
  'The Pessimist': 'Foreclosure reflex',
  'The Perfectionist': 'Standard-inflation freeze',
  'The People-Pleaser': 'Approval-contingent action',
  'The Imposter': 'Signal-suppression mode',
  'The Self-Saboteur': 'Self-undermining action',
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

export const HABIT_LABELS = {
  'Excessive social media scrolling': 'Scroll-state compulsion',
  'Binge eating': 'Consumption dysregulation',
  'Procrastination': 'Task-avoidance loop',
  'Negative self-talk': 'Internal prosecution',
  'Isolation': 'Withdrawal pattern',
  'Overthinking': 'Rumination loop',
  'Comparing myself to others': 'External-referent fixation',
  'Avoiding responsibilities': 'Obligation evasion',
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
