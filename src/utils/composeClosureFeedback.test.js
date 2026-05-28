import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  composeClosureFeedback,
  coerceClosureResponseText,
} from './composeClosureFeedback.js';

describe('composeClosureFeedback — Oracle structured object input', () => {
  it('extracts text + closingQuestion when both present (kill)', () => {
    const out = composeClosureFeedback(
      { text: 'You ended it cleanly.', closingQuestion: 'What replaces it?', metacognitiveDepth: 'Pattern' },
      'kill',
    );
    assert.equal(out.oracleResponse, 'You ended it cleanly.');
    assert.equal(out.oracleClosingQuestion, 'What replaces it?');
  });

  it('extracts text when closingQuestion is null/missing', () => {
    const out = composeClosureFeedback(
      { text: 'Logged.', closingQuestion: null, metacognitiveDepth: null },
      'kill',
    );
    assert.equal(out.oracleResponse, 'Logged.');
    assert.equal(out.oracleClosingQuestion, null);
  });

  it('falls back to mode-specific string when text is empty', () => {
    const out = composeClosureFeedback({ text: '', closingQuestion: null }, 'kill');
    assert.equal(out.oracleResponse, 'Contract closed. Logged to archive.');
    assert.equal(out.oracleClosingQuestion, null);
  });

  it('uses escape fallback when mode is escape and text is empty', () => {
    const out = composeClosureFeedback({ text: '   ', closingQuestion: null }, 'escape');
    assert.equal(out.oracleResponse, 'Breach logged. Regroup.');
  });

  it('trims surrounding whitespace from text and closingQuestion', () => {
    const out = composeClosureFeedback(
      { text: '  done.  ', closingQuestion: '  next?  ' },
      'kill',
    );
    assert.equal(out.oracleResponse, 'done.');
    assert.equal(out.oracleClosingQuestion, 'next?');
  });
});

describe('composeClosureFeedback — defensive paths', () => {
  it('returns fallback on null input (kill)', () => {
    const out = composeClosureFeedback(null, 'kill');
    assert.equal(out.oracleResponse, 'Contract closed. Logged to archive.');
    assert.equal(out.oracleClosingQuestion, null);
  });

  it('returns fallback on undefined input (escape)', () => {
    const out = composeClosureFeedback(undefined, 'escape');
    assert.equal(out.oracleResponse, 'Breach logged. Regroup.');
    assert.equal(out.oracleClosingQuestion, null);
  });

  it('accepts a bare string (legacy correct path)', () => {
    const out = composeClosureFeedback('Quick.', 'kill');
    assert.equal(out.oracleResponse, 'Quick.');
    assert.equal(out.oracleClosingQuestion, null);
  });

  it('falls back when the string is whitespace-only', () => {
    const out = composeClosureFeedback('   ', 'kill');
    assert.equal(out.oracleResponse, 'Contract closed. Logged to archive.');
  });

  it('handles object missing text field gracefully', () => {
    const out = composeClosureFeedback({ closingQuestion: 'x' }, 'kill');
    assert.equal(out.oracleResponse, 'Contract closed. Logged to archive.');
    assert.equal(out.oracleClosingQuestion, 'x');
  });

  it('returns fallback for unexpected primitive types', () => {
    assert.equal(composeClosureFeedback(42, 'kill').oracleResponse, 'Contract closed. Logged to archive.');
    assert.equal(composeClosureFeedback(true, 'escape').oracleResponse, 'Breach logged. Regroup.');
  });
});

describe('coerceClosureResponseText — legacy read-time coercion', () => {
  it('passes strings through unchanged', () => {
    assert.equal(coerceClosureResponseText('hi'), 'hi');
  });

  it('extracts .text from map-shaped legacy values', () => {
    assert.equal(
      coerceClosureResponseText({
        text: 'extracted from map',
        metacognitiveDepth: null,
        closingQuestion: null,
      }),
      'extracted from map',
    );
  });

  it('returns empty string for null / undefined', () => {
    assert.equal(coerceClosureResponseText(null), '');
    assert.equal(coerceClosureResponseText(undefined), '');
  });

  it('returns empty string when object has no string .text', () => {
    assert.equal(coerceClosureResponseText({ metacognitiveDepth: 'Pattern' }), '');
    assert.equal(coerceClosureResponseText({ text: 42 }), '');
  });

  it('returns empty string for non-string non-object primitives', () => {
    assert.equal(coerceClosureResponseText(42), '');
    assert.equal(coerceClosureResponseText(true), '');
  });
});
