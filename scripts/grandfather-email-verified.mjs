/**
 * One-time migration for the email-verification boundary (2026-08).
 *
 * firestore.rules now require request.auth.token.email_verified == true for
 * all user-data access. Accounts that predate the boundary never clicked a
 * verification link, so deploying the rules without this migration locks them
 * out. This script marks pre-existing PASSWORD accounts (the ones with an
 * email) as verified. Accounts with no email (legacy anonymous dev artifacts)
 * are left untouched — they cannot verify and stay locked out by design.
 *
 * DRY RUN by default — prints what it would change. Pass --apply to execute.
 *
 *   node scripts/grandfather-email-verified.mjs [--apply] [--cutoff 2026-08-06T00:00:00Z]
 *
 * Only accounts created BEFORE the cutoff (default: the moment the script
 * runs) are grandfathered, so a signup racing the deploy cannot slip through.
 *
 * Credentials: needs Admin SDK access to inner-ops-8ce36. Either
 *   - GOOGLE_APPLICATION_CREDENTIALS=<path to a service-account key json>
 *     (Firebase console → Project settings → Service accounts), or
 *   - gcloud auth application-default login
 * The change is reversible: updateUser(uid, { emailVerified: false }).
 */
import { createRequire } from 'node:module';

// Reuse the Admin SDK already installed for Cloud Functions — no new deps.
const require = createRequire(new URL('../functions/package.json', import.meta.url));
const admin = require('firebase-admin');

const APPLY = process.argv.includes('--apply');
const cutoffArg = process.argv[process.argv.indexOf('--cutoff') + 1];
const CUTOFF = process.argv.includes('--cutoff') ? new Date(cutoffArg) : new Date();
if (Number.isNaN(CUTOFF.getTime())) {
  console.error(`Invalid --cutoff value: ${cutoffArg}`);
  process.exit(1);
}

admin.initializeApp({ projectId: 'inner-ops-8ce36' });

async function main() {
  const candidates = [];
  let skippedNoEmail = 0;
  let alreadyVerified = 0;
  let afterCutoff = 0;

  let pageToken;
  do {
    const page = await admin.auth().listUsers(1000, pageToken);
    for (const u of page.users) {
      if (!u.email) { skippedNoEmail += 1; continue; }
      if (u.emailVerified) { alreadyVerified += 1; continue; }
      if (new Date(u.metadata.creationTime) >= CUTOFF) { afterCutoff += 1; continue; }
      candidates.push(u);
    }
    pageToken = page.pageToken;
  } while (pageToken);

  console.log(`cutoff:            ${CUTOFF.toISOString()}`);
  console.log(`no email (skip):   ${skippedNoEmail}`);
  console.log(`already verified:  ${alreadyVerified}`);
  console.log(`created ≥ cutoff:  ${afterCutoff}`);
  console.log(`to grandfather:    ${candidates.length}`);
  for (const u of candidates) {
    console.log(`  ${u.uid}  ${u.email}  created=${u.metadata.creationTime}`);
  }

  if (!APPLY) {
    console.log('\nDry run — nothing changed. Re-run with --apply to execute.');
    return;
  }

  let updated = 0;
  for (const u of candidates) {
    await admin.auth().updateUser(u.uid, { emailVerified: true });
    updated += 1;
    console.log(`✔ marked verified: ${u.email}`);
  }
  console.log(`\nDone. ${updated} account(s) marked emailVerified=true.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
