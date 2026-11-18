import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  emptyDraft,
  canSaveDraft,
  missingForFinalize,
  lessonFromPrefill,
  draftFromLesson,
  applyEdit,
  takeSuggestion,
  mergeExtraction,
  buildLessonPayload,
  draftsEqual,
  lessonSource,
  findMatchingRule,
  findLinkedRule,
  linkLessonBreak,
  closeLessonBreak,
  readLocalDraft,
  writeLocalDraft,
  clearLocalDraft,
} from './lessonDraft.js';
import { localDateKey } from './dateUtils.js';
import { isUnderReview, getViolatedRules, getLastBreakMs } from './ruleState.js';

const DAY = 24 * 60 * 60 * 1000;
const NOW_ISO = new Date(2026, 10, 18, 15, 0, 0).toISOString(); // local afternoon
const NOW = new Date(NOW_ISO).getTime();
const ago = (ms) => new Date(NOW - ms).toISOString();

const fullDraft = (over = {}) => ({
  ...emptyDraft(),
  eventDescription: 'Signed the renewal without reading it.',
  eventCategory: 'overconfidence',
  myAssumption: 'I assumed nothing changed.',
  signalIgnored: 'They sent a new version an hour before.',
  costs: ['financial'],
  costDescription: 'Locked into twelve months.',
  extractedLesson: 'Time pressure is the tell.',
  ruleGoingForward: 'No signature on the day a document arrives.',
  ...over,
});

const rule = (over = {}) => ({
  id: 'r1',
  isFinalized: true,
  ruleGoingForward: 'Never sign what I have not read in full, out loud.',
  extractedLesson: 'Ambiguity in a contract is a decision already made against me.',
  finalizedAt: ago(30 * DAY),
  violations: [],
  ...over,
});

describe('canSaveDraft / missingForFinalize', () => {
  it('a draft needs only a non-blank event', () => {
    assert.equal(canSaveDraft({ ...emptyDraft(), eventDescription: 'x' }), true);
    assert.equal(canSaveDraft({ ...emptyDraft(), eventDescription: '   \n ' }), false);
    assert.equal(canSaveDraft(null), false);
  });

  it('lists every missing field at once, in form order', () => {
    assert.deepEqual(missingForFinalize({ ...emptyDraft(), eventDescription: 'x' }), [
      'eventCategory', 'myAssumption', 'signalIgnored', 'costs', 'costDescription', 'extractedLesson', 'ruleGoingForward',
    ]);
    assert.deepEqual(missingForFinalize(fullDraft()), []);
    assert.deepEqual(missingForFinalize(fullDraft({ costs: [], ruleGoingForward: ' ' })), ['costs', 'ruleGoingForward']);
  });
});

describe('lessonFromPrefill', () => {
  it('Signal: event and source id only, nothing marked as the Oracle\'s', () => {
    const d = lessonFromPrefill({ eventDescription: ' Isolation — conditions: late night. ', sourceSignalId: 's1' });
    assert.equal(d.eventDescription, 'Isolation — conditions: late night.');
    assert.equal(d.sourceSignalId, 's1');
    assert.deepEqual(d.oracleFilled, []);
    assert.equal(d.oracleSuggestion, null);
    assert.equal(lessonSource(d), 'signal');
  });

  it('Ledger: event and target id', () => {
    const d = lessonFromPrefill({ eventDescription: 'Doomscrolling — 3 escapes recorded', sourceKillTargetId: 'k1' });
    assert.equal(lessonSource(d), 'ledger');
    assert.equal(d.ruleGoingForward, '');
  });

  it('Journal: lesson and rule become a suggestion, never the fields', () => {
    const d = lessonFromPrefill({
      eventCategory: 'boundary_failure', eventDescription: 'Said yes again.', myAssumption: 'I assumed no would cost me.',
      signalIgnored: 'My gut said no.', costs: ['time', 'bogus'], costDescription: 'Two weeks.',
      extractedLesson: 'A resented yes is a no I did not say.', ruleGoingForward: 'Delay every yes 24 hours.',
      sourceJournalId: 'j1', isOracleExtracted: true,
    });
    assert.equal(d.extractedLesson, '');
    assert.equal(d.ruleGoingForward, '');
    assert.deepEqual(d.oracleSuggestion, { extractedLesson: 'A resented yes is a no I did not say.', ruleGoingForward: 'Delay every yes 24 hours.' });
    assert.deepEqual(d.costs, ['time']);
    assert.deepEqual(new Set(d.oracleFilled), new Set(['eventDescription', 'eventCategory', 'myAssumption', 'signalIgnored', 'costDescription', 'costs']));
    assert.equal(lessonSource(d), 'journal');
  });

  it('tolerates malformed input', () => {
    assert.deepEqual(lessonFromPrefill(null), emptyDraft());
    assert.deepEqual(lessonFromPrefill('not an object'), emptyDraft());
    const d = lessonFromPrefill({ eventCategory: 'made_up', isOracleExtracted: true, costs: 'financial' });
    assert.equal(d.eventCategory, '');
    assert.deepEqual(d.costs, []);
  });
});

