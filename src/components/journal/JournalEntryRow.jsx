import { getMoodStripColor } from '../../constants/moods';
import { parseDate } from '../../utils/dateUtils';
import OracleReactionChip from './OracleReactionChip';

// Collapse an entry to one scannable line. Multi-line entries would blow the
// row height open even with `truncate`, so newlines fold to spaces first.
const snippetOf = (content) => {
  if (!content || typeof content !== 'string') return 'Empty entry';
  return content.replace(/\s+/g, ' ').trim() || 'Empty entry';
};

/**
 * One row in the entries list. The whole row is the tap target — edit and
 * archive live in the detail overlay, so there are no small hover-revealed
 * controls sitting inside a full-width button (unreachable on touch, and an
 * accidental-archive hazard).
 */
export default function JournalEntryRow({ entry, onOpen }) {
  const date = parseDate(entry.timestamp) || parseDate(entry.createdAt);
  const dateLabel = date
    ? date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : '—';
  const color = getMoodStripColor(entry.mood);
  const opacity = 0.25 + ((entry.intensity || 3) / 5) * 0.75;

  return (
    <button
      type="button"
      onClick={() => onOpen(entry.id)}
      className="w-full flex items-center gap-3 px-4 py-3 text-left border-b border-[#1a1a1a] last:border-b-0 hover:bg-[#0a0a0a] focus:outline-none focus:bg-[#0a0a0a] transition-colors"
      aria-label={`Open entry from ${dateLabel}`}
    >
      <span
        className="w-2.5 h-2.5 rounded-full shrink-0"
        style={{ backgroundColor: color, opacity }}
        title={entry.mood || 'No mood'}
      />
      <span className="text-[#858585] text-[11px] tabular-nums w-12 shrink-0">
        {dateLabel}
      </span>
      <span className="flex-1 min-w-0 truncate text-[#d1d1d1] text-sm">
        {snippetOf(entry.content)}
      </span>
      <span className="flex items-center gap-2 shrink-0">
        <OracleReactionChip reaction={entry.oracleReaction} />
        {entry.oracleJudgment && (
          <span className="w-1.5 h-1.5 rounded-full bg-[#a855f7]" title="Oracle reading recorded" />
        )}
      </span>
    </button>
  );
}
