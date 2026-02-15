import test from 'node:test';
import assert from 'node:assert/strict';
import { extractThemes, selectLenses, generateFeedback } from './aiFeedback.js';
import { feedbackFixtures } from './aiFeedback.fixtures.js';

const flattenFeedback = (feedback) => [
  feedback.summary_mirror,
  feedback.core_pattern,
  feedback.analysis,
  ...(feedback.prescriptions || []),
  ...(feedback.journal_prompts || []),
  feedback.closing_charge
].join(' ');

const wordCount = (text) => String(text || '').trim().split(/\s+/).filter(Boolean).length;

test('extractThemes finds expected themes from curated fixtures', () => {
  feedbackFixtures.forEach((fixture) => {
    const themes = extractThemes(fixture.entryText, fixture.moduleName);
    fixture.expectedThemes.forEach((expectedTheme) => {
      assert.ok(themes.includes(expectedTheme), `${fixture.name}: missing theme ${expectedTheme}`);
    });
  });
});

test('selectLenses maps fixtures to expected philosophy lenses', () => {
  feedbackFixtures.forEach((fixture) => {
    const themes = extractThemes(fixture.entryText, fixture.moduleName);
    const lenses = selectLenses(themes, {});
    fixture.expectedLenses.forEach((expectedLens) => {
      assert.ok(lenses.includes(expectedLens), `${fixture.name}: missing lens ${expectedLens}`);
    });
    assert.ok(lenses.length >= 1 && lenses.length <= 3, `${fixture.name}: lens count should be 1-3`);
  });
});

test('anti-repetition rotates angle for same entry and user', async () => {
  const entryText = 'I avoided the hard call, then numbed out with scrolling and told myself I would handle it tomorrow.';
  const userContext = { userId: 'test-user-1' };

  const first = await generateFeedback({ moduleName: 'journal', entryText, userContext });
  const second = await generateFeedback({ moduleName: 'journal', entryText, userContext });

  assert.notEqual(first.analysis, second.analysis, 'analysis should rotate when similarity is high');
});

test('short entries receive dense output and required structure', async () => {
  const entryText = 'Missed training again. Made excuses. Felt weak.';
  const feedback = await generateFeedback({ moduleName: 'killList', entryText, userContext: { userId: 'test-user-2' } });

  assert.ok(wordCount(flattenFeedback(feedback)) >= wordCount(entryText), 'feedback should match/exceed short entry length');
  assert.ok(Array.isArray(feedback.chosen_lenses) && feedback.chosen_lenses.length >= 1 && feedback.chosen_lenses.length <= 3, 'chosen_lenses must contain 1-3 items');
  assert.ok(Array.isArray(feedback.prescriptions) && feedback.prescriptions.length >= 3, 'prescriptions should contain at least 3 actions');
  assert.ok(Array.isArray(feedback.journal_prompts) && feedback.journal_prompts.length >= 2, 'journal prompts should contain at least 2 prompts');
});

test('feedback references entry specifics with at least two touchpoints', async () => {
  const entryText = 'I snapped at my partner after a long shift, then blamed stress and stayed on my phone for two hours to avoid talking.';
  const feedback = await generateFeedback({ moduleName: 'journal', entryText, userContext: { userId: 'test-user-3' } });
  const combined = `${feedback.summary_mirror} ${feedback.analysis}`.toLowerCase();

  const touchpoints = ['snapped at my partner', 'long shift', 'phone for two hours'];
  const hits = touchpoints.reduce((count, phrase) => (combined.includes(phrase) ? count + 1 : count), 0);

  assert.ok(hits >= 2, 'feedback should cite at least two distinct entry touchpoints');
});
