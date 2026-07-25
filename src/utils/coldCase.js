// Cold Case Protocol — pure helpers for reopening a confirmed kill.
//
// A confirmed kill is never un-killed. When the user reports the pattern
// moving again, the protocol hands the Oracle the full file — closure note,
// pre-committed intention, and the escape autopsies with the user's own
// rationalizations verbatim — so the comparison is against the record, not
// against memory. Re-engaging drafts a NEW contract linked by lineage.
import { categories } from './killListCategories.js';

const CLOSURE_TAG_LABELS = {
  identity_shifted: 'identity shifted',
  environment_changed: 'environment changed',
  cost_unbearable: 'cost became unbearable',
};

// Escape autopsies embedded in the Oracle prompt. Long wars accumulate
// breaches; the most recent ones carry the rationalizations most likely to
// resurface, and the cap keeps the prompt bounded.
const ESCAPES_IN_PROMPT = 6;

const toDateSafe = (value) => {
  if (!value) return null;
  const d = value?.toDate ? value.toDate() : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

const formatDate = (value) => {
  const d = toDateSafe(value);
  return d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
};

const categoryLabel = (value) =>
  categories.find(c => c.value === value)?.label || '';

export function buildColdCaseEntryText(kill, description, now = new Date()) {
  if (!kill) return '';
  const lines = [];

  const label = categoryLabel(kill.category);
  const killedStr = formatDate(kill.killedAt);
  const duration = Number(kill.activeDuration) || 0;
  const streak = Number(kill.streak) || 0;
  lines.push(
    `Cold case reopened: "${kill.title}"${label ? ` — a ${label}` : ''}.` +
    ` Killed${killedStr ? ` ${killedStr}` : ''} after ${duration} days under contract; final streak ${streak}.`
  );

  if (kill.closureNote) {
    lines.push(`What ended it, in the user's words at the time: "${kill.closureNote}"`);
  }
  const tags = Array.isArray(kill.closureTags) ? kill.closureTags.filter(Boolean) : [];
  if (tags.length) {
    lines.push(`Closure framing: ${tags.map(t => CLOSURE_TAG_LABELS[t] || t).join(', ')}.`);
  }

  const intention = kill.implementationIntention;
  if (intention?.trigger && intention?.response) {
    lines.push(`Pre-committed clause: when ${intention.trigger}, I will ${intention.response}.`);
  }

  const escapes = Array.isArray(kill.escapeData) ? kill.escapeData.filter(Boolean) : [];
  if (escapes.length) {
    const shown = escapes.slice(-ESCAPES_IN_PROMPT);
    const header = escapes.length > shown.length
      ? `Breached ${escapes.length} times before the kill (showing last ${shown.length}):`
      : `Breached ${escapes.length} time${escapes.length !== 1 ? 's' : ''} before the kill:`;
    lines.push(header);
    shown.forEach((e) => {
      const parts = [`[${e.date || 'undated'}, streak ${Number(e.streakAtEscape) || 0}]`];
      if (e.context) parts.push(`Context: ${e.context}.`);
      if (e.rationalization) parts.push(`Told themselves: "${e.rationalization}".`);
      if (e.prevention) parts.push(`Prevention filed: ${e.prevention}.`);
      lines.push(parts.join(' '));
    });
  }

  const killedDate = toDateSafe(kill.killedAt);
  const daysSince = killedDate
    ? Math.max(0, Math.round((now.getTime() - killedDate.getTime()) / 86400000))
    : null;
  lines.push(
    `Today${daysSince !== null ? `, ${daysSince} days after the kill,` : ','} the user reports movement: "${description}"`
  );
  lines.push(
    'Compare the report against the file. Is this the same pattern resurfacing or a new target wearing its clothes? ' +
    'If the old rationalizations match what they are describing now, quote their own words back at them.'
  );

  return lines.join('\n');
}

// Seed the new-contract form from the file. The last escape's prevention is
// the sharpest available response clause — it names what would have stopped
// the breach; the original intention is the fallback.
export function buildReengagePrefill(kill) {
  const escapes = Array.isArray(kill?.escapeData) ? kill.escapeData.filter(Boolean) : [];
  const lastEscape = escapes.length ? escapes[escapes.length - 1] : null;
  const intention = kill?.implementationIntention || {};
  const parsedDays = parseInt(kill?.consecutiveDaysRequired, 10);
  const killedDate = toDateSafe(kill?.killedAt);

  return {
    title: kill?.title || '',
    category: kill?.category || 'bad-habit',
    days: Number.isFinite(parsedDays) ? parsedDays : null,
    intention: {
      trigger: intention.trigger || lastEscape?.context || '',
      response: lastEscape?.prevention || intention.response || '',
    },
    description: lastEscape?.prevention || null,
    engagementCount: (Number(kill?.engagementCount) || 1) + 1,
    priorKillDays: Number(kill?.activeDuration) || 0,
    priorKilledAt: killedDate ? killedDate.toISOString() : null,
  };
}

const ORDINAL_WORDS = {
  2: 'SECOND', 3: 'THIRD', 4: 'FOURTH', 5: 'FIFTH', 6: 'SIXTH',
  7: 'SEVENTH', 8: 'EIGHTH', 9: 'NINTH', 10: 'TENTH',
};

export function engagementLineageLabel(target) {
  const count = Number(target?.engagementCount);
  if (!Number.isFinite(count) || count < 2) return null;

  const ordinal = ORDINAL_WORDS[count]
    ? `${ORDINAL_WORDS[count]} ENGAGEMENT`
    : `ENGAGEMENT #${count}`;

  const killDays = Number(target?.priorKillDays) || 0;
  const dateStr = formatDate(target?.priorKilledAt);
  if (!killDays && !dateStr) return { ordinal, detail: null };

  const which = count === 2 ? 'first kill' : 'last kill';
  const parts = [];
  if (killDays) parts.push(`${killDays} days`);
  if (dateStr) parts.push(dateStr);
  return { ordinal, detail: `${which}: ${parts.join(', ')}` };
}
