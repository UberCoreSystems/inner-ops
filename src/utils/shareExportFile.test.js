import { test } from 'node:test';
import assert from 'node:assert';

import { shareExportFile } from './shareExportFile.js';

const EXPORT = {
  filename: 'inner-ops-export-2026-11-20.json',
  json: '{\n  "manifest": { "totalDocuments": 2 }\n}',
};
const URI = `file:///var/mobile/Containers/Data/Application/A/Library/Caches/${EXPORT.filename}`;
const FILE = { path: EXPORT.filename, directory: 'CACHE' };

// Stand-ins for the two Capacitor plugins. `calls` records every bridge call
// in order; a test overrides a method by name.
function fakePlugins(overrides = {}) {
  const calls = [];
  const run = (name, fallback) => async (options) => {
    calls.push([name, options]);
    return (overrides[name] ?? fallback)(options);
  };
  const plugins = {
    Directory: { Cache: 'CACHE' },
    Encoding: { UTF8: 'utf8' },
    Filesystem: {
      writeFile: run('writeFile', () => ({ uri: URI })),
      deleteFile: run('deleteFile', () => undefined),
    },
    Share: {
      share: run('share', () => ({ activityType: 'com.apple.DocumentManagerUICore.SaveToFiles' })),
    },
  };
  return { calls, load: async () => plugins };
}

const rejectWith = (message) => () => {
  throw new Error(message);
};

test('writes the JSON as UTF-8 to the cache directory, shares that file, then deletes it', async () => {
  const { calls, load } = fakePlugins();

  assert.strictEqual(await shareExportFile(EXPORT, load), true);
  assert.deepStrictEqual(calls, [
    ['writeFile', { ...FILE, data: EXPORT.json, encoding: 'utf8' }],
    ['share', { files: [URI] }],
    ['deleteFile', FILE],
  ]);
});

test('a dismissed sheet is not a failure, and the file is still deleted', async () => {
  const { calls, load } = fakePlugins({ share: rejectWith('Share canceled') });

  assert.strictEqual(await shareExportFile(EXPORT, load), false);
  assert.deepStrictEqual(calls.at(-1), ['deleteFile', FILE]);
});

test('a share failure reaches the caller, and the file is still deleted', async () => {
  const { calls, load } = fakePlugins({ share: rejectWith('Error sharing item') });

  await assert.rejects(shareExportFile(EXPORT, load), /Error sharing item/);
  assert.deepStrictEqual(calls.at(-1), ['deleteFile', FILE]);
});

test('a failed write reaches the caller and nothing is shared', async () => {
  const { calls, load } = fakePlugins({ writeFile: rejectWith("'writeFile' failed") });

  await assert.rejects(shareExportFile(EXPORT, load), /writeFile/);
  assert.deepStrictEqual(calls.map(([name]) => name), ['writeFile']);
});

test('a failed delete does not change the outcome', async () => {
  const { load } = fakePlugins({ deleteFile: rejectWith('does not exist') });

  assert.strictEqual(await shareExportFile(EXPORT, load), true);
});
