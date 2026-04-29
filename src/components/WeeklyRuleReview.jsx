import React, { useEffect, useMemo, useState } from 'react';
import { readUserData, updateData, writeData } from '../utils/firebaseUtils';
import { readUserSettings } from '../utils/oracleQuestionPool';
import { COLLECTIONS, HARD_LESSON_FIELDS, USER_SETTINGS_FIELDS } from '../utils/schema';
import logger from '../utils/logger';
import ouraToast from '../utils/toast';

/**
 * WeeklyRuleReview — once-per-week retrospective sweep over every finalized
 * Hard Lessons rule. Renders on the Dashboard. Each rule gets a Held / Broke
 * it toggle. Submit writes a violations[] entry on every "Broke it" rule.
 *
 * Held selections write nothing — absence of a violation IS the held state.
 * Both Submit and Dismiss stamp `userSettings.lastWeeklyRuleReviewWeek` to
 * the current ISO week so the card hides for the rest of the week.
 *
 * Returns null when:
 *   • there are no finalized rules to review
 *   • the user has already submitted or dismissed this ISO week's review
 *   • the data fetch is in flight (avoids a content flash)
 */

function isoWeekKey(date = new Date()) {
  // ISO 8601 week number — Mon=1..Sun=7. Week 1 contains the first Thursday.
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7; // map Sunday from 0 → 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum); // shift to the week's Thursday
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

export default function WeeklyRuleReview() {
  const [loading, setLoading] = useState(true);
  const [rules, setRules] = useState([]);
  const [settings, setSettings] = useState(null);
  const [marks, setMarks] = useState({}); // ruleId → 'held' | 'broke'
  const [submitting, setSubmitting] = useState(false);
  const [submittedThisSession, setSubmittedThisSession] = useState(false);

  const currentWeek = useMemo(() => isoWeekKey(new Date()), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [hardLessons, userSettings] = await Promise.all([
          readUserData(COLLECTIONS.HARD_LESSONS),
          readUserSettings(),
        ]);
        if (cancelled) return;
        const finalized = (hardLessons || []).filter(
          (l) => l?.[HARD_LESSON_FIELDS.IS_FINALIZED] === true &&
                 (l?.[HARD_LESSON_FIELDS.RULE] || '').trim().length > 0
        );
        setRules(finalized);
        setSettings(userSettings);
      } catch (err) {
        logger.warn('WeeklyRuleReview: data fetch failed', err?.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const lastReviewedWeek = settings?.[USER_SETTINGS_FIELDS.LAST_WEEKLY_RULE_REVIEW_WEEK] || null;
  const alreadyDoneThisWeek = lastReviewedWeek === currentWeek || submittedThisSession;

  const stampReviewedWeek = async () => {
    try {
      const payload = {
        [USER_SETTINGS_FIELDS.LAST_WEEKLY_RULE_REVIEW_WEEK]: currentWeek,
      };
      if (settings?.id) {
        await updateData(COLLECTIONS.USER_SETTINGS, settings.id, payload);
      } else {
        await writeData(COLLECTIONS.USER_SETTINGS, payload);
      }
    } catch (err) {
      logger.warn('WeeklyRuleReview: failed to stamp lastWeeklyRuleReviewWeek', err?.message);
    }
  };

  const handleDismiss = async () => {
    setSubmittedThisSession(true);
    await stampReviewedWeek();
  };

  const handleSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const broken = rules.filter((r) => marks[r.id] === 'broke');
      const nowIso = new Date().toISOString();
      // One write per broken rule. Sequential to keep error handling simple
      // and to avoid contending Firestore writes on the same doc.
      for (const rule of broken) {
        const existing = Array.isArray(rule[HARD_LESSON_FIELDS.VIOLATIONS])
          ? rule[HARD_LESSON_FIELDS.VIOLATIONS]
          : [];
        const violations = [...existing, { date: nowIso, source: 'weekly_review' }];
        try {
          await updateData(COLLECTIONS.HARD_LESSONS, rule.id, {
            [HARD_LESSON_FIELDS.VIOLATIONS]: violations,
            [HARD_LESSON_FIELDS.LAST_VIOLATED_AT]: nowIso,
          });
        } catch (err) {
          logger.error('WeeklyRuleReview: violation write failed', { ruleId: rule.id, err: err?.message });
        }
      }
      await stampReviewedWeek();
      setSubmittedThisSession(true);
      if (broken.length > 0) {
        ouraToast.success(`${broken.length} violation${broken.length === 1 ? '' : 's'} logged`);
      } else {
        ouraToast.success('Week reviewed — all rules held');
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return null;
  if (rules.length === 0) return null;
  if (alreadyDoneThisWeek) return null;

  const allMarked = rules.every((r) => marks[r.id] === 'held' || marks[r.id] === 'broke');
  const brokenCount = rules.filter((r) => marks[r.id] === 'broke').length;

  return (
    <section className="mb-10 animate-fade-in-up" style={{ animationDelay: '0.08s' }}>
      <div className="oura-card p-6">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-[#858585] text-xs uppercase tracking-widest">Weekly Rule Review</h3>
          <button
            onClick={handleDismiss}
            className="text-[#858585] hover:text-[#ababab] text-xs transition-colors"
            title="Skip this week's review"
          >
            Skip
          </button>
        </div>
        <p className="text-[#858585] text-xs mb-5">
          Sweep the past 7 days. For each rule, mark whether you held the line or broke it.
        </p>

        <div className="space-y-2">
          {rules.map((rule) => {
            const ruleText = rule[HARD_LESSON_FIELDS.RULE];
            const mark = marks[rule.id];
            return (
              <div key={rule.id} className="flex items-start justify-between gap-3 p-3 bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl">
                <p className="text-[#fbbf24] text-sm leading-relaxed flex-1">{ruleText}</p>
                <div className="flex gap-1.5 shrink-0">
                  <button
                    onClick={() => setMarks((prev) => ({ ...prev, [rule.id]: 'held' }))}
                    className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                      mark === 'held'
                        ? 'border-[#00d4aa] bg-[#00d4aa]/10 text-[#00d4aa]'
                        : 'border-[#2a2a2a] text-[#858585] hover:border-[#00d4aa]/50 hover:text-[#00d4aa]'
                    }`}
                  >
                    Held
                  </button>
                  <button
                    onClick={() => setMarks((prev) => ({ ...prev, [rule.id]: 'broke' }))}
                    className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                      mark === 'broke'
                        ? 'border-[#b45309] bg-[#b45309]/10 text-[#b45309]'
                        : 'border-[#2a2a2a] text-[#858585] hover:border-[#b45309]/50 hover:text-[#b45309]'
                    }`}
                  >
                    Broke it
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between mt-5 pt-4 border-t border-[#1a1a1a]">
          <span className="text-[#858585] text-xs">
            {allMarked
              ? brokenCount === 0
                ? 'All held.'
                : `${brokenCount} marked broken.`
              : `${rules.length - Object.keys(marks).length} remaining.`}
          </span>
          <button
            onClick={handleSubmit}
            disabled={!allMarked || submitting}
            className="px-4 py-2 text-xs rounded-xl bg-white text-black hover:bg-[#d1d1d1] disabled:bg-[#1a1a1a] disabled:text-[#858585] transition-all font-medium"
          >
            {submitting ? 'Saving...' : 'Submit review'}
          </button>
        </div>
      </div>
    </section>
  );
}
