/**
 * signalReminders — scheduled email reminders for open signals.
 *
 * Every relapseEntries doc is a signal with a 72h window anchored on
 * eventOccurredAt (falling back to createdAt/timestamp). The client closes a
 * signal only on the user's answer (held / landed). This job is the reach
 * outside the app while that answer is missing: one email at +24h while the
 * window is open, one when it has closed. Nothing after that; the Debrief
 * card holds it.
 *
 * Mirrors the anchor and window rules in src/utils/signalDebrief.js; change
 * the two together.
 *
 * Idempotent through stamps on the signal doc: reminders.h24 / reminders.close
 * (ISO). A stamp is written only after a successful send, so a failed send is
 * retried on the next run. Server-written only; the client never touches it.
 *
 * Transport: Google Workspace SMTP as noreply@innerops.io with an app
 * password in the SIGNAL_REMINDER_SMTP_PASSWORD secret. The innerops.io SPF
 * record must include _spf.google.com and Workspace DKIM must be published,
 * or Gmail spam-folders these.
 *
 * Opt-out: userSettings.notificationPreferences.signalReminders.enabled ===
 * false (on unless explicitly off, like the in-app triggers). Unverified
 * email addresses are never written to.
 */
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { defineSecret } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");

const smtpPassword = defineSecret("SIGNAL_REMINDER_SMTP_PASSWORD");

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const SIGNAL_WINDOW_MS = 72 * HOUR_MS;
const REMINDER_AFTER_MS = 24 * HOUR_MS;
// Stop chasing a closed window after a week; the Debrief card still holds it.
const CLOSE_REMINDER_GRACE_MS = 7 * DAY_MS;
// Query pad over the close grace so a backdated eventOccurredAt is still seen.
const QUERY_LOOKBACK_MS = SIGNAL_WINDOW_MS + CLOSE_REMINDER_GRACE_MS + 3 * DAY_MS;

const REMINDER_KINDS = Object.freeze({ H24: "h24", CLOSE: "close" });
const VALID_OUTCOMES = new Set(["held", "landed"]);
const PREFERENCE_ID = "signalReminders";

const SMTP_HOST = "smtp.gmail.com";
const SMTP_PORT = 465;
const SMTP_USER = "noreply@innerops.io";
const SENDER = `Inner Ops <${SMTP_USER}>`;
const APP_URL = "https://innerops.io";
const DASHBOARD_URL = `${APP_URL}/dashboard`;
const SETTINGS_URL = `${APP_URL}/settings`;

// Mirrors ARCHETYPE_LABELS in src/utils/relapseTaxonomy.js (display labels
// for the stored archetype ids). Unknown ids fall through verbatim.
const ARCHETYPE_LABELS = Object.freeze({
  "The Addict": "Craving / Urge",
  "The Victim": "Blaming",
  "The Procrastinator": "Avoidance",
  "The Pessimist": "Catastrophizing",
  "The Perfectionist": "Perfectionism",
  "The People-Pleaser": "People-pleasing",
  "The Imposter": "Denial / Minimizing",
  "The Self-Saboteur": "Self-sabotage",
});

// ---------------------------------------------------------------------------
// Pure selection
// ---------------------------------------------------------------------------

