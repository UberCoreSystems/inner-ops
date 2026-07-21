import { getMoodStripColor } from '../../constants/moods';
import { parseDate } from '../../utils/dateUtils';
import JournalEntryRow from './JournalEntryRow';

// Per-day cells for one month, so a collapsed group still shows the shape of
// that month at a glance. Mirrors the 30-day strip's encoding: valence color,
// opacity by intensity, blank cell for a day with no entry.
const MonthStrip = ({ group }) => {
  if (typeof group.year !== 'number') return null;
  const daysInMonth = new Date(group.year, group.month + 1, 0).getDate();

  const byDay = {};
  group.entries.forEach((e) => {
    const d = parseDate(e.timestamp) || parseDate(e.createdAt);
    if (d) byDay[d.getDate()] = e;
  });

  return (
    <div className="flex flex-1 gap-px min-w-0">
      {Array.from({ length: daysInMonth }, (_, i) => {
        const day = i + 1;
        const e = byDay[day];
        return (
          <div
            key={day}
            className="h-3 flex-1 rounded-[1px]"
            style={{
              backgroundColor: e ? getMoodStripColor(e.mood) : '#151515',
              opacity: e ? 0.25 + ((e.intensity || 3) / 5) * 0.75 : 1,
            }}
          />
        );
      })}
    </div>
  );
};

/**
 * One collapsible month section. Collapsed groups render no rows at all —
 * that omission is where the scroll saving comes from, so don't swap it for
 * a `hidden` class.
 */
export default function JournalMonthGroup({ group, isOpen, onToggle, onOpenEntry }) {
  return (
    <div className="oura-card">
      <button
        type="button"
        onClick={() => onToggle(group.key)}
        aria-expanded={isOpen}
        className="w-full sticky top-16 z-20 flex items-center gap-3 px-4 py-3 rounded-t-[20px] bg-[#080808]/95 backdrop-blur-sm hover:bg-[#111]/95 transition-colors"
      >
        <svg
          width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          className={`text-[#858585] shrink-0 transition-transform duration-300 ${isOpen ? 'rotate-90' : ''}`}
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
        <span className="text-white text-xs uppercase tracking-widest shrink-0">{group.label}</span>
        <span className="text-[#858585] text-[11px] tabular-nums shrink-0">
          {group.entries.length}
        </span>
        <span className="hidden sm:flex flex-1 min-w-0 pl-2">
          <MonthStrip group={group} />
        </span>
      </button>

      {isOpen && (
        <div>
          {group.entries.map((entry) => (
            <JournalEntryRow key={entry.id} entry={entry} onOpen={onOpenEntry} />
          ))}
        </div>
      )}
    </div>
  );
}
