import { getAuth } from '../firebase';
import { authService } from './authService';
import logger from './logger';

// The server's timeoutSeconds is 120; outlast it plus the network.
const ERASE_TIMEOUT_MS = 130000;

const closeSession = () => authService.signOut().catch(() => {});

/**
 * Erases the signed-in account server-side (all data, then the Auth record)
 * and closes the local session. Never throws.
 *
 * A rejected call does not prove the erasure failed: the response can be lost
 * after the server finished. The Auth record is the last thing the server
 * removes, so when it is gone the erasure ran to the end.
 *
 * @returns {Promise<{ status: 'erased', manifest: object|null } | { status: 'failed' }>}
 */
export async function eraseAccount() {
  let user = null;
  try {
    user = (await getAuth()).currentUser;
    if (!user) return { status: 'failed' };
    // Loaded here so the functions SDK stays out of the boot chunk.
    const { getFunctions, httpsCallable } = await import('firebase/functions');
    const res = await httpsCallable(getFunctions(), 'deleteUserData', { timeout: ERASE_TIMEOUT_MS })();
    await closeSession();
    return { status: 'erased', manifest: res?.data?.manifest ?? null };
  } catch (err) {
    logger.error('Account erasure call failed:', { code: err?.code });
  }
  if (!user) return { status: 'failed' };

  try {
    await user.reload();
  } catch (probeErr) {
    // The SDK reports an account that no longer exists as an expired token.
    if (probeErr?.code === 'auth/user-token-expired') {
      await closeSession();
      return { status: 'erased', manifest: null };
    }
  }
  return { status: 'failed' };
}
