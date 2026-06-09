import { useState, useMemo } from 'react';
import { CONFRONTATION_FIELDS } from '../utils/schema';
import { resolveArchetypeLabel } from '../utils/relapseTaxonomy';

/**
 * ConfrontationHistoryPanel — collapsible inline archive of past Pattern
 * Confrontations. Rendered directly below PatternConfrontationCard on the
 * Dashboard. Returns null when there are no past entries.
 *
 * Display model: confrontations are grouped by signalKey (the unique
 * pattern identity). Each group shows a recurrence trend — total times
 * the same signal has been surfaced + when it was first and last
 * confronted. This makes pattern persistence visible: a signal that
 * keeps reappearing despite confrontation is itself a signal.
 *
 * Reads `confrontations` come from the parent (PatternConfrontationCard)
 * so we don't double-fetch the same collection — the parent already needs
 * them for its dedupe check.
 */

const REACTION_LABELS = {
  landed: 'This landed',
  disagree: 'Disagreed',
  sit: 'Sat with it',
  missed: 'Missed',
};

const REACTION_COLORS = {
  landed: '#22c55e',
  disagree: '#ef4444',
  sit: '#f59e0b',
  missed: '#5a5a5a',
};

const DAY_MS = 86400000;

function getCreatedTs(c) {
  const v = c?.[CONFRONTATION_FIELDS.CREATED_AT];
  if (!v) return 0;
  if (v instanceof Date) return v.getTime();
  const ts = new Date(v).getTime();
  return Number.isFinite(ts) ? ts : 0;
}

