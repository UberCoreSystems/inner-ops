/**
 * protocolTools — the Protocol's grounding tools as data, plus the one-line
 * summary of a logged run. Pure: no React, no Firebase.
 *
 * Every tool is something the user runs to a finish, not a tip to read:
 *   steps  — tap through each step (5-4-3-2-1)
 *   timer  — hold for `seconds` (cold water, movement)
 *   breath — the paced box-breathing round (useBreathing)
 * A tool counts as used only when it reaches its finish. Ids must stay
 * inside PROTOCOL_TOOL_IDS: buildProtocolEntry drops anything else.
 */
import { PROTOCOL_TOOL_IDS } from './buildProtocolEntry.js';

export const PROTOCOL_TOOLS = Object.freeze([
  {
    id: 'grounding',
    name: '5-4-3-2-1',
    icon: 'eye',
    kind: 'steps',
    description: 'Name 5 things you see, 4 you hear, 3 you feel, 2 you smell, 1 you taste.',
    steps: [
      { count: 5, prompt: 'things you can see' },
      { count: 4, prompt: 'things you can hear' },
      { count: 3, prompt: 'things you can feel' },
      { count: 2, prompt: 'things you can smell' },
      { count: 1, prompt: 'thing you can taste' },
    ],
    finish: 'Five senses named. You are here.',
  },
  {
    id: 'breathing',
    name: 'Box breathing',
    icon: 'breath',
    kind: 'breath',
    description: 'In 4 seconds. Hold 4. Out 4. Hold 4. Four cycles.',
  },
  {
    id: 'cold',
    name: 'Cold water',
    icon: 'droplet',
    kind: 'timer',
    seconds: 30,
    description: 'Cold water on the face, or ice in the hands, until the body answers.',
    instruction: 'Cold water on the face, or ice in the hands. Stay with it.',
    finish: 'Thirty seconds. The body answered.',
  },
  {
    id: 'movement',
    name: 'Movement',
    icon: 'movement',
    kind: 'timer',
    seconds: 60,
    description: 'Ten jumping jacks, a walk around the block, or a full stretch.',
    instruction: 'Jumping jacks, a fast walk, or a full stretch. Keep moving.',
    finish: 'Sixty seconds. The charge moved.',
  },
]);

export const getProtocolTool = (id) => PROTOCOL_TOOLS.find((tool) => tool.id === id) || null;

const SUMMARY_NAMES = Object.freeze({
  grounding: '5-4-3-2-1',
  cold: 'cold water',
  movement: 'movement',
});

/**
 * One line for a logged run, e.g.
 *   "Protocol run · intensity 7/10 · 5-4-3-2-1, cold water · 4 breathing cycles · trigger: the call"
 * Breathing is reported by its cycle count, not by name. Null for a missing
 * or malformed run.
 */
export function describeProtocolRun(protocolRun) {
  if (!protocolRun || typeof protocolRun !== 'object') return null;
  const tools = Array.isArray(protocolRun.toolsUsed)
    ? PROTOCOL_TOOL_IDS.filter((id) => protocolRun.toolsUsed.includes(id) && SUMMARY_NAMES[id]).map((id) => SUMMARY_NAMES[id])
    : [];
  const cycles = Number(protocolRun.breathingCycles);
  const trigger = typeof protocolRun.trigger === 'string' ? protocolRun.trigger.trim() : '';
  return [
    `Protocol run · intensity ${Number(protocolRun.intensity) || '?'}/10`,
    tools.length ? tools.join(', ') : null,
    cycles > 0 ? `${cycles} breathing cycles` : null,
    trigger ? `trigger: ${trigger}` : null,
  ].filter(Boolean).join(' · ');
}
