import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CUSTOM_PRECURSOR_LIMITS,
  normalizeCondition,
  addCustomPrecursor,
  removeCustomPrecursor,
  sanitizeCustomList,
} from './customPrecursors.js';

const BUILTINS = ['Sleep deprived', 'Craving', 'None of the above'];

test('normalizeCondition trims and collapses internal whitespace', () => {
  assert.equal(normalizeCondition('  late  \t night  '), 'late night');
  assert.equal(normalizeCondition('argued with ex'), 'argued with ex');
});

test('normalizeCondition returns empty string for non-strings', () => {
  assert.equal(normalizeCondition(null), '');
  assert.equal(normalizeCondition(undefined), '');
  assert.equal(normalizeCondition(42), '');
  assert.equal(normalizeCondition(['x']), '');
});

test('addCustomPrecursor appends the normalized value and returns it', () => {
  const result = addCustomPrecursor(['worked past midnight'], '  argued  with ex ', BUILTINS);
  assert.equal(result.ok, true);
  assert.deepEqual(result.list, ['worked past midnight', 'argued with ex']);
  assert.equal(result.value, 'argued with ex');
});

test('addCustomPrecursor rejects empty and whitespace-only input', () => {
  assert.deepEqual(addCustomPrecursor([], '', BUILTINS), { ok: false, reason: 'empty' });
  assert.deepEqual(addCustomPrecursor([], '   \t ', BUILTINS), { ok: false, reason: 'empty' });
});

test('addCustomPrecursor rejects over-length, accepts exactly at the cap', () => {
  const max = CUSTOM_PRECURSOR_LIMITS.MAX_LENGTH;
  assert.deepEqual(addCustomPrecursor([], 'x'.repeat(max + 1), BUILTINS), { ok: false, reason: 'too_long' });
  const result = addCustomPrecursor([], 'x'.repeat(max), BUILTINS);
  assert.equal(result.ok, true);
  assert.equal(result.value.length, max);
});

test('addCustomPrecursor rejects case-insensitive duplicates of builtins', () => {
  assert.deepEqual(addCustomPrecursor([], 'craving', BUILTINS), { ok: false, reason: 'duplicate' });
  assert.deepEqual(addCustomPrecursor([], 'SLEEP  DEPRIVED', BUILTINS), { ok: false, reason: 'duplicate' });
});

test('addCustomPrecursor rejects case-insensitive duplicates of existing customs', () => {
  const current = ['argued with ex'];
  assert.deepEqual(addCustomPrecursor(current, 'Argued With Ex', BUILTINS), { ok: false, reason: 'duplicate' });
  assert.deepEqual(addCustomPrecursor(current, ' argued  with ex ', BUILTINS), { ok: false, reason: 'duplicate' });
});

test('addCustomPrecursor rejects when the list is at MAX_COUNT', () => {
  const full = Array.from({ length: CUSTOM_PRECURSOR_LIMITS.MAX_COUNT }, (_, i) => `condition ${i}`);
  assert.deepEqual(addCustomPrecursor(full, 'one more', BUILTINS), { ok: false, reason: 'limit' });
});

test('addCustomPrecursor does not mutate the input array', () => {
  const current = ['a'];
  addCustomPrecursor(current, 'b', BUILTINS);
  assert.deepEqual(current, ['a']);
});

test('removeCustomPrecursor removes exact matches only, without mutation', () => {
  const current = ['argued with ex', 'worked past midnight'];
  assert.deepEqual(removeCustomPrecursor(current, 'argued with ex'), ['worked past midnight']);
  assert.deepEqual(removeCustomPrecursor(current, 'Argued With Ex'), current);
  assert.deepEqual(removeCustomPrecursor(current, 'unknown'), current);
  assert.deepEqual(current, ['argued with ex', 'worked past midnight']);
});

test('removeCustomPrecursor tolerates non-array input', () => {
  assert.deepEqual(removeCustomPrecursor(null, 'x'), []);
  assert.deepEqual(removeCustomPrecursor(undefined, 'x'), []);
});

test('sanitizeCustomList returns [] for non-arrays', () => {
  assert.deepEqual(sanitizeCustomList(null, BUILTINS), []);
  assert.deepEqual(sanitizeCustomList('not a list', BUILTINS), []);
  assert.deepEqual(sanitizeCustomList({ 0: 'x' }, BUILTINS), []);
});

test('sanitizeCustomList drops junk, dedupes, caps, preserves order', () => {
  const raw = [
    '  argued  with ex ',
    42,
    '',
    'craving',              // dup of builtin
    'x'.repeat(CUSTOM_PRECURSOR_LIMITS.MAX_LENGTH + 1),
    'Argued With Ex',       // dup of earlier custom
    'worked past midnight',
    'condition a',
    'condition b',
    'condition c',
    'condition d',
    'condition e',          // seventh valid — beyond cap
  ];
  assert.deepEqual(sanitizeCustomList(raw, BUILTINS), [
    'argued with ex',
    'worked past midnight',
    'condition a',
    'condition b',
    'condition c',
    'condition d',
  ]);
});