function formatTimestamp(value) {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const sameYear = d.getFullYear() === now.getFullYear();
  if (sameDay) {
    return `today, ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
  }
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: sameYear ? undefined : 'numeric',
  });
}

function relativeDays(ts) {
  if (!ts) return '';
  const diff = Math.max(0, Math.floor((Date.now() - ts) / DAY_MS));
  if (diff === 0) return 'today';
  if (diff === 1) return '1d ago';
  return `${diff}d ago`;
}

// Humanize a signalKey into a short label for the group header. The
// signalKey shape is built by PatternConfrontationCard.buildSignalKey and
// has the form `drift_<type>_<tail>` or `rule_violation`. Type strings can
// themselves contain underscores ('archetype_frequency'), so we match
// against the known set of types via prefix rather than a fragile regex.
const KNOWN_DRIFT_TYPES = [
  'archetype_frequency',
  'precursor_pattern',
  'correlated_escape',
  'life_transition',
];

function humanizeSignalKey(signalKey, sampleConfrontation) {
  if (!signalKey) return 'Pattern';
  if (signalKey === 'rule_violation') {
    const ruleText = sampleConfrontation?.[CONFRONTATION_FIELDS.SIGNAL_SNAPSHOT]?.ruleText;
    return ruleText ? `Rule violation — ${ruleText}` : 'Rule violation';
  }
  for (const type of KNOWN_DRIFT_TYPES) {
    const prefix = `drift_${type}_`;
    if (!signalKey.startsWith(prefix)) continue;
    const tail = signalKey.slice(prefix.length);
    switch (type) {
      case 'archetype_frequency': {
        const label = resolveArchetypeLabel(tail) || tail;
        return `Archetype — ${label}`;
      }
      case 'precursor_pattern':
        return `Precursor — ${tail}`;
      case 'correlated_escape': {
        // tail is a targetId; prefer the captured targetTitle from snapshot
        const title = sampleConfrontation?.[CONFRONTATION_FIELDS.SIGNAL_SNAPSHOT]?.targetTitle;
        return `Correlated escape — ${title || tail}`;
      }
      case 'life_transition':
        return 'Life transition';
      default:
        return signalKey;
    }
  }
  return signalKey;
}

function buildGroups(confrontations) {
  const groups = new Map();
  for (const c of confrontations) {
    const key = c?.[CONFRONTATION_FIELDS.SIGNAL_KEY] || 'unknown';
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(c);
  }
  // Sort entries within each group by date desc, then sort groups by their
  // most-recent entry date desc.
  const result = [];
  for (const [signalKey, entries] of groups.entries()) {
    entries.sort((a, b) => getCreatedTs(b) - getCreatedTs(a));
    const lastTs = getCreatedTs(entries[0]);
    const firstTs = getCreatedTs(entries[entries.length - 1]);
    const engagedCount = entries.filter(
      (e) => e?.[CONFRONTATION_FIELDS.ORACLE_ENGAGED] === true
    ).length;
    result.push({
      signalKey,
      entries,
      count: entries.length,
      lastTs,
      firstTs,
      engagedCount,
    });
  }
  result.sort((a, b) => b.lastTs - a.lastTs);
  return result;
}

export default function ConfrontationHistoryPanel({ confrontations = [] }) {
  const [expanded, setExpanded] = useState(false);
  const [openGroups, setOpenGroups] = useState(() => new Set());

  const groups = useMemo(() => buildGroups(confrontations || []), [confrontations]);
  const totalConfrontations = confrontations?.length || 0;

  if (!Array.isArray(confrontations) || confrontations.length === 0) return null;

  const toggleGroup = (signalKey) => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(signalKey)) next.delete(signalKey);
      else next.add(signalKey);
      return next;
    });
  };

  return (
    <section className="mb-10 -mt-6 animate-fade-in-up" style={{ animationDelay: '0.075s' }}>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-2.5 oura-card hover:border-[#2a2a2a] transition-colors"
      >
        <span className="text-[#858585] text-xs uppercase tracking-widest">
          Past Confrontations ({totalConfrontations} across {groups.length} pattern{groups.length !== 1 ? 's' : ''})
        </span>
        <span className="text-[#858585] text-xs">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div className="mt-2 space-y-2">
          {groups.map((g) => {
            const isOpen = openGroups.has(g.signalKey);
            const sample = g.entries[0];
            const heading = humanizeSignalKey(g.signalKey, sample);
            const recurred = g.count > 1;
            const spanDays = recurred
              ? Math.max(1, Math.floor((g.lastTs - g.firstTs) / DAY_MS))
              : 0;
            return (
              <div
                key={g.signalKey}
                className="oura-card border border-[#1a1a1a] hover:border-[#2a2a2a] transition-colors overflow-hidden"
              >
                <button
                  onClick={() => toggleGroup(g.signalKey)}
                  className="w-full flex items-start justify-between gap-3 p-4 text-left"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-[#b45309] text-[10px] uppercase tracking-widest mb-1 truncate" title={heading}>
                      {heading}
                    </p>
                    <p className="text-[#ababab] text-xs">
                      <span className="font-light tabular-nums text-[#d1d1d1]">×{g.count}</span>
                      <span className="text-[#858585]"> · last {relativeDays(g.lastTs)}</span>
                      {recurred && (
                        <span className="text-[#858585]"> · recurred over {spanDays}d</span>
                      )}
                      {g.engagedCount > 0 && g.engagedCount < g.count && (
                        <span className="text-[#858585]"> · {g.engagedCount} of {g.count} engaged</span>
                      )}
                    </p>
                  </div>
                  <span className="text-[#858585] text-xs shrink-0 mt-0.5">{isOpen ? '▲' : '▼'}</span>
                </button>

                {isOpen && (
                  <div className="border-t border-[#1a1a1a] divide-y divide-[#1a1a1a]">
                    {g.entries.map((c) => {
                      const reaction = c?.[CONFRONTATION_FIELDS.REACTION];
                      const followUp = c?.[CONFRONTATION_FIELDS.FOLLOW_UP_RESPONSE];
                      return (
                        <div key={c.id} className="p-4">
                          <p className="text-[#858585] text-[10px] mb-2">
                            {formatTimestamp(c?.[CONFRONTATION_FIELDS.CREATED_AT])}
                          </p>

                          {c?.[CONFRONTATION_FIELDS.PROMPT] && (
                            <p className="text-[#858585] text-xs italic leading-relaxed mb-2 border-l-2 border-[#1a1a1a] pl-2">
                              {c[CONFRONTATION_FIELDS.PROMPT]}
                            </p>
                          )}

                          {c?.[CONFRONTATION_FIELDS.ORACLE_RESPONSE] && (
                            <p className="text-[#d1d1d1] text-sm leading-relaxed whitespace-pre-line">
                              {c[CONFRONTATION_FIELDS.ORACLE_RESPONSE]}
                            </p>
                          )}

                          {!c?.[CONFRONTATION_FIELDS.ORACLE_RESPONSE] && c?.[CONFRONTATION_FIELDS.REACTION] === 'missed' && (
                            <p className="text-[#7a7a7a] text-xs italic">Dismissed without confronting.</p>
                          )}

                          {followUp && (
                            <div className="mt-2 pt-2 border-t border-[#1a1a1a]">
                              <p className="text-[#858585] text-[10px] uppercase tracking-widest mb-1">Follow-up</p>
                              <p className="text-[#ababab] text-xs leading-relaxed whitespace-pre-line">{followUp}</p>
                            </div>
                          )}

                          {reaction && REACTION_LABELS[reaction] && (
                            <div className="mt-3 inline-flex items-center gap-1.5 text-[10px] uppercase tracking-widest"
                              style={{ color: REACTION_COLORS[reaction] || '#858585' }}>
                              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: REACTION_COLORS[reaction] || '#858585' }} />
                              {REACTION_LABELS[reaction]}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
