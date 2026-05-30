import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { AppIcon } from './AppIcons';
import {
  buildOracleQuestionPool,
  pickTodaysOracleQuestion,
  readUserSettings,
  assignDailyPrompt,
  markDailyPromptAnswered,
  formatRelativeDate,
  todayUtcDateString,
} from '../utils/oracleQuestionPool.js';
import { USER_SETTINGS_FIELDS } from '../utils/schema.js';
import {
  PROMPT_LIBRARY,
  ORACLE_SOURCE_META,
  STATIC_CATEGORY_META,
} from '../constants/dailyPrompts.js';

const getAllPrompts = () => {
  const allPrompts = [];
  Object.entries(PROMPT_LIBRARY).forEach(([category, prompts]) => {
    prompts.forEach(prompt => {
      allPrompts.push({ text: prompt, category });
    });
  });
  return allPrompts;
};

// Static fallback — deterministic by calendar day so a new user who has not
// yet generated Oracle responses still gets a consistent prompt within a day.
const computeDayOfYear = (date = new Date()) => {
  return Math.floor((date - new Date(date.getFullYear(), 0, 0)) / (1000 * 60 * 60 * 24));
};

const getTodaysStaticPrompt = () => {
  const allPrompts = getAllPrompts();
  const dayOfYear = computeDayOfYear();
  const index = dayOfYear % allPrompts.length;
  return { ...allPrompts[index], id: `static/${dayOfYear}` };
};

const isStaticPromptId = (id) => typeof id === 'string' && id.startsWith('static/');

