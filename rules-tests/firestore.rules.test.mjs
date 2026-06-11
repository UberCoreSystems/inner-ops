/**
 * Firestore security-rules proof suite (Inner Ops).
 *
 * Runs against the Firestore emulator via `@firebase/rules-unit-testing`.
 * Invoke with:  npm run test:rules
 * (which wraps this in `firebase emulators:exec --only firestore ...` so the
 *  emulator is started, this file runs, and the emulator is torn down.)
 *
 * What it proves, for EVERY collection the app uses:
 *   - unauthenticated clients can read/write NOTHING
 *   - the owner can read/create/update/delete ONLY their own documents
 *   - a non-owner cannot read, write, spoof ownership, or re-key userId
 *   - unfiltered / cross-user list queries are rejected by the rules engine
 *   - admin-only namespaces (_rateLimits, integrations) reject all client access
 *   - the removed `test-connection` allow is gone (default-deny covers it)
 *
 * Owner binding differs by layout and the suite tests both:
 *   - userId-field collections (root): ownership = `userId` field
 *   - doc-id==uid collections (userProfiles, users): ownership = path id
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { before, after, describe, it } from 'node:test';

import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';

import {
  doc,
  collection,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
} from 'firebase/firestore';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RULES = readFileSync(join(__dirname, '..', 'firestore.rules'), 'utf8');

const OWNER = 'alice';
const OTHER = 'mallory';

let testEnv;
let ownerDb; // authenticated as OWNER
let otherDb; // authenticated as OTHER
let anonDb; // unauthenticated

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'inner-ops-rules-test',
    firestore: {
      rules: RULES,
      host: '127.0.0.1',
      port: 8080,
    },
  });
  ownerDb = testEnv.authenticatedContext(OWNER).firestore();
  otherDb = testEnv.authenticatedContext(OTHER).firestore();
  anonDb = testEnv.unauthenticatedContext().firestore();
});

after(async () => {
  if (testEnv) await testEnv.cleanup();
});

// Seed a document bypassing rules (admin-equivalent), so read/update/delete
// paths have something real to act on.
async function seed(path, segments, data) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), path, ...segments), data);
  });
}

// Reset between collections so a leftover doc can't mask a denial.
async function clear() {
  await testEnv.clearFirestore();
}

// ─────────────────────────────────────────────────────────────────────────
// Root collections keyed by a `userId` field. Every one shares the same
// owner-only template, so the matrix is identical across them.
// ─────────────────────────────────────────────────────────────────────────
const USERID_COLLECTIONS = [
  'journalEntries',
  'killTargets',
  'relapseEntries',
  'hardLessons',
  'compassChecks',
  'confirmedKills',
  'confrontations',
  'journalEntriesArchive',
  'killTargetsArchive',
  'hardLessonsArchive',
  'relapseEntriesArchive',
  'emergencyLogs',
  'syntheses',
  'userSettings',
  'dailyBriefs',
];

for (const coll of USERID_COLLECTIONS) {
  describe(`userId-field collection: ${coll}`, () => {
    before(clear);

    it('unauthenticated: get denied', async () => {
      await seed(coll, ['doc1'], { userId: OWNER, body: 'x' });
      await assertFails(getDoc(doc(anonDb, coll, 'doc1')));
    });

    it('unauthenticated: create denied', async () => {
      await assertFails(setDoc(doc(anonDb, coll, 'newdoc'), { userId: OWNER }));
    });

    it('unauthenticated: list denied', async () => {
      await assertFails(getDocs(query(collection(anonDb, coll), where('userId', '==', OWNER))));
    });

    it('owner: create with own uid allowed', async () => {
      await assertSucceeds(setDoc(doc(ownerDb, coll, 'owner-created'), { userId: OWNER, body: 'mine' }));
    });

    it('owner: create with spoofed userId denied', async () => {
      await assertFails(setDoc(doc(ownerDb, coll, 'spoof-on-create'), { userId: OTHER, body: 'nope' }));
    });

    it('owner: create with missing userId denied', async () => {
      await assertFails(setDoc(doc(ownerDb, coll, 'no-owner-key'), { body: 'nope' }));
    });

    it('owner: get own doc allowed', async () => {
      await seed(coll, ['owned'], { userId: OWNER, body: 'x' });
      await assertSucceeds(getDoc(doc(ownerDb, coll, 'owned')));
    });

    it('owner: update own doc allowed', async () => {
      await seed(coll, ['owned-u'], { userId: OWNER, body: 'x' });
      await assertSucceeds(updateDoc(doc(ownerDb, coll, 'owned-u'), { body: 'y' }));
    });

    it('owner: update re-keying userId denied', async () => {
      await seed(coll, ['owned-rekey'], { userId: OWNER, body: 'x' });
      await assertFails(updateDoc(doc(ownerDb, coll, 'owned-rekey'), { userId: OTHER }));
    });

    it('owner: delete own doc allowed', async () => {
      await seed(coll, ['owned-d'], { userId: OWNER, body: 'x' });
      await assertSucceeds(deleteDoc(doc(ownerDb, coll, 'owned-d')));
    });

    it('owner: list own data allowed', async () => {
      await seed(coll, ['l1'], { userId: OWNER, body: 'x' });
      await assertSucceeds(getDocs(query(collection(ownerDb, coll), where('userId', '==', OWNER))));
    });

    it('owner: unfiltered list (no userId constraint) denied', async () => {
      await assertFails(getDocs(query(collection(ownerDb, coll))));
    });

    it('non-owner: get denied', async () => {
      await seed(coll, ['victim'], { userId: OWNER, body: 'secret' });
      await assertFails(getDoc(doc(otherDb, coll, 'victim')));
    });

    it('non-owner: update denied', async () => {
      await seed(coll, ['victim-u'], { userId: OWNER, body: 'secret' });
      await assertFails(updateDoc(doc(otherDb, coll, 'victim-u'), { body: 'hacked' }));
    });

    it('non-owner: delete denied', async () => {
      await seed(coll, ['victim-d'], { userId: OWNER, body: 'secret' });
      await assertFails(deleteDoc(doc(otherDb, coll, 'victim-d')));
    });

    it('non-owner: create with spoofed (victim) userId denied', async () => {
      await assertFails(setDoc(doc(otherDb, coll, 'spoof'), { userId: OWNER, body: 'planted' }));
    });

    it("non-owner: query across another user's data denied", async () => {
      await seed(coll, ['victim-q'], { userId: OWNER, body: 'secret' });
      await assertFails(getDocs(query(collection(otherDb, coll), where('userId', '==', OWNER))));
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Doc-id == uid collections. Ownership is the path id, not a field.
// ─────────────────────────────────────────────────────────────────────────
const DOCID_COLLECTIONS = ['userProfiles', 'users'];

for (const coll of DOCID_COLLECTIONS) {
  describe(`doc-id==uid collection: ${coll}`, () => {
    before(clear);

    it('unauthenticated: get denied', async () => {
      await seed(coll, [OWNER], { displayName: 'Alice' });
      await assertFails(getDoc(doc(anonDb, coll, OWNER)));
    });

    it('unauthenticated: write denied', async () => {
      await assertFails(setDoc(doc(anonDb, coll, OWNER), { displayName: 'x' }));
    });

    it('owner: create own doc (id == uid) allowed', async () => {
      await assertSucceeds(setDoc(doc(ownerDb, coll, OWNER), { displayName: 'Alice' }));
    });

    it('owner: get own doc allowed', async () => {
      await seed(coll, [OWNER], { displayName: 'Alice' });
      await assertSucceeds(getDoc(doc(ownerDb, coll, OWNER)));
    });

    it('owner: update own doc allowed', async () => {
      await seed(coll, [OWNER], { displayName: 'Alice' });
      await assertSucceeds(updateDoc(doc(ownerDb, coll, OWNER), { displayName: 'Alice2' }));
    });

    it('owner: delete own doc allowed', async () => {
      await seed(coll, [OWNER], { displayName: 'Alice' });
      await assertSucceeds(deleteDoc(doc(ownerDb, coll, OWNER)));
    });

    it("owner: write to another user's doc (id != uid) denied", async () => {
      await assertFails(setDoc(doc(ownerDb, coll, OTHER), { displayName: 'planted' }));
    });

    it("non-owner: get another user's doc denied", async () => {
      await seed(coll, [OWNER], { displayName: 'Alice' });
      await assertFails(getDoc(doc(otherDb, coll, OWNER)));
    });

    it("non-owner: update another user's doc denied", async () => {
      await seed(coll, [OWNER], { displayName: 'Alice' });
      await assertFails(updateDoc(doc(otherDb, coll, OWNER), { displayName: 'hacked' }));
    });

    it('enumeration: list across the collection denied (even for owner)', async () => {
      await seed(coll, [OWNER], { displayName: 'Alice' });
      await assertFails(getDocs(query(collection(ownerDb, coll))));
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Admin-only namespaces — Cloud Functions (Admin SDK) write; clients get
// nothing, owner included.
// ─────────────────────────────────────────────────────────────────────────
describe('admin-only: users/{uid}/_rateLimits', () => {
  before(clear);

  it('owner: read denied', async () => {
    await seed('users', [OWNER, '_rateLimits', 'oracle_2026-06-09'], { count: 3 });
    await assertFails(getDoc(doc(ownerDb, 'users', OWNER, '_rateLimits', 'oracle_2026-06-09')));
  });

  it('owner: write denied (cannot reset own quota)', async () => {
    await assertFails(setDoc(doc(ownerDb, 'users', OWNER, '_rateLimits', 'oracle_2026-06-09'), { count: 0 }));
  });

  it('unauthenticated: read denied', async () => {
    await seed('users', [OWNER, '_rateLimits', 'k'], { count: 1 });
    await assertFails(getDoc(doc(anonDb, 'users', OWNER, '_rateLimits', 'k')));
  });
});

describe('admin-only: users/{uid}/integrations (OAuth tokens)', () => {
  before(clear);

  it('owner: read denied', async () => {
    await seed('users', [OWNER, 'integrations', 'oura'], { accessToken: 'SECRET' });
    await assertFails(getDoc(doc(ownerDb, 'users', OWNER, 'integrations', 'oura')));
  });

  it('owner: write denied', async () => {
    await assertFails(setDoc(doc(ownerDb, 'users', OWNER, 'integrations', 'oura'), { accessToken: 'x' }));
  });

  it("non-owner: read another user's token denied", async () => {
    await seed('users', [OWNER, 'integrations', 'oura'], { accessToken: 'SECRET' });
    await assertFails(getDoc(doc(otherDb, 'users', OWNER, 'integrations', 'oura')));
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Oura biometrics cache — CF writes, owner reads only.
// ─────────────────────────────────────────────────────────────────────────
describe('users/{uid}/biometrics (CF-written, owner-read)', () => {
  before(clear);

  it('owner: read own biometrics allowed', async () => {
    await seed('users', [OWNER, 'biometrics', 'oura_2026-06-09'], { hrv: 42 });
    await assertSucceeds(getDoc(doc(ownerDb, 'users', OWNER, 'biometrics', 'oura_2026-06-09')));
  });

  it('owner: write denied (client cannot forge biometrics)', async () => {
    await assertFails(setDoc(doc(ownerDb, 'users', OWNER, 'biometrics', 'oura_2026-06-09'), { hrv: 99 }));
  });

  it("non-owner: read another user's biometrics denied", async () => {
    await seed('users', [OWNER, 'biometrics', 'oura_2026-06-09'], { hrv: 42 });
    await assertFails(getDoc(doc(otherDb, 'users', OWNER, 'biometrics', 'oura_2026-06-09')));
  });

  it('unauthenticated: read denied', async () => {
    await seed('users', [OWNER, 'biometrics', 'k'], { hrv: 1 });
    await assertFails(getDoc(doc(anonDb, 'users', OWNER, 'biometrics', 'k')));
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Long-term AI memory — CF writes (Admin SDK), owner reads only. Generation,
// edit, and wipe all route through callables, so EVERY client write is denied,
// owner included. Covers all five docIds (global + four module memories).
// ─────────────────────────────────────────────────────────────────────────
describe('users/{uid}/memory (CF-written, owner-read)', () => {
  before(clear);

  const MEMORY_DOCS = ['global', 'journal', 'killList', 'hardLessons', 'relapse'];

  for (const docId of MEMORY_DOCS) {
    it(`owner: read own memory/${docId} allowed`, async () => {
      await seed('users', [OWNER, 'memory', docId], { content: 'x', receipts: [] });
      await assertSucceeds(getDoc(doc(ownerDb, 'users', OWNER, 'memory', docId)));
    });

    it(`owner: write memory/${docId} denied (client cannot author memory)`, async () => {
      await assertFails(setDoc(doc(ownerDb, 'users', OWNER, 'memory', docId), { content: 'forged' }));
    });

    it(`owner: update memory/${docId} denied (client cannot edit directly)`, async () => {
      await seed('users', [OWNER, 'memory', docId], { content: 'x', receipts: [] });
      await assertFails(updateDoc(doc(ownerDb, 'users', OWNER, 'memory', docId), { content: 'rewritten' }));
    });

    it(`owner: delete memory/${docId} denied (wipe goes through callable)`, async () => {
      await seed('users', [OWNER, 'memory', docId], { content: 'x', receipts: [] });
      await assertFails(deleteDoc(doc(ownerDb, 'users', OWNER, 'memory', docId)));
    });

    it(`non-owner: read another user's memory/${docId} denied`, async () => {
      await seed('users', [OWNER, 'memory', docId], { content: 'secret', receipts: [] });
      await assertFails(getDoc(doc(otherDb, 'users', OWNER, 'memory', docId)));
    });

    it(`unauthenticated: read memory/${docId} denied`, async () => {
      await seed('users', [OWNER, 'memory', docId], { content: 'x', receipts: [] });
      await assertFails(getDoc(doc(anonDb, 'users', OWNER, 'memory', docId)));
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────
// Default-deny floor — the removed test-connection allow and any unknown
// collection must reject even an authenticated owner-shaped write.
// ─────────────────────────────────────────────────────────────────────────
describe('default-deny floor', () => {
  before(clear);

  it('authenticated: write to removed test-connection denied', async () => {
    await assertFails(setDoc(doc(ownerDb, 'test-connection', 'ping'), { userId: OWNER }));
  });

  it('authenticated: read from an unknown collection denied', async () => {
    await seed('someUnknownCollection', ['x'], { userId: OWNER });
    await assertFails(getDoc(doc(ownerDb, 'someUnknownCollection', 'x')));
  });

  it('authenticated: write to an unknown collection denied', async () => {
    await assertFails(setDoc(doc(ownerDb, 'anotherUnknown', 'y'), { userId: OWNER }));
  });
});
