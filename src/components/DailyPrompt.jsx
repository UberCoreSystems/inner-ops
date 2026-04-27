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

// Static prompt library — used only when the Oracle question pool is empty
// (new users, or before any Oracle responses have been generated). Once the
// user has entries with Oracle prose, the rotation is driven entirely by
// past Oracle closing questions.
const promptLibrary = {
  selfAwareness: [
    "What pattern keeps showing up in your life that you've been ignoring?",
    "What lie do you keep telling yourself to avoid change?",
    "What would your future self thank you for doing today?",
    "What are you pretending not to know about yourself?",
    "What emotion have you been avoiding feeling?",
    "Where in your life are you settling for less than you deserve?",
    "What old story about yourself needs to die?",
    "What part of yourself have you been hiding from others?",
  ],
  actionOriented: [
    "What's one small win you can secure before the day ends?",
    "What have you been procrastinating on that would take less than 10 minutes?",
    "What boundary do you need to set or reinforce today?",
    "What would you do today if you weren't afraid of failing?",
    "What's the most important thing you can do for your future self today?",
    "What habit have you been meaning to start? Start it now, imperfectly.",
    "Who do you need to have an honest conversation with?",
    "What would make today feel like a victory?",
  ],
  shadowWork: [
    "What triggers you most in others? What does that reveal about you?",
    "What do you judge in others that you secretly fear exists in yourself?",
    "What wound from your past are you still protecting?",
    "What part of yourself have you been at war with?",
    "What failure are you still carrying shame about?",
    "What do you fear others would think if they knew the real you?",
    "Where are you still seeking approval you don't need?",
    "What anger are you holding that's actually protecting deeper pain?",
  ],
  gratitude: [
    "What strength got you through your hardest moment this week?",
    "What challenge has secretly been a gift in disguise?",
    "Who in your life has believed in you when you didn't believe in yourself?",
    "What part of your journey are you proud of that others don't see?",
    "What lesson have you learned that you wouldn't trade for anything?",
    "What simple thing brought you unexpected peace recently?",
    "What ability do you take for granted that others would treasure?",
    "What past version of you would be amazed by who you are now?",
  ],
  clarity: [
    "What do you actually want? Not what you think you should want.",
    "If you couldn't fail, what would you be doing with your life?",
    "What needs to end for something new to begin?",
    "What's the difference between who you are and who you're becoming?",
    "What are you tolerating that's draining your energy?",
    "What decision have you been avoiding because you already know the answer?",
    "What would your life look like if you stopped people-pleasing?",
    "What does your ideal day look like? How far is today from that?",
  ],
  recovery: [
    "What trigger have you been blind to that keeps catching you off guard?",
    "What void are you trying to fill with destructive behavior?",
    "What would you tell someone you love who's in your exact situation?",
    "What moment of strength can you draw from when the urge hits?",
    "What are you running from when you reach for your vice?",
    "What has your addiction cost you that you're ready to reclaim?",
    "What small promise to yourself can you keep today to rebuild trust?",
    "What would 'one year sober you' say to you right now?",
  ]
};

const getAllPrompts = () => {
  const allPrompts = [];
  Object.entries(promptLibrary).forEach(([category, prompts]) => {
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

// Per-source meta for Oracle-sourced prompts. `recovery` is the closest fit
// for relapse/kill modules' palette; `clarity` for synthesis; `shadowWork`
// for hard lessons. Journal stays on `selfAwareness`.
const ORACLE_SOURCE_META = {
  journalEntries: { icon: 'search', label: 'From Your Journal', color: '#a855f7' },
  hardLessons: { icon: 'bolt', label: 'From a Hard Lesson', color: '#f59e0b' },
  relapseEntries: { icon: 'shield', label: 'From a Relapse Log', color: '#ef4444' },
  killTargets: { icon: 'target', label: 'From a Kill Escape', color: '#ef4444' },
  confirmedKills: { icon: 'target', label: 'From a Kill Closure', color: '#22c55e' },
  syntheses: { icon: 'clarity', label: 'From a Synthesis Briefing', color: '#00d4aa' },
};

const STATIC_CATEGORY_META = {
  selfAwareness: { icon: 'search', label: 'Self-Awareness', color: '#a855f7' },
  actionOriented: { icon: 'bolt', label: 'Take Action', color: '#22c55e' },
  shadowWork: { icon: 'moon', label: 'Shadow Work', color: '#6366f1' },
  gratitude: { icon: 'heart', label: 'Gratitude', color: '#f59e0b' },
  clarity: { icon: 'clarity', label: 'Clarity', color: '#00d4aa' },
  recovery: { icon: 'shield', label: 'Recovery', color: '#ef4444' },
};

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
          setPrompt({ kind: 'static', text: staticPrompt.text, category: staticPrompt.category, id: storedId });
          return;
        }
        // Oracle ID — look up in the pool. If the source doc was archived or
        // aged past the lookback window, fall through to a fresh pick.
        try {
          const pool = await buildOracleQuestionPool();
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
      try {
        const pool = await buildOracleQuestionPool();
        if (cancelled) return;
        const recent = settings?.[USER_SETTINGS_FIELDS.RECENTLY_SHOWN_DAILY_PROMPT_IDS] || [];
        const pick = pickTodaysOracleQuestion(pool, recent, today);
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
      setPrompt({ kind: 'static', text: staticPrompt.text, category: staticPrompt.category, id: staticPrompt.id });
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

        {/* Refresh hint */}
        <div className="flex items-center gap-2 text-[#858585] text-xs">
          <AppIcon name="sunrise" size={16} color="#f59e0b" glow={true} glowIntensity={0.3} />
          <span>New prompt daily</span>
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
