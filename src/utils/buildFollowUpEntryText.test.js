import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildFollowUpEntryText,
  FOLLOW_UP_MAX_CHARS,
  FOLLOW_UP_READING_MAX_CHARS,
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
});
