import React from 'react';

/**
 * BehavioralRecordDensity — a factual census of the raw mass of work the user
 * has produced across modules. Not a score, not a rank, not progress. Each
 * line is a count of artifacts that required real effort to create:
 *
 *   - autopsies require context + rationalization (KillList.jsx submit guard)
 *   - finalized rules require the full 6-part forensic structure
 *   - kills require the user-set consecutive-day threshold held
 *
 * Rendering rules:
 *   - Only non-zero lines render. Zero is visual clutter.
 *   - If every field is zero (brand-new user), a single prose line explains
 *     the inventory is empty. No encouragement, no CTA.
 *   - Numbers use `tabular-nums` for clean column alignment.
 *   - Labels are lowercase, matching the prose-only register established by
 *     SignalReport and the drift-signal surface on Dashboard.
 *   - No icons, no bars, no color coding, no comparative language.
 *
 * @param {{ density: {
 *   autopsies: number,
 *   rulesFinalized: number,
 *   kills60Plus: number,
 *   kills21Plus: number,
 *   activeDriftSignals: number,
 *   structuredJournalEntries: number
 * } | null }} props
 */
export default function BehavioralRecordDensity({ density }) {
  if (!density) {
    return <p className="text-[#5a5a5a] text-sm">Loading behavioral record…</p>;
  }

  const {
    autopsies = 0,
    rulesFinalized = 0,
    kills60Plus = 0,
    kills21Plus = 0,
    activeDriftSignals = 0,
    structuredJournalEntries = 0,
  } = density;

  // Kills ≥21 is the full-kill population; kills ≥60 is a strict subset. Show
  // 60+ on its own line only when it's non-zero AND there are additional
  // 21–59 kills to distinguish it from. Otherwise the single ≥21 line carries
  // the information without redundancy.
  const has60 = kills60Plus > 0;
  const has21Additional = kills21Plus > kills60Plus;

  const lines = [];

  if (autopsies > 0) {
    lines.push({
      key: 'autopsies',
      value: autopsies,
      label: `autops${autopsies === 1 ? 'y' : 'ies'} written`,
    });
  }

  if (rulesFinalized > 0) {
    lines.push({
      key: 'rules',
      value: rulesFinalized,
      label: `rule${rulesFinalized === 1 ? '' : 's'} finalized`,
    });
  }

  if (has60) {
    lines.push({
      key: 'kills60',
      value: kills60Plus,
      label: `kill${kills60Plus === 1 ? '' : 's'} at ≥60 consecutive days held`,
    });
  }

  if (has21Additional || (!has60 && kills21Plus > 0)) {
    lines.push({
      key: 'kills21',
      value: kills21Plus,
      label: `kill${kills21Plus === 1 ? '' : 's'} at ≥21 consecutive days held`,
    });
  }

  if (activeDriftSignals > 0) {
    lines.push({
      key: 'drift',
      value: activeDriftSignals,
      label: `active drift signal${activeDriftSignals === 1 ? '' : 's'}`,
    });
  }

  if (structuredJournalEntries > 0) {
    lines.push({
      key: 'journal',
      value: structuredJournalEntries,
      label: `journal entr${structuredJournalEntries === 1 ? 'y' : 'ies'} with structural frame`,
    });
  }

  if (lines.length === 0) {
    return (
      <p className="text-[#8a8a8a] text-sm lowercase">
        record empty. the inventory fills as work accumulates.
      </p>
    );
  }

  return (
    <ul className="space-y-1.5 text-sm">
      {lines.map(({ key, value, label }) => (
        <li key={key} className="flex items-baseline gap-3">
          <span className="text-white tabular-nums font-medium min-w-[3ch] text-right">
            {value}
          </span>
          <span className="text-[#8a8a8a] lowercase">{label}</span>
        </li>
      ))}
    </ul>
  );
}
