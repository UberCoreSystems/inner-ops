import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { ONBOARDING_HELP_VERSION, USER_SETTINGS_FIELDS } from './schema.js';

/**
 * Local re-implementation of the dotted-key expansion in firebaseUtils, so it
 * can be exercised without pulling the Firebase SDK into the test runner.
 * Kept byte-identical in behaviour; if the real one changes, this must too.
 */
const expandDottedKeys = (dottedMap) => {
  const out = {};
  for (const [path, value] of Object.entries(dottedMap)) {
    const segments = path.split('.');
    let cursor = out;
    for (let i = 0; i < segments.length - 1; i++) {
      const key = segments[i];
      if (typeof cursor[key] !== 'object' || cursor[key] === null) cursor[key] = {};
      cursor = cursor[key];
    }
    cursor[segments[segments.length - 1]] = value;
  }
  return out;
};

describe('onboardingHelp — schema contract', () => {
  it('declares the onboardingHelp settings field', () => {
    assert.equal(USER_SETTINGS_FIELDS.ONBOARDING_HELP, 'onboardingHelp');
  });

  it('exposes an integer help version for the re-show lever', () => {
    assert.ok(Number.isInteger(ONBOARDING_HELP_VERSION));
    assert.ok(ONBOARDING_HELP_VERSION >= 1);
  });
});

describe('dotted field-path expansion (create branch)', () => {
  // The create branch matters because updateDoc treats "a.b.c" as a field
  // path, but writeData would create a field literally named "a.b.c" — a
  // document that no reader could ever find.
  it('expands a nested path into real nested objects', () => {
    const out = expandDottedKeys({ 'onboardingHelp.modules.journal': '2026-07-19T00:00:00.000Z' });
    assert.deepEqual(out, {
      onboardingHelp: { modules: { journal: '2026-07-19T00:00:00.000Z' } },
    });
  });

  it('merges sibling paths under a shared parent rather than overwriting', () => {
    const out = expandDottedKeys({
      'onboardingHelp.version': 1,
      'onboardingHelp.modules.journal': 'a',
      'onboardingHelp.modules.ledger': 'b',
    });
    assert.deepEqual(out, {
      onboardingHelp: { version: 1, modules: { journal: 'a', ledger: 'b' } },
    });
  });

  it('handles a single-segment key unchanged', () => {
    assert.deepEqual(expandDottedKeys({ identityDirection: 'x' }), { identityDirection: 'x' });
  });

  it('supports resetting a whole subtree to an empty map', () => {
    // This is what resetHelp('modules') writes.
    assert.deepEqual(
      expandDottedKeys({ 'onboardingHelp.modules': {} }),
      { onboardingHelp: { modules: {} } }
    );
  });
});

describe('module intro config', () => {
  it('every intro has the fields ModuleIntro renders, and no banned tone', async () => {
    const { MODULE_INTROS } = await import('../config/moduleIntros.js');
    assert.ok(MODULE_INTROS.length >= 5);

    // Voice rules are enforced here rather than in review: exclamation marks,
    // emoji, and encouragement have all crept into this product's copy before.
    const banned = /!|😀|🎉|[\u{1F300}-\u{1FAFF}]|you got this|great job|keep it up|amazing|journey/iu;

    for (const intro of MODULE_INTROS) {
      assert.ok(intro.id, 'intro needs an id');
      assert.ok(intro.accent?.startsWith('#'), `${intro.id}: accent must be a hex colour`);
      assert.ok(intro.eyebrow, `${intro.id}: missing eyebrow`);
      // Rendered by the page header, permanently — a module whose definition
      // is missing or thin leaves the user with no lasting statement of what
      // the module is, since the first-run card is dismissed for good.
      assert.ok(intro.definition?.length > 20, `${intro.id}: 'definition' is too short to teach anything`);
      assert.ok(intro.example?.length > 20, `${intro.id}: missing a concrete example`);
      assert.ok(intro.actionLabel, `${intro.id}: missing actionLabel`);

      for (const field of ['eyebrow', 'definition', 'example', 'actionLabel']) {
        assert.doesNotMatch(intro[field], banned, `${intro.id}.${field} violates the voice rules`);
      }
    }
  });

  it('ids are unique', async () => {
    const { MODULE_INTROS } = await import('../config/moduleIntros.js');
    const ids = MODULE_INTROS.map((i) => i.id);
    assert.equal(new Set(ids).size, ids.length);
  });
});
