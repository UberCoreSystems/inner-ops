import React, { useEffect, useState, useRef } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { subscribeUserProfile } from '../utils/userProfile';
import { isExemptPath } from '../utils/routeGating';
import logger from '../utils/logger';

const PageLoader = () => (
  <div className="flex items-center justify-center h-screen bg-black text-white">
    <div className="text-center">
      <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-red-500 mx-auto"></div>
      <p className="mt-4 text-lg">Loading...</p>
    </div>
  </div>
);

/**
 * Redirects authenticated users who have not completed onboarding to
 * /onboarding. Tracks completion via the `onboardingCompletedAt` field on
 * userProfiles, which is written either when the wizard finishes or when
 * the user explicitly skips from the briefing screen.
 *
 * Uses a realtime subscription on the user's profile doc so the wizard's
 * write propagates immediately — without it, the gate's cached state
 * would still read "needs onboarding" the moment the wizard navigates to
 * /dashboard, redirecting the user straight back to /onboarding.
 *
 * Routes excluded from gating: /auth, /onboarding, /oura/callback.
 */
export default function OnboardingGate({ user, children }) {
  const location = useLocation();
  // null = checking, true = needs onboarding, false = completed
  const [needsOnboarding, setNeedsOnboarding] = useState(null);
  const unsubRef = useRef(null);

  useEffect(() => {
    if (!user) {
      setNeedsOnboarding(null);
      return;
    }

    let active = true;

    subscribeUserProfile((profile) => {
      if (!active) return;
      setNeedsOnboarding(!profile?.onboardingCompletedAt);
    })
      .then((unsub) => {
        if (!active) {
          try { unsub(); } catch { /* noop */ }
          return;
        }
        unsubRef.current = unsub;
      })
      .catch((err) => {
        logger.warn('Onboarding-status subscribe failed:', err);
        // Fail open — better to land the user on Dashboard than to trap
        // them in a loader if Firestore is flaking.
        if (active) setNeedsOnboarding(false);
      });

    return () => {
      active = false;
      if (unsubRef.current) {
        try { unsubRef.current(); } catch { /* noop */ }
        unsubRef.current = null;
      }
    };
  }, [user?.uid]);

  // Not authenticated — let downstream routes handle the /auth redirect.
  if (!user) return children;

  // Still checking — hold the screen rather than briefly flashing the
  // dashboard before the redirect.
  if (needsOnboarding === null) return <PageLoader />;

  if (needsOnboarding && !isExemptPath(location.pathname)) {
    return <Navigate to="/onboarding" replace />;
  }

  return children;
}
