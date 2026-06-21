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
  buildMemoryBlock,
  buildContextSnapshot,
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

// ── Context snapshot (module-tagged receipts) ────────────────────────────────

const SNAP = { activeTargets: ['Doomscroll'], dominantArchetype: 'avoider', violatedRules: ['No phone after 11pm'] };

test("a new receipt is stamped with the contextSnapshot when provided", () => {
  const parsed = { receipts: [{ quote: "done blaming the schedule", source: "new" }] };
  const { receipts } = reconcileReceipts(parsed, ENTRY, "journal", [], "e1", SNAP);
  assert.deepEqual(receipts[0].contextSnapshot, SNAP);
});

test("no contextSnapshot key is added when none is provided (back-compat)", () => {
  const parsed = { receipts: [{ quote: "done blaming the schedule", source: "new" }] };
  const { receipts } = reconcileReceipts(parsed, ENTRY, "journal", [], "e1");
  assert.ok(!("contextSnapshot" in receipts[0]), "legacy path stays clean");
});

test("a prior receipt keeps its own snapshot; legacy prior without one still reconciles", () => {
  const prior = [
    { date: "2026-04-01", quote: "tagged old", sourceModule: "journal", sourceEntryId: "o1", contextSnapshot: SNAP },
    { date: "2026-03-01", quote: "untagged old", sourceModule: "journal", sourceEntryId: "o2" },
  ];
  const parsed = { receipts: [
    { quote: "tagged old", source: "prior" },
    { quote: "untagged old", source: "prior" },
  ] };
  const { receipts } = reconcileReceipts(parsed, ENTRY, "journal", prior, "e1", SNAP);
  const tagged = receipts.find((r) => r.quote === "tagged old");
  const untagged = receipts.find((r) => r.quote === "untagged old");
  assert.deepEqual(tagged.contextSnapshot, SNAP);          // prior snapshot preserved
  assert.ok(!("contextSnapshot" in untagged), "legacy prior is not retro-tagged");
});

test("buildMemoryBlock renders the recall tag when a snapshot is present", () => {
  const block = buildMemoryBlock([
    { label: "Journal", content: "", receipts: [
      { date: "2026-05-14", quote: "again", contextSnapshot: { activeTargets: ['Doomscroll'] } },
    ] },
  ]);
  assert.match(block, /written while "Doomscroll" was active/);
});

test("buildMemoryBlock renders a legacy receipt unchanged (no tag)", () => {
  const block = buildMemoryBlock([
    { label: "Journal", content: "", receipts: [{ date: "2026-05-14", quote: "again" }] },
  ]);
  assert.match(block, /- \(2026-05-14\) "again"/);
  assert.ok(!/written while/.test(block));
});

// Minimal fake Firestore for buildContextSnapshot (where() is ignored; the
// fixture only contains the user's own docs).
function fakeDb(data) {
  const snap = (docs) => ({ forEach: (cb) => (docs || []).forEach((d) => cb({ data: () => d })) });
  return { collection: (name) => ({ where: () => ({ get: async () => snap(data[name]) }) }) };
}

test("buildContextSnapshot captures active targets, dominant archetype, violated rules", async () => {
  const now = Date.UTC(2026, 5, 1, 12, 0, 0);
  const recent = new Date(now - 3 * 86400000).toISOString();
  const db = fakeDb({
    killTargets: [
      { status: "active", title: "Doomscroll" },
      { status: "killed", title: "Old habit" },
    ],
    relapseEntries: [
      { selectedSelf: "avoider", eventOccurredAt: recent },
      { selectedSelf: "avoider", eventOccurredAt: recent },
      { selectedSelf: "numb", eventOccurredAt: recent },
    ],
    hardLessons: [
      { isFinalized: true, ruleGoingForward: "No phone after 11pm", violations: [{ date: recent }] },
      { isFinalized: true, ruleGoingForward: "Never untouched", violations: [] },
    ],
  });
  const s = await buildContextSnapshot(db, "u1", now);
  assert.deepEqual(s.activeTargets, ["Doomscroll"]);
  assert.equal(s.dominantArchetype, "avoider");
  assert.deepEqual(s.violatedRules, ["No phone after 11pm"]);
});

test("buildContextSnapshot caps list lengths and label chars", async () => {
  const longTitle = "x".repeat(200);
  const db = fakeDb({
    killTargets: [1, 2, 3, 4, 5].map((i) => ({ status: "active", title: `${longTitle}${i}` })),
    relapseEntries: [],
    hardLessons: [],
  });
  const s = await buildContextSnapshot(db, "u1", Date.now());
  assert.equal(s.activeTargets.length, 3, "capped to MEMORY_SNAPSHOT_MAX_ITEMS");
  assert.ok(s.activeTargets[0].length <= 80, "label truncated");
});

test("buildContextSnapshot returns null when there is nothing to capture", async () => {
  const db = fakeDb({ killTargets: [], relapseEntries: [], hardLessons: [] });
  const s = await buildContextSnapshot(db, "u1", Date.now());
  assert.equal(s, null);
});
