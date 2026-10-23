#!/usr/bin/env node
/**
 * Read path for the Oracle follow-up arc ("Go deeper"): how often the exchange
 * runs, how it ends, and what it costs. Decides whether the open-ended dialogue
 * is ever built and whether outcomes should feed later readings. Admin SDK
 * only — _usage is server-only, and no entry text is ever printed: counts and
 * distinct users at every step, nothing else.
 *
 * Credentials: Application Default Credentials, as in readUsage.js:
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccount.json
 *   or `gcloud auth application-default login` (+ GOOGLE_CLOUD_PROJECT=inner-ops-8ce36)
 *
 * Usage:
 *   node functions/scripts/readFollowUpArc.js --since 2026-10-20 [--until 2026-11-20]
 *
 * Indexes: none to define. _usage rows are read one user at a time with a
 * timestamp range (a collection-group query would need an index the project
 * does not define); journal and confrontation docs use a single-field range
 * on their own timestamp. The automatic indexes cover all of it.
 */
const path = require("path");
const { pathToFileURL } = require("url");
const { initializeApp, applicationDefault, getApps } = require("firebase-admin/app");
const { getFirestore, Timestamp } = require("firebase-admin/firestore");

const ARC_CALL_TYPES = ["oracle_pushback", "oracle_further", "oracle_close", "oracle_landed", "oracle_challenge"];

const STEPS = {
  all: "docs in range",
  reading: "with a reading",
  pushBack: "response: pushed back",
  goFurther: "response: went further",
  landed: "response: it landed",
  sit: "response: sitting with it",
  legacy: "legacy single-turn follow-up",
  started: "arc started (challenge sent)",
  question: "question delivered",
  answered: "answered",
  evaded: "evaded",
  unanswered: "left unanswered",
  noVerdict: "closed, verdict not recorded",
  commitment: "commitment",
  contract: "contract signed",
  surfaced: "came back on the dashboard",
};
const JOURNAL_STEPS = Object.keys(STEPS);
const RESPONSE_STEPS = { push_back: "pushBack", go_further: "goFurther", landed: "landed", sit: "sit" };
const JOURNAL_ONLY = new Set(["contract", "surfaced", ...Object.values(RESPONSE_STEPS)]);
const CONFRONTATION_STEPS = JOURNAL_STEPS.filter((s) => !JOURNAL_ONLY.has(s));

// Logical names → stored field names, from the schema the app writes with.
function fieldMaps({ ORACLE_FIELDS, CONFRONTATION_FIELDS }) {
  const arc = (F) => ({
    reply: F.FOLLOW_UP_REPLY,
    question: F.FOLLOW_UP_QUESTION,
    answer: F.FOLLOW_UP_ANSWER,
    outcome: F.FOLLOW_UP_OUTCOME,
    commitment: F.COMMITMENT,
  });
  return {
    journal: {
      userId: "userId",
      reading: ORACLE_FIELDS.JOURNAL_PROSE,
      ...arc(ORACLE_FIELDS),
      surfacedAt: ORACLE_FIELDS.FOLLOW_UP_SURFACED_AT,
      intent: ORACLE_FIELDS.FOLLOW_UP_INTENT,
    },
    confrontation: {
      userId: "userId",
      reading: CONFRONTATION_FIELDS.ORACLE_RESPONSE,
      ...arc(CONFRONTATION_FIELDS),
    },
  };
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--since") out.since = argv[i + 1];
    else if (argv[i] === "--until") out.until = argv[i + 1];
    else if (argv[i] === "-h" || argv[i] === "--help") out.help = true;
  }
  return out;
}

