import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  isFinalizedRule,
  getMostRecentBreak,
  isUnderReview,
  getHeldStreakDays,
  isViolatedInWindow,
  getViolatedRules,
  RULE_GRADUATION_DAYS,
} from './ruleState.js';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 4, 31); // fixed clock for determinism
const iso = (msAgo) => new Date(NOW - msAgo).toISOString();

const rule = (over = {}) => ({
  id: 'r1',
  isFinalized: true,
  ruleGoingForward: 'Verify before trusting.',
  finalizedAt: iso(100 * DAY),
  violations: [],
  ...over,
});

describe('isFinalizedRule', () => {
  it('requires isFinalized and non-empty rule text', () => {
    assert.equal(isFinalizedRule(rule()), true);
    assert.equal(isFinalizedRule(rule({ isFinalized: false })), false);
    assert.equal(isFinalizedRule(rule({ ruleGoingForward: '   ' })), false);
    assert.equal(isFinalizedRule(null), false);
  });
});

describe('isUnderReview', () => {
  it('is false when never broken', () => {
    assert.equal(isUnderReview(rule()), false);
  });

  it('is true when the most-recent break is unresolved', () => {
    assert.equal(isUnderReview(rule({ violations: [{ date: iso(2 * DAY), source: 'direct' }] })), true);
  });

  it('is false when the most-recent break is resolved (after-action done)', () => {
    assert.equal(isUnderReview(rule({
      violations: [{ date: iso(2 * DAY), source: 'direct', cause: 'x', correction: 'y', resolvedAt: iso(1 * DAY) }],
    })), false);
  });

  it('treats a legacy free-text note as an informal resolution', () => {
    assert.equal(isUnderReview(rule({ violations: [{ date: iso(2 * DAY), source: 'direct', note: 'slipped' }] })), false);
  });

  it('keys off the NEWEST break only', () => {
    // old resolved, new unresolved → under review
    assert.equal(isUnderReview(rule({
      violations: [
        { date: iso(20 * DAY), resolvedAt: iso(19 * DAY), cause: 'a', correction: 'b' },
        { date: iso(2 * DAY), source: 'direct' },
      ],
    })), true);
  });
});

describe('getHeldStreakDays', () => {
  it('returns 0 while under review', () => {
    assert.equal(getHeldStreakDays(rule({ violations: [{ date: iso(2 * DAY) }] }), NOW), 0);
  });

  it('counts from finalization when never broken', () => {
    assert.equal(getHeldStreakDays(rule({ finalizedAt: iso(14 * DAY) }), NOW), 14);
  });

  it('counts from the most-recent re-affirmation, not finalization', () => {
    const r = rule({
      finalizedAt: iso(100 * DAY),
      violations: [{ date: iso(10 * DAY), resolvedAt: iso(7 * DAY), cause: 'a', correction: 'b' }],
    });
    assert.equal(getHeldStreakDays(r, NOW), 7);
  });

  it('returns 0 for a non-finalized doc', () => {
    assert.equal(getHeldStreakDays(rule({ isFinalized: false }), NOW), 0);
  });
});

describe('getMostRecentBreak', () => {
  it('synthesizes a break from lastViolatedAt on old docs without violations[]', () => {
    const b = getMostRecentBreak(rule({ violations: undefined, lastViolatedAt: iso(3 * DAY) }));
    assert.ok(b);
    assert.equal(new Date(b.date).getTime(), NOW - 3 * DAY);
  });

  it('returns the newest of several violations', () => {
    const b = getMostRecentBreak(rule({
      violations: [{ date: iso(10 * DAY) }, { date: iso(2 * DAY) }, { date: iso(40 * DAY) }],
    }));
    assert.equal(new Date(b.date).getTime(), NOW - 2 * DAY);
  });
});

describe('isViolatedInWindow', () => {
  it('counts a violations[] break inside the window', () => {
    assert.equal(isViolatedInWindow(rule({ violations: [{ date: iso(5 * DAY) }] }), 14, NOW), true);
    assert.equal(isViolatedInWindow(rule({ violations: [{ date: iso(20 * DAY) }] }), 14, NOW), false);
  });

  it('counts lastViolatedAt inside the window', () => {
    assert.equal(isViolatedInWindow(rule({ lastViolatedAt: iso(3 * DAY) }), 14, NOW), true);
  });

  it('still counts a RESOLVED break (anti-gaming — after-action does not erase history)', () => {
    const r = rule({ violations: [{ date: iso(3 * DAY), resolvedAt: iso(1 * DAY), cause: 'a', correction: 'b' }] });
    assert.equal(isViolatedInWindow(r, 14, NOW), true);
  });
});

describe('getViolatedRules', () => {
  it('includes a finalized rule broken only via violations[] (the original bug)', () => {
    const rules = [rule({ id: 'a', violations: [{ date: iso(3 * DAY), source: 'weekly_review' }] })];
    const out = getViolatedRules(rules, { windowDays: 14, now: NOW });
    assert.equal(out.length, 1);
    assert.equal(out[0].id, 'a');
    assert.equal(out[0].ruleGoingForward, 'Verify before trusting.');
    assert.equal(out[0].underReview, true);
  });

  it('includes a legacy sibling violation doc pointing at a finalized rule, de-duped to one entry', () => {
    const target = rule({ id: 'tgt', violations: [{ date: iso(3 * DAY) }] });
    const legacy = { id: 'leg', isRuleViolation: true, violatedRuleId: 'tgt', ruleGoingForward: 'X', timestamp: NOW - 2 * DAY };
    const out = getViolatedRules([target, legacy], { windowDays: 14, now: NOW });
    assert.equal(out.length, 1);
    assert.equal(out[0].id, 'tgt');
  });

  it('surfaces a standalone legacy violation doc on its own rule text', () => {
    const legacy = { id: 'leg', isRuleViolation: true, ruleGoingForward: 'No phone after 9pm', timestamp: NOW - 1 * DAY };
    const out = getViolatedRules([legacy], { windowDays: 14, now: NOW });
    assert.equal(out.length, 1);
    assert.equal(out[0].rule, 'No phone after 9pm');
  });

  it('excludes breaks outside the window', () => {
    const rules = [rule({ id: 'a', violations: [{ date: iso(40 * DAY) }] })];
    assert.equal(getViolatedRules(rules, { windowDays: 14, now: NOW }).length, 0);
  });

  it('still surfaces a resolved-but-recent break (anti-gaming)', () => {
    const rules = [rule({ id: 'a', violations: [{ date: iso(3 * DAY), resolvedAt: iso(1 * DAY), cause: 'a', correction: 'b' }] })];
    const out = getViolatedRules(rules, { windowDays: 14, now: NOW });
    assert.equal(out.length, 1);
    assert.equal(out[0].underReview, false);
  });

  it('sorts newest break first', () => {
    const rules = [
      rule({ id: 'old', violations: [{ date: iso(10 * DAY) }] }),
      rule({ id: 'new', violations: [{ date: iso(1 * DAY) }] }),
    ];
    const out = getViolatedRules(rules, { windowDays: 14, now: NOW });
    assert.deepEqual(out.map(r => r.id), ['new', 'old']);
  });
});

describe('RULE_GRADUATION_DAYS', () => {
  it('is the 28-day establishing window', () => {
    assert.equal(RULE_GRADUATION_DAYS, 28);
  });
});
