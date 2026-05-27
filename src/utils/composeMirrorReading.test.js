import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { composeMirrorReading } from './composeMirrorReading.js';
import { RELAPSE_FIELDS, RELAPSE_ENTRY_TYPES, KILL_TARGET_FIELDS } from './schema.js';

// Fixed reference instant so tests don't drift with the wall clock.
const NOW = Date.UTC(2026, 4, 26, 12, 0, 0); // 2026-05-26T12:00:00Z
const DAY = 86400000;

const rule = ({ ruleGoingForward = 'Some rule', isFinalized = true } = {}) => ({
  isFinalized,
  ruleGoingForward,
});

const target = ({
  status = 'active',
  title = 'Target',
  streak = 0,
  checkIns = [],
  escapeData = [],
} = {}) => ({
  [KILL_TARGET_FIELDS.STATUS]: status,
  [KILL_TARGET_FIELDS.TITLE]: title,
  [KILL_TARGET_FIELDS.STREAK]: streak,
  checkIns,
  escapeData,
});

const checkIn = ({ daysAgo = 1, held = true } = {}) => ({
  date: new Date(NOW - daysAgo * DAY).toISOString(),
  held,
});

const relapse = ({ daysAgo = 1, archetype = null, entryType = RELAPSE_ENTRY_TYPES.SIGNAL } = {}) => ({
  timestamp: NOW - daysAgo * DAY,
  [RELAPSE_FIELDS.ARCHETYPE]: archetype,
  [RELAPSE_FIELDS.ENTRY_TYPE]: entryType,
});

describe('composeMirrorReading — cold start', () => {
  it('returns the blank-record line when nothing is declared', () => {
    const out = composeMirrorReading({ now: NOW });
    assert.deepEqual(out.observedLines, ['Nothing declared yet. The record is blank.']);
    assert.equal(out.synthesis, null);
    assert.equal(out.question, null);
    assert.equal(out.precursorAlert, null);
  });

  it('renders DIRECTION even in cold start when identityDirection is set', () => {
    const out = composeMirrorReading({
      now: NOW,
      behavioralContext: { identityDirection: 'Become someone whose word is binding.' },
    });
    assert.equal(out.direction, 'Become someone whose word is binding.');
    assert.deepEqual(out.observedLines, ['Nothing declared yet. The record is blank.']);
  });
});

describe('composeMirrorReading — rule lines', () => {
  it('"held under load" when 0 violations + contracts present + low untouched rate', () => {
    const out = composeMirrorReading({
      now: NOW,
      hardLessons: [rule(), rule(), rule(), rule(), rule()],
      killTargets: [
        target({ streak: 5, checkIns: [checkIn({ daysAgo: 1, held: true })] }),
        target({ streak: 5, checkIns: [checkIn({ daysAgo: 1, held: true })] }),
        target({ streak: 5, checkIns: [checkIn({ daysAgo: 1, held: true })] }),
      ],
      signalReport: { ruleIntegrity: { violatedInWindow: 0 } },
    });
    const rulesLine = out.observedLines.find((l) => l.includes('rules declared'));
    assert.ok(rulesLine);
    assert.match(rulesLine, /held under load/);
  });

  it('"held — or rules are too cautious" when 0 violations + high untouched rate', () => {
    const out = composeMirrorReading({
      now: NOW,
      hardLessons: [rule(), rule(), rule()],
      killTargets: [
        target({ streak: 0 }), // untouched
        target({ streak: 0 }), // untouched
      ],
      signalReport: { ruleIntegrity: { violatedInWindow: 0 } },
    });
    const rulesLine = out.observedLines.find((l) => l.includes('rules declared'));
    assert.ok(rulesLine);
    assert.match(rulesLine, /too cautious/);
  });

  it('singular "rule declared" when count is 1', () => {
    const out = composeMirrorReading({
      now: NOW,
      hardLessons: [rule()],
      signalReport: { ruleIntegrity: { violatedInWindow: 0 } },
    });
    const rulesLine = out.observedLines.find((l) => l.includes('declared'));
    assert.match(rulesLine, /^1 rule declared/);
  });

  it('"line broke once" when violatedInWindow === 1', () => {
    const out = composeMirrorReading({
      now: NOW,
      hardLessons: [rule(), rule(), rule()],
      signalReport: { ruleIntegrity: { violatedInWindow: 1 } },
    });
    const line = out.observedLines.find((l) => l.includes('broke once'));
    assert.ok(line);
  });

  it('"lines breaking" when violatedInWindow > 1', () => {
    const out = composeMirrorReading({
      now: NOW,
      hardLessons: [rule(), rule(), rule(), rule()],
      signalReport: { ruleIntegrity: { violatedInWindow: 3 } },
    });
    const line = out.observedLines.find((l) => l.includes('Lines breaking'));
    assert.ok(line);
  });
});

