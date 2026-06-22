/**
 * Emulator-backed proof for the account-deletion receipt.
 *
 * eraseUserData (functions/index.js) is the Admin-SDK erase + manifest builder.
 * This suite proves the deletion RECEIPT is honest: the per-collection counts it
 * returns equal what was actually seeded and erased, memory + profile are
 * counted, another user's data is untouched, and nothing owned by the caller
 * survives.
 *
 * Runs against the Firestore emulator. It is launched by scripts/run-rules-tests.mjs
 * (npm run test:rules) AFTER the rules suites, sequenced with `&&` so the
 * rules tests' clearFirestore() can't race this admin-SDK data.
 *
 * Requires FIRESTORE_EMULATOR_HOST (set automatically by `firebase emulators:exec`).
 */

// Ensure the Admin SDK has a project id before ./index calls initializeApp().
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || "inner-ops-8ce36";

const { test, before } = require("node:test");
const assert = require("node:assert");
const { getFirestore } = require("firebase-admin/firestore");
// Requiring ./index initializes the default Admin app (idempotent) and exports
// the erase logic.
const { eraseUserData } = require("./index");

const UID = "erase-receipt-test-user";
const OTHER = "erase-receipt-other-user";

let db;

before(() => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error(
      "FIRESTORE_EMULATOR_HOST is not set — run this via `npm run test:rules` so the emulator is up."
    );
  }
  db = getFirestore();
});

test("deletion receipt counts equal what was seeded and erased; other users untouched", async () => {
  // Deterministic start: clear anything this test owns from a prior run.
  await eraseUserData(db, UID);
  await db.collection("journalEntries").doc("erase-other-j1").delete().catch(() => {});

  // --- Seed UID-owned data across several collections ---
  await db.collection("journalEntries").doc("erase-j1").set({ userId: UID, content: "a" });
  await db.collection("journalEntries").doc("erase-j2").set({ userId: UID, content: "b" });
  await db.collection("killTargets").doc("erase-k1").set({ userId: UID, title: "x" });
  await db.collection("hardLessons").doc("erase-h1").set({ userId: UID, ruleGoingForward: "never" });
  await db.collection("relapseEntries").doc("erase-r1").set({ userId: UID, reflection: "c" });

  // Memory (doc-id-keyed subcollection) + profile.
  await db.doc(`users/${UID}/memory/global`).set({ content: "g", receipts: [] });
  await db.doc(`users/${UID}/memory/journal`).set({ content: "j", receipts: [] });
  await db.doc(`userProfiles/${UID}`).set({ primaryDriver: "clarity" });

  // An admin-only subcollection that must be purged but is not user content.
  await db.doc(`users/${UID}/_rateLimits/oracle_2026-06-22`).set({ count: 7 });

  // --- A DIFFERENT user's data that must survive the erase ---
  await db.collection("journalEntries").doc("erase-other-j1").set({ userId: OTHER, content: "keep me" });

  // --- Erase + receipt ---
  const manifest = await eraseUserData(db, UID);

  // Receipt counts match exactly what was seeded.
  assert.strictEqual(manifest.journalEntries, 2, "journalEntries count");
  assert.strictEqual(manifest.killTargets, 1, "killTargets count");
  assert.strictEqual(manifest.hardLessons, 1, "hardLessons count");
  assert.strictEqual(manifest.relapseEntries, 1, "relapseEntries count");
  assert.strictEqual(manifest.memory, 2, "memory doc count");
  assert.strictEqual(manifest.userProfile, 1, "userProfile presence");
  // A collection that was never seeded reports zero, not undefined.
  assert.strictEqual(manifest.syntheses, 0, "unseeded collection reports 0");

  // Everything owned by UID is actually gone.
  const jLeft = await db.collection("journalEntries").where("userId", "==", UID).get();
  assert.strictEqual(jLeft.size, 0, "no journalEntries remain for UID");
  const memLeft = await db.collection(`users/${UID}/memory`).get();
  assert.strictEqual(memLeft.size, 0, "no memory docs remain for UID");
  const rlLeft = await db.collection(`users/${UID}/_rateLimits`).get();
  assert.strictEqual(rlLeft.size, 0, "admin subcollections recursively purged");
  const profLeft = await db.doc(`userProfiles/${UID}`).get();
  assert.strictEqual(profLeft.exists, false, "userProfile doc removed");

  // The other user's data is untouched.
  const otherDoc = await db.collection("journalEntries").doc("erase-other-j1").get();
  assert.strictEqual(otherDoc.exists, true, "another user's data must survive");

  // Cleanup so reruns within one emulator session stay deterministic.
  await db.collection("journalEntries").doc("erase-other-j1").delete();
});
