import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { normalizeIntentionSuggestions, normalizeRedirectCritique } from './crossModuleExtraction.js';

describe('normalizeIntentionSuggestions', () => {
  it('returns [] for malformed / empty input', () => {
    assert.deepEqual(normalizeIntentionSuggestions(null), []);
    assert.deepEqual(normalizeIntentionSuggestions(undefined), []);
    assert.deepEqual(normalizeIntentionSuggestions({}), []);
    assert.deepEqual(normalizeIntentionSuggestions({ suggestions: 'nope' }), []);
    assert.deepEqual(normalizeIntentionSuggestions({ suggestions: [] }), []);
  });

  it('keeps valid pairs and trims whitespace', () => {
    const out = normalizeIntentionSuggestions({
      suggestions: [{ when: '  the urge hits  ', iWill: '  do 10 pushups  ' }],
    });
    assert.deepEqual(out, [{ when: 'the urge hits', iWill: 'do 10 pushups' }]);
  });

  it('drops entries missing either clause', () => {
    const out = normalizeIntentionSuggestions({
      suggestions: [
        { when: 'a', iWill: '' },
        { when: '', iWill: 'b' },
        { when: 'c' },
        { iWill: 'd' },
        { when: 'valid', iWill: 'pair' },
      ],
    });
    assert.deepEqual(out, [{ when: 'valid', iWill: 'pair' }]);
  });

  it('truncates each clause to the 50-char field cap (anti-overflow)', () => {
    const long = 'x'.repeat(80);
    const out = normalizeIntentionSuggestions({ suggestions: [{ when: long, iWill: long }] });
    assert.equal(out[0].when.length, 50);
    assert.equal(out[0].iWill.length, 50);
  });

  it('de-dupes case-insensitively on the when|iWill pair', () => {
    const out = normalizeIntentionSuggestions({
      suggestions: [
        { when: 'The Urge', iWill: 'Walk' },
        { when: 'the urge', iWill: 'walk' },
        { when: 'the urge', iWill: 'breathe' },
      ],
    });
    assert.equal(out.length, 2);
  });

  it('caps the count', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ when: `w${i}`, iWill: `r${i}` }));
    assert.equal(normalizeIntentionSuggestions({ suggestions: many }, 50, 6).length, 6);
  });
});

describe('normalizeRedirectCritique', () => {
  it('returns null only for null/undefined (caller fails open)', () => {
    assert.equal(normalizeRedirectCritique(null), null);
    assert.equal(normalizeRedirectCritique(undefined), null);
  });

  it('collapses any non-redirect verdict to a clean sound result', () => {
    const sound = { verdict: 'sound', critique: '', suggestions: [] };
    assert.deepEqual(normalizeRedirectCritique({}), sound);
    assert.deepEqual(normalizeRedirectCritique({ verdict: 'sound', critique: 'ignored' }), sound);
    assert.deepEqual(normalizeRedirectCritique({ verdict: 'whatever' }), sound);
  });

  it('keeps a redirect with valid suggestions and trims fields', () => {
    const out = normalizeRedirectCritique({
      verdict: 'redirect',
      critique: '  The target is a symptom.  ',
      suggestions: [{ title: '  Avoidance of conflict  ', category: 'fear', why: '  This is upstream.  ' }],
    });
    assert.deepEqual(out, {
      verdict: 'redirect',
      critique: 'The target is a symptom.',
      suggestions: [{ title: 'Avoidance of conflict', category: 'fear', why: 'This is upstream.' }],
    });
  });

  it('coerces an invalid/unknown category to "other"', () => {
    const out = normalizeRedirectCritique({
      verdict: 'redirect',
      critique: 'x',
      suggestions: [{ title: 't', category: 'made-up', why: 'w' }],
    });
    assert.equal(out.suggestions[0].category, 'other');
  });

  it('drops suggestions missing title or why', () => {
    const out = normalizeRedirectCritique({
      verdict: 'redirect',
      critique: 'x',
      suggestions: [
        { title: '', why: 'w', category: 'fear' },
        { title: 't', why: '', category: 'fear' },
        { title: 'keep', why: 'kept', category: 'fear' },
      ],
    });
    assert.deepEqual(out.suggestions, [{ title: 'keep', category: 'fear', why: 'kept' }]);
  });

  it('caps title length, de-dupes by title, and caps the count', () => {
    const long = 'y'.repeat(140);
    const dup = normalizeRedirectCritique({
      verdict: 'redirect', critique: 'x',
      suggestions: [
        { title: long, why: 'a', category: 'fear' },
        { title: 'Dupe', why: 'b', category: 'fear' },
        { title: 'dupe', why: 'c', category: 'fear' },
      ],
    });
    assert.equal(dup.suggestions[0].title.length, 100);
    assert.equal(dup.suggestions.length, 2);

    const many = Array.from({ length: 9 }, (_, i) => ({ title: `t${i}`, why: 'w', category: 'fear' }));
    const capped = normalizeRedirectCritique({ verdict: 'redirect', critique: 'x', suggestions: many });
    assert.equal(capped.suggestions.length, 3);
  });

  it('downgrades a redirect with no usable suggestions to sound', () => {
    const out = normalizeRedirectCritique({
      verdict: 'redirect',
      critique: 'flaw but nothing actionable',
      suggestions: [{ title: '', why: '' }],
    });
    assert.deepEqual(out, { verdict: 'sound', critique: '', suggestions: [] });
  });
});
