import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractClosingQuestion,
  extractTaggedQuestion,
  stripQuestionTags,
} from './oracleQuestionExtractor.js';

test('extracts tagged closing question', () => {
  const prose = 'Some prose. <closing_question>What are you protecting here?</closing_question>';
  assert.equal(extractTaggedQuestion(prose), 'What are you protecting here?');
});

test('extracts last sentence ending in ? when no tag present', () => {
  const prose = 'You named the trigger. That is real signal. What did you do in the moment that did not match what you said?';
  assert.equal(
    extractClosingQuestion(prose),
    'What did you do in the moment that did not match what you said?'
  );
});

test('returns null when prose has no question', () => {
  const prose = 'You named the trigger. That is real signal. Hold the line.';
  assert.equal(extractClosingQuestion(prose), null);
});

test('returns null on empty input', () => {
  assert.equal(extractClosingQuestion(''), null);
  assert.equal(extractClosingQuestion(null), null);
  assert.equal(extractClosingQuestion(undefined), null);
});

test('returns last question when prose contains multiple', () => {
  const prose = 'What were you avoiding? You also need to consider the timing. When does the next test of this rule arrive?';
  assert.equal(
    extractClosingQuestion(prose),
    'When does the next test of this rule arrive?'
  );
});

test('treats whole prose as the question when it is a single short question', () => {
  const prose = 'What does this make possible now?';
  assert.equal(
    extractClosingQuestion(prose),
    'What does this make possible now?'
  );
});

test('skips rhetorical hedges', () => {
  const prose = 'You held the line. Or maybe you postponed it? What does the next move look like in concrete terms?';
  assert.equal(
    extractClosingQuestion(prose),
    'What does the next move look like in concrete terms?'
  );
});

test('strips question tags but keeps the inner text', () => {
  const prose = 'Some prose. <closing_question>What are you protecting?</closing_question>';
  assert.equal(stripQuestionTags(prose), 'Some prose. What are you protecting?');
});

test('strip is a no-op when no tags present', () => {
  const prose = 'Some prose with no tags. What now?';
  assert.equal(stripQuestionTags(prose), prose);
});

test('handles smart quotes wrapping the question', () => {
  const prose = 'You said something specific. "What does discipline look like at 2pm on a Tuesday?"';
  assert.equal(
    extractClosingQuestion(prose),
    'What does discipline look like at 2pm on a Tuesday?'
  );
});

test('rejects too-short candidates', () => {
  const prose = 'Statement. No?';
  assert.equal(extractClosingQuestion(prose), null);
});

test('ignores non-string input', () => {
  assert.equal(extractClosingQuestion({}), null);
  assert.equal(extractClosingQuestion(42), null);
  assert.equal(extractClosingQuestion([]), null);
});
