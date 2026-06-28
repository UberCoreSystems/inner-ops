const test = require("node:test");
const assert = require("node:assert/strict");

const { computeCostUSD, RATES, CACHE_READ_MULT, CACHE_WRITE_MULT } = require("./usage");

test("sonnet input + output priced per million", () => {
  // 1,000,000 in @ $3 + 1,000,000 out @ $15 = $18
  const cost = computeCostUSD("claude-sonnet-4-6", { input: 1_000_000, output: 1_000_000 });
  assert.equal(cost, 18);
});

test("haiku input + output priced per million", () => {
  // 1,000,000 in @ $1 + 1,000,000 out @ $5 = $6
  const cost = computeCostUSD("claude-haiku-4-5", { input: 1_000_000, output: 1_000_000 });
  assert.equal(cost, 6);
});

test("cache read billed at 10% of input rate", () => {
  // 1,000,000 cache-read tokens @ sonnet $3 * 0.10 = $0.30 (rounded to 6dp)
  const cost = computeCostUSD("claude-sonnet-4-6", { cacheRead: 1_000_000 });
  assert.equal(cost, 0.3);
  assert.equal(CACHE_READ_MULT, 0.1);
});

test("cache write billed at 1.25x input rate", () => {
  // 1,000,000 cache-write tokens @ sonnet $3 * 1.25 = $3.75
  const cost = computeCostUSD("claude-sonnet-4-6", { cacheWrite: 1_000_000 });
  assert.equal(cost, 3 * CACHE_WRITE_MULT);
  assert.equal(cost, 3.75);
});

test("all four buckets sum without double-counting", () => {
  const cost = computeCostUSD("claude-sonnet-4-6", {
    input: 1_000_000,
    output: 1_000_000,
    cacheWrite: 1_000_000,
    cacheRead: 1_000_000,
  });
  // 3 + 15 + 3.75 + 0.30 = 22.05
  assert.equal(cost, 22.05);
});

test("unknown model → cost 0 (counts still recorded upstream)", () => {
  assert.equal(computeCostUSD("gpt-4", { input: 1_000_000, output: 1_000_000 }), 0);
  assert.equal(computeCostUSD(undefined, { input: 1_000_000 }), 0);
});

test("missing token fields default to 0", () => {
  assert.equal(computeCostUSD("claude-sonnet-4-6", {}), 0);
});

test("RATES exposes the documented June 2026 rate card", () => {
  assert.deepEqual(RATES["claude-sonnet-4-6"], { in: 3, out: 15 });
  assert.deepEqual(RATES["claude-haiku-4-5"], { in: 1, out: 5 });
});