function toMs(value) {
  if (value == null) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/** Window anchor: event time, then createdAt, then the server timestamp. */
function getAnchorMs(doc) {
  return toMs(doc.eventOccurredAt) || toMs(doc.createdAt) || toMs(doc.timestamp);
}

function isResolved(doc) {
  return VALID_OUTCOMES.has(doc.resolution?.outcome);
}

/**
 * Which reminder, if any, a signal is due for at nowMs. Null when none.
 *   h24   — [anchor+24h, anchor+72h) and not yet stamped
 *   close — [anchor+72h, anchor+72h+7d) and not yet stamped
 */
function dueReminderKind(doc, nowMs) {
  if (isResolved(doc) || doc.legacyRelapse) return null;
  const anchorMs = getAnchorMs(doc);
  if (!anchorMs) return null;
  const age = nowMs - anchorMs;
  const stamps = doc.reminders || {};
  if (age >= REMINDER_AFTER_MS && age < SIGNAL_WINDOW_MS) {
    return stamps[REMINDER_KINDS.H24] ? null : REMINDER_KINDS.H24;
  }
  if (age >= SIGNAL_WINDOW_MS && age < SIGNAL_WINDOW_MS + CLOSE_REMINDER_GRACE_MS) {
    return stamps[REMINDER_KINDS.CLOSE] ? null : REMINDER_KINDS.CLOSE;
  }
  return null;
}

/**
 * Every signal due a reminder, as { id, userId, kind, anchorMs,
 * windowEndsAtMs, doc }. Docs without a userId are skipped.
 */
function selectReminders(docs, nowMs = Date.now()) {
  const due = [];
  for (const doc of docs || []) {
    if (!doc || !doc.userId) continue;
    const kind = dueReminderKind(doc, nowMs);
    if (!kind) continue;
    const anchorMs = getAnchorMs(doc);
    due.push({ id: doc.id, userId: doc.userId, kind, anchorMs, windowEndsAtMs: anchorMs + SIGNAL_WINDOW_MS, doc });
  }
  return due;
}

// ---------------------------------------------------------------------------
// Pure content
// ---------------------------------------------------------------------------

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function hoursLabel(ms) {
  const hours = Math.ceil(ms / HOUR_MS);
  if (hours < 1) return "under an hour";
  return hours === 1 ? "1 hour" : `${hours} hours`;
}

function elapsedLabel(ms) {
  if (ms >= 2 * DAY_MS) return `${Math.floor(ms / DAY_MS)} days`;
  return hoursLabel(ms);
}

function signalLabel(doc) {
  const archetype = doc.selectedSelf ? ARCHETYPE_LABELS[doc.selectedSelf] || doc.selectedSelf : "";
  if (archetype) return archetype;
  return doc.protocolRun && typeof doc.protocolRun === "object" ? "Protocol run" : "Signal";
}

function conditionsLine(doc) {
  const list = Array.isArray(doc.precursorConditions)
    ? doc.precursorConditions.filter((c) => typeof c === "string" && c.trim()).map((c) => c.trim())
    : [];
  return list.length ? `Conditions: ${list.join(", ")}.` : "";
}

// One block per signal; lines are plain strings, the HTML twin escapes them.
function signalBlock(item, nowMs) {
  const label = signalLabel(item.doc);
  const sinceAnchor = nowMs - item.anchorMs;
  const lines = [label];
  if (item.kind === REMINDER_KINDS.H24) {
    lines.push(`${elapsedLabel(sinceAnchor)} in. The window closes in ${hoursLabel(item.windowEndsAtMs - nowMs)}.`);
  } else {
    lines.push(`The 72-hour window has passed. Closed ${elapsedLabel(nowMs - item.windowEndsAtMs)} ago, unanswered.`);
  }
  const conditions = conditionsLine(item.doc);
  if (conditions) lines.push(conditions);
  return lines;
}

function subjectFor(items, nowMs) {
  if (items.length > 1) return `${items.length} signals pending`;
  const [item] = items;
  const label = signalLabel(item.doc);
  return item.kind === REMINDER_KINDS.H24
    ? `Signal open — ${label}, ${hoursLabel(item.windowEndsAtMs - nowMs)} left`
    : `Signal window closed — ${label}`;
}

/**
 * Builds { subject, text, html } for one user's due signals. Pure. Plain
 * text first; the HTML is a paragraph-for-paragraph twin with one link.
 * Product language only: no encouragement, no urgency theater.
 */
function buildSignalReminderEmail({ items, nowMs = Date.now() }) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("buildSignalReminderEmail: no items");
  }
  const allClosed = items.every((item) => item.kind === REMINDER_KINDS.CLOSE);
  const paragraphs = items.map((item) => signalBlock(item, nowMs));

  const standing = allClosed
    ? items.length > 1
      ? "Call each one: a Hard Lesson, or closed. They stay in the Debrief until you do."
      : "Call it: a Hard Lesson, or closed. It stays in the Debrief until you do."
    : items.length > 1
      ? "Each is pending until you convert it to a Hard Lesson or close it."
      : "The signal is pending until you convert it to a Hard Lesson or close it.";

  const text = [
    ...paragraphs.map((lines) => lines.join("\n")),
    standing,
    `Answer it here: ${DASHBOARD_URL}`,
    `Turn these off in Settings: ${SETTINGS_URL}`,
  ].join("\n\n");

  const htmlBlocks = paragraphs.map((lines) => {
    const [label, ...rest] = lines;
    return `<p><strong>${escapeHtml(label)}</strong><br>${rest.map(escapeHtml).join("<br>")}</p>`;
  });
  const html = [
    '<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;color:#111">',
    ...htmlBlocks,
    `<p>${escapeHtml(standing)}</p>`,
    `<p><a href="${DASHBOARD_URL}">Answer it here</a></p>`,
    `<p style="font-size:12px;color:#666">Turn these off in <a href="${SETTINGS_URL}" style="color:#666">Settings</a>.</p>`,
    "</div>",
  ].join("\n");

  return { subject: subjectFor(items, nowMs), text, html };
}

