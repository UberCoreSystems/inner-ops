import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildFollowUpEntryText,
  FOLLOW_UP_MAX_CHARS,
  FOLLOW_UP_READING_MAX_CHARS,
  FOLLOW_UP_PUSHBACK_MAX_CHARS,
  FOLLOW_UP_ANSWER_MAX_CHARS,
  NO_READING_RECORDED,
} from './buildFollowUpEntryText.js';

describe('buildFollowUpEntryText', () => {
  it('lays out the three labeled sections in order', () => {
    const out = buildFollowUpEntryText({
      entryText: 'Skipped the gym twice.',
      priorReading: 'You called both skips scheduling.',
      pushback: 'They were.',
    });
    assert.equal(
      out,
      'ORIGINAL ENTRY:\nSkipped the gym twice.\n\nYOUR PRIOR READING:\nYou called both skips scheduling.\n\nHIS PUSHBACK:\nThey were.'
    );
  });

  it('writes "(none recorded)" when there is no Oracle reading to stand behind', () => {
    for (const priorReading of [null, undefined, '', '   ']) {
      const out = buildFollowUpEntryText({ entryText: 'Entry.', priorReading, pushback: 'Pushback.' });
      assert.ok(out.includes(`YOUR PRIOR READING:\n${NO_READING_RECORDED}\n\nHIS PUSHBACK:`));
    }
  });

  it('never truncates the pushback and keeps the total within budget including labels', () => {
    const pushback = 'p'.repeat(8000);
    const out = buildFollowUpEntryText({
      entryText: 'e'.repeat(30000),
      priorReading: 'r'.repeat(30000),
      pushback,
    });
    assert.ok(out.length <= FOLLOW_UP_MAX_CHARS, `total ${out.length} must not exceed ${FOLLOW_UP_MAX_CHARS}`);
    assert.ok(out.endsWith(`HIS PUSHBACK:\n${pushback}`), 'pushback is intact at the end');
  });

  it('caps the reading and gives the entry the remainder', () => {
    const out = buildFollowUpEntryText({
      entryText: 'e'.repeat(30000),
      priorReading: 'r'.repeat(30000),
      pushback: 'short',
    });
    const reading = out.split('YOUR PRIOR READING:\n')[1].split('\n\nHIS PUSHBACK:')[0];
    assert.equal(reading.length, FOLLOW_UP_READING_MAX_CHARS);
    const entry = out.split('ORIGINAL ENTRY:\n')[1].split('\n\nYOUR PRIOR READING:')[0];
    assert.ok(entry.length > 15000, 'entry takes the remaining budget');
    assert.ok(out.length <= FOLLOW_UP_MAX_CHARS);
  });

  it('respects a custom budget and tolerates missing input', () => {
    const out = buildFollowUpEntryText({ entryText: 'e'.repeat(500), pushback: 'x' }, 120);
    assert.ok(out.length <= 120);
    assert.ok(out.endsWith('HIS PUSHBACK:\nx'));
    assert.doesNotThrow(() => buildFollowUpEntryText());
    assert.doesNotThrow(() => buildFollowUpEntryText({}));
  });

  it('keeps the three-section layout when there is no answer, even if a reply is passed', () => {
    const out = buildFollowUpEntryText({ entryText: 'E.', priorReading: 'R.', pushback: 'P.', reply: 'Reply?' });
    assert.equal(out, 'ORIGINAL ENTRY:\nE.\n\nYOUR PRIOR READING:\nR.\n\nHIS PUSHBACK:\nP.');
  });

  it('lays out the five labeled sections in order for the closing turn', () => {
    const out = buildFollowUpEntryText({
      entryText: 'Skipped the gym twice.',
      priorReading: 'You called both skips scheduling.',
      pushback: 'They were.',
      reply: 'Were they. Which night did you choose the desk?',
      answer: 'Tuesday.',
    });
    assert.equal(
      out,
      'ORIGINAL ENTRY:\nSkipped the gym twice.\n\nYOUR PRIOR READING:\nYou called both skips scheduling.' +
        '\n\nHIS PUSHBACK:\nThey were.\n\nYOUR REPLY:\nWere they. Which night did you choose the desk?\n\nHIS ANSWER:\nTuesday.'
    );
  });

  it('under budget pressure the answer and the whole reply survive, pushback and reading are capped, the entry takes the rest', () => {
    const reply = 'r'.repeat(3000) + ' Which night did you choose the desk?';
    const answer = 'a'.repeat(1500);
    const out = buildFollowUpEntryText({
      entryText: 'e'.repeat(30000),
      priorReading: 'p'.repeat(30000),
      pushback: 'b'.repeat(30000),
      reply,
      answer,
    });
    assert.ok(out.length <= FOLLOW_UP_MAX_CHARS, `total ${out.length} must not exceed ${FOLLOW_UP_MAX_CHARS}`);
    assert.ok(out.endsWith(`HIS ANSWER:\n${answer}`), 'answer intact at the end');
    assert.ok(out.includes(`YOUR REPLY:\n${reply}\n\nHIS ANSWER:`), 'reply intact, its question at the end');
    const pushback = out.split('HIS PUSHBACK:\n')[1].split('\n\nYOUR REPLY:')[0];
    assert.equal(pushback.length, FOLLOW_UP_PUSHBACK_MAX_CHARS);
    const reading = out.split('YOUR PRIOR READING:\n')[1].split('\n\nHIS PUSHBACK:')[0];
    assert.equal(reading.length, FOLLOW_UP_READING_MAX_CHARS);
    const entry = out.split('ORIGINAL ENTRY:\n')[1].split('\n\nYOUR PRIOR READING:')[0];
    assert.ok(entry.length > 3000, 'entry takes the remaining budget');
  });

  it('clamps the answer, and keeps the tail of the reply when the budget is tiny', () => {
    const reply = 'x'.repeat(50) + ' Which night?';
    const out = buildFollowUpEntryText({ entryText: 'E', priorReading: 'R', pushback: 'P', reply, answer: 'a'.repeat(3000) });
    assert.ok(out.endsWith(`HIS ANSWER:\n${'a'.repeat(FOLLOW_UP_ANSWER_MAX_CHARS)}`));
    const tight = buildFollowUpEntryText({ entryText: 'E', priorReading: 'R', pushback: 'P', reply, answer: 'A.' }, 120);
    assert.ok(tight.length <= 120);
    assert.ok(tight.includes('Which night?'), 'the reply keeps its tail, where the question sits');
  });

  it('writes "(none recorded)" in the five-section layout too', () => {
    const out = buildFollowUpEntryText({ entryText: 'E.', priorReading: '', pushback: 'P.', reply: 'Which?', answer: 'A.' });
    assert.ok(out.includes(`YOUR PRIOR READING:\n${NO_READING_RECORDED}\n\nHIS PUSHBACK:`));
  });
});
