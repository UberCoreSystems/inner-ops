import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  SIGNAL_WINDOW_MS,
  SIGNAL_STATES,
  getSignalAnchorMs,
  getSignalState,
  getDebriefQueue,
  formatWindowRemaining,
} from './signalDebrief.js';
import {
  RELAPSE_FIELDS,
  SIGNAL_RESOLUTION_OUTCOMES,
  SIGNAL_RESOLUTION_VIA,
} from './schema.js';

const hourMs = 60 * 60 * 1000;
const dayMs = 24 * hourMs;

// Fixed reference instant so tests don't drift with the wall clock.
const NOW = Date.UTC(2026, 3, 1, 12, 0, 0); // 2026-04-01T12:00:00Z

const iso = (ms) => new Date(ms).toISOString();

const signal = ({ id = 's1', eventMs, resolution, ...rest } = {}) => ({
  id,
  ...(eventMs != null ? { eventOccurredAt: iso(eventMs) } : {}),
  ...(resolution ? { [RELAPSE_FIELDS.RESOLUTION]: resolution } : {}),
  ...rest,
});

describe('getSignalAnchorMs', () => {
  it('prefers eventOccurredAt over createdAt over legacy timestamp', () => {
    assert.equal(
      getSignalAnchorMs({ eventOccurredAt: iso(NOW - hourMs), createdAt: iso(NOW) }),
      NOW - hourMs
    );
    assert.equal(getSignalAnchorMs({ createdAt: iso(NOW - 2 * hourMs) }), NOW - 2 * hourMs);
    assert.equal(getSignalAnchorMs({ timestamp: NOW - 3 * hourMs }), NOW - 3 * hourMs);
  });

  it('returns 0 when nothing is parseable', () => {
    assert.equal(getSignalAnchorMs({}), 0);
    assert.equal(getSignalAnchorMs({ eventOccurredAt: 'garbage' }), 0);
  });
});

describe('getSignalState — basic states', () => {
  it('fresh unresolved signal is live', () => {
    const s = signal({ eventMs: NOW - hourMs });
    assert.equal(getSignalState(s, NOW).status, SIGNAL_STATES.LIVE);
  });

  it('unresolved signal past 48h is pending', () => {
    const s = signal({ eventMs: NOW - 49 * hourMs });
    assert.equal(getSignalState(s, NOW).status, SIGNAL_STATES.PENDING);
  });

  it('stored held resolution passes through as closed/held with provenance', () => {
    const s = signal({
      eventMs: NOW - 10 * dayMs,
      resolution: {
        outcome: SIGNAL_RESOLUTION_OUTCOMES.HELD,
        resolvedAt: iso(NOW - 10 * dayMs + hourMs),
        via: SIGNAL_RESOLUTION_VIA.DEBRIEF,
        note: 'left the house',
      },
    });
    const state = getSignalState(s, NOW);
    assert.equal(state.status, SIGNAL_STATES.CLOSED);
    assert.equal(state.outcome, SIGNAL_RESOLUTION_OUTCOMES.HELD);
    assert.equal(state.via, SIGNAL_RESOLUTION_VIA.DEBRIEF);
    assert.equal(state.note, 'left the house');
  });

  it('stored landed resolution is closed/landed with its provenance', () => {
    const s = signal({
      eventMs: NOW - 60 * hourMs,
      resolution: {
        outcome: SIGNAL_RESOLUTION_OUTCOMES.LANDED,
        resolvedAt: iso(NOW - 55 * hourMs),
        via: SIGNAL_RESOLUTION_VIA.CHECKPOINT,
      },
    });
    const state = getSignalState(s, NOW);
    assert.equal(state.status, SIGNAL_STATES.CLOSED);
    assert.equal(state.outcome, SIGNAL_RESOLUTION_OUTCOMES.LANDED);
    assert.equal(state.via, SIGNAL_RESOLUTION_VIA.CHECKPOINT);
    assert.equal(state.note, undefined);
  });

  it('a resolution with no via reads as checkpoint', () => {
    const s = signal({
      eventMs: NOW - 60 * hourMs,
      resolution: { outcome: SIGNAL_RESOLUTION_OUTCOMES.HELD, resolvedAt: iso(NOW - 59 * hourMs) },
    });
    assert.equal(getSignalState(s, NOW).via, SIGNAL_RESOLUTION_VIA.CHECKPOINT);
  });

  it('a migrated legacy relapse doc is a closed landed signal', () => {
    const s = signal({
      eventMs: NOW - 40 * dayMs,
      legacyRelapse: true,
      resolution: {
        outcome: SIGNAL_RESOLUTION_OUTCOMES.LANDED,
        resolvedAt: iso(NOW - 40 * dayMs),
        via: SIGNAL_RESOLUTION_VIA.LEGACY,
      },
    });
    const state = getSignalState(s, NOW);
    assert.equal(state.status, SIGNAL_STATES.CLOSED);
    assert.equal(state.outcome, SIGNAL_RESOLUTION_OUTCOMES.LANDED);
    assert.equal(state.via, SIGNAL_RESOLUTION_VIA.LEGACY);
  });

  it('an unknown outcome is not a resolution — the window still governs', () => {
    const s = signal({ eventMs: NOW - 60 * hourMs, resolution: { outcome: 'maybe' } });
    assert.equal(getSignalState(s, NOW).status, SIGNAL_STATES.PENDING);
  });

  it('doc with no usable anchor is pending (queues for debrief)', () => {
    const state = getSignalState({ id: 'x' }, NOW);
    assert.equal(state.status, SIGNAL_STATES.PENDING);
    assert.equal(state.anchorMs, 0);
  });

  it('missing entry has no state', () => {
    assert.equal(getSignalState(null, NOW), null);
    assert.equal(getSignalState(undefined, NOW), null);
  });
});