function dayStartMs(ymd) {
  const d = new Date(`${ymd}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d.getTime();
}

const isText = (v) => typeof v === "string" && v.trim().length > 0;
const has = (data, key) => Object.prototype.hasOwnProperty.call(data, key);
const fmtUSD = (n) => `$${(Number(n) || 0).toFixed(4)}`;

// Which funnel steps one doc counts toward. An arc is a doc with the question
// key present — the legacy single-turn follow-up never wrote it.
function arcSteps(data, F) {
  const steps = ["all"];
  if (isText(data[F.reading])) steps.push("reading");
  // Which of the four responses he chose (journal docs only). A sit has no
  // reply, so it is counted here and nowhere below.
  const responseStep = F.intent ? RESPONSE_STEPS[data[F.intent]] : null;
  if (responseStep) steps.push(responseStep);
  const hasReply = isText(data[F.reply]);
  if (hasReply && !has(data, F.question)) steps.push("legacy");
  if (!hasReply || !has(data, F.question)) return steps;
  steps.push("started");
  const question = isText(data[F.question]);
  if (question) steps.push("question");
  const outcome = data[F.outcome];
  const answered = isText(data[F.answer]);
  if (outcome === "answered") steps.push("answered");
  else if (outcome === "evaded") steps.push("evaded");
  else if (outcome === "unanswered" || (question && !answered)) steps.push("unanswered");
  else if (answered) steps.push("noVerdict");
  const commitment = data[F.commitment];
  if (commitment && isText(commitment.text)) steps.push("commitment");
  if (commitment && commitment.contractId) steps.push("contract");
  if (F.surfacedAt && data[F.surfacedAt]) steps.push("surfaced");
  return steps;
}

async function fetchFunnel(query, F, stepKeys) {
  const snap = await query.get();
  const tallies = Object.fromEntries(stepKeys.map((k) => [k, { count: 0, users: new Set() }]));
  for (const d of snap.docs) {
    const data = d.data();
    for (const step of arcSteps(data, F)) {
      const t = tallies[step];
      if (!t) continue;
      t.count += 1;
      if (data[F.userId]) t.users.add(data[F.userId]);
    }
  }
  return { size: snap.size, tallies, stepKeys };
}

function printFunnel(title, { size, tallies, stepKeys }) {
  console.log(`\n${title} — ${size} docs`);
  for (const k of stepKeys) {
    const t = tallies[k];
    console.log(`  ${STEPS[k].padEnd(32)} ${String(t.count).padStart(6)}  ${String(t.users.size).padStart(5)} users`);
  }
}

// One range query per user, all in flight at once. listDocuments() includes
// users/{uid} paths that have subcollections but no document of their own,
// which is how _usage and _rateLimits parents are created.
async function fetchCalls(db, since, until) {
  const users = await db.collection("users").listDocuments();
  const snaps = await Promise.all(
    users.map((u) =>
      u.collection("_usage")
        .where("timestamp", ">=", since)
        .where("timestamp", "<", until)
        .select("callType", "costUSD", "outputTokens")
        .get()
    )
  );
  const byType = Object.fromEntries(
    ARC_CALL_TYPES.map((t) => [t, { calls: 0, users: new Set(), costUSD: 0, outputTokens: 0 }])
  );
  let rows = 0;
  snaps.forEach((snap, i) => {
    rows += snap.size;
    for (const d of snap.docs) {
      const r = d.data();
      const b = byType[r.callType];
      if (!b) continue;
      b.calls += 1;
      b.users.add(users[i].id);
      b.costUSD += Number(r.costUSD) || 0;
      b.outputTokens += Number(r.outputTokens) || 0;
    }
  });
  return { userCount: users.length, rows, byType };
}

function printCalls({ userCount, rows, byType }) {
  console.log(`\nOracle calls by type (${rows} usage rows in range across ${userCount} users)`);
  for (const type of ARC_CALL_TYPES) {
    const b = byType[type];
    const avgOut = b.calls ? Math.round(b.outputTokens / b.calls) : 0;
    console.log(
      `  ${type.padEnd(18)} calls ${String(b.calls).padStart(5)}  users ${String(b.users.size).padStart(4)}  cost ${fmtUSD(b.costUSD)}  avg out ${avgOut} tok`
    );
  }
  const legacy = byType.oracle_challenge.calls;
  console.log(
    legacy === 0
      ? "  oracle_challenge: no calls in range — delete the legacy key once this holds for 7 days."
      : `  oracle_challenge: still called ${legacy}× — keep the legacy key.`
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const sinceMs = args.since ? dayStartMs(args.since) : null;
  const untilMs = args.until ? dayStartMs(args.until) : Date.now();
  if (args.help || sinceMs == null || untilMs == null) {
    console.log("Usage:\n  node functions/scripts/readFollowUpArc.js --since YYYY-MM-DD [--until YYYY-MM-DD]");
    process.exit(args.help ? 0 : 1);
  }

  const schema = await import(pathToFileURL(path.join(__dirname, "..", "..", "src", "utils", "schema.js")).href);
  const F = fieldMaps(schema);

  if (!getApps().some((a) => a.name === "[DEFAULT]")) {
    initializeApp({ credential: applicationDefault() });
  }
  const db = getFirestore();
  const since = Timestamp.fromMillis(sinceMs);
  const until = Timestamp.fromMillis(untilMs);

  const [calls, journal, confrontations] = await Promise.all([
    fetchCalls(db, since, until),
    fetchFunnel(
      db.collection("journalEntries")
        .where("timestamp", ">=", since)
        .where("timestamp", "<", until)
        .select(...Object.values(F.journal)),
      F.journal,
      JOURNAL_STEPS
    ),
    fetchFunnel(
      db.collection("confrontations")
        .where("createdAt", ">=", new Date(sinceMs).toISOString())
        .where("createdAt", "<", new Date(untilMs).toISOString())
        .select(...Object.values(F.confrontation)),
      F.confrontation,
      CONFRONTATION_STEPS
    ),
  ]);

  console.log(`Follow-up arc — ${new Date(sinceMs).toISOString().slice(0, 10)} to ${new Date(untilMs).toISOString().slice(0, 10)} (UTC)`);
  printCalls(calls);
  printFunnel("Journal arc funnel", journal);
  printFunnel("Confrontation arc funnel", confrontations);
}

main().catch((err) => {
  console.error("readFollowUpArc failed:", err?.message || err);
  process.exit(1);
});
