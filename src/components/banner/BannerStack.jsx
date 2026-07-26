import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { subscribeToUserData, upsertUserSettings } from '../../utils/firebaseUtils';
import { getUserProfile } from '../../utils/userProfile';
import { evaluateAllTriggers, layoutBanners } from '../../utils/engagementTriggers';
import { DEFAULT_NOTIFICATION_PREFERENCES } from '../../utils/schema';
import { isExemptPath } from '../../utils/routeGating';
import ouraToast from '../../utils/toast';
import logger from '../../utils/logger';

/**
 * Top-of-app banner stack. Evaluates engagement triggers against currently-
 * loaded user state and renders up to one banner pre-deploy (stack-of-2 +
 * "+N more" deferred to v1.1).
 *
 * Data sourcing:
 *   journalEntries — realtime subscription bounded to the newest entry. The
 *     only consumer (journalStaleness) reads the most recent timestamp, so an
 *     app-wide listener over the user's entire highest-volume collection buys
 *     nothing. New entries still dismiss the banner without a navigation.
 *   userSettings   — realtime subscription. Toggling a notification off in
 *     /settings hides the banner immediately.
 *   userProfile    — one-shot read on mount/auth change. Personal context
 *     rarely changes mid-session and the read is doc-keyed (no listener
 *     wired in firebaseUtils for that pattern). The profile is re-fetched
 *     when the user signs back in.
 *
 * Hidden on /auth, /onboarding, /oura/callback — banner is the wrong
 * surface before the user has actually entered the app.
 */