describe('getSignalState — nothing is derived from other entries', () => {
  it('a passed window stays pending no matter what else is on the record', () => {
    const s = signal({ id: 's1', eventMs: NOW - 60 * hourMs });
    const later = signal({ id: 's2', eventMs: NOW - 55 * hourMs });
    assert.equal(getSignalState(s, NOW).status, SIGNAL_STATES.PENDING);
    assert.equal(getSignalState(later, NOW).status, SIGNAL_STATES.PENDING);
  });

  it('a stored held is final — no later entry overrides it', () => {
    const s = signal({
      eventMs: NOW - 60 * hourMs,
      resolution: { outcome: SIGNAL_RESOLUTION_OUTCOMES.HELD, resolvedAt: iso(NOW - 59 * hourMs), via: 'checkpoint' },
    });
    assert.equal(getSignalState(s, NOW).outcome, SIGNAL_RESOLUTION_OUTCOMES.HELD);
  });

  it('legacy fields are ignored: entryType and relapseEntryId carry no meaning', () => {
    const typed = signal({ eventMs: NOW - hourMs, entryType: 'relapse' });
    assert.equal(getSignalState(typed, NOW).status, SIGNAL_STATES.LIVE);

    const linked = signal({
      eventMs: NOW - 60 * hourMs,
      resolution: {
        outcome: SIGNAL_RESOLUTION_OUTCOMES.LANDED,
        resolvedAt: iso(NOW - 55 * hourMs),
        via: 'debrief',
        relapseEntryId: 'r9',
      },
    });
    const state = getSignalState(linked, NOW);
    assert.equal(state.status, SIGNAL_STATES.CLOSED);
    assert.equal('relapseEntryId' in state, false);
  });
});

describe('getSignalState — boundaries (half-open [anchor, anchor+48h))', () => {
  it('at exactly +48h the window has passed', () => {
    const s = signal({ eventMs: NOW - SIGNAL_WINDOW_MS });
    assert.equal(getSignalState(s, NOW).status, SIGNAL_STATES.PENDING);
  });

  it('one ms before +48h it is still live', () => {
    const s = signal({ eventMs: NOW - SIGNAL_WINDOW_MS + 1 });
    assert.equal(getSignalState(s, NOW).status, SIGNAL_STATES.LIVE);
  });

  it('retrospective signal (event 3d before logging) is pending immediately', () => {
    const s = signal({ eventMs: NOW - 3 * dayMs, createdAt: iso(NOW - hourMs) });
    assert.equal(getSignalState(s, NOW).status, SIGNAL_STATES.PENDING);
  });
});

describe('getDebriefQueue', () => {
  it('returns pending signals oldest first; live and closed drop out', () => {
    const pendingOld = signal({ id: 'old', eventMs: NOW - 20 * dayMs });
    const pendingNew = signal({ id: 'new', eventMs: NOW - 3 * dayMs });
    const live = signal({ id: 'live', eventMs: NOW - hourMs });
    const held = signal({
      id: 'held',
      eventMs: NOW - 5 * dayMs,
      resolution: { outcome: SIGNAL_RESOLUTION_OUTCOMES.HELD, resolvedAt: iso(NOW - 5 * dayMs), via: 'checkpoint' },
    });
    const landed = signal({
      id: 'landed',
      eventMs: NOW - 10 * dayMs,
      resolution: { outcome: SIGNAL_RESOLUTION_OUTCOMES.LANDED, resolvedAt: iso(NOW - 10 * dayMs + hourMs), via: 'debrief' },
    });
    const migrated = signal({
      id: 'migrated',
      eventMs: NOW - 90 * dayMs,
      legacyRelapse: true,
      resolution: { outcome: SIGNAL_RESOLUTION_OUTCOMES.LANDED, resolvedAt: iso(NOW - 90 * dayMs), via: 'legacy' },
    });
    const all = [pendingNew, live, held, landed, migrated, pendingOld];
    assert.deepEqual(getDebriefQueue(all, NOW).map(e => e.id), ['old', 'new']);
  });

  it('anchor-less docs queue first', () => {
    const noAnchor = { id: 'unknown' };
    const dated = signal({ id: 'dated', eventMs: NOW - 3 * dayMs });
    assert.deepEqual(getDebriefQueue([dated, noAnchor], NOW).map(e => e.id), ['unknown', 'dated']);
  });

  it('empty input yields empty queue', () => {
    assert.deepEqual(getDebriefQueue([], NOW), []);
  });
});

describe('formatWindowRemaining', () => {
  it('renders hours, under-an-hour, and closed', () => {
    assert.equal(formatWindowRemaining(40.2 * hourMs), '41h left');
    assert.equal(formatWindowRemaining(30 * 60 * 1000), '<1h left');
    assert.equal(formatWindowRemaining(0), 'window closed');
    assert.equal(formatWindowRemaining(-5), 'window closed');
  });
});