// ---------------------------------------------------------------------------
// Orchestration (dependency-injected so the loop is unit-testable)
// ---------------------------------------------------------------------------

function groupByUser(due) {
  const byUser = new Map();
  for (const item of due) {
    if (!byUser.has(item.userId)) byUser.set(item.userId, []);
    byUser.get(item.userId).push(item);
  }
  return byUser;
}

/**
 * deps:
 *   listCandidates(nowMs) → docs[] (each with id + fields)
 *   getUser(uid)          → { email, emailVerified } | null
 *   isOptedOut(uid)       → boolean
 *   sendMail({ to, subject, text, html }) → Promise
 *   stamp(id, kind, iso)  → Promise
 *   nowMs, log
 * Returns counts. Never throws for a single user's failure.
 */
async function runSignalReminders(deps) {
  const { listCandidates, getUser, isOptedOut, sendMail, stamp, nowMs = Date.now(), log = logger } = deps;
  const stats = { candidates: 0, due: 0, users: 0, sent: 0, skippedUnverified: 0, skippedOptedOut: 0, failed: 0 };

  const docs = await listCandidates(nowMs);
  stats.candidates = docs.length;
  const due = selectReminders(docs, nowMs);
  stats.due = due.length;
  const byUser = groupByUser(due);
  stats.users = byUser.size;

  for (const [uid, items] of byUser) {
    try {
      const user = await getUser(uid);
      if (!user?.email || !user.emailVerified) {
        stats.skippedUnverified += 1;
        continue;
      }
      if (await isOptedOut(uid)) {
        stats.skippedOptedOut += 1;
        continue;
      }
      const message = buildSignalReminderEmail({ items, nowMs });
      await sendMail({ to: user.email, ...message });
      const iso = new Date(nowMs).toISOString();
      await Promise.all(items.map((item) => stamp(item.id, item.kind, iso)));
      stats.sent += 1;
    } catch (error) {
      stats.failed += 1;
      log.error("signalReminders: user send failed", { uid, signals: items.length, message: error?.message });
    }
  }

  log.info("signalReminders: run complete", stats);
  return stats;
}

// ---------------------------------------------------------------------------
// Firebase wiring
// ---------------------------------------------------------------------------

function buildFirebaseDeps(nowMs) {
  const { getFirestore, Timestamp } = require("firebase-admin/firestore");
  const { getAuth } = require("firebase-admin/auth");
  const nodemailer = require("nodemailer");
  const db = getFirestore();
  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: true,
    auth: { user: SMTP_USER, pass: smtpPassword.value() },
  });

  return {
    nowMs,
    listCandidates: async (now) => {
      const since = Timestamp.fromMillis(now - QUERY_LOOKBACK_MS);
      const snap = await db.collection("relapseEntries").where("timestamp", ">=", since).get();
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    },
    getUser: async (uid) => {
      try {
        const record = await getAuth().getUser(uid);
        return { email: record.email, emailVerified: record.emailVerified };
      } catch (error) {
        if (error?.code === "auth/user-not-found") return null;
        throw error;
      }
    },
    isOptedOut: async (uid) => {
      const snap = await db.collection("userSettings").where("userId", "==", uid).get();
      if (snap.empty) return false;
      // Newest doc wins, matching the client's upsert target.
      const newest = snap.docs
        .map((d) => d.data())
        .sort((a, b) => toMs(b.lastUpdated || b.timestamp) - toMs(a.lastUpdated || a.timestamp))[0];
      return newest?.notificationPreferences?.[PREFERENCE_ID]?.enabled === false;
    },
    sendMail: ({ to, subject, text, html }) =>
      transporter.sendMail({
        from: SENDER,
        to,
        subject,
        text,
        html,
        headers: { "List-Unsubscribe": `<${SETTINGS_URL}>` },
      }),
    stamp: (id, kind, iso) => db.collection("relapseEntries").doc(id).update({ [`reminders.${kind}`]: iso }),
    log: logger,
  };
}

const signalReminders = onSchedule(
  {
    schedule: "every 30 minutes",
    region: "us-central1",
    timeoutSeconds: 120,
    secrets: [smtpPassword],
  },
  async () => {
    await runSignalReminders(buildFirebaseDeps(Date.now()));
  }
);

module.exports = {
  signalReminders,
  // Pure pieces, exported for unit tests.
  selectReminders,
  dueReminderKind,
  buildSignalReminderEmail,
  runSignalReminders,
  SIGNAL_WINDOW_MS,
  REMINDER_AFTER_MS,
  CLOSE_REMINDER_GRACE_MS,
  REMINDER_KINDS,
};
