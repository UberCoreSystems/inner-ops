import { useLocation, Navigate } from 'react-router-dom';

// Routes that bypass the Synthesis Briefing guard
const GUARD_EXEMPT = new Set([
  '/dashboard',
  '/synthesis',
  '/auth',
  '/onboarding',
  '/oura/callback',
  '/login',
  '/',
]);

/**
 * Global route guard for the Synthesis Briefing forced state.
 * When latestSynthesisIsNew is true, any navigation to a module route
 * is hard-redirected to /dashboard until the briefing is opened.
 *
 * Pass 3 New Finding 15: `latestSynthesisIsNew` is sourced from
 * useSynthesisNewFlag which subscribes to the syntheses collection in
 * real time. That means the guard activates as soon as a briefing is
 * generated in this tab. A briefing generated in ANOTHER tab or device
 * will also propagate via Firestore listeners, so multi-tab coherence
 * is fine. No remount required.
 */
export default function SynthesisGuard({ latestSynthesisIsNew, children }) {
  const { pathname } = useLocation();

  if (latestSynthesisIsNew && !GUARD_EXEMPT.has(pathname)) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}
