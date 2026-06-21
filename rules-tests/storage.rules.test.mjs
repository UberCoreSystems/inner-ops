/**
 * Storage security-rules proof suite (Inner Ops) — minimal.
 *
 * Inner Ops ships NO client uploads in v1, so storage.rules is a pure
 * default-deny. This suite proves that floor holds against the Storage
 * emulator: neither an authenticated user nor an anonymous client can read
 * or write ANY path, including a uid-shaped one.
 *
 * Runs via `npm run test:rules` (the launcher boots firestore + storage
 * emulators, runs this file, then tears them down).
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { before, after, describe, it } from 'node:test';

import {
  initializeTestEnvironment,
  assertFails,
} from '@firebase/rules-unit-testing';

import { ref, uploadString, getBytes } from 'firebase/storage';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RULES = readFileSync(join(__dirname, '..', 'storage.rules'), 'utf8');

const OWNER = 'alice';

let testEnv;
let ownerStorage; // authenticated as OWNER
let anonStorage; // unauthenticated

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'inner-ops-rules-test',
    storage: {
      rules: RULES,
      host: '127.0.0.1',
      port: 9199,
    },
  });
  ownerStorage = testEnv.authenticatedContext(OWNER).storage();
  anonStorage = testEnv.unauthenticatedContext().storage();
});

after(async () => {
  if (testEnv) await testEnv.cleanup();
});

// Seed an object bypassing rules so read paths have a real target to deny.
async function seed(path) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await uploadString(ref(ctx.storage(), path), 'seed-bytes');
  });
}

describe('storage default-deny floor', () => {
  // A uid-shaped path is the most likely place a future upload would land —
  // prove it is denied today so there is no window before owner-scoping lands.
  const PATHS = ['arbitrary/object.txt', `users/${OWNER}/upload.txt`];

  for (const path of PATHS) {
    it(`authenticated owner: write to ${path} denied`, async () => {
      await assertFails(uploadString(ref(ownerStorage, path), 'payload'));
    });

    it(`authenticated owner: read from ${path} denied`, async () => {
      await seed(path);
      await assertFails(getBytes(ref(ownerStorage, path)));
    });

    it(`unauthenticated: write to ${path} denied`, async () => {
      await assertFails(uploadString(ref(anonStorage, path), 'payload'));
    });

    it(`unauthenticated: read from ${path} denied`, async () => {
      await seed(path);
      await assertFails(getBytes(ref(anonStorage, path)));
    });
  }
});
