/**
 * Unit tests for account-deletion receipt completeness (eraseUserData).
 *
 * SCOPE: verifies ORCHESTRATION + RECEIPT COMPLETENESS against an in-memory
 * fake Firestore — not real deletion. The trust-critical invariant is that the
 * deletion receipt (the manifest shown to the user) accounts for EVERY tracked
 * collection plus memory + profile, and that the two root docs are recursively
 * deleted. A collection that gets deleted but not reported is silent data the
 * user is never told was erased; a collection added to the system but missed by
 * the wipe is a data leak. This test guards both directions.
 *
 * It does NOT replace the live/emulator deletion smoke test (run deleteUserData
 * against a real test account, confirm reads return nothing, confirm the receipt
 * is emitted — see the pre-deploy checklist).
 *
 * Run: node --test functions/deleteUserData.test.js
 */
const { test } = require("node:test");
const assert = require("node:assert");

const { eraseUserData, USER_DATA_COLLECTIONS } = require("./index");

// Minimal fake Firestore covering exactly the surface eraseUserData/deleteOwnedDocs use:
//   collection(name).where().limit().get()  → owner-scoped page (single page; size < 400)
//   batch().delete(ref) / commit()
//   collection("users").doc(uid).collection("memory").get() → { size }
//   collection("userProfiles").doc(uid).get() → { exists }
//   recursiveDelete(docRef)
function makeFakeDb({ collectionCounts = {}, memory = 0, userProfileExists = false } = {}) {
  const calls = { recursiveDeletes: [], commits: 0, deletes: 0 };

  const makeDocRef = (path, collectionName) => ({
    path,
    async get() {
      if (collectionName === "userProfiles") return { exists: userProfileExists };
      return { exists: true };
    },
    collection() {
      // users/{uid}/memory
      return {
        async get() {
          return { size: memory, empty: memory === 0, docs: [] };
        },
      };
    },
  });

  const makeQuery = (collectionName) => ({
    where() { return this; },
    limit() { return this; },
    async get() {
      const size = collectionCounts[collectionName] ?? 0; // kept < 400 → single page
      const docs = Array.from({ length: size }, (_, i) => ({ ref: { path: `${collectionName}/${i}` } }));
      return { size, empty: size === 0, docs };
    },
    doc(id) { return makeDocRef(`${collectionName}/${id}`, collectionName); },
  });

  return {
    _calls: calls,
    collection(name) { return makeQuery(name); },
    batch() {
      return {
        delete() { calls.deletes++; },
        async commit() { calls.commits++; },
      };
    },
    async recursiveDelete(ref) { calls.recursiveDeletes.push(ref.path); },
  };
}

test("receipt reports a count for every tracked collection plus memory + profile", async () => {
  // Distinct small per-collection counts so a mis-keyed manifest entry is caught.
  const collectionCounts = Object.fromEntries(
    USER_DATA_COLLECTIONS.map((c, i) => [c, (i % 5) + 1])
  );
  const db = makeFakeDb({ collectionCounts, memory: 4, userProfileExists: true });

  const manifest = await eraseUserData(db, "user-123");

  for (const c of USER_DATA_COLLECTIONS) {
    assert.strictEqual(
      manifest[c],
      collectionCounts[c],
      `deletion receipt must report collection "${c}" with its erased count`
    );
  }
  assert.strictEqual(manifest.memory, 4, "memory docs must be counted in the receipt");
  assert.strictEqual(manifest.userProfile, 1, "an existing profile counts as 1");
  assert.strictEqual(manifest.adminSubcollectionsPurged, true);
});

test("the two root docs (userProfiles/{uid}, users/{uid}) are recursively deleted", async () => {
  const db = makeFakeDb({ userProfileExists: true });
  await eraseUserData(db, "abc");
  assert.ok(
    db._calls.recursiveDeletes.includes("userProfiles/abc"),
    "userProfiles/{uid} must be recursively deleted"
  );
  assert.ok(
    db._calls.recursiveDeletes.includes("users/abc"),
    "users/{uid} (and its admin subcollections) must be recursively deleted"
  );
});

test("empty account: every collection reports 0 and absent profile reports 0", async () => {
  const db = makeFakeDb({ collectionCounts: {}, memory: 0, userProfileExists: false });
  const manifest = await eraseUserData(db, "u");
  for (const c of USER_DATA_COLLECTIONS) {
    assert.strictEqual(manifest[c], 0, `empty "${c}" must report 0, not undefined`);
  }
  assert.strictEqual(manifest.memory, 0);
  assert.strictEqual(manifest.userProfile, 0);
});
