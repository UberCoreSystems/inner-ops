import { getAuth, getDb } from '../firebase.js';
import logger from './logger';

const OURA_AUTH_URL = 'https://cloud.ouraring.com/oauth/authorize';
const OURA_TOKEN_URL = 'https://api.ouraring.com/oauth/token';
const OURA_API_BASE = 'https://api.ouraring.com/v2/usercollection';

const CLIENT_ID = import.meta.env.VITE_OURA_CLIENT_ID;
const getRedirectUri = () =>
  import.meta.env.VITE_OURA_REDIRECT_URI || `${window.location.origin}/oura/callback`;

// ─── PKCE helpers ────────────────────────────────────────────────────────────

function base64URLEncode(buffer) {
  return btoa(String.fromCharCode(...buffer))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

function generateCodeVerifier() {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return base64URLEncode(array);
}

async function generateCodeChallenge(verifier) {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return base64URLEncode(new Uint8Array(digest));
}

// ─── OAuth initiation ─────────────────────────────────────────────────────────

export async function initiateOuraOAuth() {
  if (!CLIENT_ID) {
    throw new Error('VITE_OURA_CLIENT_ID is not configured');
  }
  const verifier = generateCodeVerifier();
  const challenge = await generateCodeChallenge(verifier);
  const state = generateCodeVerifier();

  sessionStorage.setItem('oura_code_verifier', verifier);
  sessionStorage.setItem('oura_state', state);

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: getRedirectUri(),
    scope: 'daily heartrate personal',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
  });

  window.location.href = `${OURA_AUTH_URL}?${params}`;
}

// ─── OAuth callback ───────────────────────────────────────────────────────────

export async function handleOAuthCallback(code, state) {
  const savedState = sessionStorage.getItem('oura_state');
  if (state !== savedState) throw new Error('State mismatch — possible CSRF');

  const verifier = sessionStorage.getItem('oura_code_verifier');
  if (!verifier) throw new Error('No code verifier found in session');

  const res = await fetch(OURA_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: getRedirectUri(),
      client_id: CLIENT_ID,
      code_verifier: verifier,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error_description || 'Token exchange failed');
  }

  const tokenData = await res.json();
  const auth = await getAuth();
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Not authenticated');

  await storeToken(uid, tokenData);

  sessionStorage.removeItem('oura_code_verifier');
  sessionStorage.removeItem('oura_state');

  logger.log('✅ Oura Ring connected for user:', uid);
  return tokenData;
}

// ─── Token storage ────────────────────────────────────────────────────────────

async function storeToken(uid, tokenData) {
  const db = await getDb();
  const { doc, setDoc } = await import('firebase/firestore');
  const tokenRef = doc(db, 'users', uid, 'integrations', 'oura');
  await setDoc(tokenRef, {
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token,
    expiresAt: Date.now() + tokenData.expires_in * 1000,
    tokenType: tokenData.token_type,
    scope: tokenData.scope,
    updatedAt: new Date().toISOString(),
  });
}

async function getStoredToken(uid) {
  const db = await getDb();
  const { doc, getDoc } = await import('firebase/firestore');
  const snap = await getDoc(doc(db, 'users', uid, 'integrations', 'oura'));
  return snap.exists() ? snap.data() : null;
}

/**
 * Token refresh status — discriminated so callers can distinguish:
 *   - 'no_token': user has not connected Oura
 *   - 'valid': stored access token is still good
 *   - 'refreshed': refresh succeeded; new access token is available
 *   - 'expired': refresh failed permanently (4xx) — stored token cleared
 *   - 'transient': refresh failed temporarily (5xx / network) — token kept
 */
async function clearStoredToken(uid) {
  try {
    const db = await getDb();
    const { doc, deleteDoc } = await import('firebase/firestore');
    await deleteDoc(doc(db, 'users', uid, 'integrations', 'oura'));
  } catch (err) {
    logger.warn('Oura: failed to clear stale token', { code: err?.code, name: err?.name });
  }
}

