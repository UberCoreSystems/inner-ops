
import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { readUserData, writeData } from '../utils/firebaseUtils';
// Pass 2 Finding 7 remediation: privileged admin helpers (data migration,
// duplicate cleanup, unfiltered inspection) are loaded dynamically inside
// the dev-only debug effect below. In production they are not included in
// the page's static import graph, so Vite/Terser can omit them entirely.
import { authService } from '../utils/authService';
import { composeSignalReport, getBehavioralRecordDensity } from '../utils/clarityScore';
import { getBehavioralContext } from '../utils/getBehavioralContext';
import { computeDepthTrend } from '../utils/computeDepthTrend';
import { formatDriftSignalText } from '../utils/relapseTaxonomy';
import { RELAPSE_ENTRY_TYPES } from '../utils/schema';
import SignalReport from '../components/SignalReport';
import BehavioralRecordDensity from '../components/BehavioralRecordDensity';
import MorningBrief from '../components/MorningBrief';
import KillListDashboard from '../components/KillListDashboard';
import TodaysReflectionModal from '../components/TodaysReflectionModal';
import DailyPrompt from '../components/DailyPrompt';
import MirrorStack from '../components/MirrorStack';
import WeeklyRuleReview from '../components/WeeklyRuleReview';
import PatternConfrontationCard from '../components/PatternConfrontationCard';
import { ScoreCard, ActivityItem } from '../components/OuraRing';
import { AppIcon } from '../components/AppIcons';
import { SkeletonDashboard } from '../components/SkeletonLoader';
import ouraToast from '../utils/toast';
import logger from '../utils/logger';

// BM v2 deferred — match the gate used in App.jsx and Navbar.jsx.
const BLACK_MIRROR_ENABLED = import.meta.env.VITE_ENABLE_BLACK_MIRROR === 'true';

