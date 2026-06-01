import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { readUserData, updateData, writeData } from '../utils/firebaseUtils';
import { readUserSettings } from '../utils/oracleQuestionPool';
import { COLLECTIONS, HARD_LESSON_FIELDS, USER_SETTINGS_FIELDS } from '../utils/schema';
import { isUnderReview, getMostRecentBreak, RULE_GRADUATION_DAYS } from '../utils/ruleState';
import { toMs, MS_PER_DAY } from '../utils/dateUtils';
import logger from '../utils/logger';
import ouraToast from '../utils/toast';

/**
 * WeeklyRuleReview — Sunday-anchored retrospective sweep. Renders on the
 * Dashboard.
 *
 * Maturity-tiered: it does NOT sweep every finalized rule. It surfaces only
 * rules that still need attention — those still being established (finalized
 * within RULE_GRADUATION_DAYS) and not currently breached — as Held / Broke it
 * toggles, plus a reminder for any rule whose after-action review is still
 * open. Long-established, honored rules graduate out of the sweep; the
 * in-the-moment "Rule broken" button on the Hard Lessons page is the
 * accountability path for them.
 *
 * Held selections write nothing — absence of a violation IS the held state.
 * "Broke it" writes an unresolved violations[] entry (→ the rule goes under
 * review) and hands off to the Hard Lessons page so the user completes the
 * after-action review. Both Submit and Skip stamp
 * `userSettings.lastReviewedSunday` (current Sunday's local YYYY-MM-DD) so the
 * card hides for the rest of the week.
 *
 * Visibility window: Sun-Wed (Sunday anchor + 3-day carryover). Hidden
 * Thu/Fri/Sat regardless of interaction state.
 *
 * Returns null when:
 *   • today is Thu/Fri/Sat (outside the Sun-Wed render window)
 *   • no rule needs review (none establishing, none under review)
 *   • the user has already submitted or skipped this Sunday's review
 *   • the data fetch is in flight (avoids a content flash)
 */

const RENDER_WINDOW_END_DAY = 3; // Wed. (Sun=0, Mon=1, Tue=2, Wed=3)

