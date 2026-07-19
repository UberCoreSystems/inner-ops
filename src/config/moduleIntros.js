/**
 * Copy and configuration for the per-module first-run intro panels.
 *
 * Pure data, no JSX, so copy edits produce readable diffs and can be reviewed
 * as writing rather than as code.
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
 */

export const MODULE_INTROS = Object.freeze([
  {
    id: 'journal',
    accent: '#a855f7',
    eyebrow: 'Journal',
    what: 'Raw input. Everything the system knows about you starts here.',
    example: 'Skipped the gym again. Told myself I was tired. I wasn’t — I was avoiding the call with my father.',
    actionLabel: 'Write today’s entry',
    actionRoute: null,
  },
  {
    id: 'ledger',
    accent: '#ef4444',
    eyebrow: 'General Ledger',
    what: 'Contracts against the patterns costing you the most. One line each, held daily.',
    example: 'No phone in bed. Sixty consecutive days. Checked in every night — held or escaped. There is no third option.',
    actionLabel: 'Name your first target',
    actionRoute: null,
  },
  {
    id: 'hardlessons',
    accent: '#f59e0b',
    eyebrow: 'Hard Lessons',
    what: 'A cost you already paid, converted into a rule you carry forward.',
    example: 'Cost: lost the contract by going quiet for three weeks. Rule: when I want to disappear, I send the email first.',
    actionLabel: 'Record a lesson',
    actionRoute: null,
  },
  {
    id: 'relapse',
    accent: '#00d4aa',
    eyebrow: 'The Signal',
    what: 'Where you log the slip and what preceded it. Drift is read from the pattern, not the incident.',
    example: '11:40pm. Alone. Third night this week. The trigger was the argument, not the boredom.',
    actionLabel: 'Log a signal',
    actionRoute: null,
  },
  {
    id: 'synthesis',
    accent: '#4da6ff',
    eyebrow: 'Synthesis Briefing',
    what: 'A cross-module read. What your journal, ledger, lessons, and signals say when compared against each other.',
    example: 'Your ledger says the target is discipline. Your journal says you have not written since the day you set it.',
    actionLabel: 'Run a briefing',
    actionRoute: null,
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
