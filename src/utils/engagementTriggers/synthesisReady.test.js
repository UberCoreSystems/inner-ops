import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateSynthesisReady } from './synthesisReady.js';
import { ENGAGEMENT_TRIGGERS } from '../schema.js';

const TID = ENGAGEMENT_TRIGGERS.SYNTHESIS_READY;
const base = (over = {}) => ({
  syntheses: [{ id: 's1', generatedAt: '2026-06-06T00:00:00.000Z', isNew: true }],
  notificationPreferences: {},
  bannerDismissals: {},
  currentPath: '/journal',
  ...over,
});

describe('evaluateSynthesisReady', () => {
  it('fires when an unread briefing exists off the dashboard', () => {
    const r = evaluateSynthesisReady(base());
    assert.ok(r);
    assert.equal(r.triggerId, TID);
    assert.equal(r.actionRoute, '/synthesis');
  });

  it('is suppressed on the dashboard (own forced banner)', () => {
    assert.equal(evaluateSynthesisReady(base({ currentPath: '/dashboard' })), null);
  });

  it('is suppressed on the synthesis page itself', () => {
    assert.equal(evaluateSynthesisReady(base({ currentPath: '/synthesis' })), null);
  });

  it('does not fire when the latest briefing is already read', () => {
    assert.equal(evaluateSynthesisReady(base({ syntheses: [{ id: 's1', generatedAt: '2026-06-06T00:00:00.000Z', isNew: false }] })), null);
  });

  it('does not fire with no briefings', () => {
    assert.equal(evaluateSynthesisReady(base({ syntheses: [] })), null);
  });

  it('respects an explicit disable', () => {
    assert.equal(evaluateSynthesisReady(base({ notificationPreferences: { [TID]: { enabled: false } } })), null);
  });

  it('uses the newest briefing to decide isNew', () => {
    const r = evaluateSynthesisReady(base({
      syntheses: [
        { id: 'old', generatedAt: '2026-05-01T00:00:00.000Z', isNew: false },
        { id: 'new', generatedAt: '2026-06-06T00:00:00.000Z', isNew: true },
      ],
    }));
    assert.ok(r);
  });

  it('honors a dismissal until a newer briefing is generated', () => {
    // Dismissed AFTER the briefing was generated → stays suppressed.
    const suppressed = evaluateSynthesisReady(base({
      bannerDismissals: { [TID]: '2026-06-06T12:00:00.000Z' },
    }));
    assert.equal(suppressed, null);

    // A briefing generated AFTER the dismissal → fires again.
    const refires = evaluateSynthesisReady(base({
      syntheses: [{ id: 's2', generatedAt: '2026-06-07T00:00:00.000Z', isNew: true }],
      bannerDismissals: { [TID]: '2026-06-06T12:00:00.000Z' },
    }));
    assert.ok(refires);
  });
});
