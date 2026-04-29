import React from 'react';
import { categories } from '../utils/killListCategories';

/**
 * KillTargetSummary — shared summary block for a single Kill List / General
 * Ledger contract. Renders the elements that should be identical wherever
 * a kill target is shown:
 *   • title (strikethrough when killed)
 *   • category · status · "Day N" · created-date metadata row
 *   • "Kill requires N consecutive days of held execution." copy
 *   • streak progress bar
 *   • three-metric row: Current Streak / Behavioral Record / Longest Run
 *
 * Consumers:
 *   • src/pages/KillList.jsx — module page card; appends action buttons,
 *     daily check-in, escape autopsy, autopsy pattern, and the Hard Lessons
 *     bridge below this summary.
 *   • src/components/KillListDashboard.jsx — Dashboard collapsible "General
 *     Ledger" section; appends Quick Killed/Escaped/Reset/Cycle buttons,
 *     reflection notes, "Seek Oracle", and the stats footer below this
 *     summary.
 *
 * Sharing the upper portion guarantees the Dashboard surface and the module
 * page never visually drift on the elements that describe the target.
 */

const MIN_DAYS_REQUIRED = 30;

function getConsecutiveDaysRequired(target) {
  const raw = parseInt(target?.consecutiveDaysRequired, 10);
  return Number.isFinite(raw) && raw >= MIN_DAYS_REQUIRED ? raw : MIN_DAYS_REQUIRED;
}

export function KillTargetSummary({ target }) {
  if (!target) return null;
  const category = categories.find((c) => c.value === target.category) || categories[0];
  const streak = target.streak || 0;
  const threshold = getConsecutiveDaysRequired(target);
  const createdAt = new Date(target.createdAt);
  const daysActive = Math.floor((Date.now() - createdAt.getTime()) / 86400000);
  const showYear = createdAt.getFullYear() !== new Date().getFullYear();
  const dateLabel = createdAt.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: showYear ? 'numeric' : undefined,
  });

  return (
    <>
      <h3 className={`font-medium ${target.status === 'killed' ? 'line-through text-[#858585]' : 'text-white'}`}>
        {target.title}
      </h3>
      <div className="flex items-center gap-2 mt-1 flex-wrap">
        <span className="text-xs text-[#858585] uppercase tracking-wider">{category.label}</span>
        <span className="text-[#858585] text-xs">·</span>
        <span className={`text-xs uppercase tracking-wider ${
          target.status === 'killed' ? 'text-[#858585]' :
          target.status === 'escaped' ? 'text-[#b45309]' :
          'text-white'
        }`}>
          {target.status}
        </span>
        <span className="text-[#858585] text-xs">·</span>
        <span className="text-[#858585] text-xs">Day {daysActive} · {dateLabel}</span>
      </div>
      <p className="text-[#858585] text-xs mt-2">
        Kill requires {threshold} consecutive days of held execution.
      </p>

      {/* Streak progress bar */}
      <div className="flex items-center gap-3 mt-4">
        <div className="flex-1 bg-[#1a1a1a] rounded-full h-2 overflow-hidden">
          <div
            className="h-2 rounded-full transition-all duration-500"
            style={{
              width: `${Math.min(100, (streak / threshold) * 100)}%`,
              backgroundColor: '#ef4444',
            }}
          />
        </div>
        <span className="text-xs text-[#858585] shrink-0 tabular-nums">{streak} / {threshold}d</span>
      </div>

      {/* 3-metric row */}
      <div className="flex items-start justify-between mt-3">
        <div className="flex gap-5">
          <div>
            <span className="text-2xl font-light tabular-nums text-white">{streak}</span>
            <div className="text-[#858585] text-xs mt-0.5">Current Streak</div>
          </div>
          <div>
            <span className="text-2xl font-light tabular-nums text-[#ababab]">
              {target.totalTrackedDays || 0}
            </span>
            <div className="text-[#858585] text-xs mt-0.5">Behavioral Record</div>
          </div>
          <div>
            <span className="text-2xl font-light tabular-nums text-[#858585]">
              {target.longestStreak || 0}
            </span>
            <div className="text-[#858585] text-xs mt-0.5">Longest Run</div>
          </div>
        </div>
      </div>
    </>
  );
}
