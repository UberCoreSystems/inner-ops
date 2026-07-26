import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  SIGNAL_WINDOW_MS,
  SIGNAL_STATES,
  isSignalEntry,
  getSignalAnchorMs,
  findLandingRelapse,
  getSignalState,
  getDebriefQueue,
  formatWindowRemaining,
} from './signalDebrief.js';
import {
  RELAPSE_FIELDS,
  RELAPSE_ENTRY_TYPES,
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
  [RELAPSE_FIELDS.ENTRY_TYPE]: RELAPSE_ENTRY_TYPES.SIGNAL,
  ...(eventMs != null ? { eventOccurredAt: iso(eventMs) } : {}),
  ...(resolution ? { [RELAPSE_FIELDS.RESOLUTION]: resolution } : {}),
  ...rest,
});

const relapse = ({ id = 'r1', eventMs, ...rest } = {}) => ({
  id,
  [RELAPSE_FIELDS.ENTRY_TYPE]: RELAPSE_ENTRY_TYPES.RELAPSE,
  ...(eventMs != null ? { eventOccurredAt: iso(eventMs) } : {}),
  ...rest,
});

describe('isSignalEntry', () => {
  it('signals and legacy docs without entryType are signals; relapses are not', () => {
    assert.equal(isSignalEntry(signal()), true);
    assert.equal(isSignalEntry({ id: 'legacy' }), true);
    assert.equal(isSignalEntry(relapse()), false);
  });
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
    assert.equal(getSignalState(s, [s], NOW).status, SIGNAL_STATES.LIVE);
  });

  it('unresolved signal past 48h is pending', () => {
    const s = signal({ eventMs: NOW - 49 * hourMs });
    assert.equal(getSignalState(s, [s], NOW).status, SIGNAL_STATES.PENDING);
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
    const state = getSignalState(s, [s], NOW);
    assert.equal(state.status, SIGNAL_STATES.CLOSED);
    assert.equal(state.outcome, SIGNAL_RESOLUTION_OUTCOMES.HELD);
    assert.equal(state.via, SIGNAL_RESOLUTION_VIA.DEBRIEF);
    assert.equal(state.note, 'left the house');
  });

  it('relapse entries have no signal state', () => {
    const r = relapse({ eventMs: NOW - hourMs });
    assert.equal(getSignalState(r, [r], NOW), null);
  });

  it('doc with no usable anchor is pending (queues for debrief)', () => {
    const state = getSignalState({ id: 'x', entryType: 'signal' }, [], NOW);
    assert.equal(state.status, SIGNAL_STATES.PENDING);
    assert.equal(state.anchorMs, 0);
  });
});

describe('getSignalState — landing derivation', () => {
  it('relapse inside the window auto-lands the signal with zero writes', () => {
    const s = signal({ eventMs: NOW - 60 * hourMs });
    const r = relapse({ eventMs: NOW - 55 * hourMs });
    const state = getSignalState(s, [s, r], NOW);
    assert.equal(state.status, SIGNAL_STATES.CLOSED);
    assert.equal(state.outcome, SIGNAL_RESOLUTION_OUTCOMES.LANDED);
    assert.equal(state.via, SIGNAL_RESOLUTION_VIA.AUTO);
    assert.equal(state.relapseEntryId, 'r1');
  });

  it('landed overrides a stored held', () => {
    const s = signal({
      eventMs: NOW - 60 * hourMs,
      resolution: { outcome: SIGNAL_RESOLUTION_OUTCOMES.HELD, resolvedAt: iso(NOW - 59 * hourMs), via: 'checkpoint' },
    });
    const r = relapse({ eventMs: NOW - 50 * hourMs });
    const state = getSignalState(s, [s, r], NOW);
    assert.equal(state.outcome, SIGNAL_RESOLUTION_OUTCOMES.LANDED);
    assert.equal(state.via, SIGNAL_RESOLUTION_VIA.AUTO);
  });

  it('stored landed resolution keeps its provenance and link', () => {
    const s = signal({
      eventMs: NOW - 60 * hourMs,
      resolution: {
        outcome: SIGNAL_RESOLUTION_OUTCOMES.LANDED,
        resolvedAt: iso(NOW - 55 * hourMs),
        via: SIGNAL_RESOLUTION_VIA.DEBRIEF,
        relapseEntryId: 'r9',
      },
    });
    const state = getSignalState(s, [s], NOW);
    assert.equal(state.status, SIGNAL_STATES.CLOSED);
    assert.equal(state.via, SIGNAL_RESOLUTION_VIA.DEBRIEF);
    assert.equal(state.relapseEntryId, 'r9');
  });

  it('earliest in-window relapse is the landing link when several exist', () => {
    const s = signal({ eventMs: NOW - 60 * hourMs });
    const r1 = relapse({ id: 'late', eventMs: NOW - 50 * hourMs });
    const r2 = relapse({ id: 'early', eventMs: NOW - 58 * hourMs });
    assert.equal(findLandingRelapse(s, [s, r1, r2]).id, 'early');
  });

  it('backdated relapse (eventOccurredAt before createdAt) lands by event time', () => {
    const s = signal({ eventMs: NOW - 60 * hourMs });
    const r = relapse({ eventMs: NOW - 55 * hourMs, createdAt: iso(NOW) });
    assert.equal(getSignalState(s, [s, r], NOW).outcome, SIGNAL_RESOLUTION_OUTCOMES.LANDED);
  });

  it('one relapse lands every window it falls inside', () => {
    const s1 = signal({ id: 's1', eventMs: NOW - 60 * hourMs });
    const s2 = signal({ id: 's2', eventMs: NOW - 54 * hourMs });
    const r = relapse({ eventMs: NOW - 52 * hourMs });
    const all = [s1, s2, r];
    assert.equal(getSignalState(s1, all, NOW).outcome, SIGNAL_RESOLUTION_OUTCOMES.LANDED);
    assert.equal(getSignalState(s2, all, NOW).outcome, SIGNAL_RESOLUTION_OUTCOMES.LANDED);
  });
});

