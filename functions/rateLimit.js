/**
 * Oracle Cloud Function rate limiter.
 *
 * Shared by `oracle` and `oracleFollowUp` — one counter pool per user per
 * UTC day. Counter doc location:
 *
 *   users/{uid}/_rateLimits/oracle_{YYYY-MM-DD}
 *
 * The `_rateLimits` subcollection is locked from client reads/writes by
 * firestore.rules:78-80; the Admin SDK in this Cloud Function bypasses
 * those rules and is the only writer.
 *
 * Counter is incremented BEFORE the Anthropic call — counts attempts, not
 * successes — so a failed Anthropic call still consumes a slot. This
 * prevents free retries on transient upstream failures from draining the
 * cap into runaway spend.
 *
 * runTransaction serializes concurrent calls on the same uid (e.g., the
 * journal-save extractor cascade that fires 1 classifier + up to 3
 * extractors in parallel) — no double-spend past the cap.
 *
 * Cleanup: a future scheduled CF can query each user's _rateLimits
 * subcollection and delete docs whose id is < `oracle_${todayUtcMinusN}`.
 */
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { HttpsError } = require('firebase-functions/v2/https');

const intFromEnv = (name, fallback) => {
  const raw = process.env[name];
  if (raw == null || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
};

const ORACLE_DAILY_LIMIT = intFromEnv('ORACLE_DAILY_LIMIT', 50);

function utcDayKey(now = new Date()) {
  return now.toISOString().slice(0, 10); // YYYY-MM-DD, UTC
}

async function checkAndIncrementOracleLimit(uid, { limit = ORACLE_DAILY_LIMIT } = {}) {
  const db = getFirestore();
  const dayKey = utcDayKey();
  const ref = db.doc(`users/${uid}/_rateLimits/oracle_${dayKey}`);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.exists ? (snap.data().count || 0) : 0;
    if (current >= limit) {
      throw new HttpsError(
        'resource-exhausted',
        'Daily Oracle limit reached. Resets at 00:00 UTC.'
      );
    }
    if (snap.exists) {
      tx.update(ref, {
        count: FieldValue.increment(1),
        lastAt: FieldValue.serverTimestamp(),
      });
    } else {
      tx.set(ref, {
        count: 1,
        dayKey,
        createdAt: FieldValue.serverTimestamp(),
        lastAt: FieldValue.serverTimestamp(),
      });
    }
  });
}

module.exports = { checkAndIncrementOracleLimit, ORACLE_DAILY_LIMIT };