describe('composeMirrorReading — contract lines', () => {
  it('"declared, not pursued" when half-or-more untouched', () => {
    const out = composeMirrorReading({
      now: NOW,
      killTargets: [
        target({ streak: 0 }),
        target({ streak: 0 }),
        target({ streak: 0 }),
      ],
    });
    const line = out.observedLines.find((l) => l.includes('untouched'));
    assert.match(line, /Declared, not pursued/);
  });

  it('"pressure on" when an escape landed this week', () => {
    const out = composeMirrorReading({
      now: NOW,
      killTargets: [
        target({
          streak: 0,
          escapeData: [{ date: new Date(NOW - 2 * DAY).toISOString() }],
        }),
      ],
    });
    const line = out.observedLines.find((l) => l.includes('Pressure on'));
    assert.ok(line);
  });

  it('"under daily contact" when most contracts held this week', () => {
    const out = composeMirrorReading({
      now: NOW,
      killTargets: [
        target({ streak: 5, checkIns: [checkIn({ daysAgo: 1, held: true })] }),
        target({ streak: 5, checkIns: [checkIn({ daysAgo: 1, held: true })] }),
        target({ streak: 5, checkIns: [checkIn({ daysAgo: 1, held: true })] }),
      ],
    });
    const line = out.observedLines.find((l) => l.includes('Under daily contact'));
    assert.ok(line);
  });
});

describe('composeMirrorReading — hold streak line', () => {
  it('"strongest signal. Untested." when 21+ day hold and no violations', () => {
    const out = composeMirrorReading({
      now: NOW,
      killTargets: [target({ title: 'Never compromise a binding word.', streak: 25 })],
      signalReport: { ruleIntegrity: { violatedInWindow: 0 } },
    });
    const line = out.observedLines.find((l) => l.startsWith('Holding'));
    assert.ok(line);
    assert.match(line, /Untested/);
  });

  it('"strongest signal under load" when 21+ day hold with violations', () => {
    const out = composeMirrorReading({
      now: NOW,
      hardLessons: [rule()],
      killTargets: [target({ title: 'X', streak: 25 })],
      signalReport: { ruleIntegrity: { violatedInWindow: 1 } },
    });
    const line = out.observedLines.find((l) => l.startsWith('Holding'));
    assert.match(line, /under load/);
  });

  it('does NOT emit a hold line below the 21-day significance threshold', () => {
    const out = composeMirrorReading({
      now: NOW,
      killTargets: [target({ title: 'X', streak: 10 })],
    });
    const line = out.observedLines.find((l) => l.startsWith('Holding'));
    assert.equal(line, undefined);
  });
});

describe('composeMirrorReading — confrontation rate line', () => {
  it('"read selectively" when below 40%', () => {
    const out = composeMirrorReading({
      now: NOW,
      hardLessons: [rule()],
      signalReport: {
        ruleIntegrity: { violatedInWindow: 0 },
        confrontationRate: { engagedCount: 2, dismissedCount: 8, percentage: 20 },
      },
    });
    const line = out.observedLines.find((l) => l.includes('Oracle reflected'));
    assert.match(line, /read selectively/);
  });

  it('"loop closes" at 80%+', () => {
    const out = composeMirrorReading({
      now: NOW,
      hardLessons: [rule()],
      signalReport: {
        ruleIntegrity: { violatedInWindow: 0 },
        confrontationRate: { engagedCount: 8, dismissedCount: 1, percentage: 89 },
      },
    });
    const line = out.observedLines.find((l) => l.includes('Oracle reflected'));
    assert.match(line, /loop closes/);
  });

  it('skips the line below the minimum sample size of 5', () => {
    const out = composeMirrorReading({
      now: NOW,
      hardLessons: [rule()],
      signalReport: {
        ruleIntegrity: { violatedInWindow: 0 },
        confrontationRate: { engagedCount: 1, dismissedCount: 2, percentage: 33 },
      },
    });
    const line = out.observedLines.find((l) => l.includes('Oracle reflected'));
    assert.equal(line, undefined);
  });
});

describe('composeMirrorReading — language pattern', () => {
  it('renders when behavioralContext.journalLanguagePattern is set', () => {
    const out = composeMirrorReading({
      now: NOW,
      hardLessons: [rule()],
      behavioralContext: { journalLanguagePattern: 'commitment, pressure, decision' },
    });
    const line = out.observedLines.find((l) => l.includes('commitment, pressure, decision'));
    assert.ok(line);
    assert.match(line, /The language tracks the work/);
  });

  it('omits the line when no pattern detected', () => {
    const out = composeMirrorReading({
      now: NOW,
      hardLessons: [rule()],
      behavioralContext: { journalLanguagePattern: null },
    });
    const line = out.observedLines.find((l) => l.includes('writing returned to'));
    assert.equal(line, undefined);
  });
});

