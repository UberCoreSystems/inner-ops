/**
 * Unit tests for the memory updater's authenticity gate.
 *
 * The non-negotiable rule: a receipt shown to the user as their own words MUST
 * be a verbatim substring of the real entry. These tests prove reconcileReceipts
 * drops fabrications, preserves prior receipt metadata, enforces caps/word
 * limits, and that parsing/tone helpers behave.
 *
 * Run: node --test functions/memory.test.js
 */
const { test } = require("node:test");
const assert = require("node:assert");

const {
  reconcileReceipts,
  parseUpdaterJson,
  stripBannedTone,
} = require("./memory");

const ENTRY = {
  text: "I told myself I was done blaming the schedule. Then I blamed the schedule again.",
  date: "2026-05-14",
};

test("a real quote validates and is stamped with date + source", () => {
  const parsed = { receipts: [{ quote: "done blaming the schedule", source: "new" }] };
  const { receipts, validated, dropped } = reconcileReceipts(parsed, ENTRY, "journal", [], "entry-1");
  assert.equal(validated, 1);
  assert.equal(dropped, 0);
  assert.equal(receipts.length, 1);
  assert.deepEqual(receipts[0], {
    date: "2026-05-14",
    quote: "done blaming the schedule",
    sourceModule: "journal",
    sourceEntryId: "entry-1",
  });
});

test("a fabricated quote (not in entry) is dropped silently", () => {
  const parsed = { receipts: [{ quote: "I am a fraud and a coward", source: "new" }] };
  const { receipts, validated, dropped } = reconcileReceipts(parsed, ENTRY, "journal", [], "entry-1");
  assert.equal(validated, 0);
  assert.equal(dropped, 1);
  assert.equal(receipts.length, 0);
});

test("validation is whitespace/case tolerant but content-exact", () => {
  const parsed = { receipts: [{ quote: "DONE   blaming The Schedule", source: "new" }] };
  const { receipts } = reconcileReceipts(parsed, ENTRY, "journal", [], "e");
  assert.equal(receipts.length, 1);
});

test("a prior receipt is kept only if it matches an existing receipt (no resurrection)", () => {
  const prior = [{ date: "2026-04-01", quote: "old wound", sourceModule: "journal", sourceEntryId: "old" }];
  const parsed = {
    receipts: [
      { quote: "old wound", source: "prior" },          // matches → kept, metadata preserved
      { quote: "wiped long ago", source: "prior" },      // no match → dropped
    ],
  };
  const { receipts, dropped } = reconcileReceipts(parsed, ENTRY, "journal", prior, "e");
  assert.equal(receipts.length, 1);
  assert.deepEqual(receipts[0], prior[0]);
  assert.equal(dropped, 1);
});

test("receipts are capped at 5", () => {
  const six = Array.from({ length: 6 }, (_, i) => ({ quote: `q${i}`, source: "new" }));
  const entry = { text: "q0 q1 q2 q3 q4 q5", date: "2026-01-01" };
  const { receipts } = reconcileReceipts({ receipts: six }, entry, "journal", [], "e");
  assert.equal(receipts.length, 5);
});

test("receipts over the word limit are dropped", () => {
  const longQuote = Array.from({ length: 30 }, (_, i) => `w${i}`).join(" ");
  const entry = { text: longQuote, date: "2026-01-01" };
  const { receipts, dropped } = reconcileReceipts({ receipts: [{ quote: longQuote, source: "new" }] }, entry, "journal", [], "e");
  assert.equal(receipts.length, 0);
  assert.equal(dropped, 1);
});

test("duplicate quotes are de-duplicated", () => {
  const parsed = { receipts: [
    { quote: "blamed the schedule", source: "new" },
    { quote: "blamed the schedule", source: "new" },
  ] };
  const { receipts } = reconcileReceipts(parsed, ENTRY, "journal", [], "e");
  assert.equal(receipts.length, 1);
});

test("parseUpdaterJson strips code fences and extracts the object", () => {
  const raw = "```json\n{\"content\":\"x\",\"receipts\":[]}\n```";
  assert.deepEqual(parseUpdaterJson(raw), { content: "x", receipts: [] });
});

test("parseUpdaterJson returns null on garbage", () => {
  assert.equal(parseUpdaterJson("not json at all"), null);
});

test("stripBannedTone removes banned phrases", () => {
  const out = stripBannedTone("You did the work. proud of you. The pattern holds.");
  assert.ok(!/proud of you/i.test(out));
  assert.ok(/The pattern holds/.test(out));
});