describe('edits and suggestions', () => {
  it('an edited field stops being the Oracle\'s', () => {
    const d = { ...fullDraft(), oracleFilled: ['myAssumption', 'signalIgnored'] };
    const e = applyEdit(d, { myAssumption: 'Mine now.' });
    assert.deepEqual(e.oracleFilled, ['signalIgnored']);
    assert.equal(e.myAssumption, 'Mine now.');
  });

  it('taking a suggestion copies it and marks it as the Oracle\'s wording', () => {
    const d = { ...emptyDraft(), oracleSuggestion: { extractedLesson: 'L', ruleGoingForward: 'R' } };
    const t = takeSuggestion(d, 'ruleGoingForward');
    assert.equal(t.ruleGoingForward, 'R');
    assert.deepEqual(t.oracleFilled, ['ruleGoingForward']);
    assert.equal(takeSuggestion(d, 'myAssumption'), d);
  });
});

describe('mergeExtraction', () => {
  const extraction = {
    suggestedCategory: 'overconfidence', myAssumption: 'O-assumption', signalIgnored: 'O-signal',
    costDescription: 'O-cost', suggestedCosts: ['financial', 'nope'], extractedLesson: 'O-lesson', ruleGoingForward: 'O-rule',
    eventDescription: 'O-event',
  };

  it('fills empty forensic fields and offers the lesson/rule as a suggestion only', () => {
    const d = mergeExtraction({ ...emptyDraft(), eventDescription: 'Mine.' }, extraction);
    assert.equal(d.eventDescription, 'Mine.');
    assert.equal(d.myAssumption, 'O-assumption');
    assert.deepEqual(d.costs, ['financial']);
    assert.equal(d.extractedLesson, '');
    assert.equal(d.ruleGoingForward, '');
    assert.deepEqual(d.oracleSuggestion, { extractedLesson: 'O-lesson', ruleGoingForward: 'O-rule' });
    assert.equal(d.isOracleExtracted, true);
  });

  it('never overwrites the user\'s text; refreshes text that is still the Oracle\'s', () => {
    const d = mergeExtraction(
      { ...emptyDraft(), eventDescription: 'Mine.', myAssumption: 'User wrote this.', signalIgnored: 'Old oracle', oracleFilled: ['signalIgnored'], extractedLesson: 'My lesson', ruleGoingForward: 'My rule' },
      extraction,
    );
    assert.equal(d.myAssumption, 'User wrote this.');
    assert.equal(d.signalIgnored, 'O-signal');
    assert.equal(d.extractedLesson, 'My lesson');
    assert.equal(d.ruleGoingForward, 'My rule');
    assert.ok(!d.oracleFilled.includes('myAssumption'));
  });

  it('ignores an unknown category', () => {
    const d = mergeExtraction(emptyDraft(), { suggestedCategory: 'astrology' });
    assert.equal(d.eventCategory, '');
  });
});