// Pass 2 Finding 6 remediation: refresh failures are now logged with HTTP
// status (never the token), distinguish "permanently expired" from "transient
// network failure", and clear the stored token on definitive 4xx so the user
// is prompted to re-authorize instead of retrying a known-bad token.
async function getValidToken(uid) {
  const token = await getStoredToken(uid);
  if (!token) return null;

  // Token still valid with 60s buffer
  if (Date.now() < token.expiresAt - 60_000) {
    return token.accessToken;
  }

  // Attempt refresh
  let res;
  try {
    res = await fetch(OURA_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: token.refreshToken,
        client_id: CLIENT_ID,
      }),
    });
  } catch (err) {
    // Network-level failure — keep the stored token, caller can retry later.
    logger.warn('Oura token refresh: network error', { name: err?.name, message: err?.message });
    return null;
  }

  if (!res.ok) {
    if (res.status >= 400 && res.status < 500) {
      // Permanent failure (revoked, rotated refresh token, etc). Clear the
      // stored credentials so the next attempt prompts re-authorization.
      logger.warn('Oura token refresh rejected', { status: res.status });
      await clearStoredToken(uid);
    } else {
      // Transient (5xx, timeouts surfaced as fetch errors handled above).
      logger.warn('Oura token refresh: transient failure', { status: res.status });
    }
    return null;
  }

  const newToken = await res.json();
  await storeToken(uid, {
    access_token: newToken.access_token,
    refresh_token: newToken.refresh_token || token.refreshToken,
    expires_in: newToken.expires_in,
    token_type: newToken.token_type,
    scope: newToken.scope || token.scope,
  });
  return newToken.access_token;
}

// ─── Connection status ────────────────────────────────────────────────────────

export async function isOuraConnected(uid) {
  try {
    const token = await getStoredToken(uid);
    return !!token;
  } catch {
    return false;
  }
}

// ─── Biometric fetch + cache ──────────────────────────────────────────────────

export async function fetchAndCacheBiometrics(uid) {
  const accessToken = await getValidToken(uid);
  if (!accessToken) return null;

  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const headers = { Authorization: `Bearer ${accessToken}` };

  const [readinessRes, sleepRes, hrvRes] = await Promise.all([
    fetch(`${OURA_API_BASE}/daily_readiness?start_date=${yesterday}&end_date=${today}`, { headers }),
    fetch(`${OURA_API_BASE}/daily_sleep?start_date=${yesterday}&end_date=${today}`, { headers }),
    fetch(`${OURA_API_BASE}/daily_hrv?start_date=${yesterday}&end_date=${today}`, { headers }),
  ]);

  const [readinessData, sleepData, hrvData] = await Promise.all([
    readinessRes.ok ? readinessRes.json() : { data: [] },
    sleepRes.ok ? sleepRes.json() : { data: [] },
    hrvRes.ok ? hrvRes.json() : { data: [] },
  ]);

  const readiness = readinessData.data?.at(-1);
  const sleep = sleepData.data?.at(-1);
  const hrv = hrvData.data?.at(-1);

  const biometrics = {
    hrv: hrv?.rmssd ?? null,
    sleepScore: sleep?.score ?? null,
    restingHeartRate: readiness?.contributors?.resting_heart_rate ?? null,
    readinessScore: readiness?.score ?? null,
    fetchedAt: new Date().toISOString(),
    date: today,
  };

  const db = await getDb();
  const { doc, setDoc } = await import('firebase/firestore');
  await setDoc(doc(db, 'users', uid, 'biometrics', `oura_${today}`), biometrics, { merge: true });

  logger.log('✅ Oura biometrics cached for', today, biometrics);
  return biometrics;
}

export async function getTodaysBiometrics(uid) {
  const today = new Date().toISOString().slice(0, 10);
  const db = await getDb();
  const { doc, getDoc } = await import('firebase/firestore');
  const snap = await getDoc(doc(db, 'users', uid, 'biometrics', `oura_${today}`));

  if (snap.exists()) {
    const data = snap.data();
    const age = Date.now() - new Date(data.fetchedAt).getTime();
    if (age < 3_600_000) return data; // cache valid for 1 hour
  }

  return fetchAndCacheBiometrics(uid);
}

// ─── HRV baseline (7-day rolling average) ────────────────────────────────────

export async function getHrvBaseline(uid) {
  try {
    const db = await getDb();
    const { collection, getDocs } = await import('firebase/firestore');
    const snap = await getDocs(collection(db, 'users', uid, 'biometrics'));

    const entries = snap.docs
      .map(d => d.data())
      .filter(d => d.hrv != null)
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 7);

    if (entries.length < 2) return null;
    return entries.reduce((sum, e) => sum + e.hrv, 0) / entries.length;
  } catch {
    return null;
  }
}
