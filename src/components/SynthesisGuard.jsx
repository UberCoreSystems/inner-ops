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
 */
export default function SynthesisGuard({ latestSynthesisIsNew, children }) {
  const { pathname } = useLocation();

  if (latestSynthesisIsNew && !GUARD_EXEMPT.has(pathname)) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}
