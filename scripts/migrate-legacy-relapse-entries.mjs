/**
 * One-time migration for the removal of the "Actual relapse" entry type
 * (2026-10-25). Every relapseEntries doc is now a signal and readers no
 * longer look at `entryType`. Legacy docs written as `entryType: 'relapse'`
 * would otherwise derive as signals with a long-passed 48h window and no
 * resolution — the Signal Debrief card would ask the user to "call"
 * months-old relapses. This script closes each one as landed, marks it
 * `legacyRelapse: true`, and deletes the dead field. Docs written as
 * `entryType: 'signal'` are left alone; the stale field is harmless.
 *
 * Run BEFORE deploying the hosting build that drops the readers. It is safe
 * against the old client: a doc carrying entryType 'relapse' plus a landed
 * resolution still derives as not-a-signal there.
 *
 * DRY RUN by default — prints what it would change. Pass --apply to execute.
 *
 *   node scripts/migrate-legacy-relapse-entries.mjs [--apply]
 *
 * Credentials: Admin SDK access to inner-ops-8ce36. Either
 *   - GOOGLE_APPLICATION_CREDENTIALS=<path to a service-account key json>
 *     (Firebase console → Project settings → Service accounts), or
 *   - gcloud auth application-default login
 * Reversal is by hand from the dry-run listing: restore `entryType: 'relapse'`
 * and drop `legacyRelapse` (and the stamped `resolution`) on each doc id.
 */
import { createRequire } from 'node:module';

// Reuse the Admin SDK already installed for Cloud Functions — no new deps.
const require = createRequire(new URL('../functions/package.json', import.meta.url));
const admin = require('firebase-admin');

const APPLY = process.argv.includes('--apply');
const COLLECTIONS = ['relapseEntries', 'relapseEntriesArchive'];
const VALID_OUTCOMES = new Set(['held', 'landed']);
const BATCH_SIZE = 400; // Firestore caps a batch at 500 writes

admin.initializeApp({ projectId: 'inner-ops-8ce36' });
const db = admin.firestore();
const { FieldValue } = admin.firestore;

function toIso(value) {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// Keep a resolution the user already stamped; otherwise close the doc as
// landed at its own event time (the relapse was the landing).
function plannedUpdate(data) {
  const existing = data.resolution;
  const keep = existing && VALID_OUTCOMES.has(existing.outcome);
  const resolvedAt =
    toIso(data.eventOccurredAt) || toIso(data.createdAt) || toIso(data.timestamp) || new Date().toISOString();
  return {
    ...(keep ? {} : { resolution: { outcome: 'landed', resolvedAt, via: 'legacy' } }),
    legacyRelapse: true,
    entryType: FieldValue.delete(),
  };
}

async function main() {
  const plans = [];
  for (const name of COLLECTIONS) {
    const snap = await db.collection(name).where('entryType', '==', 'relapse').get();
    for (const doc of snap.docs) {
      const data = doc.data();
      plans.push({
        ref: doc.ref,
        collection: name,
        id: doc.id,
        userId: data.userId || 'NO_USER_ID',
        update: plannedUpdate(data),
      });
    }
  }

  const perUser = {};
  for (const p of plans) perUser[p.userId] = (perUser[p.userId] || 0) + 1;

  console.log(`legacy relapse docs: ${plans.length}`);
  for (const [uid, n] of Object.entries(perUser)) console.log(`  user ${uid}: ${n}`);
  for (const p of plans) {
    const how = p.update.resolution
      ? `stamp landed @ ${p.update.resolution.resolvedAt}`
      : 'keep existing resolution';
    console.log(`  ${p.collection}/${p.id}  ${how}`);
  }

  if (!APPLY) {
    console.log('\nDry run — nothing changed. Re-run with --apply to execute.');
    return;
  }

  let updated = 0;
  for (let i = 0; i < plans.length; i += BATCH_SIZE) {
    const batch = db.batch();
    const slice = plans.slice(i, i + BATCH_SIZE);
    for (const p of slice) batch.update(p.ref, p.update);
    await batch.commit();
    updated += slice.length;
    console.log(`✔ committed ${updated}/${plans.length}`);
  }
  console.log(`\nDone. ${updated} doc(s) migrated.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