export default function BannerStack({ user }) {
  const location = useLocation();
  const [journalEntries, setJournalEntries] = useState([]);
  const [killTargets, setKillTargets] = useState([]);
  const [syntheses, setSyntheses] = useState([]);
  const [userProfile, setUserProfile] = useState(null);
  const [notificationPreferences, setNotificationPreferences] = useState(
    DEFAULT_NOTIFICATION_PREFERENCES
  );
  const [bannerDismissals, setBannerDismissals] = useState({});
  const [loaded, setLoaded] = useState(false);

  // Subscription unsubscribers held in refs so cleanup runs even if the
  // promise resolves after unmount.
  const journalUnsubRef = useRef(null);
  const killTargetsUnsubRef = useRef(null);
  const synthesesUnsubRef = useRef(null);
  const settingsUnsubRef = useRef(null);
  // One notice per mount — four listeners dying together (network drop) must
  // not stack four toasts.
  const listenerDeathNotifiedRef = useRef(false);

  const notifyListenerDeath = useCallback((collectionName, error) => {
    logger.error(`BannerStack ${collectionName} listener stopped:`, error?.code || error?.message);
    if (listenerDeathNotifiedRef.current) return;
    listenerDeathNotifiedRef.current = true;
    ouraToast.error('Live updates stopped. Refresh to reconnect.');
  }, []);

  useEffect(() => {
    if (!user) {
      setJournalEntries([]);
      setKillTargets([]);
      setSyntheses([]);
      setUserProfile(null);
      setNotificationPreferences(DEFAULT_NOTIFICATION_PREFERENCES);
      setBannerDismissals({});
      setLoaded(false);
      return;
    }

    let active = true;
    listenerDeathNotifiedRef.current = false;

    // One-shot profile read — rarely changes mid-session.
    (async () => {
      try {
        const profile = await getUserProfile();
        if (!active) return;
        setUserProfile(profile || {});
      } catch (err) {
        logger.warn('BannerStack profile read failed:', err);
        if (active) setUserProfile({});
      }
    })();

    // Realtime journal entries — new entries silence the staleness banner
    // without a route change. Bounded to the newest doc; the (userId ASC,
    // timestamp DESC) composite index in firestore.indexes.json covers it,
    // and firebaseUtils degrades to an unbounded listener if it is missing.
    subscribeToUserData('journalEntries', (data) => {
      if (!active) return;
      setJournalEntries(data || []);
    }, {
      orderByField: 'timestamp',
      orderDirection: 'desc',
      limit: 1,
      onError: (err) => { if (active) notifyListenerDeath('journalEntries', err); },
    }).then((unsub) => {
      if (!active) { unsub(); return; }
      journalUnsubRef.current = unsub;
    }).catch((err) => {
      logger.warn('BannerStack journal subscribe failed:', err);
    });

    // Realtime kill targets — feeds the daily check-in trigger. A check-in
    // or a new/closed contract updates banner state without a route change.
    subscribeToUserData('killTargets', (data) => {
      if (!active) return;
      setKillTargets(data || []);
    }, {
      onError: (err) => { if (active) notifyListenerDeath('killTargets', err); },
    }).then((unsub) => {
      if (!active) { unsub(); return; }
      killTargetsUnsubRef.current = unsub;
    }).catch((err) => {
      logger.warn('BannerStack killTargets subscribe failed:', err);
    });

    // Realtime syntheses — feeds the synthesis-ready trigger so a new briefing
    // surfaces an app-wide return reason, and clears once it is opened/read.
    subscribeToUserData('syntheses', (data) => {
      if (!active) return;
      setSyntheses(data || []);
    }, {
      onError: (err) => { if (active) notifyListenerDeath('syntheses', err); },
    }).then((unsub) => {
      if (!active) { unsub(); return; }
      synthesesUnsubRef.current = unsub;
    }).catch((err) => {
      logger.warn('BannerStack syntheses subscribe failed:', err);
    });

    // Realtime user settings — toggling notification prefs / dismissals
    // updates banner state instantly.
    subscribeToUserData('userSettings', (docs) => {
      if (!active) return;
      const settings = (docs || [])[0] || null;
      if (!settings) {
        setNotificationPreferences(DEFAULT_NOTIFICATION_PREFERENCES);
        setBannerDismissals({});
      } else {
        setNotificationPreferences({
          ...DEFAULT_NOTIFICATION_PREFERENCES,
          ...(settings.notificationPreferences || {}),
        });
        setBannerDismissals(settings.bannerDismissals || {});
      }
      setLoaded(true);
    }, {
      onError: (err) => { if (active) notifyListenerDeath('userSettings', err); },
    }).then((unsub) => {
      if (!active) { unsub(); return; }
      settingsUnsubRef.current = unsub;
    }).catch((err) => {
      logger.warn('BannerStack settings subscribe failed:', err);
      if (active) setLoaded(true);
    });

    return () => {
      active = false;
      if (journalUnsubRef.current) {
        try { journalUnsubRef.current(); } catch { /* noop */ }
        journalUnsubRef.current = null;
      }
      if (killTargetsUnsubRef.current) {
        try { killTargetsUnsubRef.current(); } catch { /* noop */ }
        killTargetsUnsubRef.current = null;
      }
      if (synthesesUnsubRef.current) {
        try { synthesesUnsubRef.current(); } catch { /* noop */ }
        synthesesUnsubRef.current = null;
      }
      if (settingsUnsubRef.current) {
        try { settingsUnsubRef.current(); } catch { /* noop */ }
        settingsUnsubRef.current = null;
      }
    };
    // Re-subscribe only when uid changes; a same-uid user object identity
    // change carries no new data.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid]);

  const banners = useMemo(() => {
    if (!loaded || !user) return [];
    return evaluateAllTriggers({
      journalEntries,
      killTargets,
      syntheses,
      userProfile,
      notificationPreferences,
      bannerDismissals,
      currentPath: location.pathname,
    });
  }, [loaded, user, journalEntries, killTargets, syntheses, userProfile, notificationPreferences, bannerDismissals, location.pathname]);

  const persistDismissal = useCallback(async (triggerId) => {
    const next = { ...bannerDismissals, [triggerId]: new Date().toISOString() };
    setBannerDismissals(next);
    try {
      const data = { bannerDismissals: next };
      await upsertUserSettings(data);
    } catch (err) {
      logger.warn('Failed to persist dismissal:', err);
    }
  }, [bannerDismissals]);

  if (isExemptPath(location.pathname) || !user) return null;
  if (banners.length === 0) return null;

  const { visible } = layoutBanners(banners, { maxVisible: 1 });

  return (
    <div className="w-full bg-black border-b border-[#1a1a1a]">
      <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-3 space-y-2">
        {visible.map((b) => (
          <BannerRow
            key={b.triggerId}
            banner={b}
            onDismiss={() => persistDismissal(b.triggerId)}
          />
        ))}
      </div>
    </div>
  );
}

function BannerRow({ banner, onDismiss }) {
  return (
    <div className="flex items-center justify-between gap-3 bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl px-4 py-3">
      <p className="text-[#d1d1d1] text-sm font-light flex-1 leading-snug">{banner.copy}</p>
      <div className="flex items-center gap-1.5 shrink-0">
        <Link
          to={banner.actionRoute}
          className="text-xs px-3 py-1.5 bg-[#1a1a1a] text-[#ababab] hover:text-white border border-[#2a2a2a] rounded-lg transition-colors"
        >
          {banner.actionLabel}
        </Link>
        <button
          onClick={onDismiss}
          aria-label="Dismiss"
          className="text-[#858585] hover:text-white transition-colors p-1.5 rounded-lg"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  );
}

