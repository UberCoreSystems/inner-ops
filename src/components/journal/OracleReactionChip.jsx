import { arcChipLabel } from '../../utils/followUpArc';

// The chip on an entry row and its detail: how he responded to the reading
// and how it ended — "Pushed back · evaded", "It landed · contracted",
// "Sitting with it · ×2" — or the legacy reaction on entries from before the
// four responses. One resolver (followUpArc.js) so the two never drift apart.
const TONES = {
  neutral:    'text-[#ababab] border-[#2a2a2a]',
  evaded:     'text-[#f59e0b] border-[#f59e0b]/30',
  contracted: 'text-white border-white/30',
  // Legacy reactions keep their colours.
  landed:     'text-white border-white/30',
  disagree:   'text-[#b45309] border-[#b45309]/30',
  sit:        'text-[#ababab] border-[#2a2a2a]',
  missed:     'text-[#858585] border-[#2a2a2a]',
};

export default function OracleReactionChip({ entry, className = '' }) {
  const chip = arcChipLabel(entry);
  if (!chip) return null;
  const tone = TONES[chip.tone] || TONES.neutral;

  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-lg border bg-transparent whitespace-nowrap ${tone} ${className}`}>
      {chip.label}
    </span>
  );
}