describe('getSignalState — boundaries (half-open [anchor, anchor+48h))', () => {
  it('at exactly +48h the window has passed', () => {
    const s = signal({ eventMs: NOW - SIGNAL_WINDOW_MS });
    assert.equal(getSignalState(s, [s], NOW).status, SIGNAL_STATES.PENDING);
  });

  it('one ms before +48h it is still live', () => {
    const s = signal({ eventMs: NOW - SIGNAL_WINDOW_MS + 1 });
    assert.equal(getSignalState(s, [s], NOW).status, SIGNAL_STATES.LIVE);
  });

  it('relapse at exactly the anchor lands; at exactly +48h it does not', () => {
    const anchor = NOW - 50 * hourMs;
    const s = signal({ eventMs: anchor });
    const atAnchor = relapse({ id: 'a', eventMs: anchor });
    const atClose = relapse({ id: 'b', eventMs: anchor + SIGNAL_WINDOW_MS });
    assert.equal(getSignalState(s, [s, atAnchor], NOW).outcome, SIGNAL_RESOLUTION_OUTCOMES.LANDED);
    assert.equal(getSignalState(s, [s, atClose], NOW).status, SIGNAL_STATES.PENDING);
  });

  it('relapse before the anchor does not land', () => {
    const s = signal({ eventMs: NOW - hourMs });
    const r = relapse({ eventMs: NOW - 5 * hourMs });
    assert.equal(getSignalState(s, [s, r], NOW).status, SIGNAL_STATES.LIVE);
  });

  it('retrospective signal (event 3d before logging) is pending immediately', () => {
    const s = signal({ eventMs: NOW - 3 * dayMs, createdAt: iso(NOW - hourMs) });
    assert.equal(getSignalState(s, [s], NOW).status, SIGNAL_STATES.PENDING);
  });
});

describe('getDebriefQueue', () => {
  it('returns pending signals oldest first; live, closed, auto-landed, and relapses drop out', () => {
    const pendingOld = signal({ id: 'old', eventMs: NOW - 20 * dayMs });
    const pendingNew = signal({ id: 'new', eventMs: NOW - 3 * dayMs });
    const live = signal({ id: 'live', eventMs: NOW - hourMs });
    const held = signal({
      id: 'held',
      eventMs: NOW - 5 * dayMs,
      resolution: { outcome: SIGNAL_RESOLUTION_OUTCOMES.HELD, resolvedAt: iso(NOW - 5 * dayMs), via: 'checkpoint' },
    });
    const autoLanded = signal({ id: 'auto', eventMs: NOW - 10 * dayMs });
    const landingRelapse = relapse({ eventMs: NOW - 10 * dayMs + hourMs });
    const all = [pendingNew, live, held, autoLanded, landingRelapse, pendingOld];
    assert.deepEqual(getDebriefQueue(all, NOW).map(e => e.id), ['old', 'new']);
  });

  it('anchor-less docs queue first', () => {
    const noAnchor = { id: 'unknown', entryType: 'signal' };
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
