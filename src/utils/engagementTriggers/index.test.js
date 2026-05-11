import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { evaluateAllTriggers, layoutBanners, TRIGGERS } from './index.js';
import { ENGAGEMENT_TRIGGERS } from '../schema.js';

const HOURS = 60 * 60 * 1000;
const NOW = Date.UTC(2026, 4, 8, 12, 0, 0);

describe('evaluateAllTriggers', () => {
  it('returns the journal-staleness payload when conditions match', () => {
    const result = evaluateAllTriggers({
      journalEntries: [],
      userProfile: {},
      notificationPreferences: {},
      bannerDismissals: {},
      now: NOW,
    });
    assert.equal(result.length, 1);
    assert.equal(result[0].triggerId, ENGAGEMENT_TRIGGERS.JOURNAL_STALENESS);
  });

  it('returns an empty array when no trigger conditions hold', () => {
    const result = evaluateAllTriggers({
      journalEntries: [{ createdAt: new Date(NOW - HOURS).toISOString() }],
      userProfile: {},
      notificationPreferences: { [ENGAGEMENT_TRIGGERS.JOURNAL_STALENESS]: { enabled: true } },
      bannerDismissals: {},
      now: NOW,
    });
    assert.deepEqual(result, []);
  });

  it('isolates evaluator failures so one broken trigger does not blank the stack', () => {
    // Inject a throwing trigger to confirm the orchestrator survives.
    const original = TRIGGERS.slice();
    TRIGGERS.unshift({
      id: 'test:throws',
      evaluate: () => { throw new Error('boom'); },
    });
    try {
      const result = evaluateAllTriggers({
        journalEntries: [],
        userProfile: {},
        notificationPreferences: {},
        bannerDismissals: {},
        now: NOW,
      });
      // The bad trigger contributed nothing; journalStaleness still fired.
      assert.ok(result.find((p) => p.triggerId === ENGAGEMENT_TRIGGERS.JOURNAL_STALENESS));
      assert.equal(result.length, 1);
    } finally {
      // Restore registry so subsequent tests are unaffected.
      TRIGGERS.length = 0;
      TRIGGERS.push(...original);
    }
  });
});

describe('layoutBanners', () => {
  const mk = (id) => ({ triggerId: id, copy: id });

  it('caps visible at 1 by default (pre-deploy stack-of-1)', () => {
    const banners = [mk('a'), mk('b'), mk('c')];
    const out = layoutBanners(banners);
    assert.equal(out.visible.length, 1);
    assert.equal(out.visible[0].triggerId, 'a');
    assert.equal(out.collapsedCount, 2);
  });

  it('respects an explicit maxVisible (v1.1 stack-of-2)', () => {
    const banners = [mk('a'), mk('b'), mk('c'), mk('d')];
    const out = layoutBanners(banners, { maxVisible: 2 });
    assert.equal(out.visible.length, 2);
    assert.equal(out.collapsedCount, 2);
  });

  it('clamps maxVisible at minimum 1 — stack-of-zero is meaningless', () => {
    const out = layoutBanners([mk('a'), mk('b')], { maxVisible: 0 });
    assert.equal(out.visible.length, 1);
    assert.equal(out.collapsedCount, 1);
  });

  it('returns zero collapsed when banners fit', () => {
    const out = layoutBanners([mk('a')], { maxVisible: 2 });
    assert.equal(out.visible.length, 1);
    assert.equal(out.collapsedCount, 0);
  });

  it('handles an empty banner list', () => {
    const out = layoutBanners([]);
    assert.deepEqual(out.visible, []);
    assert.equal(out.collapsedCount, 0);
  });
});

describe('TRIGGERS registry', () => {
  it('lists journal-staleness as the first (highest priority) trigger', () => {
    assert.ok(TRIGGERS.length >= 1);
    assert.equal(TRIGGERS[0].id, ENGAGEMENT_TRIGGERS.JOURNAL_STALENESS);
    assert.equal(typeof TRIGGERS[0].evaluate, 'function');
  });

  it('every registered trigger has an id and an evaluate function', () => {
    for (const t of TRIGGERS) {
      assert.equal(typeof t.id, 'string', `trigger missing id: ${JSON.stringify(t)}`);
      assert.equal(typeof t.evaluate, 'function', `trigger ${t.id} missing evaluate`);
    }
  });

  it('integrates with NOW-based evaluation when journalEntries is current', () => {
    const fresh = new Date(NOW - 2 * HOURS).toISOString();
    const result = evaluateAllTriggers({
      journalEntries: [{ createdAt: fresh }],
      userProfile: {},
      notificationPreferences: { [ENGAGEMENT_TRIGGERS.JOURNAL_STALENESS]: { enabled: true } },
      bannerDismissals: {},
      now: NOW,
    });
    assert.deepEqual(result, []);
  });
});
