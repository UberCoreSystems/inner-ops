import { test } from 'node:test';
import assert from 'node:assert';

import { buildExportPayload } from './exportData.js';
import { MEMORY_DOC_IDS } from './memoryConstants.js';

const ISO = '2026-06-17T10:00:00.000Z';

test('manifest counts collections and includes all five memory docs', () => {
  const payload = buildExportPayload({
    exportedAt: ISO,
    collections: {
      journalEntries: [{ id: 'a' }, { id: 'b' }],
      killTargets: [{ id: 'k' }],
      relapseEntries: [],
    },
    memory: {
      global: { content: 'x' },
      journal: { receipts: [] },
      killList: null,
      hardLessons: null,
      relapse: { content: 'y' },
    },
    userProfile: { uid: 'u1' },
  });

  assert.strictEqual(payload.exportedAt, ISO);
  assert.strictEqual(payload.manifest.collections.journalEntries, 2);
  assert.strictEqual(payload.manifest.collections.killTargets, 1);
  assert.strictEqual(payload.manifest.collections.relapseEntries, 0);

  // All five memory ids reported, presence as 0/1.
  for (const id of MEMORY_DOC_IDS) {
    assert.ok(id in payload.manifest.memory, `memory.${id} present in manifest`);
  }
  assert.strictEqual(payload.manifest.memory.global, 1);
  assert.strictEqual(payload.manifest.memory.killList, 0);
  assert.strictEqual(payload.manifest.userProfile, 1);

  assert.strictEqual(payload.manifest.memory.journal, 1);
  // total = 3 collection docs + 3 present memory docs (global/journal/relapse) + 1 profile
  assert.strictEqual(payload.manifest.totalDocuments, 7);
  assert.strictEqual(payload.manifest.partial, false);
  assert.deepStrictEqual(payload.manifest.errors, []);

  // Data is carried through, not just counted.
  assert.deepStrictEqual(payload.journalEntries, [{ id: 'a' }, { id: 'b' }]);
  assert.deepStrictEqual(payload.memory.relapse, { content: 'y' });
});

test('sparse history yields zero counts and is not flagged partial', () => {
  const payload = buildExportPayload({
    exportedAt: ISO,
    collections: { journalEntries: [], killTargets: [] },
    memory: {},
    userProfile: null,
  });

  assert.strictEqual(payload.manifest.totalDocuments, 0);
  assert.strictEqual(payload.manifest.partial, false);
  assert.strictEqual(payload.manifest.userProfile, 0);
  for (const id of MEMORY_DOC_IDS) {
    assert.strictEqual(payload.manifest.memory[id], 0);
  }
});

test('failed reads mark the manifest partial without faking counts', () => {
  const payload = buildExportPayload({
    exportedAt: ISO,
    collections: { journalEntries: [], killTargets: [{ id: 'k' }] },
    memory: { global: { content: 'x' } },
    userProfile: null,
    errors: ['journalEntries', 'memory'],
  });

  assert.strictEqual(payload.manifest.partial, true);
  assert.deepStrictEqual(payload.manifest.errors, ['journalEntries', 'memory']);
  // A failed collection reads as 0 — the partial flag is what signals "didn't load".
  assert.strictEqual(payload.manifest.collections.journalEntries, 0);
  assert.strictEqual(payload.manifest.collections.killTargets, 1);
});

test('missing optional fields default safely', () => {
  const payload = buildExportPayload({ exportedAt: ISO });
  assert.strictEqual(payload.manifest.totalDocuments, 0);
  assert.strictEqual(payload.manifest.partial, false);
  assert.deepStrictEqual(payload.manifest.collections, {});
  assert.strictEqual(payload.userProfile, null);
});