describe('composeMirrorReading — precursor alert', () => {
  it('"routine disruption" wins when life_transition fires', () => {
    const out = composeMirrorReading({
      now: NOW,
      hardLessons: [rule()],
      signalReport: {
        ruleIntegrity: { violatedInWindow: 0 },
        driftSignals: [{ type: 'life_transition', streak: 4 }],
      },
    });
    assert.match(out.precursorAlert, /Routine disruption 4 days running/);
  });

  it('"systems are leaking" for correlated escape', () => {
    const out = composeMirrorReading({
      now: NOW,
      hardLessons: [rule()],
      signalReport: {
        ruleIntegrity: { violatedInWindow: 0 },
        driftSignals: [{ type: 'correlated_escape', targetTitle: 'X' }],
      },
    });
    assert.match(out.precursorAlert, /leaking into each other/);
  });

  it('"recurring condition" for precursor_pattern with condition + streak', () => {
    const out = composeMirrorReading({
      now: NOW,
      hardLessons: [rule()],
      signalReport: {
        ruleIntegrity: { violatedInWindow: 0 },
        driftSignals: [{ type: 'precursor_pattern', condition: 'sleep deficit', streak: 3 }],
      },
    });
    assert.match(out.precursorAlert, /sleep deficit present across 3 consecutive days/);
  });

  it('null when only archetype_frequency fires (already covered by archetype line)', () => {
    const out = composeMirrorReading({
      now: NOW,
      hardLessons: [rule()],
      signalReport: {
        ruleIntegrity: { violatedInWindow: 0 },
        driftSignals: [{ type: 'archetype_frequency', archetype: 'Avoider', streak: 3 }],
      },
    });
    assert.equal(out.precursorAlert, null);
  });
});

describe('composeMirrorReading — synthesis', () => {
  it('"lines breaking in two places" when both violation + confirmed relapse', () => {
    const out = composeMirrorReading({
      now: NOW,
      hardLessons: [rule()],
      relapseEntries: [relapse({ daysAgo: 2, entryType: RELAPSE_ENTRY_TYPES.RELAPSE })],
      signalReport: { ruleIntegrity: { violatedInWindow: 1 } },
    });
    assert.match(out.synthesis, /breaking in two places/);
  });

  it('"a rule broke" when only violation', () => {
    const out = composeMirrorReading({
      now: NOW,
      hardLessons: [rule()],
      signalReport: { ruleIntegrity: { violatedInWindow: 1 } },
    });
    assert.match(out.synthesis, /A rule broke/);
  });

  it('"a relapse landed" when only confirmed relapse', () => {
    const out = composeMirrorReading({
      now: NOW,
      relapseEntries: [relapse({ daysAgo: 2, entryType: RELAPSE_ENTRY_TYPES.RELAPSE })],
      signalReport: { ruleIntegrity: { violatedInWindow: 0 } },
    });
    assert.match(out.synthesis, /relapse landed/);
  });

  it('"longest line you\'ve drawn" when aligned with significant hold', () => {
    const out = composeMirrorReading({
      now: NOW,
      hardLessons: [rule()],
      killTargets: [target({ title: 'X', streak: 25, checkIns: [checkIn({ daysAgo: 1, held: true })] })],
      signalReport: { ruleIntegrity: { violatedInWindow: 0 } },
    });
    assert.match(out.synthesis, /longest line you've drawn/);
  });

  it('"quiet is not the same as solved" when quiet + work declared and untouched', () => {
    const out = composeMirrorReading({
      now: NOW,
      hardLessons: [rule()],
      killTargets: [target({ streak: 0 }), target({ streak: 0 })],
      signalReport: { ruleIntegrity: { violatedInWindow: 0 } },
    });
    assert.match(out.synthesis, /not the same as solved/);
  });
});

describe('composeMirrorReading — question', () => {
  it('"what is the system avoiding" when many contracts untouched', () => {
    const out = composeMirrorReading({
      now: NOW,
      killTargets: [target({ streak: 0 }), target({ streak: 0 }), target({ streak: 0 })],
    });
    assert.match(out.question, /What is the system avoiding/);
  });

  it('"what would break with it" when significant hold + no violations', () => {
    const out = composeMirrorReading({
      now: NOW,
      hardLessons: [rule()],
      killTargets: [target({ title: 'Never compromise', streak: 25, checkIns: [checkIn({ daysAgo: 1, held: true })] })],
      signalReport: { ruleIntegrity: { violatedInWindow: 0 } },
    });
    assert.match(out.question, /what would break with it/);
  });

  it('"what did the breaking cost" when a violation fired', () => {
    const out = composeMirrorReading({
      now: NOW,
      hardLessons: [rule()],
      signalReport: { ruleIntegrity: { violatedInWindow: 1 } },
    });
    assert.match(out.question, /What did the breaking cost/);
  });

  it('skips the question in cold-start state', () => {
    const out = composeMirrorReading({ now: NOW });
    assert.equal(out.question, null);
  });
});

describe('composeMirrorReading — defensive defaults', () => {
  it('handles entirely missing input without throwing', () => {
    const out = composeMirrorReading();
    assert.ok(Array.isArray(out.observedLines));
    assert.equal(out.direction, null);
  });

  it('handles missing signalReport gracefully (no confrontation/violations data)', () => {
    const out = composeMirrorReading({
      now: NOW,
      hardLessons: [rule()],
    });
    // No signalReport means violatedInWindow defaults to 0, so the "held" branch fires.
    const rulesLine = out.observedLines.find((l) => l.includes('rule declared'));
    assert.ok(rulesLine);
  });
});
