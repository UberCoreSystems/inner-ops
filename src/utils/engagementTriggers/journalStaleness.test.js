import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  evaluateJournalStaleness,
  STALENESS_THRESHOLD_HOURS,
} from './journalStaleness.js';
import { ENGAGEMENT_TRIGGERS } from '../schema.js';

const HOURS = 60 * 60 * 1000;
const NOW = Date.UTC(2026, 4, 8, 12, 0, 0); // 2026-05-08T12:00:00Z

const baseArgs = (overrides = {}) => ({
  journalEntries: [],
  userProfile: {},
  notificationPreferences: { [ENGAGEMENT_TRIGGERS.JOURNAL_STALENESS]: { enabled: true } },
  bannerDismissals: {},
  now: NOW,
  ...overrides,
});

describe('evaluateJournalStaleness — gating', () => {
  it('returns null when the trigger is disabled', () => {
    const result = evaluateJournalStaleness(baseArgs({
      notificationPreferences: { [ENGAGEMENT_TRIGGERS.JOURNAL_STALENESS]: { enabled: false } },
    }));
    assert.equal(result, null);
  });

  it('treats a missing preferences entry as enabled (default-on for journal)', () => {
    const result = evaluateJournalStaleness(baseArgs({
      notificationPreferences: {},
    }));
    assert.ok(result, 'expected payload when prefs are unset');
  });

  it('returns null when the latest entry is fresher than the threshold', () => {
    const result = evaluateJournalStaleness(baseArgs({
      journalEntries: [{ createdAt: new Date(NOW - 2 * HOURS).toISOString() }],
    }));
    assert.equal(result, null);
  });

  it('fires when the latest entry is older than the threshold', () => {
    const result = evaluateJournalStaleness(baseArgs({
      journalEntries: [{ createdAt: new Date(NOW - (STALENESS_THRESHOLD_HOURS + 1) * HOURS).toISOString() }],
    }));
    assert.ok(result);
    assert.equal(result.triggerId, ENGAGEMENT_TRIGGERS.JOURNAL_STALENESS);
    assert.equal(result.actionRoute, '/journal');
  });

  it('fires immediately when the user has zero entries', () => {
    const result = evaluateJournalStaleness(baseArgs({ journalEntries: [] }));
    assert.ok(result);
    assert.match(result.copy, /No entries yet/);
  });
});

describe('evaluateJournalStaleness — copy enrichment', () => {
  it('uses generic copy when activeSituations is empty', () => {
    const result = evaluateJournalStaleness(baseArgs({
      journalEntries: [{ createdAt: new Date(NOW - 40 * HOURS).toISOString() }],
      userProfile: { activeSituations: [] },
    }));
    assert.match(result.copy, /Write what's actually happening/);
  });

  it('uses the personalized template when activeSituations[0] exists', () => {
    const result = evaluateJournalStaleness(baseArgs({
      journalEntries: [{ createdAt: new Date(NOW - 40 * HOURS).toISOString() }],
      userProfile: { activeSituations: ['Career transition'] },
    }));
    assert.match(result.copy, /Career transition is still in motion/);
  });

  it('ignores empty strings in activeSituations and falls back to generic', () => {
    const result = evaluateJournalStaleness(baseArgs({
      journalEntries: [{ createdAt: new Date(NOW - 40 * HOURS).toISOString() }],
      userProfile: { activeSituations: ['', '  '] },
    }));
    assert.match(result.copy, /Write what's actually happening/);
  });
});

describe('evaluateJournalStaleness — dismissal', () => {
  it('suppresses the banner inside the dismissal window', () => {
    const dismissedAt = NOW - 2 * HOURS;
    const result = evaluateJournalStaleness(baseArgs({
      journalEntries: [{ createdAt: new Date(NOW - 50 * HOURS).toISOString() }],
      bannerDismissals: { [ENGAGEMENT_TRIGGERS.JOURNAL_STALENESS]: new Date(dismissedAt).toISOString() },
    }));
    assert.equal(result, null);
  });

  it('re-fires once another threshold window has passed since dismissal', () => {
    const dismissedAt = NOW - (STALENESS_THRESHOLD_HOURS + 5) * HOURS;
    const result = evaluateJournalStaleness(baseArgs({
      journalEntries: [{ createdAt: new Date(NOW - 80 * HOURS).toISOString() }],
      bannerDismissals: { [ENGAGEMENT_TRIGGERS.JOURNAL_STALENESS]: new Date(dismissedAt).toISOString() },
    }));
    assert.ok(result);
  });

  it('re-fires when the user has journaled since the dismissal but then went stale again', () => {
    const dismissedAt = NOW - 5 * HOURS;
    const lastEntry = NOW - 3 * HOURS; // newer than dismissal — but still under threshold
    const oldEntry = NOW - 100 * HOURS;
    const result = evaluateJournalStaleness(baseArgs({
      journalEntries: [
        { createdAt: new Date(lastEntry).toISOString() },
        { createdAt: new Date(oldEntry).toISOString() },
      ],
      bannerDismissals: { [ENGAGEMENT_TRIGGERS.JOURNAL_STALENESS]: new Date(dismissedAt).toISOString() },
    }));
    // latest entry is fresher than threshold → no banner regardless of dismissal
    assert.equal(result, null);
  });
});
