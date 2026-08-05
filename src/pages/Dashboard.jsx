
import { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { readUserData, writeData } from '../utils/firebaseUtils';
// Pass 2 Finding 7 remediation: privileged admin helpers (data migration,
// duplicate cleanup, unfiltered inspection) are loaded dynamically inside
// the dev-only debug effect below. In production they are not included in
// the page's static import graph, so Vite/Terser can omit them entirely.
import { authService } from '../utils/authService';
import { composeSignalReport } from '../utils/clarityScore';
import { computeBehavioralRecord } from '../utils/behavioralRecord';
import { getBehavioralContext } from '../utils/getBehavioralContext';
import { computeDepthTrend } from '../utils/computeDepthTrend';
import { composeSeededPreview } from '../utils/composeSeededPreview';
import { getUserProfile } from '../utils/userProfile';
import { formatDriftSignalText } from '../utils/relapseTaxonomy';
import { RELAPSE_ENTRY_TYPES } from '../utils/schema';
import { localDateKey, parseDateOnlyLocal, parseDate } from '../utils/dateUtils';
import SignalReport from '../components/SignalReport';
import BehavioralRecord from '../components/BehavioralRecord';
import MorningBrief from '../components/MorningBrief';
import KillListDashboard from '../components/KillListDashboard';
import DailyPrompt from '../components/DailyPrompt';
import MirrorStack from '../components/MirrorStack';
import WeeklyRuleReview from '../components/WeeklyRuleReview';
import PatternConfrontationCard from '../components/PatternConfrontationCard';
import SignalDebriefCard from '../components/SignalDebriefCard';
import { ScoreCard, ActivityItem } from '../components/OuraRing';
import { AppIcon } from '../components/AppIcons';
import { SkeletonDashboard } from '../components/SkeletonLoader';
import ouraToast from '../utils/toast';
import logger from '../utils/logger';
import { useOnboardingHelp } from '../hooks/useOnboardingHelp';
import { WALKTHROUGH_ID } from '../config/dashboardWalkthrough';
import { track } from '../utils/analytics';

// Lazy so a returning user — who will never see it again after one run — pays
// nothing for the tutorial. Mounted inside Dashboard rather than App, so it
// rides this page's existing chunk and self-gates on route by construction.
const DashboardWalkthrough = lazy(() => import('../components/help/DashboardWalkthrough'));

// Mirrors the Synthesis briefing's signal-delta vocabulary so the dashboard's
// consolidated Trajectory header can show the same verdict without recomputing.
const SIGNAL_DELTA_LABELS = { improving: 'Improving', stable: 'Stable', deteriorating: 'Deteriorating' };
const SIGNAL_DELTA_COLORS = { improving: 'text-[#22c55e]', stable: 'text-[#ababab]', deteriorating: 'text-[#ef4444]' };

// Permanent accent bloom for the Quick Actions cards — intentionally always-on
// (not hover-gated) so primary navigation stands apart from the content cards,
// which use the module hover-glow. hex+alpha `1f` (~12%) keeps it a whisper.
const cardGlow = (hex) => ({
  boxShadow: `inset 0 1px 0 rgba(255, 255, 255, 0.05), 0 8px 24px rgba(0, 0, 0, 0.5), 0 0 34px ${hex}1f`,
});

export default function Dashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState(null);
  // Holds the launch source rather than a boolean: the replay path clears
  // location.state as soon as it fires, so the source has to be captured at
  // start or the analytics would attribute every Settings replay to the
  // launcher card. null means the tour is closed.
  const [walkthroughSource, setWalkthroughSource] = useState(null);
  const { ready: helpReady, hasSeenWalkthrough, completeWalkthrough } = useOnboardingHelp();
  const [stats, setStats] = useState({
    journalEntries: 0,
    relapseEntries: 0,
    streakDays: 0,
    killTargets: 0,
    hardLessons: 0
  });
  const [recentEntries, setRecentEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showSkeleton, setShowSkeleton] = useState(false);

  // Signal report replaces the former numeric clarity score + rank.
  const [signalReport, setSignalReport] = useState(null);

  // The Record — effort-weighted cross-module census rendered inside the Oracle
  // card. Null until the deferred pass computes it; the component renders
  // nothing while null or empty.
  const [record, setRecord] = useState(null);

  // Behavioral context — feeds MirrorStack with identityDirection +
  // journalLanguagePattern. Same upstream as Oracle's context injection.
  const [behavioralContext, setBehavioralContext] = useState(null);

  // 30-day metacognitive-depth trend for MirrorStack.
  const [depthTrend, setDepthTrend] = useState(null);

  // Day-one seeded mirror — honest preview built from onboarding answers,
  // shown by MirrorStack only on cold-start (no module data yet).
  const [seededPreview, setSeededPreview] = useState(null);

  // Store raw data for deferred signal report composition
  const [rawUserData, setRawUserData] = useState(null);
  const [composingReport, setComposingReport] = useState(false);

  // Early warning signal
  const [earlyWarning, setEarlyWarning] = useState(null);

  // Drift signals from detectDriftSignals
  const [driftSignals, setDriftSignals] = useState([]);

  // Synthesis Briefing ready indicator
  const [latestSynthesisIsNew, setLatestSynthesisIsNew] = useState(false);
  // Latest synthesis signal delta (improving/stable/deteriorating), surfaced in
  // the consolidated Trajectory header. Captured from the prefetch below.
  const [latestSignalDelta, setLatestSignalDelta] = useState(null);

  // Sunday Autopsy
  const [autopsyText, setAutopsyText] = useState('');
  const [autopsySaving, setAutopsySaving] = useState(false);
  const autopsySessionKey = (() => {
    const today = new Date();
    const sunday = new Date(today);
    sunday.setDate(today.getDate() - today.getDay());
    return `autopsy_dismissed_${localDateKey(sunday)}`;
  })();
  const [autopsyDismissed, setAutopsyDismissed] = useState(
    () => sessionStorage.getItem(autopsySessionKey) === 'true'
  );

  // Collapsible section states
  const [killListExpanded, setKillListExpanded] = useState(true);

  // Sunday Autopsy — show on Sundays
  const isSunday = new Date().getDay() === 0;
  const showAutopsy = isSunday && !autopsyDismissed && !loading;

  // Monday Kill Report
  const [killReportDismissed, setKillReportDismissed] = useState(false);
  const isMonday = new Date().getDay() === 1;

  const submitAutopsy = async () => {
    if (!autopsyText.trim()) return;
    setAutopsySaving(true);
    try {
      await writeData('hardLessons', {
        eventCategory: '',
        eventDescription: autopsyText.trim(),
        myAssumption: '',
        signalIgnored: '',
        costs: [],
        costDescription: '',
        extractedLesson: '',
        ruleGoingForward: '',
        isFinalized: false,
        isScarStub: false,
        isWeeklyAutopsy: true,
        createdAt: new Date().toISOString(),
      });
      ouraToast.success('Week captured — expand the lesson when you\'re ready');
      setAutopsyText('');
      sessionStorage.setItem(autopsySessionKey, 'true');
      setAutopsyDismissed(true);
    } catch (error) {
      logger.error('Error saving weekly autopsy:', error);
      ouraToast.error('Failed to save');
    } finally {
      setAutopsySaving(false);
    }
  };

  // Delay showing skeleton to prevent flicker on fast loads
  useEffect(() => {
    const skeletonTimer = setTimeout(() => {
      if (loading) {
        setShowSkeleton(true);
      }
    }, 250); // Only show skeleton if loading takes > 250ms

    return () => clearTimeout(skeletonTimer);
  }, [loading]);

  // Keep skeleton mounted briefly to prevent blink when data finishes loading
  useEffect(() => {
    let dwellTimer;
    if (!loading && showSkeleton) {
      dwellTimer = setTimeout(() => setShowSkeleton(false), 300);
    }
    return () => clearTimeout(dwellTimer);
  }, [loading, showSkeleton]);

  // Get current user from auth service and load data ONCE
  useEffect(() => {
    const currentUser = authService.getCurrentUser();
    setUser(currentUser);
    logger.log("👤 Dashboard: Current user:", currentUser?.uid);
    
    if (currentUser) {
      loadDashboardData(currentUser);
      // Pass 3 New Finding 7 remediation: log prefetch failures so engineers
      // can distinguish "no new synthesis" from "synthesis read failed".
      readUserData('syntheses').then(data => {
        const sorted = (data || []).sort((a, b) => new Date(b.generatedAt) - new Date(a.generatedAt));
        if (sorted[0]?.isNew === true) setLatestSynthesisIsNew(true);
        if (sorted[0]?.signalDelta) setLatestSignalDelta(sorted[0].signalDelta);
      }).catch((err) => {
        logger.warn('Dashboard: synthesis prefetch failed:', err?.message);
      });
    } else {
      setLoading(false); // Stop loading if no user
    }

    // Dev-mode debug surface (window.debugDashboard, admin helpers,
    // legacy localStorage migration tools) removed. Admin recovery
    // helpers now live at scripts/firebaseAdmin.js (out of the app bundle).
    // Mount-only: loadDashboardData captures the user at mount; re-running on
    // its identity change would reload the dashboard on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount

  const loadDashboardData = useCallback(async (currentUser = user) => {
    if (!currentUser) {
      logger.log("⏳ Dashboard: Waiting for user authentication...");
      return;
    }

    try {
      logger.log("📡 Dashboard: Loading data for user:", currentUser.uid);
      
      // Load ALL data at once - await everything before setting state.
      const [journalEntries, relapseEntries, killTargets, hardLessons, userSettings, confirmedKills] = await Promise.all([
        readUserData('journalEntries').then(data => {
          logger.log("📔 Dashboard: Journal entries loaded:", data?.length || 0);
          return data || [];
        }),
        readUserData('relapseEntries').then(data => {
          logger.log("⚠️ Dashboard: Relapse entries loaded:", data?.length || 0);
          return data || [];
        }),
        readUserData('killTargets').then(data => {
          logger.log("🎯 Dashboard: Kill targets loaded:", data?.length || 0);
          return data || [];
        }),
        readUserData('hardLessons').then(data => {
          logger.log("⚡ Dashboard: Hard lessons loaded:", data?.length || 0);
          return data || [];
        }),
        readUserData('userSettings').then(data => data || []).catch(() => []),
        readUserData('confirmedKills').then(data => {
          logger.log("💀 Dashboard: Confirmed kills loaded:", data?.length || 0);
          return data || [];
        }),
      ]);

      logger.log("📊 Dashboard: All data loaded:", {
        journalEntries: journalEntries.length,
        relapseEntries: relapseEntries.length,
        killTargets: killTargets.length,
        hardLessons: hardLessons.length
      });

      // Days since last ACTUAL relapse — entries flagged entryType: 'relapse'
      // only. Precursor signals do not count (they are early-warning logs,
      // not relapse events). Null when no actual relapse has ever been
      // logged, which prevents the early-warning tile from claiming "Recent
      // relapse within 72 hours" for users who have never relapsed.
      let streakDays = null;
      const actualRelapses = relapseEntries.filter(
        e => e.entryType === RELAPSE_ENTRY_TYPES.RELAPSE
      );
      if (actualRelapses.length > 0) {
        const lastRelapse = new Date(actualRelapses[0].createdAt);
        const today = new Date();
        streakDays = Math.max(0, Math.floor((today - lastRelapse) / (1000 * 60 * 60 * 24)));
      }

      // Kills are MOVED to confirmedKills on close (KillList archive model),
      // so the live killTargets collection never counts them. All-time killed
      // = archived kills + any legacy doc still carrying status:'killed'.
      const legacyKilled = killTargets.filter(t => t.status === 'killed').length;
      const contractsKilled = confirmedKills.length + legacyKilled;
      const contractsTotal = killTargets.length + confirmedKills.length;

      // Set stats to show ALL-TIME counts (not just recent activity)
      // This gives a complete picture of user progress
      setStats({
        journalEntries: journalEntries.length,  // All-time total
        journalEntriesTotal: journalEntries.length,
        relapseEntries: relapseEntries.length,
        streakDays,
        killTargets: contractsKilled,  // All-time killed contracts
        killTargetsTotal: contractsTotal,
        hardLessons: hardLessons.length,  // All-time total
        hardLessonsTotal: hardLessons.length
      });

      // Get recent entries from all sources
      const allEntries = [
        ...journalEntries.slice(0, 3).map(e => ({ ...e, type: 'journal' })),
        ...relapseEntries.slice(0, 2).map(e => ({ ...e, type: 'relapse' })),
        ...hardLessons.slice(0, 2).map(e => ({ ...e, type: 'hardlesson' }))
      ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5);

      setRecentEntries(allEntries);
      
      // Store raw data for the deferred Signal Report composition
      setRawUserData({ journalEntries, relapseEntries, killTargets, hardLessons, userSettings });

      logger.log("✅ Dashboard: Critical data loaded and UI updated", {
        stats: { 
          journalEntries: journalEntries.length,
          relapseEntries: relapseEntries.length,
          killTargets: killTargets.length,
          streakDays
        },
        recentEntries: allEntries.length
      });
      
      // Signal Report composition is deferred to a separate effect after the
      // UI is shown, to avoid blocking initial render.
    } catch (error) {
      logger.error("❌ Dashboard: Error loading critical data:", error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Deferred Signal Report composition — runs after UI renders.
  // The Dashboard already holds the raw cross-module data, so we feed it to
  // composeSignalReport via a synchronous in-memory reader instead of
  // re-fetching from Firestore.
  useEffect(() => {
    if (!loading && rawUserData && !composingReport) {
      setComposingReport(true);

      const timer = setTimeout(async () => {
        try {
          const inMemoryReader = async (name) => rawUserData[name] || [];
          // "Truly cold" = no data in ANY module, journal included. The seeded
          // preview ("what the mirror WILL read once you log") is only honest
          // then — a user who has journaled must not be told the record is
          // blank. Gating the profile read on this also avoids a wasted
          // Firestore fetch for the common (established-user) case.
          const isTrulyCold =
            !(rawUserData.journalEntries || []).length &&
            !(rawUserData.killTargets || []).length &&
            !(rawUserData.hardLessons || []).length &&
            !(rawUserData.relapseEntries || []).length;
          // confirmedKills and syntheses are NOT in rawUserData (the critical
          // load fetches only the four core collections), so the record reads
          // them fresh. Both are single userId-scoped queries, no index. Skipped
          // for a truly cold account — the record would be empty regardless.
          const [report, ctx, profile, confirmedKills, syntheses] = await Promise.all([
            composeSignalReport(user?.uid, { readUserData: inMemoryReader }),
            getBehavioralContext(user?.uid, { readUserData: inMemoryReader, useCache: false }),
            isTrulyCold ? getUserProfile() : Promise.resolve(null),
            isTrulyCold ? Promise.resolve([]) : readUserData('confirmedKills'),
            isTrulyCold ? Promise.resolve([]) : readUserData('syntheses'),
          ]);
          setSignalReport(report);
          setBehavioralContext(ctx);
          setRecord(computeBehavioralRecord({
            killTargets: rawUserData.killTargets || [],
            hardLessons: rawUserData.hardLessons || [],
            journalEntries: rawUserData.journalEntries || [],
            relapseEntries: rawUserData.relapseEntries || [],
            confirmedKills: confirmedKills || [],
            syntheses: syntheses || [],
          }));
          setDepthTrend(computeDepthTrend(rawUserData.journalEntries || []));
          // Non-null only when truly cold, so MirrorStack shows the seeded
          // preview exclusively on a genuine day-one.
          setSeededPreview(isTrulyCold ? composeSeededPreview(profile) : null);

          // Compute early warning signal (unchanged — distinct from Signal Report)
          const NEGATIVE_MOODS = new Set(['heavy','hollow','foggy','chaotic']);
          const POSITIVE_MOODS = new Set(['electric','light','radiant','triumphant','focused','sharp','steady','calm']);
          const recentJournal = (rawUserData.journalEntries || []).slice(0, 7);
          const moodDots = recentJournal.map(e => {
            if (NEGATIVE_MOODS.has(e.mood)) return 'red';
            if (POSITIVE_MOODS.has(e.mood)) return 'green';
            return 'gray';
          });
          const negativeCount = moodDots.filter(m => m === 'red').length;
          const last5negative = moodDots.slice(0, 5).filter(m => m === 'red').length;
          const daysSinceRelapse = stats.streakDays;
          const daysSinceJournal = recentJournal.length > 0 ? (() => {
            const raw = recentJournal[0].createdAt;
            const d = raw?.toDate ? raw.toDate() : new Date(raw);
            return isNaN(d.getTime()) ? 99 : Math.floor((Date.now() - d.getTime()) / 86400000);
          })() : 99;

          let level = 'clear';
          const signals = [];
          if (daysSinceRelapse !== null && daysSinceRelapse < 3) { level = 'high'; signals.push('Recent relapse within 72 hours'); }
          if (last5negative >= 3) { level = level === 'high' ? 'high' : 'elevated'; signals.push('Predominantly negative mood over last 5 entries'); }
          if (daysSinceJournal >= 5) { level = level === 'high' ? 'high' : 'elevated'; signals.push(`No journal entry in ${daysSinceJournal} days`); }
          if (negativeCount >= 2 && daysSinceRelapse !== null && daysSinceRelapse < 14) { level = level === 'high' ? 'high' : 'elevated'; signals.push('Negative mood pattern following recent relapse'); }

          if (level !== 'clear' && recentJournal.length >= 3) {
            setEarlyWarning({ level, signals, moodDots, daysSinceRelapse, daysSinceJournal });
          }

          // Mirror drift signals into the existing Drift Warning banner.
          if (report.driftSignals && report.driftSignals.length > 0) {
            setDriftSignals(report.driftSignals);
          }
        } catch (error) {
          logger.error("❌ Dashboard: Error composing signal report:", error);
        } finally {
          setComposingReport(false);
        }
      }, 100);

      return () => clearTimeout(timer);
    }
    // Recompute only when load state / raw data changes. composingReport is a
    // re-entrancy guard; user?.uid and stats.streakDays are read from the same
    // render. Depending on them would thrash this callback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, rawUserData]);

  const showShell = loading || showSkeleton || !user;

  // The launcher only exists for a user who has never run or skipped the tour.
  // `helpReady` gates it so an already-dismissed card never flashes on load.
  const showWalkthroughLauncher = helpReady && !hasSeenWalkthrough(WALKTHROUGH_ID) && !showShell;

  const finishWalkthrough = useCallback(({ status, atStep }) => {
    setWalkthroughSource(null);
    completeWalkthrough(WALKTHROUGH_ID, { status, atStep });
  }, [completeWalkthrough]);

  // Settings hands the tour back via navigation state, the same mechanism this
  // page already uses to seed a prompt into Journal. Cleared immediately so a
  // reload or a back-navigation does not silently restart it.
  useEffect(() => {
    if (!location.state?.startWalkthrough || showShell) return;
    setWalkthroughSource('settings');
    navigate(location.pathname, { replace: true, state: {} });
  }, [location.state, location.pathname, showShell, navigate]);

  const formatTimeAgo = useCallback((date) => {
    const now = new Date();
    const diff = now - new Date(date);
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days}d ago`;
    return new Date(date).toLocaleDateString();
  }, []);

  const getActivityMeta = useCallback((type) => {
    const meta = {
      journal: { icon: <AppIcon name="journal" size={18} color="#a855f7" glow={false} />, color: '#a855f7', label: 'Journal' },
      relapse: { icon: <AppIcon name="relapse" size={18} color="#f59e0b" glow={false} />, color: '#f59e0b', label: 'Awareness' },
      hardlesson: { icon: <AppIcon name="bolt" size={18} color="#f59e0b" glow={false} />, color: '#f59e0b', label: 'Hard Lesson' }
    };
    return meta[type] || { icon: <AppIcon name="activity" size={18} color="#8a8a8a" glow={false} />, color: '#8a8a8a', label: 'Activity' };
  }, []);

  // Recent Activity click-through — open the source event in its module for
  // review. Journal opens its detail overlay; HardLessons and Relapse scroll
  // to and highlight the card (they have no overlay). The target id rides in
  // router state, read + cleared by a mount effect on each destination page.
  const openActivity = useCallback((entry) => {
    if (!entry?.id) return;
    if (entry.type === 'journal') {
      navigate('/journal', { state: { openEntryId: entry.id } });
    } else if (entry.type === 'hardlesson') {
      navigate('/hardlessons', { state: { focusLessonId: entry.id } });
    } else if (entry.type === 'relapse') {
      navigate('/relapse', { state: { focusEntryId: entry.id } });
    }
  }, [navigate]);

  return (
    <div className="min-h-screen bg-black">
      <div className={`fade-pane ${showShell ? 'visible' : 'hidden'}`}>
        <SkeletonDashboard />
      </div>

      {/* data-tour-ready is the walkthrough's start gate: it must not measure
          anything until the skeleton→content cross-fade has settled, or it
          spotlights the skeleton's geometry. */}
      <div
        className={`fade-pane ${showShell ? 'hidden' : 'visible'}`}
        {...(!showShell && { 'data-tour-ready': 'true' })}
      >
        <div className="relative min-h-screen bg-black animate-fade-in">
          {/* Ambient page glow — a single soft bloom behind the header so the
              black canvas has a light source and cards read as lit, not flat. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 h-[440px]"
            style={{
              background:
                'radial-gradient(ellipse 70% 100% at 50% 0%, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0) 68%)',
            }}
          />
          <div className="relative max-w-6xl mx-auto px-4 py-8">

            {/* Operational header — the time-of-day greeting was removed: Inner Ops
                is a command surface, not a cozy dashboard. Name + stark clause only. */}
            <header className="mb-10 animate-fade-in-up">
              <p className="text-[#858585] text-sm uppercase tracking-widest mb-2">
                {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
              </p>
              <h1 className="text-2xl sm:text-3xl font-bold text-white break-words text-sheen">
                {user?.displayName?.split(' ')[0] || user?.email?.split('@')[0] || 'Operator'}
              </h1>
              <p className="text-[#858585] text-sm mt-1">What your record says today.</p>
            </header>

        {/* First-run launcher. Tap to start, never auto-start: a tour that
            seizes the screen unannounced is the single most resented pattern
            in onboarding. One skip is permanent — Settings is the way back. */}
        {showWalkthroughLauncher && (
          <section className="mb-10 animate-fade-in-up" style={{ animationDelay: '0.04s' }}>
            <div className="oura-card p-5 border-l-4 border-[#4da6ff]">
              <p className="text-[#858585] text-xs uppercase tracking-widest">First run</p>
              <p className="text-[#ababab] text-sm leading-relaxed mt-2">
                What your record says today. Nothing here is entered — every line is read back
                from what you logged.
              </p>
              <p className="text-[#858585] text-sm mt-2">Four things on this screen. Sixty seconds.</p>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  onClick={() => {
                    track('walkthrough_launcher_clicked', {});
                    setWalkthroughSource('launcher');
                  }}
                  className="px-4 py-2.5 rounded-xl text-sm font-medium text-black bg-[#4da6ff] hover:opacity-90 transition-opacity min-h-11"
                >
                  Walk me through it
                </button>
                <button
                  onClick={() => completeWalkthrough(WALKTHROUGH_ID, { status: 'skipped', atStep: null })}
                  className="text-[#858585] hover:text-[#ababab] text-sm transition-colors min-h-11 px-1"
                >
                  Skip
                </button>
              </div>
            </div>
          </section>
        )}

        {/* Synthesis Briefing — Forced State banner (non-dismissible, must open
            before clearing). Full-width above the unified reading so a new
            briefing keeps its prominence; only renders while unread. */}
        {latestSynthesisIsNew && (
          <section className="mb-10 animate-fade-in-up" style={{ animationDelay: '0.02s' }}>
            <div className="oura-card p-6 border border-white/25 bg-[#0d0d0d]">
              <p className="text-xs font-medium uppercase tracking-widest text-white mb-2">Synthesis Briefing</p>
              <p className="text-[#ababab] text-sm mb-5 leading-relaxed">
                A new cross-module intelligence briefing has been generated. Open it to proceed.
              </p>
              <button
                onClick={() => navigate('/synthesis')}
                className="px-6 py-2.5 bg-white text-black text-sm font-medium rounded-xl hover:bg-[#d1d1d1] transition-colors"
              >
                Open Briefing
              </button>
            </div>
          </section>
        )}

        {/* Signal Debrief — signals whose 48h window passed unresolved.
            Prop-driven off rawUserData so an answer patches dashboard state in
            place; "It landed" bridges into the relapse flow via sessionStorage
            (Relapse.jsx remounts RelapseRadar, so router state won't survive). */}
        {rawUserData && (
          <SignalDebriefCard
            entries={rawUserData.relapseEntries || []}
            animationDelay="0.03s"
            onResolved={(entryId, resolution) => {
              setRawUserData(prev => prev ? {
                ...prev,
                relapseEntries: (prev.relapseEntries || []).map(e =>
                  e.id === entryId ? { ...e, resolution } : e
                ),
              } : prev);
            }}
            onLanded={(entry) => {
              try {
                sessionStorage.setItem('signal_debrief_landed', JSON.stringify({ originSignalId: entry.id }));
              } catch { /* ignore storage errors */ }
              navigate('/relapse');
            }}
          />
        )}

        {/* Unified reading — one card, two peer sections. Oracle is the layered
            reflective surface (direction, observed, precursor, synthesis,
            question; selection in composeMirrorReading.js). Trajectory, passed
            as children, answers "is this working?" — the Signal Report under the
            latest Synthesis signal delta. MirrorStack owns the card and divides
            the sections with its own border-t rhythm. */}
        {/* Plain wrapper purely as a tour anchor — wrapping here rather than
            adding the attribute inside MirrorStack keeps that component
            untouched. No animation class: `animate-fade-in-up` uses a
            persisting transform, which would make this a containing block for
            the spotlight's `position: fixed` children. */}
        <div data-tour="mirror">
        <MirrorStack
          killTargets={rawUserData?.killTargets || []}
          hardLessons={rawUserData?.hardLessons || []}
          relapseEntries={rawUserData?.relapseEntries || []}
          signalReport={signalReport}
          behavioralContext={behavioralContext}
          depthTrend={depthTrend}
          seededPreview={seededPreview}
        >
          <div className="flex items-baseline justify-between gap-4 mb-4">
            <h2 className="text-[#858585] text-xs uppercase tracking-widest">Trajectory</h2>
            {latestSignalDelta && (
              <p className="text-[#858585] text-[10px] uppercase tracking-widest">
                Signal Delta{' '}
                <span className={SIGNAL_DELTA_COLORS[latestSignalDelta] || 'text-[#ababab]'}>
                  {SIGNAL_DELTA_LABELS[latestSignalDelta] || latestSignalDelta}
                </span>
              </p>
            )}
          </div>
          <SignalReport report={signalReport} />
          {/* The Record — third peer section of the Oracle card, via the
              children slot. Renders nothing until there is real work; no tour
              anchor (tour step 1 already frames the whole card). */}
          <BehavioralRecord record={record} />
        </MirrorStack>
        </div>

        {/* Today's Reflection — the day's Oracle-sourced prompt and the primary
            journaling entry point. Placed directly under the Oracle reading and
            above Quick Actions: journaling is the module everything else is
            drawn from, so the day's question leads the module launcher. */}
        <section className="mb-10 animate-fade-in-up" style={{ animationDelay: '0.05s' }}>
          <DailyPrompt
            onJournalClick={(promptText) => {
              navigate('/journal', { state: { seedPrompt: promptText || '', fromDailyPrompt: true } });
            }}
          />
        </section>

        {/* Quick Actions — primary navigation. Kept as a permanent accent
            bloom (cardGlow) so it stands apart from the content cards, and
            placed high (directly below the Oracle reading) for accessibility. */}
        <section data-tour="quick-actions" className="mb-10 animate-fade-in-up" style={{ animationDelay: '0.08s' }}>
          <h3 className="text-[#858585] text-xs uppercase tracking-widest mb-4">Quick Actions</h3>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Link to="/journal" className="oura-card p-5 group hover:border-[#a855f7]/50 transition-all" style={cardGlow('#a855f7')}>
              <div className="w-12 h-12 rounded-2xl bg-[#a855f7]/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <AppIcon name="journal" size={28} color="#a855f7" />
              </div>
              <h4 className="text-white font-medium mb-1">Journal</h4>
              <p className="text-[#858585] text-sm">Today's reflection</p>
            </Link>

            <Link to="/ledger" className="oura-card p-5 group hover:border-[#ef4444]/50 transition-all" style={cardGlow('#ef4444')}>
              <div className="w-12 h-12 rounded-2xl bg-[#ef4444]/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <AppIcon name="target" size={28} color="#ef4444" />
              </div>
              <h4 className="text-white font-medium mb-1">General Ledger</h4>
              <p className="text-[#858585] text-sm">Name what needs to die</p>
            </Link>

            <Link to="/hardlessons" className="oura-card p-5 group hover:border-[#f59e0b]/50 transition-all" style={cardGlow('#f59e0b')}>
              <div className="w-12 h-12 rounded-2xl bg-[#f59e0b]/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <AppIcon name="hardLessons" size={28} color="#f59e0b" />
              </div>
              <h4 className="text-white font-medium mb-1">Hard Lessons</h4>
              <p className="text-[#858585] text-sm">Convert cost into a rule</p>
            </Link>

            <Link to="/relapse" className="oura-card p-5 group hover:border-[#00d4aa]/50 transition-all" style={cardGlow('#00d4aa')}>
              <div className="w-12 h-12 rounded-2xl bg-[#00d4aa]/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <AppIcon name="relapse" size={28} color="#00d4aa" />
              </div>
              <h4 className="text-white font-medium mb-1">The Signal</h4>
              <p className="text-[#858585] text-sm">Catch the drift</p>
            </Link>
          </div>
        </section>

        {/* Weekly Rule Review — Sunday-anchored sweep over finalized rules.
            Self-gating: visible Sun-Wed only; returns null on Thu/Fri/Sat,
            when there are no rules, when the user has already reviewed this
            Sunday's window, or while data is loading. */}
        <WeeklyRuleReview />

        {/* Morning Brief — operator-cadence daily readout, Firestore-cached. */}
        {user?.uid && <MorningBrief userId={user.uid} />}

        {/* Pattern Confrontation Card — promotes the top drift signal or rule violation */}
        <PatternConfrontationCard
          signalReport={signalReport}
          hardLessons={rawUserData?.hardLessons || []}
        />

        {/* Early Warning Widget */}
        {earlyWarning && (
          <section className="mb-10 animate-fade-in-up" style={{ animationDelay: '0.08s' }}>
            <div
              className={`oura-card oura-card-accent-hover p-5 border-l-4 transition-all ${
                earlyWarning.level === 'high' ? 'border-[#ef4444]' :
                earlyWarning.level === 'elevated' ? 'border-[#f59e0b]' :
                'border-[#22c55e]'
              }`}
              style={{ '--card-accent-glow': `${earlyWarning.level === 'high' ? '#ef4444' : earlyWarning.level === 'elevated' ? '#f59e0b' : '#22c55e'}4d` }}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-3">
                    <span className={`text-xs font-medium uppercase tracking-widest ${
                      earlyWarning.level === 'high' ? 'text-[#ef4444]' :
                      earlyWarning.level === 'elevated' ? 'text-[#f59e0b]' :
                      'text-[#22c55e]'
                    }`}>
                      {earlyWarning.level === 'high' ? 'High Risk' :
                       earlyWarning.level === 'elevated' ? 'Elevated Risk' : 'On Track'}
                    </span>
                    {earlyWarning.daysSinceRelapse !== null && (
                      <span className="text-[#858585] text-xs">
                        {earlyWarning.daysSinceRelapse === 0 ? 'relapsed today' : `${earlyWarning.daysSinceRelapse}d since last relapse`}
                      </span>
                    )}
                  </div>
                  {earlyWarning.signals.length > 0 && (
                    <div className="space-y-1 mb-3">
                      {earlyWarning.signals.map((s, i) => (
                        <p key={i} className="text-[#ababab] text-sm">{s}</p>
                      ))}
                    </div>
                  )}
                  {/* Mood dots — last 7 journal entries, left = most recent */}
                  {earlyWarning.moodDots.length > 0 && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-[#858585] text-xs mr-1">Mood</span>
                      {earlyWarning.moodDots.map((color, i) => (
                        <div
                          key={i}
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: color === 'red' ? '#ef4444' : color === 'green' ? '#22c55e' : '#2a2a2a' }}
                        />
                      ))}
                      <span className="text-[#858585] text-xs ml-1">← recent</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Drift Signal Warning — UXR-002 Spec 4: bare lowercase prose. No color
            coding, no badges, no alert-state visuals. The language carries the
            weight, not the styling. */}
        {driftSignals.length > 0 && (
          <section className="mb-10 animate-fade-in-up" style={{ animationDelay: '0.09s' }}>
            <div className="space-y-1">
              {driftSignals.map((signal, idx) => (
                <p key={idx} className="text-[#ababab] text-sm lowercase">
                  {formatDriftSignalText(signal)}
                </p>
              ))}
            </div>
          </section>
        )}

        {/* Sunday Autopsy — weekly lesson capture */}
        {showAutopsy && (
          <section className="mb-10 animate-fade-in-up" style={{ animationDelay: '0.09s' }}>
            <div className="oura-card p-6 border-l-4 border-[#f59e0b] hover:shadow-oura-glow-amber transition-all">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-white text-sm font-medium mb-1">What did this week cost you?</h3>
                  <p className="text-[#858585] text-xs">Name one thing you'd handle differently. This becomes a Hard Lesson draft.</p>
                </div>
                <button
                  onClick={() => { sessionStorage.setItem(autopsySessionKey, 'true'); setAutopsyDismissed(true); }}
                  className="text-[#858585] hover:text-[#858585] transition-colors shrink-0"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={autopsyText}
                  onChange={(e) => setAutopsyText(e.target.value)}
                  placeholder="I should have..."
                  className="flex-1 p-3 bg-[#0a0a0a] text-white text-sm rounded-xl border border-[#1a1a1a] focus:border-[#f59e0b] focus:outline-none transition-colors placeholder-[#828282]"
                  onKeyDown={(e) => { if (e.key === 'Enter' && autopsyText.trim()) submitAutopsy(); }}
                />
                <button
                  onClick={submitAutopsy}
                  disabled={autopsySaving || !autopsyText.trim()}
                  className="px-4 py-3 bg-[#f59e0b] hover:bg-[#ea580c] disabled:bg-[#1a1a1a] disabled:text-[#858585] text-white text-sm font-medium rounded-xl transition-all shrink-0"
                >
                  {autopsySaving ? '...' : 'Capture'}
                </button>
              </div>
            </div>
          </section>
        )}

        {/* Monday Kill Report */}
        {isMonday && !killReportDismissed && !loading && rawUserData?.killTargets?.length > 0 && (() => {
          const now = Date.now();
          const weekAgo = now - 7 * 86400000;
          const activeTargets = rawUserData.killTargets.filter(t => t.status === 'active');
          const held = activeTargets.filter(t => {
            const recentChecks = (t.checkIns || []).filter(c => ((parseDateOnlyLocal(c.date) || parseDate(c.date))?.getTime() ?? 0) > weekAgo);
            return recentChecks.length > 0 && recentChecks.every(c => c.held);
          }).length;
          const escaped = activeTargets.filter(t => {
            const recentChecks = (t.checkIns || []).filter(c => ((parseDateOnlyLocal(c.date) || parseDate(c.date))?.getTime() ?? 0) > weekAgo);
            return recentChecks.some(c => !c.held);
          }).length;
          const untouched = activeTargets.filter(t => {
            const recentChecks = (t.checkIns || []).filter(c => ((parseDateOnlyLocal(c.date) || parseDate(c.date))?.getTime() ?? 0) > weekAgo);
            return recentChecks.length === 0;
          }).length;
          if (held === 0 && escaped === 0 && untouched === 0) return null;
          return (
            <section className="mb-10 animate-fade-in-up" style={{ animationDelay: '0.092s' }}>
              <div className="oura-card p-5 border-l-4 border-[#00d4aa] hover:shadow-oura-glow-cyan transition-all">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="text-white text-sm font-medium mb-1">Last Week's Record</h3>
                    <p className="text-[#858585] text-xs">Across {activeTargets.length} active contract{activeTargets.length !== 1 ? 's' : ''}</p>
                  </div>
                  <button onClick={() => setKillReportDismissed(true)} className="text-[#858585] hover:text-[#858585] transition-colors shrink-0">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M18 6L6 18M6 6l12 12" /></svg>
                  </button>
                </div>
                <div className="flex items-center gap-4">
                  {held > 0 && <span className="text-[#22c55e] text-sm"><span className="text-lg font-medium tabular-nums">{held}</span> held</span>}
                  {escaped > 0 && <span className="text-[#ef4444] text-sm"><span className="text-lg font-medium tabular-nums">{escaped}</span> escaped</span>}
                  {untouched > 0 && <span className="text-[#858585] text-sm"><span className="text-lg font-medium tabular-nums">{untouched}</span> untouched</span>}
                </div>
                {untouched > 0 && (
                  <p className="text-[#858585] text-xs mt-2">{untouched} target{untouched > 1 ? 's' : ''} had zero check-ins last week.</p>
                )}
              </div>
            </section>
          );
        })()}

        {/* The Record lives in the Oracle card above (MirrorStack's children
            slot), so the census reads as part of the unified reading rather
            than a detached section. It carries no tour anchor of its own —
            step 1 already frames the whole card. The raw per-module totals
            are a separate surface and deliberately stay — now paired with
            Recent Activity in the row below. */}

        {/* Kill List Dashboard — collapsible. Collapsed, the header carries the
            module accent and the active-contract count so the section reads as
            a closed drawer with content behind it, not a stray label. Expanded,
            it drops back to the plain section-label rhythm so it doesn't
            compete with the cards it opens onto. */}
        <section className="mb-10 animate-fade-in-up" style={{ animationDelay: '0.4s' }}>
          {(() => {
            const activeCount = (rawUserData?.killTargets || []).filter(t => t.status === 'active').length;
            return (
              <button
                onClick={() => setKillListExpanded(prev => !prev)}
                className={`flex items-center justify-between w-full mb-4 group transition-all ${
                  killListExpanded
                    ? ''
                    : 'oura-card px-5 py-4 hover:border-[#ef4444]/50'
                }`}
                style={killListExpanded ? undefined : cardGlow('#ef4444')}
              >
                <div className="flex items-center gap-3">
                  {!killListExpanded && (
                    <div className="w-9 h-9 rounded-xl bg-[#ef4444]/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                      <AppIcon name="target" size={20} color="#ef4444" />
                    </div>
                  )}
                  <div className="text-left">
                    <h3 className={`uppercase tracking-widest transition-colors ${
                      killListExpanded
                        ? 'text-[#858585] text-xs group-hover:text-[#ababab]'
                        : 'text-white text-xs font-medium'
                    }`}>General Ledger</h3>
                    {!killListExpanded && (
                      <p className="text-[#858585] text-sm mt-0.5">
                        {activeCount > 0
                          ? `${activeCount} active kill contract${activeCount === 1 ? '' : 's'}`
                          : 'No active kill contracts'}
                      </p>
                    )}
                  </div>
                </div>
                <svg
                  width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                  className={`transition-all duration-200 ${
                    killListExpanded ? 'rotate-180 text-[#858585]' : 'text-[#ef4444]'
                  }`}
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
            );
          })()}
          {killListExpanded && <KillListDashboard />}
        </section>

        {/* Recent Activity + All-Time Stats — paired in one row to keep the
            page compact. Stats sit as a 2×2 square in the right column. */}
        {/* grid-cols-1 is load-bearing on mobile: a bare `grid` leaves the
            implicit column auto-sized, so the nowrap activity titles inflate
            the track past the viewport and drag the stats grid with it. */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fade-in-up" style={{ animationDelay: '0.5s' }}>

          {/* Recent Activity */}
          <section>
            <h3 className="text-[#858585] text-xs uppercase tracking-widest mb-4">Recent Activity</h3>
            <div className="space-y-3">
              {recentEntries.length > 0 ? (
                recentEntries.map((entry, index) => {
                  const meta = getActivityMeta(entry.type);
                  return (
                    <ActivityItem
                      key={index}
                      type={meta.label}
                      title={entry.type === 'hardlesson'
                        ? (entry.extractedLesson || entry.eventDescription || 'Hard lesson extracted')
                        : (entry.content || entry.reflection || entry.notes || 'Entry recorded')}
                      description={entry.type === 'hardlesson' && entry.ruleGoingForward ? `Rule: ${entry.ruleGoingForward}` : null}
                      time={formatTimeAgo(entry.createdAt)}
                      icon={meta.icon}
                      color={meta.color}
                      onClick={() => openActivity(entry)}
                    />
                  );
                })
              ) : (
                <div className="oura-card p-8 text-center">
                  <div className="mb-3 flex justify-center opacity-40"><AppIcon name="insight" size={40} color="#5a5a5a" glow={false} /></div>
                  <p className="text-[#858585]">Nothing logged yet.</p>
                  <p className="text-[#858585] text-sm mt-1 max-w-sm mx-auto">The system has no signal to read. Start with the journal — the Oracle reads what you write.</p>
                  <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-5">
                    <Link
                      to="/journal"
                      className="px-5 py-2.5 bg-[#4da6ff] hover:bg-[#3d8fd9] text-black rounded-xl transition-all duration-300 font-medium text-sm"
                    >
                      Write an entry
                    </Link>
                    <Link
                      to="/ledger"
                      className="px-5 py-2.5 bg-transparent border border-[#1a1a1a] text-[#ababab] hover:text-white hover:border-[#2a2a2a] rounded-xl transition-all duration-300 font-medium text-sm"
                    >
                      Name a contract
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* All-Time Stats — 2×2 square. Retains the data-tour="stats" anchor
              the walkthrough's final step targets. The grid fills the column so
              the square matches Recent Activity's height instead of running
              short; cards stretch and center their content (auto-rows-fr +
              ScoreCard h-full). */}
          <section data-tour="stats" className="flex flex-col">
            <h3 className="text-[#858585] text-xs uppercase tracking-widest mb-4">Your Stats (All-Time)</h3>
            <div className="grid grid-cols-2 auto-rows-fr gap-4 flex-1">
              <ScoreCard score={stats.killTargets} label="Kills" sublabel={`of ${stats.killTargetsTotal || 0} contracts`} color="#ef4444" icon={<AppIcon name="target" size={20} color="#ef4444" />} size="small" glow />
              <ScoreCard score={stats.hardLessons} label="Lessons" sublabel={`of ${stats.hardLessonsTotal || 0} total`} color="#f59e0b" icon={<AppIcon name="hardLessons" size={20} color="#f59e0b" />} size="small" glow />
              <ScoreCard score={stats.journalEntries} label="Journal" sublabel={`of ${stats.journalEntriesTotal || 0} total`} color="#a855f7" icon={<AppIcon name="journal" size={20} color="#a855f7" />} size="small" glow />
              <ScoreCard score={stats.relapseEntries || 0} label="Signal" sublabel={`of ${stats.relapseEntries || 0} total`} color="#00d4aa" icon={<AppIcon name="relapse" size={20} color="#00d4aa" />} size="small" glow />
            </div>
          </section>

          </div>

        {/* This is the mount point, not the render location: the overlay
            portals itself to <body>. Two separate hazards on this page make
            that necessary, and both were caught only by driving a browser —
            `animate-fade-in-up` leaves an identity transform behind, which
            establishes a containing block for `position: fixed`, and
            `animate-fade-in` on the page wrapper establishes a stacking
            context that traps z-index. See SpotlightOverlay.jsx.
            What this location still buys: the tutorial rides Dashboard's lazy
            chunk, self-gates on route by construction, and leaves App.jsx
            alone. Suspense falls back to null — a spinner over a dimmed page
            is worse than a beat of nothing. */}
        {walkthroughSource && (
          <Suspense fallback={null}>
            <DashboardWalkthrough source={walkthroughSource} onFinish={finishWalkthrough} />
          </Suspense>
        )}

        </div>

        {/* Debug panel and window.debugDashboard surface removed.
            Admin recovery helpers live at scripts/firebaseAdmin.js. */}
      </div>
      </div>
    </div>
  );
}
