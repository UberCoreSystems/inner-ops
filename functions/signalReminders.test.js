/**
 * Unit tests for the open-signal email reminders: which signal is due which
 * reminder at a given instant, what the email says, and that the run loop
 * sends once per user, honors opt-out and unverified addresses, and only
 * stamps after a successful send. No Firestore, no SMTP.
 */
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  selectReminders,
  dueReminderKind,
  buildSignalReminderEmail,
  runSignalReminders,
  SIGNAL_WINDOW_MS,
  REMINDER_AFTER_MS,
  CLOSE_REMINDER_GRACE_MS,
  REMINDER_KINDS,
} = require("./signalReminders");

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const NOW = Date.UTC(2026, 9, 26, 12, 0, 0);
const iso = (ms) => new Date(ms).toISOString();

const signal = ({ id = "s1", userId = "u1", ageMs, resolution, reminders, ...rest } = {}) => ({
  id,
  userId,
  ...(ageMs != null ? { eventOccurredAt: iso(NOW - ageMs) } : {}),
  ...(resolution ? { resolution } : {}),
  ...(reminders ? { reminders } : {}),
  ...rest,
});

describe("dueReminderKind — window arithmetic mirrors signalDebrief.js", () => {
  it("pins the product numbers", () => {
    assert.equal(SIGNAL_WINDOW_MS, 72 * HOUR);
    assert.equal(REMINDER_AFTER_MS, 24 * HOUR);
    assert.equal(CLOSE_REMINDER_GRACE_MS, 7 * DAY);
  });

  it("nothing before 24h", () => {
    assert.equal(dueReminderKind(signal({ ageMs: 23 * HOUR }), NOW), null);
    assert.equal(dueReminderKind(signal({ ageMs: 24 * HOUR - 1 }), NOW), null);
  });

  it("h24 from exactly +24h until the window closes", () => {
    assert.equal(dueReminderKind(signal({ ageMs: 24 * HOUR }), NOW), REMINDER_KINDS.H24);
    assert.equal(dueReminderKind(signal({ ageMs: 71 * HOUR }), NOW), REMINDER_KINDS.H24);
    assert.equal(dueReminderKind(signal({ ageMs: 72 * HOUR - 1 }), NOW), REMINDER_KINDS.H24);
  });

  it("close from exactly +72h for a week, then silence", () => {
    assert.equal(dueReminderKind(signal({ ageMs: 72 * HOUR }), NOW), REMINDER_KINDS.CLOSE);
    assert.equal(dueReminderKind(signal({ ageMs: 80 * HOUR }), NOW), REMINDER_KINDS.CLOSE);
    assert.equal(dueReminderKind(signal({ ageMs: 72 * HOUR + 7 * DAY - 1 }), NOW), REMINDER_KINDS.CLOSE);
    assert.equal(dueReminderKind(signal({ ageMs: 72 * HOUR + 7 * DAY }), NOW), null);
  });

  it("a stamped reminder is not resent; the other kind still fires later", () => {
    const stampedH24 = signal({ ageMs: 30 * HOUR, reminders: { h24: iso(NOW - 6 * HOUR) } });
    assert.equal(dueReminderKind(stampedH24, NOW), null);
    const closedStampedH24 = signal({ ageMs: 73 * HOUR, reminders: { h24: iso(NOW - 49 * HOUR) } });
    assert.equal(dueReminderKind(closedStampedH24, NOW), REMINDER_KINDS.CLOSE);
    const bothStamped = signal({ ageMs: 73 * HOUR, reminders: { h24: iso(NOW - 49 * HOUR), close: iso(NOW - HOUR) } });
    assert.equal(dueReminderKind(bothStamped, NOW), null);
  });

  it("held, landed, and migrated legacy docs are never due", () => {
    const held = signal({ ageMs: 30 * HOUR, resolution: { outcome: "held", resolvedAt: iso(NOW - HOUR), via: "checkpoint" } });
    const landed = signal({ ageMs: 80 * HOUR, resolution: { outcome: "landed", resolvedAt: iso(NOW - HOUR), via: "debrief" } });
    const legacy = signal({ ageMs: 80 * HOUR, legacyRelapse: true });
    assert.equal(dueReminderKind(held, NOW), null);
    assert.equal(dueReminderKind(landed, NOW), null);
    assert.equal(dueReminderKind(legacy, NOW), null);
  });

  it("an unknown outcome is not a resolution — the window still governs", () => {
    assert.equal(dueReminderKind(signal({ ageMs: 30 * HOUR, resolution: { outcome: "maybe" } }), NOW), REMINDER_KINDS.H24);
  });

  it("anchors on eventOccurredAt even when logged later; falls back to createdAt then timestamp", () => {
    const backdated = signal({ ageMs: 30 * HOUR, createdAt: iso(NOW - HOUR), timestamp: { toMillis: () => NOW - HOUR } });
    assert.equal(dueReminderKind(backdated, NOW), REMINDER_KINDS.H24);

    const noEvent = { id: "x", userId: "u1", createdAt: iso(NOW - 25 * HOUR), timestamp: { toMillis: () => NOW - HOUR } };
    assert.equal(dueReminderKind(noEvent, NOW), REMINDER_KINDS.H24);

    const onlyTimestamp = { id: "y", userId: "u1", timestamp: { toMillis: () => NOW - 73 * HOUR } };
    assert.equal(dueReminderKind(onlyTimestamp, NOW), REMINDER_KINDS.CLOSE);
  });

  it("a doc with no usable anchor is left alone", () => {
    assert.equal(dueReminderKind({ id: "z", userId: "u1" }, NOW), null);
    assert.equal(dueReminderKind({ id: "z", userId: "u1", eventOccurredAt: "garbage" }, NOW), null);
  });
});

