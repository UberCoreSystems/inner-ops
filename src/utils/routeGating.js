/**
 * Path-based gates shared by OnboardingGate and BannerStack.
 *
 * `EXEMPT_PATHS` are routes that should NOT trigger an onboarding redirect
 * AND should NOT display engagement banners — pre-onboarding screens, the
 * auth screen, and the OAuth callback. Both components must agree on this
 * list, so it lives here.
 */
export const EXEMPT_PATHS = Object.freeze([
  '/auth',
  '/onboarding',
  '/oura/callback',
]);

/**
 * Returns true when the given pathname starts with any exempt prefix.
 * Defensive against null/undefined/non-string input — those cases never
 * exempt (gating logic should still apply), so the caller fails safe.
 */
export const isExemptPath = (pathname) => {
  if (typeof pathname !== 'string' || pathname.length === 0) return false;
  return EXEMPT_PATHS.some((p) => pathname.startsWith(p));
};