describe('buildLessonPayload', () => {
  it('whitelists fields: no legacy flags, id or timestamp', () => {
    const p = buildLessonPayload({
      ...fullDraft(), id: 'x', timestamp: 1, userId: 'u', isRuleViolation: true, violatedRuleId: 'r1',
      isScarStub: true, sourceSignalId: 's1',
    });
    for (const k of ['id', 'timestamp', 'userId', 'isRuleViolation', 'violatedRuleId', 'isScarStub']) {
      assert.equal(k in p, false, k);
    }
    assert.equal(p.sourceSignalId, 's1');
    assert.equal(p.isFinalized, false);
    assert.equal(p.finalizedAt, null);
  });

  it('locking stamps finalizedAt and strips the suggestion', () => {
    const p = buildLessonPayload({ ...fullDraft(), oracleSuggestion: { extractedLesson: 'L', ruleGoingForward: 'R' } }, { finalize: true, nowIso: NOW_ISO });
    assert.equal(p.isFinalized, true);
    assert.equal(p.finalizedAt, NOW_ISO);
    assert.equal(p.oracleSuggestion, null);
  });

  it('draftsEqual ignores whitespace-only differences in trimmed fields', () => {
    assert.equal(draftsEqual(fullDraft(), fullDraft({ myAssumption: 'I assumed nothing changed.  ' })), true);
    assert.equal(draftsEqual(fullDraft(), fullDraft({ myAssumption: 'Different.' })), false);
  });

  it('draftFromLesson round-trips a saved lesson', () => {
    const lesson = { id: 'l1', ...buildLessonPayload(fullDraft({ sourceJournalId: 'j1', oracleFilled: ['myAssumption'] })) };
    const d = draftFromLesson(lesson);
    assert.equal(draftsEqual(d, fullDraft({ sourceJournalId: 'j1', oracleFilled: ['myAssumption'] })), true);
  });
});

describe('findMatchingRule', () => {
  const lessons = [rule()];

  it('matches on token overlap above the threshold', () => {
    const m = findMatchingRule('I signed the new contract without having read the full terms out loud, again.', lessons, { beforeMs: NOW });
    assert.equal(m?.id, 'r1');
  });

  it('needs at least three meaningful tokens', () => {
    assert.equal(findMatchingRule('signed contract', lessons, { beforeMs: NOW }), null);
  });

  it('ignores drafts, the lesson itself, and rules locked after the event', () => {
    const desc = 'I signed the new contract without having read the full terms out loud, again.';
    assert.equal(findMatchingRule(desc, [rule({ isFinalized: false })], { beforeMs: NOW }), null);
    assert.equal(findMatchingRule(desc, lessons, { beforeMs: NOW, excludeId: 'r1' }), null);
    assert.equal(findMatchingRule(desc, [rule({ finalizedAt: ago(-DAY) })], { beforeMs: NOW }), null);
  });

  it('returns null below the threshold', () => {
    assert.equal(findMatchingRule('Skipped training because the weather turned cold and grey.', lessons, { beforeMs: NOW }), null);
  });
});