const DailyPrompt = React.memo(function DailyPrompt({ onJournalClick, answeredSignal = 0 }) {
  const [prompt, setPrompt] = useState(null);
  const [isHovered, setIsHovered] = useState(false);

  // Mount: load today's committed prompt if one exists, otherwise pick fresh
  // and commit it. The committed pick is replayed identically across page
  // loads until the date rolls over or the user answers it.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const today = todayUtcDateString();
      let settings = null;
      try {
        settings = await readUserSettings();
      } catch { /* settings stay null — first-time user */ }
      if (cancelled) return;

      const storedDate = settings?.[USER_SETTINGS_FIELDS.DAILY_PROMPT_CURRENT_DATE];
      const storedId = settings?.[USER_SETTINGS_FIELDS.DAILY_PROMPT_CURRENT_ID];
      const answeredAt = settings?.[USER_SETTINGS_FIELDS.DAILY_PROMPT_ANSWERED_AT];

      // Same-day record: replay or hide.
      if (storedDate === today && storedId) {
        if (answeredAt) {
          setPrompt({ kind: 'answered' });
          return;
        }
        if (isStaticPromptId(storedId)) {
          const staticPrompt = getTodaysStaticPrompt();
          // Cold-start hint for the same-day replay path — check source counts
          // so the hint stays accurate even after settings has been written.
          let isColdStart = false;
          try {
            const { hasAnyEntries } = await buildOracleQuestionPool();
            if (cancelled) return;
            isColdStart = !hasAnyEntries;
          } catch { /* fail closed — no hint */ }
          setPrompt({ kind: 'static', text: staticPrompt.text, category: staticPrompt.category, id: storedId, isColdStart });
          return;
        }
        // Oracle ID — look up in the pool. If the source doc was archived or
        // aged past the lookback window, fall through to a fresh pick.
        try {
          const { pool } = await buildOracleQuestionPool();
          if (cancelled) return;
          const found = pool.find((p) => p.id === storedId);
          if (found) {
            setPrompt({
              kind: 'oracle',
              text: found.question,
              sourceModule: found.sourceModule,
              sourceDocId: found.sourceDocId,
              eventOccurredAt: found.eventOccurredAt,
              displayLabel: found.displayLabel,
              id: found.id,
            });
            return;
          }
        } catch { /* fall through to fresh pick */ }
      }

      // Fresh pick path (new day, no record, or stored ID no longer in pool).
      let hasAnyEntries = true; // assume not cold-start unless pool read confirms
      try {
        const result = await buildOracleQuestionPool();
        if (cancelled) return;
        hasAnyEntries = result.hasAnyEntries;
        const recent = settings?.[USER_SETTINGS_FIELDS.RECENTLY_SHOWN_DAILY_PROMPT_IDS] || [];
        const pick = pickTodaysOracleQuestion(result.pool, recent, today);
        if (pick) {
          setPrompt({
            kind: 'oracle',
            text: pick.question,
            sourceModule: pick.sourceModule,
            sourceDocId: pick.sourceDocId,
            eventOccurredAt: pick.eventOccurredAt,
            displayLabel: pick.displayLabel,
            id: pick.id,
          });
          assignDailyPrompt({ promptId: pick.id, today, settings });
          return;
        }
      } catch { /* pool unavailable — fall through to static */ }

      if (cancelled) return;
      const staticPrompt = getTodaysStaticPrompt();
      setPrompt({ kind: 'static', text: staticPrompt.text, category: staticPrompt.category, id: staticPrompt.id, isColdStart: !hasAnyEntries });
      assignDailyPrompt({ promptId: staticPrompt.id, today, settings });
    })();

    return () => { cancelled = true; };
  }, []);

  // Parent signals "the user just answered this prompt" via answeredSignal.
  // Initial value is 0 — we ignore the first render so the prompt isn't
  // marked answered on mount.
  useEffect(() => {
    if (answeredSignal === 0) return;
    if (!prompt || prompt.kind === 'answered') return;
    let cancelled = false;
    (async () => {
      let settings = null;
      try { settings = await readUserSettings(); } catch { /* swallow */ }
      if (cancelled) return;
      await markDailyPromptAnswered(settings);
      if (!cancelled) setPrompt({ kind: 'answered' });
    })();
    return () => { cancelled = true; };
    // Re-runs only when answeredSignal increments. `prompt` is read as a guard,
    // not a trigger — depending on it would re-mark the prompt answered.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answeredSignal]);

  if (!prompt || prompt.kind === 'answered') return null;

  const meta = prompt.kind === 'oracle'
    ? (ORACLE_SOURCE_META[prompt.sourceModule] || ORACLE_SOURCE_META.journalEntries)
    : (STATIC_CATEGORY_META[prompt.category] || STATIC_CATEGORY_META.selfAwareness);

  const provenance = prompt.kind === 'oracle'
    ? `Oracle asked you ${formatRelativeDate(prompt.eventOccurredAt) || 'recently'} after ${prompt.displayLabel}.`
    : null;

  return (
    <div
      className="oura-card p-6 relative overflow-hidden group transition-all duration-300 hover:border-[#2a2a2a]"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Background glow effect */}
      <div
        className="absolute inset-0 opacity-5 group-hover:opacity-10 transition-opacity duration-500"
        style={{
          background: `radial-gradient(circle at top right, ${meta.color}, transparent 70%)`
        }}
      />

      {/* Header */}
      <div className="flex items-center justify-between mb-4 relative z-10">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-2xl flex items-center justify-center"
            style={{ backgroundColor: `${meta.color}15` }}
          >
            <AppIcon name={meta.icon} size={22} color={meta.color} glow={true} glowIntensity={0.5} />
          </div>
          <div>
            <p className="text-[#858585] text-xs uppercase tracking-widest">Today's Reflection</p>
            <p className="text-sm" style={{ color: meta.color }}>{meta.label}</p>
          </div>
        </div>

        {/* Refresh hint — swaps for cold-start (zero entries across all source
            modules) so first-time users understand prompts will personalize. */}
        <div className="flex items-center gap-2 text-[#858585] text-xs">
          <AppIcon name="sunrise" size={16} color="#f59e0b" glow={true} glowIntensity={0.3} />
          <span>{prompt.isColdStart ? 'Prompts personalize after your first entry' : 'New prompt daily'}</span>
        </div>
      </div>

      {/* Provenance line — only when prompt is Oracle-sourced */}
      {provenance && (
        <p className="text-[#6a6a6a] text-xs italic mb-3 relative z-10">{provenance}</p>
      )}

      {/* Prompt Text */}
      <blockquote className="relative z-10 mb-6">
        <p className="text-white text-lg md:text-xl font-light leading-relaxed">
          "{prompt.text}"
        </p>
      </blockquote>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-3 relative z-10">
        <button
          onClick={() => onJournalClick?.(prompt.text)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 hover:scale-105"
          style={{
            backgroundColor: `${meta.color}20`,
            color: meta.color,
            border: `1px solid ${meta.color}40`
          }}
        >
          <AppIcon name="journal" size={16} color={meta.color} glow={true} glowIntensity={0.4} />
          <span>Journal This</span>
        </button>

        <Link
          to="/ledger"
          className="flex items-center gap-2 px-4 py-2.5 bg-[#1a1a1a] text-[#ababab] rounded-xl text-sm font-medium border border-[#2a2a2a] hover:border-[#ef4444]/50 hover:text-[#ef4444] transition-all duration-200 hover:scale-105 group"
        >
          <AppIcon name="target" size={16} color="currentColor" glow={false} />
          <span>Add to Ledger</span>
        </Link>

        <Link
          to="/hardlessons"
          className="flex items-center gap-2 px-4 py-2.5 bg-[#1a1a1a] text-[#ababab] rounded-xl text-sm font-medium border border-[#2a2a2a] hover:border-[#f59e0b]/50 hover:text-[#f59e0b] transition-all duration-200 hover:scale-105 group"
        >
          <AppIcon name="bolt" size={16} color="currentColor" glow={false} />
          <span>Extract Lesson</span>
        </Link>
      </div>

      {/* Subtle animation element */}
      <div
        className={`absolute bottom-0 left-0 h-1 transition-all duration-700 ease-out`}
        style={{
          backgroundColor: meta.color,
          width: isHovered ? '100%' : '0%',
          opacity: 0.6
        }}
      />
    </div>
  );
});

export default DailyPrompt;