describe("selectReminders", () => {
  it("returns only due signals, with kind and window bounds, skipping ownerless docs", () => {
    const docs = [
      signal({ id: "fresh", ageMs: 2 * HOUR }),
      signal({ id: "due24", ageMs: 25 * HOUR }),
      signal({ id: "dueClose", ageMs: 75 * HOUR, userId: "u2" }),
      signal({ id: "held", ageMs: 25 * HOUR, resolution: { outcome: "held" } }),
      { id: "orphan", eventOccurredAt: iso(NOW - 25 * HOUR) },
      null,
    ];
    const due = selectReminders(docs, NOW);
    assert.deepEqual(due.map((d) => [d.id, d.userId, d.kind]), [
      ["due24", "u1", "h24"],
      ["dueClose", "u2", "close"],
    ]);
    assert.equal(due[0].anchorMs, NOW - 25 * HOUR);
    assert.equal(due[0].windowEndsAtMs, NOW - 25 * HOUR + SIGNAL_WINDOW_MS);
  });

  it("empty input yields nothing", () => {
    assert.deepEqual(selectReminders([], NOW), []);
    assert.deepEqual(selectReminders(undefined, NOW), []);
  });
});

describe("buildSignalReminderEmail", () => {
  const item = (overrides) => {
    const [only] = selectReminders([signal(overrides)], NOW);
    assert.ok(only, "fixture must be due");
    return only;
  };

  it("24h email: subject names the archetype and hours left; body states the pending conversion", () => {
    const due = item({ ageMs: 25 * HOUR, selectedSelf: "The Procrastinator", precursorConditions: ["Isolation", "Overthinking"] });
    const { subject, text, html } = buildSignalReminderEmail({ items: [due], nowMs: NOW });
    assert.equal(subject, "Signal open — Avoidance, 47 hours left");
    assert.match(text, /^Avoidance\n25 hours in\. The window closes in 47 hours\.\nConditions: Isolation, Overthinking\./);
    assert.match(text, /pending until you convert it to a Hard Lesson or close it\./);
    assert.match(text, /https:\/\/innerops\.io\/dashboard/);
    assert.match(text, /Turn these off in Settings: https:\/\/innerops\.io\/settings/);
    assert.match(html, /<strong>Avoidance<\/strong>/);
    assert.match(html, /href="https:\/\/innerops\.io\/dashboard"/);
  });

  it("close email: window passed, call it, stays in the Debrief", () => {
    const due = item({ ageMs: 78 * HOUR, selectedSelf: "The Addict" });
    const { subject, text } = buildSignalReminderEmail({ items: [due], nowMs: NOW });
    assert.equal(subject, "Signal window closed — Craving / Urge");
    assert.match(text, /^Craving \/ Urge\nThe 72-hour window has passed\. Closed 6 hours ago, unanswered\./);
    assert.match(text, /Call it: a Hard Lesson, or closed\. It stays in the Debrief until you do\./);
    assert.doesNotMatch(text, /Conditions:/);
  });

  it("labels a Protocol run and an unlabeled signal; unknown archetype ids pass through", () => {
    const protocol = item({ ageMs: 25 * HOUR, protocolRun: { intensity: 7 } });
    assert.match(buildSignalReminderEmail({ items: [protocol], nowMs: NOW }).subject, /^Signal open — Protocol run,/);
    const bare = item({ ageMs: 25 * HOUR });
    assert.match(buildSignalReminderEmail({ items: [bare], nowMs: NOW }).subject, /^Signal open — Signal,/);
    const custom = item({ ageMs: 25 * HOUR, selectedSelf: "Something else" });
    assert.match(buildSignalReminderEmail({ items: [custom], nowMs: NOW }).subject, /^Signal open — Something else,/);
  });

  it("several signals go in one email with one block each", () => {
    const a = item({ id: "a", ageMs: 25 * HOUR, selectedSelf: "The Victim" });
    const b = item({ id: "b", ageMs: 100 * HOUR, selectedSelf: "The Imposter" });
    const { subject, text, html } = buildSignalReminderEmail({ items: [a, b], nowMs: NOW });
    assert.equal(subject, "2 signals pending");
    assert.match(text, /Blaming\n25 hours in/);
    assert.match(text, /Denial \/ Minimizing\nThe 72-hour window has passed\. Closed 28 hours ago, unanswered\./);
    assert.match(text, /Each is pending until you convert it to a Hard Lesson or close it\./);
    assert.equal((html.match(/<strong>/g) || []).length, 2);
  });

  it("days once elapsed passes two days; HTML escapes user-authored conditions", () => {
    const due = item({ ageMs: 72 * HOUR + 3 * DAY, precursorConditions: ["<b>late</b> & tired"] });
    const { text, html } = buildSignalReminderEmail({ items: [due], nowMs: NOW });
    assert.match(text, /Closed 3 days ago, unanswered\./);
    assert.match(text, /Conditions: <b>late<\/b> & tired\./);
    assert.match(html, /Conditions: &lt;b&gt;late&lt;\/b&gt; &amp; tired\./);
  });

  it("never says 48", () => {
    const due = item({ ageMs: 25 * HOUR, selectedSelf: "The Addict", precursorConditions: ["Isolation"] });
    const { subject, text, html } = buildSignalReminderEmail({ items: [due], nowMs: NOW });
    assert.doesNotMatch(subject + text + html, /48/);
    assert.doesNotMatch(subject + text + html, /you got this|don't forget|keep going/i);
  });

  it("refuses an empty item list", () => {
    assert.throws(() => buildSignalReminderEmail({ items: [], nowMs: NOW }), /no items/);
  });
});

describe("runSignalReminders", () => {
  const silentLog = { info() {}, error() {} };

  const makeDeps = ({ docs, users = {}, optedOut = new Set(), failSendFor = new Set() }) => {
    const sent = [];
    const stamps = [];
    return {
      sent,
      stamps,
      deps: {
        nowMs: NOW,
        log: silentLog,
        listCandidates: async () => docs,
        getUser: async (uid) => users[uid] ?? null,
        isOptedOut: async (uid) => optedOut.has(uid),
        sendMail: async (message) => {
          if (failSendFor.has(message.to)) throw new Error("smtp down");
          sent.push(message);
        },
        stamp: async (id, kind, at) => {
          stamps.push({ id, kind, at });
        },
      },
    };
  };

  it("sends one email per user covering every due signal, then stamps each", async () => {
    const docs = [
      signal({ id: "a", ageMs: 25 * HOUR, selectedSelf: "The Addict" }),
      signal({ id: "b", ageMs: 80 * HOUR, selectedSelf: "The Victim" }),
      signal({ id: "c", ageMs: 2 * HOUR }),
      signal({ id: "d", ageMs: 30 * HOUR, userId: "u2" }),
    ];
    const users = {
      u1: { email: "one@example.com", emailVerified: true },
      u2: { email: "two@example.com", emailVerified: true },
    };
    const { deps, sent, stamps } = makeDeps({ docs, users });
    const stats = await runSignalReminders(deps);

    assert.deepEqual(sent.map((m) => m.to).sort(), ["one@example.com", "two@example.com"]);
    const toOne = sent.find((m) => m.to === "one@example.com");
    assert.equal(toOne.subject, "2 signals pending");
    assert.deepEqual(
      stamps.map((s) => [s.id, s.kind, s.at]).sort(),
      [
        ["a", "h24", iso(NOW)],
        ["b", "close", iso(NOW)],
        ["d", "h24", iso(NOW)],
      ]
    );
    assert.deepEqual(stats, { candidates: 4, due: 3, users: 2, sent: 2, skippedUnverified: 0, skippedOptedOut: 0, failed: 0 });
  });

  it("skips unverified or missing addresses and opted-out users, without stamping", async () => {
    const docs = [
      signal({ id: "a", ageMs: 25 * HOUR, userId: "unverified" }),
      signal({ id: "b", ageMs: 25 * HOUR, userId: "gone" }),
      signal({ id: "c", ageMs: 25 * HOUR, userId: "optout" }),
    ];
    const users = {
      unverified: { email: "u@example.com", emailVerified: false },
      optout: { email: "o@example.com", emailVerified: true },
    };
    const { deps, sent, stamps } = makeDeps({ docs, users, optedOut: new Set(["optout"]) });
    const stats = await runSignalReminders(deps);
    assert.equal(sent.length, 0);
    assert.equal(stamps.length, 0);
    assert.equal(stats.skippedUnverified, 2);
    assert.equal(stats.skippedOptedOut, 1);
    assert.equal(stats.sent, 0);
  });

  it("a failed send leaves the stamp unset and does not stop other users", async () => {
    const docs = [
      signal({ id: "a", ageMs: 25 * HOUR, userId: "bad" }),
      signal({ id: "b", ageMs: 25 * HOUR, userId: "good" }),
    ];
    const users = {
      bad: { email: "bad@example.com", emailVerified: true },
      good: { email: "good@example.com", emailVerified: true },
    };
    const { deps, sent, stamps } = makeDeps({ docs, users, failSendFor: new Set(["bad@example.com"]) });
    const stats = await runSignalReminders(deps);
    assert.deepEqual(sent.map((m) => m.to), ["good@example.com"]);
    assert.deepEqual(stamps.map((s) => s.id), ["b"]);
    assert.equal(stats.failed, 1);
    assert.equal(stats.sent, 1);
  });

  it("a run with nothing due sends nothing", async () => {
    const { deps, sent } = makeDeps({ docs: [signal({ id: "a", ageMs: HOUR })] });
    const stats = await runSignalReminders(deps);
    assert.equal(sent.length, 0);
    assert.equal(stats.due, 0);
  });
});
