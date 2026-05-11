import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseLines,
  linesToText,
  PERSONAL_CONTEXT_LIMITS,
} from './personalContext.js';

describe('parseLines', () => {
  it('splits on newlines, trims whitespace, removes empties', () => {
    assert.deepEqual(
      parseLines('  foo  \n\nbar\n  \nbaz', 10),
      ['foo', 'bar', 'baz']
    );
  });

  it('caps the result at `max` entries', () => {
    assert.deepEqual(parseLines('a\nb\nc\nd\ne', 3), ['a', 'b', 'c']);
  });

  it('returns [] for non-string inputs', () => {
    assert.deepEqual(parseLines(null, 3), []);
    assert.deepEqual(parseLines(undefined, 3), []);
    assert.deepEqual(parseLines(123, 3), []);
    assert.deepEqual(parseLines({}, 3), []);
  });

  it('returns [] for non-positive max', () => {
    assert.deepEqual(parseLines('a\nb', 0), []);
    assert.deepEqual(parseLines('a\nb', -1), []);
    assert.deepEqual(parseLines('a\nb', NaN), []);
    assert.deepEqual(parseLines('a\nb', Infinity), []);
  });

  it('handles all-whitespace input', () => {
    assert.deepEqual(parseLines('   \n\n  \n', 3), []);
  });

  it('handles \\r\\n line endings (Windows clipboard paste)', () => {
    // \r is not stripped by split('\n'), but our trim() removes it.
    assert.deepEqual(parseLines('foo\r\nbar\r\nbaz', 3), ['foo', 'bar', 'baz']);
  });
});

describe('linesToText', () => {
  it('joins arrays with newlines', () => {
    assert.equal(linesToText(['a', 'b', 'c']), 'a\nb\nc');
  });

  it('returns empty string for non-arrays and falsy values', () => {
    assert.equal(linesToText(null), '');
    assert.equal(linesToText(undefined), '');
    assert.equal(linesToText('not an array'), '');
    assert.equal(linesToText({}), '');
  });

  it('returns empty string for empty array', () => {
    assert.equal(linesToText([]), '');
  });

  it('round-trips with parseLines for clean input', () => {
    const arr = ['Career transition', 'Recovery', 'Financial reset'];
    const text = linesToText(arr);
    assert.deepEqual(parseLines(text, 5), arr);
  });
});

describe('PERSONAL_CONTEXT_LIMITS', () => {
  it('matches the limits documented in USER_PROFILE_FIELDS', () => {
    assert.equal(PERSONAL_CONTEXT_LIMITS.ACTIVE_SITUATIONS, 3);
    assert.equal(PERSONAL_CONTEXT_LIMITS.KNOWN_TRIGGERS, 5);
  });

  it('does not expose a KEY_PEOPLE limit (field removed 2026-05-10)', () => {
    assert.equal(PERSONAL_CONTEXT_LIMITS.KEY_PEOPLE, undefined);
  });
});
