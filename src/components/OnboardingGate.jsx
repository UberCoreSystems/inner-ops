import React, { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { getUserProfile } from '../utils/userProfile';
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
 * Routes excluded from gating: /auth, /onboarding, /oura/callback. Anything
 * else triggers a redirect when the profile flag is missing.
 */
export default function OnboardingGate({ user, children }) {
  const location = useLocation();
  // null = checking, true = needs onboarding, false = completed
  const [needsOnboarding, setNeedsOnboarding] = useState(null);

  useEffect(() => {
    if (!user) {
      setNeedsOnboarding(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const profile = await getUserProfile();
        if (cancelled) return;
        setNeedsOnboarding(!profile?.onboardingCompletedAt);
      } catch (err) {
        logger.warn('Onboarding-status check failed:', err);
        if (cancelled) return;
        // Fail open — better to land the user on Dashboard than to trap them
        // in a loader if Firestore reads are flaking.
        setNeedsOnboarding(false);
      }
    })();
    return () => { cancelled = true; };
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
