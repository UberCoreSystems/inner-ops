import React, { useState } from 'react';
import { CONFRONTATION_FIELDS } from '../utils/schema';

/**
 * ConfrontationHistoryPanel — collapsible inline archive of past Pattern
 * Confrontations. Rendered directly below PatternConfrontationCard on the
 * Dashboard. Returns null when there are no past entries.
 *
 * Reads `confrontations` come from the parent (PatternConfrontationCard)
 * so we don't double-fetch the same collection — the parent already needs
 * them for its 24h dedupe check.
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

function formatTimestamp(iso) {
  if (!iso) return '';
  const d = new Date(iso);
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

function summarizeSignal(c) {
  const type = c?.[CONFRONTATION_FIELDS.SIGNAL_TYPE];
  const snap = c?.[CONFRONTATION_FIELDS.SIGNAL_SNAPSHOT];
  if (type === 'rule_violation') {
    return snap?.ruleText
      ? `Rule violation — ${snap.ruleText}`
      : `Rule violation${snap?.violatedInWindow ? ` (${snap.violatedInWindow} in 14d)` : ''}`;
  }
  // drift signal
  if (snap?.archetype) return `Drift — ${snap.archetype.replace(/_/g, ' ')}`;
  if (snap?.condition) return `Drift — ${snap.condition.replace(/_/g, ' ')}`;
  if (snap?.targetTitle) return `Drift — ${snap.targetTitle}`;
  if (snap?.type) return `Drift — ${snap.type.replace(/_/g, ' ')}`;
  return 'Pattern surfaced';
}

export default function ConfrontationHistoryPanel({ confrontations = [] }) {
  const [expanded, setExpanded] = useState(false);
  if (!Array.isArray(confrontations) || confrontations.length === 0) return null;

  const sorted = [...confrontations].sort((a, b) => {
    const at = new Date(a?.[CONFRONTATION_FIELDS.CREATED_AT] || 0).getTime();
    const bt = new Date(b?.[CONFRONTATION_FIELDS.CREATED_AT] || 0).getTime();
    return bt - at;
  });

  return (
    <section className="mb-10 -mt-6 animate-fade-in-up" style={{ animationDelay: '0.075s' }}>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-2.5 oura-card hover:border-[#2a2a2a] transition-colors"
      >
        <span className="text-[#858585] text-xs uppercase tracking-widest">
          Past Confrontations ({sorted.length})
        </span>
        <span className="text-[#858585] text-xs">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div className="mt-2 space-y-2">
          {sorted.map((c) => {
            const reaction = c?.[CONFRONTATION_FIELDS.REACTION];
            const followUp = c?.[CONFRONTATION_FIELDS.FOLLOW_UP_RESPONSE];
            return (
              <div
                key={c.id}
                className="oura-card p-4 border border-[#1a1a1a] hover:border-[#2a2a2a] transition-colors"
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <p className="text-[#b45309] text-[10px] uppercase tracking-widest">
                    {summarizeSignal(c)}
                  </p>
                  <p className="text-[#858585] text-[10px] shrink-0">
                    {formatTimestamp(c?.[CONFRONTATION_FIELDS.CREATED_AT])}
                  </p>
                </div>

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
    </section>
  );
}
