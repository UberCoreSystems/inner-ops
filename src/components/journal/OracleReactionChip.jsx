// The user's recorded reaction to an Oracle reading. Shared by the compact
// entry row and the detail overlay so the two never drift apart.
const REACTIONS = {
  landed:   { label: 'Landed',    className: 'text-white border-white/30' },
  disagree: { label: 'Disagreed', className: 'text-[#b45309] border-[#b45309]/30' },
  sit:      { label: 'Sitting',   className: 'text-[#ababab] border-[#2a2a2a]' },
  missed:   { label: 'Missed',    className: 'text-[#858585] border-[#2a2a2a]' },
};

export default function OracleReactionChip({ reaction, className = '' }) {
  if (typeof reaction !== 'string') return null;
  const config = REACTIONS[reaction];
  if (!config) return null;

  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-lg border bg-transparent whitespace-nowrap ${config.className} ${className}`}>
      {config.label}
    </span>
  );
}
