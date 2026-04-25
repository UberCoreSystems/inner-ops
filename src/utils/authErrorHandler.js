// Centralized handler for auth-related Firestore errors. When a write or read
// fails because the session expired (Firestore returns `permission-denied`
// for unauthenticated requests under our owner-gated rules) we want a
// consistent redirect to /auth so the user can re-authenticate instead of
// staying stuck on a form that will never save.

const AUTH_ERROR_CODES = new Set([
  'permission-denied',
  'unauthenticated',
]);

const AUTH_ERROR_PREFIXES = ['auth/'];

/**
 * Returns true when the given error indicates the user has lost their auth
 * session. Used in submit-handler catch blocks to decide whether to bounce
 * the user to /auth or keep them on the form.
 */
export function isAuthLostError(error) {
  if (!error) return false;
  const code = typeof error.code === 'string' ? error.code : '';
  if (AUTH_ERROR_CODES.has(code)) return true;
  return AUTH_ERROR_PREFIXES.some(prefix => code.startsWith(prefix));
}

/**
 * Hard-redirect to /auth using window.location so the new auth flow boots
 * fresh (no stale React state). Use only when isAuthLostError(err) is true.
 */
export function redirectToAuth() {
  if (typeof window !== 'undefined') {
    window.location.href = '/auth';
  }
}

/**
 * Convenience: detect + redirect in one call. Returns true if a redirect
 * was triggered so callers can early-exit from their error handler.
 */
export function redirectIfAuthLost(error) {
  if (isAuthLostError(error)) {
    redirectToAuth();
    return true;
  }
  return false;
}