export default function Dashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [todaysReflectionOpen, setTodaysReflectionOpen] = useState(false);
  // Tracks whether the TodaysReflectionModal was opened by DailyPrompt's
  // "Journal This" button. A successful save in that case marks today's
  // reflection as answered (DailyPrompt hides itself for the rest of the day).
  const [todaysReflectionFromPrompt, setTodaysReflectionFromPrompt] = useState(false);
  const [todaysReflectionInitialEntry, setTodaysReflectionInitialEntry] = useState('');
  const [dailyPromptAnsweredSignal, setDailyPromptAnsweredSignal] = useState(0);
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

  // Behavioral Record Density — factual inventory of work produced.
  const [density, setDensity] = useState(null);

  // Behavioral context — feeds MirrorStack with identityDirection +
  // journalLanguagePattern. Same upstream as Oracle's context injection.
  const [behavioralContext, setBehavioralContext] = useState(null);

  // 30-day metacognitive-depth trend for MirrorStack.
  const [depthTrend, setDepthTrend] = useState(null);

  // Store raw data for deferred signal report composition
  const [rawUserData, setRawUserData] = useState(null);
  const [composingReport, setComposingReport] = useState(false);

  // Early warning signal
  const [earlyWarning, setEarlyWarning] = useState(null);

  // Drift signals from detectDriftSignals
  const [driftSignals, setDriftSignals] = useState([]);

  // Synthesis Briefing ready indicator
  const [latestSynthesisIsNew, setLatestSynthesisIsNew] = useState(false);

  // Sunday Autopsy
  const [autopsyText, setAutopsyText] = useState('');
  const [autopsySaving, setAutopsySaving] = useState(false);
  const autopsySessionKey = (() => {
    const today = new Date();
    const sunday = new Date(today);
    sunday.setDate(today.getDate() - today.getDay());
    return `autopsy_dismissed_${sunday.toISOString().split('T')[0]}`;
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
      // blackMirrorEntries is gated behind the feature flag so v1 deploys
      // (BM disabled) skip the round-trip entirely.
      const [journalEntries, relapseEntries, killTargets, blackMirrorEntries, hardLessons, userSettings] = await Promise.all([
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
        BLACK_MIRROR_ENABLED
          ? readUserData('blackMirrorEntries').then(data => {
              logger.log("📱 Dashboard: Black mirror entries loaded:", data?.length || 0);
              return data || [];
            })
          : Promise.resolve([]),
        readUserData('hardLessons').then(data => {
          logger.log("⚡ Dashboard: Hard lessons loaded:", data?.length || 0);
          return data || [];
        }),
        readUserData('userSettings').then(data => data || []).catch(() => []),
      ]);

      logger.log("📊 Dashboard: All data loaded:", {
        journalEntries: journalEntries.length,
        relapseEntries: relapseEntries.length,
        killTargets: killTargets.length,
        blackMirrorEntries: blackMirrorEntries.length,
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

      // Set stats to show ALL-TIME counts (not just recent activity)
      // This gives a complete picture of user progress
      setStats({
        journalEntries: journalEntries.length,  // All-time total
        journalEntriesTotal: journalEntries.length,
        relapseEntries: relapseEntries.length,
        streakDays,
        killTargets: killTargets.length,  // All-time total
        killTargetsTotal: killTargets.length,
        hardLessons: hardLessons.length,  // All-time total
        hardLessonsTotal: hardLessons.length,
        blackMirrorEntries: blackMirrorEntries.length,  // All-time total
        blackMirrorEntriesTotal: blackMirrorEntries.length
      });

      // Get recent entries from all sources
      const allEntries = [
        ...journalEntries.slice(0, 3).map(e => ({ ...e, type: 'journal' })),
        ...relapseEntries.slice(0, 2).map(e => ({ ...e, type: 'relapse' })),
        ...hardLessons.slice(0, 2).map(e => ({ ...e, type: 'hardlesson' })),
        ...blackMirrorEntries.slice(0, 2).map(e => ({ ...e, type: 'blackmirror' }))
      ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5);

      setRecentEntries(allEntries);
      
      // Store raw data for deferred clarity score calculation
      setRawUserData({ journalEntries, relapseEntries, killTargets, blackMirrorEntries, hardLessons, userSettings });

      logger.log("✅ Dashboard: Critical data loaded and UI updated", {
        stats: { 
          journalEntries: journalEntries.length,
          relapseEntries: relapseEntries.length,
          killTargets: killTargets.length,
          streakDays
        },
        recentEntries: allEntries.length
      });
      
      // Defer clarity score calculation to avoid blocking initial render
      // This will be calculated in a separate effect after UI is shown
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
          const [report, densityResult, ctx] = await Promise.all([
            composeSignalReport(user?.uid, { readUserData: inMemoryReader }),
            getBehavioralRecordDensity(user?.uid, { readUserData: inMemoryReader }),
            getBehavioralContext(user?.uid, { readUserData: inMemoryReader, useCache: false }),
          ]);
          setSignalReport(report);
          setDensity(densityResult);
          setBehavioralContext(ctx);
          setDepthTrend(computeDepthTrend(rawUserData.journalEntries || []));

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
      journal: { icon: '📝', color: '#a855f7', label: 'Journal' },
      relapse: { icon: '⚠️', color: '#f59e0b', label: 'Awareness' },
      hardlesson: { icon: '⚡', color: '#f59e0b', label: 'Hard Lesson' },
      blackmirror: { icon: '📱', color: '#4da6ff', label: 'Mirror Check' }
    };
    return meta[type] || { icon: '📊', color: '#8a8a8a', label: 'Activity' };
  }, []);

  return (
    <div className="min-h-screen bg-black">
      <div className={`fade-pane ${showShell ? 'visible' : 'hidden'}`}>
        <SkeletonDashboard />
      </div>

      <div className={`fade-pane ${showShell ? 'hidden' : 'visible'}`}>
        <div className="min-h-screen bg-black animate-fade-in">
          <div className="max-w-6xl mx-auto px-4 py-8">

            {/* Oura-style Header */}
            {/* NOTE (Morning Brief integration): the "Good morning, <name>" greeting
                below is the kind of cozy UX Inner Ops rejects now that the
                Morning Brief is the first-contact surface. Flagged for removal
                in a follow-up — keeping it here without product sign-off would
                overreach the current task's scope. */}
            <header className="mb-10 animate-fade-in-up">
              <p className="text-[#858585] text-sm uppercase tracking-widest mb-2">
                {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
              </p>
              <h1 className="text-2xl sm:text-3xl font-bold text-white break-words">
                Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'}, {user?.displayName?.split(' ')[0] || user?.email?.split('@')[0] || 'Warrior'}
              </h1>
            </header>

        {/* Synthesis Briefing — Forced State (non-dismissible, must open before clearing) */}
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

        {/* Mirror Stack — layered reflective surface (direction, observed,
            precursor, synthesis, question). Content selection lives in
            composeMirrorReading.js. */}
        <MirrorStack
          killTargets={rawUserData?.killTargets || []}
          hardLessons={rawUserData?.hardLessons || []}
          relapseEntries={rawUserData?.relapseEntries || []}
          signalReport={signalReport}
          behavioralContext={behavioralContext}
          depthTrend={depthTrend}
        />

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

        {/* Daily Prompt Section */}
        <section className="mb-10 animate-fade-in-up" style={{ animationDelay: '0.05s' }}>
          <DailyPrompt
            onJournalClick={(promptText) => {
              setTodaysReflectionInitialEntry(promptText || '');
              setTodaysReflectionFromPrompt(true);
              setTodaysReflectionOpen(true);
            }}
            answeredSignal={dailyPromptAnsweredSignal}
          />
        </section>

        {/* Early Warning Widget */}
        {earlyWarning && (
          <section className="mb-10 animate-fade-in-up" style={{ animationDelay: '0.08s' }}>
            <div className={`oura-card p-5 border-l-4 ${
              earlyWarning.level === 'high' ? 'border-[#ef4444]' :
              earlyWarning.level === 'elevated' ? 'border-[#f59e0b]' :
              'border-[#22c55e]'
            }`}>
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
            <div className="oura-card p-6 border-l-4 border-[#f59e0b]">
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
                  className="flex-1 p-3 bg-[#0a0a0a] text-white text-sm rounded-xl border border-[#1a1a1a] focus:border-[#f59e0b] focus:outline-none transition-colors placeholder-[#555555]"
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
            const recentChecks = (t.checkIns || []).filter(c => new Date(c.date).getTime() > weekAgo);
            return recentChecks.length > 0 && recentChecks.every(c => c.held);
          }).length;
          const escaped = activeTargets.filter(t => {
            const recentChecks = (t.checkIns || []).filter(c => new Date(c.date).getTime() > weekAgo);
            return recentChecks.some(c => !c.held);
          }).length;
          const untouched = activeTargets.filter(t => {
            const recentChecks = (t.checkIns || []).filter(c => new Date(c.date).getTime() > weekAgo);
            return recentChecks.length === 0;
          }).length;
          if (held === 0 && escaped === 0 && untouched === 0) return null;
          return (
            <section className="mb-10 animate-fade-in-up" style={{ animationDelay: '0.092s' }}>
              <div className="oura-card p-5 border-l-4 border-[#00d4aa]">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="text-white text-sm font-medium mb-1">Last Week's Record</h3>
                    <p className="text-[#858585] text-xs">Across {activeTargets.length} active battle{activeTargets.length !== 1 ? 's' : ''}</p>
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

        {/* Signal Report — prose-only, no score, no rank, no rings */}
        <section className="mb-10 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
          <div className="oura-card p-6 border-l-2 border-[#00d4aa]/40">
            <p className="text-xs font-medium uppercase tracking-widest text-[#00d4aa] mb-3">Signal Report</p>
            <SignalReport report={signalReport} />
          </div>
        </section>

        {/* Behavioral Record Density — factual inventory of work produced.
            Leads the factual-metrics surface; SignalReport leads the trajectory
            surface above. No scores, no ranks, no bars. Only non-zero lines. */}
        <section className="mb-10 animate-fade-in-up" style={{ animationDelay: '0.15s' }}>
          <h3 className="text-[#858585] text-xs uppercase tracking-widest mb-4">Behavioral Record</h3>
          <div className="oura-card p-6 border-l-2 border-[#00d4aa]/40">
            <BehavioralRecordDensity density={density} />
          </div>
        </section>

        {/* Stats Grid - Oura Score Cards */}
        <section className="mb-10 animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
          <h3 className="text-[#858585] text-xs uppercase tracking-widest mb-4">Your Stats (All-Time)</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <ScoreCard score={stats.killTargets} label="Targets" sublabel={`of ${stats.killTargetsTotal || 0} total`} color="#ef4444" icon={<AppIcon name="target" size={20} color="#ef4444" />} size="small" />
            <ScoreCard score={stats.hardLessons} label="Lessons" sublabel={`of ${stats.hardLessonsTotal || 0} total`} color="#f59e0b" icon={<AppIcon name="hardLessons" size={20} color="#f59e0b" />} size="small" />
            <ScoreCard score={stats.journalEntries} label="Journal" sublabel={`of ${stats.journalEntriesTotal || 0} total`} color="#a855f7" icon={<AppIcon name="journal" size={20} color="#a855f7" />} size="small" />
            <ScoreCard score={stats.relapseEntries || 0} label="Signal" sublabel={`of ${stats.relapseEntries || 0} total`} color="#00d4aa" icon={<AppIcon name="relapse" size={20} color="#00d4aa" />} size="small" />
          </div>
        </section>

        {/* Quick Actions - Oura Style */}
        <section className="mb-10 animate-fade-in-up" style={{ animationDelay: '0.3s' }}>
          <h3 className="text-[#858585] text-xs uppercase tracking-widest mb-4">Quick Actions</h3>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Link to="/journal" className="oura-card p-5 group hover:border-[#a855f7]/50 transition-all">
              <div className="w-12 h-12 rounded-2xl bg-[#a855f7]/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <AppIcon name="journal" size={28} color="#a855f7" />
              </div>
              <h4 className="text-white font-medium mb-1">Journal</h4>
              <p className="text-[#858585] text-sm">Reflect & process</p>
            </Link>
            
            <Link to="/ledger" className="oura-card p-5 group hover:border-[#ef4444]/50 transition-all">
              <div className="w-12 h-12 rounded-2xl bg-[#ef4444]/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <AppIcon name="target" size={28} color="#ef4444" />
              </div>
              <h4 className="text-white font-medium mb-1">General Ledger</h4>
              <p className="text-[#858585] text-sm">Eliminate patterns</p>
            </Link>

            <Link to="/hardlessons" className="oura-card p-5 group hover:border-[#f59e0b]/50 transition-all">
              <div className="w-12 h-12 rounded-2xl bg-[#f59e0b]/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <AppIcon name="hardLessons" size={28} color="#f59e0b" />
              </div>
              <h4 className="text-white font-medium mb-1">Hard Lessons</h4>
              <p className="text-[#858585] text-sm">Turn pain to wisdom</p>
            </Link>

            <Link to="/relapse" className="oura-card p-5 group hover:border-[#00d4aa]/50 transition-all">
              <div className="w-12 h-12 rounded-2xl bg-[#00d4aa]/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <AppIcon name="relapse" size={28} color="#00d4aa" />
              </div>
              <h4 className="text-white font-medium mb-1">The Signal</h4>
              <p className="text-[#858585] text-sm">Catch the drift</p>
            </Link>
          </div>
        </section>

        {/* Kill List Dashboard — collapsible */}
        <section className="mb-10 animate-fade-in-up" style={{ animationDelay: '0.4s' }}>
          <button
            onClick={() => setKillListExpanded(prev => !prev)}
            className="flex items-center justify-between w-full mb-4 group"
          >
            <h3 className="text-[#858585] text-xs uppercase tracking-widest group-hover:text-[#ababab] transition-colors">General Ledger</h3>
            <svg
              width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              className={`text-[#858585] group-hover:text-[#858585] transition-all duration-200 ${killListExpanded ? 'rotate-180' : ''}`}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          {killListExpanded && <KillListDashboard />}
        </section>

        {/* Two Column: Activity + Insights */}
        <div className="grid lg:grid-cols-2 gap-6 animate-fade-in-up" style={{ animationDelay: '0.5s' }}>
          
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
                    />
                  );
                })
              ) : (
                <div className="oura-card p-8 text-center">
                  <div className="text-4xl mb-3 opacity-30">📊</div>
                  <p className="text-[#858585]">No recent activity</p>
                  <p className="text-[#858585] text-sm mt-1">Start using the modules to track progress</p>
                  <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-5">
                    <button
                      onClick={() => setTodaysReflectionOpen(true)}
                      className="px-5 py-2.5 bg-[#00d4aa] hover:bg-[#00e6b8] text-black rounded-xl transition-all duration-300 font-medium text-sm"
                    >
                      Today's Reflection
                    </button>
                    <Link
                      to="/ledger"
                      className="px-5 py-2.5 bg-transparent border border-[#1a1a1a] text-[#ababab] hover:text-white hover:border-[#2a2a2a] rounded-xl transition-all duration-300 font-medium text-sm"
                    >
                      Add a Kill Contract
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </section>

          </div>
        </div>

        {/* Today's Reflection Modal */}
        <TodaysReflectionModal
          isOpen={todaysReflectionOpen}
          initialEntry={todaysReflectionInitialEntry}
          onClose={() => {
            setTodaysReflectionOpen(false);
            setTodaysReflectionFromPrompt(false);
            setTodaysReflectionInitialEntry('');
          }}
          onSuccess={() => {
            // Refresh data after successful entry
            loadDashboardData();
            if (todaysReflectionFromPrompt) {
              setDailyPromptAnsweredSignal((n) => n + 1);
            }
          }}
        />

        {/* Debug panel and window.debugDashboard surface removed.
            Admin recovery helpers live at scripts/firebaseAdmin.js. */}
      </div>
      </div>
    </div>
  );
}