function currentSundayString(date = new Date()) {
  // YYYY-MM-DD (LOCAL date) of the Sunday at the start of today's week.
  // If today IS Sunday, returns today's date.
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export default function WeeklyRuleReview() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [rules, setRules] = useState([]);
  const [settings, setSettings] = useState(null);
  const [marks, setMarks] = useState({}); // ruleId → 'held' | 'broke'
  const [submitting, setSubmitting] = useState(false);
  const [submittedThisSession, setSubmittedThisSession] = useState(false);

  const today = useMemo(() => new Date(), []);
  const currentSunday = useMemo(() => currentSundayString(today), [today]);
  const inRenderWindow = today.getDay() <= RENDER_WINDOW_END_DAY;

  // Maturity tiering. Reviewable = still being established (finalized within
  // the graduation window) AND not currently breached → Held/Broke toggles.
  // Pending = a breach whose after-action review is still open → reminder row.
  // Established + honored rules fall into neither and graduate out of the sweep.
  const nowMs = today.getTime();
  const reviewableRules = useMemo(
    () => rules.filter(
      (r) => !isUnderReview(r) &&
        nowMs - (toMs(r.finalizedAt) || toMs(r.createdAt)) <= RULE_GRADUATION_DAYS * MS_PER_DAY
    ),
    [rules, nowMs]
  );
  const pendingReviewRules = useMemo(() => rules.filter(isUnderReview), [rules]);

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

  const lastReviewedSunday = settings?.[USER_SETTINGS_FIELDS.LAST_REVIEWED_SUNDAY] || null;
  const alreadyDoneThisSundayWindow = lastReviewedSunday === currentSunday || submittedThisSession;

  const stampReviewedSunday = async () => {
    try {
      const payload = {
        [USER_SETTINGS_FIELDS.LAST_REVIEWED_SUNDAY]: currentSunday,
      };
      if (settings?.id) {
        await updateData(COLLECTIONS.USER_SETTINGS, settings.id, payload);
      } else {
        await writeData(COLLECTIONS.USER_SETTINGS, payload);
      }
    } catch (err) {
      logger.warn('WeeklyRuleReview: failed to stamp lastReviewedSunday', err?.message);
    }
  };

  const handleDismiss = async () => {
    setSubmittedThisSession(true);
    await stampReviewedSunday();
  };

  // Hand off to the Hard Lessons page with that rule's after-action review open.
  // Mirrors the kl_extraction_prefill bridge pattern in HardLessons.jsx.
  const goToAfterAction = (ruleId) => {
    try {
      sessionStorage.setItem('hl_aar_open', JSON.stringify({ ruleId }));
    } catch { /* ignore storage errors */ }
    navigate('/hardlessons');
  };

  const handleSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const broken = reviewableRules.filter((r) => marks[r.id] === 'broke');
      const nowIso = new Date().toISOString();
      const failed = [];
      // One write per broken rule. Sequential to keep error handling simple
      // and to avoid contending Firestore writes on the same doc. Each break is
      // unresolved (no resolvedAt) → the rule goes under review.
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
          failed.push(rule);
        }
      }

      // Total failure: nothing committed. Don't stamp or close — let the user
      // retry this week. (Surfacing the failure was the whole bug.)
      if (broken.length > 0 && failed.length === broken.length) {
        ouraToast.error('Could not log the break — nothing saved. Try again.');
        return;
      }

      await stampReviewedSunday();
      setSubmittedThisSession(true);

      const written = broken.filter((r) => !failed.includes(r));
      if (failed.length > 0) {
        // Partial: successful writes ARE committed; re-submitting would
        // double-log, so we still stamp. Name what failed.
        ouraToast.error(`${failed.length} of ${broken.length} breaks failed to save`);
      } else if (written.length === 0) {
        ouraToast.success('Week reviewed — all rules held');
      }

      // Hand off to the after-action review for the first break logged.
      if (written.length > 0) {
        goToAfterAction(written[0].id);
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return null;
  if (!inRenderWindow) return null;
  if (reviewableRules.length === 0 && pendingReviewRules.length === 0) return null;
  if (alreadyDoneThisSundayWindow) return null;

  const allMarked = reviewableRules.every((r) => marks[r.id] === 'held' || marks[r.id] === 'broke');
  const brokenCount = reviewableRules.filter((r) => marks[r.id] === 'broke').length;
  const remaining = reviewableRules.length - reviewableRules.filter((r) => marks[r.id]).length;

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

        {pendingReviewRules.length > 0 && (
          <div className="mb-5">
            <p className="text-[#b45309] text-xs uppercase tracking-widest mb-2">After-action required</p>
            <div className="space-y-2">
              {pendingReviewRules.map((rule) => {
                const lastBreak = getMostRecentBreak(rule);
                const since = lastBreak?.date ? new Date(lastBreak.date).toLocaleDateString() : null;
                return (
                  <div key={rule.id} className="flex items-start justify-between gap-3 p-3 bg-[#0a0a0a] border border-[#b45309]/30 rounded-xl">
                    <div className="flex-1">
                      <p className="text-[#fbbf24] text-sm leading-relaxed">{rule[HARD_LESSON_FIELDS.RULE]}</p>
                      <p className="text-[#b45309] text-[10px] uppercase tracking-wider mt-1">
                        Under review{since ? ` since ${since}` : ''}
                      </p>
                    </div>
                    <button
                      onClick={() => goToAfterAction(rule.id)}
                      className="shrink-0 px-3 py-1.5 text-xs rounded-lg border border-[#b45309]/30 text-[#b45309] hover:bg-[#b45309]/10 transition-colors"
                    >
                      Review
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {reviewableRules.length > 0 && (
          <>
            <p className="text-[#858585] text-xs mb-5">
              Newly established rules. For each, mark whether you held the line or broke it.
            </p>

            <div className="space-y-2">
              {reviewableRules.map((rule) => {
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
                  : `${remaining} remaining.`}
              </span>
              <button
                onClick={handleSubmit}
                disabled={!allMarked || submitting}
                className="px-4 py-2 text-xs rounded-xl bg-white text-black hover:bg-[#d1d1d1] disabled:bg-[#1a1a1a] disabled:text-[#858585] transition-all font-medium"
              >
                {submitting ? 'Saving...' : 'Submit review'}
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
