import React from 'react';

/**
 * BehavioralRecord — the effort-weighted census at the center of the Oracle
 * card. Two labeled groups: Execution (hard-won artifacts) and Intelligence
 * (synthesis engagement). Data comes pre-computed from computeBehavioralRecord;
 * this component only decides what shows.
 *
 * Rendering rules (match the product's factual, non-gamified register):
 *   - Only non-zero count lines render; a group with no visible lines is
 *     omitted, label and all.
 *   - Returns null when the whole record is empty, so a brand-new or cold
 *     account sees nothing here — it fills as work accumulates.
 *   - Numerals are tabular for column alignment; labels are lowercase prose.
 *     No scores, ranks, bars, icons, or color-coding.
 *
 * @param {{ record: { execution: object, intelligence: object, isEmpty: boolean } | null }} props
 */
function BehavioralRecord({ record }) {
  if (!record || record.isEmpty) return null;

  const { execution: ex, intelligence: intel } = record;
  const plural = (n) => (n === 1 ? '' : 's');

  // Execution lines. Kills are cumulative tiers: ≥60 is a strict subset of ≥21,
  // so show the ≥60 line when non-zero and the ≥21 line only when it adds
  // information (there are kills below 60, or there is no ≥60 line at all).
  const has60 = ex.kills60 > 0;
  const has21Additional = ex.kills21 > ex.kills60;
  const executionLines = [
    has60 && { key: 'k60', value: ex.kills60, label: `kill${plural(ex.kills60)} held ≥60 days` },
    (has21Additional || (!has60 && ex.kills21 > 0)) && {
      key: 'k21', value: ex.kills21, label: `kill${plural(ex.kills21)} held ≥21 days`,
    },
    ex.autopsies > 0 && { key: 'aut', value: ex.autopsies, label: `autops${ex.autopsies === 1 ? 'y' : 'ies'} written` },
    ex.rulesHeld > 0 && { key: 'rul', value: ex.rulesHeld, label: `rule${plural(ex.rulesHeld)} held unbroken` },
    ex.deepEntries > 0 && { key: 'dep', value: ex.deepEntries, label: `journal entr${ex.deepEntries === 1 ? 'y' : 'ies'} at depth` },
  ].filter(Boolean);

  // Intelligence lines. Cadence renders whenever a synthesis exists (value may
  // be 0 = "ran today"); the counts render only when non-zero.
  const intelligenceLines = [
    intel.briefings > 0 && { key: 'bri', value: intel.briefings, label: `briefing${plural(intel.briefings)} generated` },
    intel.reckonings > 0 && { key: 'rec', value: intel.reckonings, label: `reckoning${plural(intel.reckonings)} faced` },
    intel.contradictions > 0 && { key: 'con', value: intel.contradictions, label: `contradiction${plural(intel.contradictions)} surfaced` },
    intel.daysSinceLastBriefing !== null && {
      key: 'cad', value: intel.daysSinceLastBriefing,
      label: `day${plural(intel.daysSinceLastBriefing)} since last briefing`,
    },
  ].filter(Boolean);

  const bothGroups = executionLines.length > 0 && intelligenceLines.length > 0;

  const Line = ({ value, label }) => (
    <li className="flex items-baseline gap-3">
      <span className="text-white tabular-nums font-medium min-w-[3ch] text-right">{value}</span>
      <span className="text-[#ababab] lowercase">{label}</span>
    </li>
  );

  const Group = ({ label, lines }) => (
    lines.length > 0 ? (
      <div>
        <p className="text-[#858585] text-[10px] uppercase tracking-widest mb-2">{label}</p>
        <ul className="space-y-1.5 text-sm">
          {lines.map(({ key, value, label: l }) => <Line key={key} value={value} label={l} />)}
        </ul>
      </div>
    ) : null
  );

  return (
    <div className="mt-6 pt-6 border-t border-[#1a1a1a]">
      <h2 className="text-[#858585] text-xs uppercase tracking-widest mb-4">The Record</h2>
      {/* Side by side from sm up so the card stays short; stacked below that.
          A hairline rule divides the columns only when both groups are present
          — a lone group stays full-width rather than a widowed half. */}
      <div className={`grid gap-4 ${bothGroups ? 'sm:grid-cols-2 sm:gap-x-8' : ''}`}>
        <Group label="Execution" lines={executionLines} />
        <div className={bothGroups ? 'sm:border-l sm:border-[#1a1a1a] sm:pl-8' : ''}>
          <Group label="Intelligence" lines={intelligenceLines} />
        </div>
      </div>
    </div>
  );
}

export default React.memo(BehavioralRecord);