describe('linkLessonBreak / closeLessonBreak', () => {
  it('appends a lesson break that every ruleState reader counts once', () => {
    const patch = linkLessonBreak(rule(), 'l9', NOW_ISO);
    assert.deepEqual(patch.violations, [{ date: NOW_ISO, source: 'lesson', lessonId: 'l9' }]);
    assert.equal(patch.lastViolatedAt, NOW_ISO);
    const updated = rule(patch);
    assert.equal(isUnderReview(updated), true);
    const violated = getViolatedRules([updated], { windowDays: 28, now: NOW });
    assert.equal(violated.length, 1);
    assert.equal(getLastBreakMs([updated]), NOW);
  });

  it('attaches to an open break already logged today instead of adding a second', () => {
    const earlier = new Date(NOW - 60 * 60 * 1000).toISOString();
    assert.equal(localDateKey(earlier), localDateKey(NOW_ISO));
    const r = rule({ violations: [{ date: earlier, source: 'direct' }], lastViolatedAt: earlier });
    const patch = linkLessonBreak(r, 'l9', NOW_ISO);
    assert.deepEqual(patch.violations, [{ date: earlier, source: 'direct', lessonId: 'l9' }]);
    assert.equal('lastViolatedAt' in patch, false);
  });

  it('does not attach to a resolved break or link the same lesson twice', () => {
    const earlier = new Date(NOW - 60 * 60 * 1000).toISOString();
    const r = rule({ violations: [{ date: earlier, source: 'direct', resolvedAt: earlier }] });
    assert.equal(linkLessonBreak(r, 'l9', NOW_ISO).violations.length, 2);
    const linked = rule({ violations: [{ date: earlier, source: 'lesson', lessonId: 'l9' }] });
    assert.equal(linkLessonBreak(linked, 'l9', NOW_ISO), null);
  });

  it('closes the linked break from the user\'s own words, re-affirming the rule', () => {
    const r = rule({ violations: [{ date: NOW_ISO, source: 'lesson', lessonId: 'l9' }] });
    const patch = closeLessonBreak(r, 'l9', fullDraft(), NOW_ISO);
    const v = patch.violations[0];
    assert.equal(v.cause, 'They sent a new version an hour before.');
    assert.equal(v.correction, 'No signature on the day a document arrives.');
    assert.equal(v.resolvedAt, NOW_ISO);
    assert.equal(isUnderReview(rule(patch)), false);
  });

  it('never stamps Oracle-filled text; the break stays open for the after-action review', () => {
    const r = rule({ violations: [{ date: NOW_ISO, source: 'lesson', lessonId: 'l9' }] });
    const oracleRule = fullDraft({ oracleFilled: ['ruleGoingForward'] });
    assert.equal(closeLessonBreak(r, 'l9', oracleRule, NOW_ISO), null);
    const oracleCause = fullDraft({ oracleFilled: ['signalIgnored'] });
    assert.equal(closeLessonBreak(r, 'l9', oracleCause, NOW_ISO).violations[0].cause, 'I assumed nothing changed.');
  });

  it('leaves an already-resolved break alone', () => {
    const r = rule({ violations: [{ date: NOW_ISO, source: 'lesson', lessonId: 'l9', cause: 'c', correction: 'x', resolvedAt: NOW_ISO }] });
    assert.equal(closeLessonBreak(r, 'l9', fullDraft(), NOW_ISO), null);
  });

  it('findLinkedRule finds the rule holding the lesson\'s break', () => {
    const r = rule({ violations: [{ date: NOW_ISO, source: 'lesson', lessonId: 'l9' }] });
    assert.equal(findLinkedRule([rule({ id: 'r0' }), r], 'l9')?.id, 'r1');
    assert.equal(findLinkedRule([r], 'nope'), null);
  });
});

describe('local draft storage', () => {
  let saved;
  beforeEach(() => { saved = globalThis.localStorage; });
  afterEach(() => { globalThis.localStorage = saved; });

  it('round-trips through localStorage', () => {
    const store = new Map();
    globalThis.localStorage = {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, v),
      removeItem: (k) => store.delete(k),
    };
    writeLocalDraft('u1', { draft: fullDraft(), editingId: 'l1' });
    const back = readLocalDraft('u1');
    assert.equal(back.editingId, 'l1');
    assert.equal(back.draft.ruleGoingForward, 'No signature on the day a document arrives.');
    assert.equal(readLocalDraft('u2'), null);
    clearLocalDraft('u1');
    assert.equal(readLocalDraft('u1'), null);
  });

  it('storage that throws is a no-op', () => {
    globalThis.localStorage = {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('blocked'); },
      removeItem: () => { throw new Error('blocked'); },
    };
    assert.doesNotThrow(() => writeLocalDraft('u1', { draft: fullDraft() }));
    assert.equal(readLocalDraft('u1'), null);
    assert.doesNotThrow(() => clearLocalDraft('u1'));
  });
});
