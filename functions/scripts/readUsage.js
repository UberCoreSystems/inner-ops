#!/usr/bin/env node
/**
 * Read path for Oracle/Haiku cost telemetry. Admin SDK only — the _usage and
 * _usageRollups subcollections are server-only (firestore.rules denies all
 * client access), so this runs with full Admin credentials and bypasses rules.
 *
 * Credentials: uses Application Default Credentials. Provide one of:
 *   - GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccount.json
 *   - `gcloud auth application-default login` (with the right project set)
 * Set the project explicitly if ADC doesn't carry it:
 *   GOOGLE_CLOUD_PROJECT=inner-ops-8ce36
 *
 * Usage:
 *   node scripts/readUsage.js <uid> [YYYY-MM]
 *       → that user's monthly rollup (defaults to the current UTC month).
 *
 *   node scripts/readUsage.js --all <YYYY-MM>
 *       → cost per active user for the month, across all users, sorted by cost.
 *         (collectionGroup scan over _usageRollups.)
 */

const { initializeApp, applicationDefault, getApps } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

function currentMonthKey() {
  return new Date().toISOString().slice(0, 7);
}

function fmtUSD(n) {
  return `$${(Number(n) || 0).toFixed(4)}`;
}

function printRollup(uid, month, data) {
  if (!data) {
    console.log(`No usage recorded for ${uid} in ${month}.`);
    return;
  }
  console.log(`Usage rollup — ${uid} — ${month}`);
  console.log(`  calls:              ${data.callCount ?? 0}`);
  console.log(`  input tokens:       ${data.inputTokens ?? 0}`);
  console.log(`  output tokens:      ${data.outputTokens ?? 0}`);
  console.log(`  cache-write tokens: ${data.cacheCreationInputTokens ?? 0}`);
  console.log(`  cache-read tokens:  ${data.cacheReadInputTokens ?? 0}`);
  console.log(`  cost:               ${fmtUSD(data.costUSD)}`);
}

async function readOne(db, uid, month) {
  const snap = await db.doc(`users/${uid}/_usageRollups/${month}`).get();
  printRollup(uid, month, snap.exists ? snap.data() : null);
}

async function readAll(db, month) {
  const snap = await db
    .collectionGroup("_usageRollups")
    .where("month", "==", month)
    .get();
  if (snap.empty) {
    console.log(`No usage rollups for ${month}.`);
    return;
  }
  const rows = snap.docs
    .map((d) => d.data())
    .sort((a, b) => (Number(b.costUSD) || 0) - (Number(a.costUSD) || 0));
  let totalCost = 0;
  let totalCalls = 0;
  console.log(`Cost per active user — ${month} (${rows.length} users)\n`);
  for (const r of rows) {
    totalCost += Number(r.costUSD) || 0;
    totalCalls += Number(r.callCount) || 0;
    console.log(`  ${r.uid}\t${fmtUSD(r.costUSD)}\t(${r.callCount ?? 0} calls)`);
  }
  console.log(`\n  TOTAL\t${fmtUSD(totalCost)}\t(${totalCalls} calls)`);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args[0] === "-h" || args[0] === "--help") {
    console.log("Usage:\n  node scripts/readUsage.js <uid> [YYYY-MM]\n  node scripts/readUsage.js --all <YYYY-MM>");
    process.exit(args.length === 0 ? 1 : 0);
  }

  if (!getApps().some((a) => a.name === "[DEFAULT]")) {
    initializeApp({ credential: applicationDefault() });
  }
  const db = getFirestore();

  if (args[0] === "--all") {
    const month = args[1] || currentMonthKey();
    await readAll(db, month);
  } else {
    const uid = args[0];
    const month = args[1] || currentMonthKey();
    await readOne(db, uid, month);
  }
}

main().catch((err) => {
  console.error("readUsage failed:", err?.message || err);
  process.exit(1);
});
