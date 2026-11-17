import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { PROTOCOL_TOOLS, getProtocolTool, describeProtocolRun } from './protocolTools.js';
import { PROTOCOL_TOOL_IDS } from './buildProtocolEntry.js';

describe('PROTOCOL_TOOLS', () => {
  it('covers exactly the ids buildProtocolEntry accepts', () => {
    assert.deepEqual([...PROTOCOL_TOOLS.map((t) => t.id)].sort(), [...PROTOCOL_TOOL_IDS].sort());
  });

  it('every tool can be run to a finish: steps, a timer, or the breathing round', () => {
    for (const tool of PROTOCOL_TOOLS) {
      assert.ok(['steps', 'timer', 'breath'].includes(tool.kind), tool.id);
      if (tool.kind !== 'breath') assert.ok(tool.finish, `${tool.id} needs a finish line`);
    }
  });

  it('5-4-3-2-1 walks five steps counting down from 5 to 1', () => {
    const tool = getProtocolTool('grounding');
    assert.equal(tool.kind, 'steps');
    assert.deepEqual(tool.steps.map((s) => s.count), [5, 4, 3, 2, 1]);
    assert.ok(tool.steps.every((s) => s.prompt));
  });

  it('cold water holds 30 seconds, movement 60', () => {
    assert.equal(getProtocolTool('cold').seconds, 30);
    assert.equal(getProtocolTool('movement').seconds, 60);
  });

  it('unknown id resolves to null', () => {
    assert.equal(getProtocolTool('nope'), null);
  });

  it('copy stays grounding language — no encouragement', () => {
    const text = PROTOCOL_TOOLS.map((t) => [t.description, t.instruction, t.finish].filter(Boolean).join(' ')).join(' ');
    assert.doesNotMatch(text, /you got this|great job|well done|proud|amazing|keep it up/i);
  });
});

describe('describeProtocolRun', () => {
  it('intensity only', () => {
    assert.equal(describeProtocolRun({ intensity: 7, toolsUsed: [], breathingCycles: 0, trigger: '' }), 'Protocol run · intensity 7/10');
  });

  it('lists tools in canonical order, breathing by cycles, then the trigger', () => {
    const line = describeProtocolRun({
      intensity: 7,
      toolsUsed: ['cold', 'breathing', 'grounding'],
      breathingCycles: 4,
      trigger: ' the call ',
    });
    assert.equal(line, 'Protocol run · intensity 7/10 · 5-4-3-2-1, cold water · 4 breathing cycles · trigger: the call');
  });

  it('drops unknown tool ids and tolerates a missing list', () => {
    assert.equal(describeProtocolRun({ intensity: 3, toolsUsed: ['movement', 'yoga'] }), 'Protocol run · intensity 3/10 · movement');
    assert.equal(describeProtocolRun({ intensity: 3 }), 'Protocol run · intensity 3/10');
  });

  it('unknown intensity reads as ?', () => {
    assert.equal(describeProtocolRun({}), 'Protocol run · intensity ?/10');
  });

  it('missing or malformed run is null', () => {
    assert.equal(describeProtocolRun(null), null);
    assert.equal(describeProtocolRun(undefined), null);
    assert.equal(describeProtocolRun('run'), null);
  });
});
