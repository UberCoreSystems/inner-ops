/**
 * Copy and configuration for the per-module first-run intro panels.
 *
 * Pure data, no JSX, so copy edits produce readable diffs and can be reviewed
 * as writing rather than as code.
 *
 * `definition` is rendered by the PAGE HEADER, not by the intro card, and it
 * is the reason this file is not purely about first-run. A definition that
 * disappears the moment the intro is dismissed is a definition the user can
 * never look up again — and dismissal is permanent here. The headers
 * previously carried mottos ("Write freely", "Catch the drift before it
 * compounds"), which tell you what to do without ever saying what the thing
 * is. Both live in one place so the two cannot drift apart.
 *
 * The intro card therefore leads with `example`: with the definition already
 * overhead, a sample entry is the part that is genuinely additive, and it
 * teaches the shape and depth of an answer, which is what new users most often
 * get wrong.
 *
 * Voice rules (non-negotiable, see CLAUDE.md): second person, declarative,
 * short. No encouragement, no wellness framing, no exclamation marks, no
 * emoji. Every `example` is a sample of what a real entry looks like — it
 * teaches the expected shape and depth of an answer, which is the single
 * thing new users get wrong.
 *
 * `accent` matches each module's established colour so the panel reads as
 * part of the page it introduces rather than as a generic notice.
 *
 * `actionRoute: null` means the action is in-page; ModuleIntro then requires
 * an `onAction` handler and renders a button instead of a link.
 *
 * `entrySelector` is the control the action promises — the field where the
 * entry is actually made. ModuleIntro scrolls it into view and focuses it after
 * `onAction` runs, so the page lands on the input rather than at the top. The
 * page handler's only job is the state change (open a collapsed form); it does
 * not scroll or focus.
 */

export const MODULE_INTROS = Object.freeze([
  {
    id: 'journal',
    accent: '#a855f7',
    eyebrow: 'Journal',
    definition: 'Raw input. Everything the system knows about you starts here.',
    example: 'Skipped the gym again. Told myself I was tired. I wasn’t — I was avoiding the call with my father.',
    actionLabel: 'Write today’s entry',
    actionRoute: null,
    entrySelector: '#journal-entry-input',
  },
  {
    id: 'ledger',
    accent: '#ef4444',
    eyebrow: 'General Ledger',
    definition: 'Contracts against the patterns costing you the most. One line each, held daily.',
    example: 'No phone in bed. Sixty consecutive days. Checked in every night — held or escaped. There is no third option.',
    actionLabel: 'Name your first target',
    actionRoute: null,
    entrySelector: '#kill-target-name',
  },
  {
    id: 'hardlessons',
    accent: '#f59e0b',
    eyebrow: 'Hard Lessons',
    definition: 'A cost you already paid, converted into a rule you carry forward.',
    example: 'Cost: lost the contract by going quiet for three weeks. Rule: when I want to disappear, I send the email first.',
    actionLabel: 'Record a lesson',
    actionRoute: null,
    entrySelector: '#hard-lessons-event',
  },
  {
    id: 'relapse',
    accent: '#00d4aa',
    eyebrow: 'The Signal',
    definition: 'Where you log the slip and what preceded it. Drift is read from the pattern, not the incident.',
    example: '11:40pm. Alone. Third night this week. The trigger was the argument, not the boredom.',
    actionLabel: 'Log a signal',
    actionRoute: null,
    entrySelector: '#quick-signal-input',
  },
  {
    id: 'synthesis',
    accent: '#4da6ff',
    eyebrow: 'Synthesis Briefing',
    // Synthesis is the one module whose header already stated what it is
    // rather than what to do, so its existing wording is kept verbatim. The
    // alternative drafted during the copy pass — "A cross-module read. What
    // your journal, ledger, lessons, and signals say when compared against
    // each other." — names the inputs more concretely if this ever reads as
    // too abstract.
    definition: 'Cross-module behavioral intelligence. What your own data reveals across domains.',
    example: 'Your ledger says the target is discipline. Your journal says you have not written since the day you set it.',
    actionLabel: 'Run a briefing',
    actionRoute: null,
    entrySelector: '#synthesis-generate',
  },
]);

const BY_ID = Object.freeze(
  MODULE_INTROS.reduce((acc, intro) => {
    acc[intro.id] = intro;
    return acc;
  }, {})
);

export const getModuleIntro = (id) => BY_ID[id] || null;

export default MODULE_INTROS;
