#!/usr/bin/env node
/**
 * Manual fixture runner for the Oracle follow-up arc ("Go deeper").
 *
 * Assembles the exact requests the deployed `oracle` function sends for each
 * turn — same system-prompt blocks, same registry fragment, same user prompt,
 * same model and max_tokens — and calls the Anthropic API directly, so the
 * templates can be exercised without a deploy. Prints the raw model output,
 * the parsed response, and mechanical checks per turn.
 *
 * Usage (repo root, functions deps installed):
 *   ANTHROPIC_API_KEY=... node functions/scripts/followUpFixture.js --fixture A
 *
 * Turn 1 only (oracle_pushback):
 *   A (hold): the first reading is generated live, then challenged with
 *     rhetoric the record does not support. Expect: holds, one insight, one
 *     tagged question, no commitment.
 *   B (concede): a hand-written reading misstates the record; the pushback
 *     cites the logged session. Expect: a plain concession naming the error,
 *     then one tagged question.
 * Full arc (oracle_pushback → oracle_close):
 *   C (answered): A, then an answer naming the moments. Expect VERDICT:answered,
 *     one commitment, no question.
 *   D (evaded): A, then a counter-question. Expect VERDICT:evaded, the evasion
 *     named, one commitment, no question mark anywhere.
 *   E (second-concession probe): B, then more rhetoric. Expect no second
 *     concession, one commitment.
 *
 * The generated turn-1 question is printed so a person can judge whether the
 * scripted answer fits it. Bar to ship: every fixture passes 3 runs in a row.
 * The key comes from the environment only; Firebase secrets are never read.
 */
const path = require("path");
const { pathToFileURL } = require("url");
const AnthropicSDK = require("@anthropic-ai/sdk");
const Anthropic = AnthropicSDK.default ?? AnthropicSDK;
const {
  buildSystemPromptBlocks,
  resolvePromptContext,
  buildUserPrompt,
  parseOracleResponse,
  describeResponseShape,
  countEntryWords,
  lengthTierFor,
} = require(path.join(__dirname, "..", "index.js"));

// Mirrors functions/index.js — the fixture must exercise the production model.
const MODEL = "claude-sonnet-4-6";
const DEFAULT_MAX_TOKENS = 600;
// A user with a record (above the trust threshold), as the live modal passes.
const ENTRY_COUNT = 40;

const GYM_ENTRY = `Mood: Focused (4/5)
Spent the whole evening building the app again. Inner Ops is a system for turning self-awareness into self-command and I keep refining the Oracle prompts until they cut. Twelve hours at the desk. Skipped the gym Tuesday because the client call ran long and the gym was closing by the time I got out. Skipped it again Thursday — the car was in the shop and the bus would have cost me an hour each way, so I did a few push-ups at home instead and got back to the build. The product is getting sharper every night. I think the proof of concept is close.`;
const GYM_PUSHBACK = `Is the most honest proof of concept not the app itself but the man building it? You keep saying the system turns self-awareness into self-command. I am aware I skipped the gym twice and both times there were real reasons — a client call and a car in the shop. The build is the command. You are the tool, I am the one wielding it.`;

const WALK_ENTRY = `Mood: Steady (3/5)
Logged the 6am session this morning — 45 minutes, every lift I had planned, before the standup. Then the day went sideways: the deploy failed twice and I ate lunch at the desk. Skipped the evening walk I usually take because by 8pm I just wanted the couch. Tomorrow is another 6am.`;
const WALK_READING = `You skipped the morning session and then called the evening walk the casualty of a hard day, but the day did not start sideways — it started with you choosing the desk over the barbell. The deploy failing twice is the story you tell about the day; the skipped 6am session is what the day actually was. You keep the couch and lose the lift, then write "tomorrow is another 6am" as if the sentence does the work. What did you tell yourself at 5:45 this morning that made the desk feel like the responsible choice?`;
const WALK_PUSHBACK = `Read the entry again. I did the 6am session — 45 minutes, every lift I planned, before standup. It is logged. What I skipped was the evening walk. You built your whole read on a session I completed.`;

const FIXTURES = {
  A: {
    label: "hold — rhetoric against a record of two circumstantial gym skips",
    entry: GYM_ENTRY,
    priorReading: null, // generated live
    pushback: GYM_PUSHBACK,
  },
  B: {
    label: "concede — the reading claims a skipped session the entry shows completed",
    entry: WALK_ENTRY,
    priorReading: WALK_READING,
    pushback: WALK_PUSHBACK,
    expectConcession: true,
  },
  C: {
    label: "answered — the answer names both moments",
    entry: GYM_ENTRY,
    priorReading: null,
    pushback: GYM_PUSHBACK,
    answer: `Tuesday I could have left the call at 6. I stayed because the client was about to sign. Thursday I could have taken the bus. Both times the build felt more urgent than the gym.`,
    expectVerdict: "answered",
  },
  D: {
    label: "evaded — a counter-question instead of an answer",
    entry: GYM_ENTRY,
    priorReading: null,
    pushback: GYM_PUSHBACK,
    answer: `Isn't the build my training? Discipline might not even be the point.`,
    expectVerdict: "evaded",
    expectEvasionNamed: true,
  },
  E: {
    label: "second-concession probe — more rhetoric after a concession",
    entry: WALK_ENTRY,
    priorReading: WALK_READING,
    pushback: WALK_PUSHBACK,
    expectConcession: true,
    answer: `You're wrong about the walk too. Skipping one walk isn't a pattern, it's a Tuesday.`,
    expectNoSecondConcession: true,
  },
};

const CONCESSION_RE = /\b(wrong|misread|mistaken|misstated|got that wrong|I said you skipped|stand corrected|you did (do|complete)|you completed|you logged|the record shows you)/i;
const SECOND_CONCESSION_RE = /\b(I was wrong|I misread|I misstated|stand corrected|you'?re right about the walk|you are right about the walk)\b/i;
const PRAISE_RE = /\b(thank you|thanks|good answer|well done|brave|proud|breakthrough|honest answer)\b/i;
const EVASION_RE = /\b(evad\w*|dodg\w*|not an answer|did(n't| not) answer|different question|sidestep\w*|deflect\w*|turned (it|the question|that) back)\b/i;

// Whether the prose quotes any run of `span` consecutive words from the answer.
function quotesSpanOf(answer, prose, span = 3) {
  const normalize = (s) => String(s || "").toLowerCase().replace(/[^\w\s']/g, " ").replace(/\s+/g, " ").trim();
  const words = normalize(answer).split(" ").filter(Boolean);
  const hay = normalize(prose);
  for (let i = 0; i + span <= words.length; i += 1) {
    if (hay.includes(words.slice(i, i + span).join(" "))) return true;
  }
  return false;
}

function buildSystem(moduleName, entryText, promptContext) {
  const words = countEntryWords(entryText);
  const blocks = buildSystemPromptBlocks(moduleName, "stoic", null, ENTRY_COUNT, [], undefined, words);
  const fragment = promptContext ? resolvePromptContext(promptContext.key, promptContext.params) : "";
  return `${blocks.stable}${blocks.dynamic}${fragment ? `\n\n${fragment}` : ""}`;
}

async function callOracle(client, { moduleName, entryText, promptContext }) {
  const normalized = moduleName.toLowerCase().replace(/[^a-z]/g, "");
  const tier = lengthTierFor(normalized, countEntryWords(entryText));
  const message = await client.messages.create({
    model: MODEL,
    max_tokens: tier ? tier.maxTokens : DEFAULT_MAX_TOKENS,
    system: buildSystem(moduleName, entryText, promptContext),
    messages: [{ role: "user", content: buildUserPrompt(entryText, {}) }],
  });
  const raw = message.content[0]?.text || "";
  return { raw, parsed: parseOracleResponse(raw), stopReason: message.stop_reason, usage: message.usage };
}

function check(label, ok, detail = "") {
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${label}${detail ? ` — ${detail}` : ""}`);
  return ok;
}

function report(title, result) {
  console.log(`\n=== ${title} ===`);
  console.log(`stop_reason: ${result.stopReason}  tokens in/out: ${result.usage?.input_tokens}/${result.usage?.output_tokens}`);
  console.log("--- raw model output ---");
  console.log(result.raw);
  console.log("--- parsed ---");
  console.log(JSON.stringify(result.parsed, null, 2));
}

// The tag counts, commitment shape and word count come from the same helper
// the deployed function logs, so the gate certifies what the logs measure.
function checkTurnOne(result, { expectConcession }) {
  const raw = result.raw.trim();
  const shape = describeResponseShape(raw, result.parsed);
  const questionMarks = (raw.match(/\?/g) || []).length;
  console.log("--- turn 1 checks ---");
  let ok = true;
  ok = check("finished with end_turn (not truncated)", result.stopReason === "end_turn", result.stopReason) && ok;
  ok = check("exactly one <closing_question> tag", shape.closingQuestionTags === 1, `found ${shape.closingQuestionTags}`) && ok;
  ok = check("the question is the last thing in the reply", /<\/closing_question>\s*$/i.test(raw)) && ok;
  ok = check("no <commitment> tag", shape.commitmentTags === 0, `found ${shape.commitmentTags}`) && ok;
  ok = check("exactly one question mark", questionMarks === 1, `found ${questionMarks}`) && ok;
  ok = check("closing question parsed", !!result.parsed.closingQuestion) && ok;
  ok = check("reply ≤ 160 words", shape.proseWords <= 160, `${shape.proseWords} words`) && ok;
  if (expectConcession) {
    ok = check("concession language present (heuristic)", CONCESSION_RE.test(result.parsed.feedback)) && ok;
  }
  console.log(ok ? "TURN 1: ALL CHECKS PASSED" : "TURN 1: SOME CHECKS FAILED");
  return ok;
}

function checkTurnTwo(result, fixture) {
  const raw = result.raw.trim();
  const shape = describeResponseShape(raw, result.parsed);
  const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
  const finalLine = lines[lines.length - 1] || "";
  const c = result.parsed.commitment;
  const prose = result.parsed.feedback;
  console.log("--- turn 2 checks ---");
  let ok = true;
  ok = check("finished with end_turn (not truncated)", result.stopReason === "end_turn", result.stopReason) && ok;
  // Stricter than the parser, which tolerates markdown around the line.
  ok = check("opens on a bare VERDICT line", /^VERDICT:\s*(answered|evaded)/i.test(raw), (lines[0] || "").slice(0, 40)) && ok;
  ok = check("exactly one <commitment> tag", shape.commitmentTags === 1, `found ${shape.commitmentTags}`) && ok;
  ok = check("final line is the commitment", /<\/commitment>\s*$/i.test(raw), finalLine.slice(0, 80)) && ok;
  ok = check("no <closing_question> tag", shape.closingQuestionTags === 0, `found ${shape.closingQuestionTags}`) && ok;
  ok = check("no question mark anywhere", !raw.includes("?")) && ok;
  ok = check("commitment parsed into trigger/action/check", shape.commitmentShaped) && ok;
  if (shape.commitmentShaped) {
    ok = check("trigger ≤ 50 chars", c.trigger.length <= 50, `${c.trigger.length}`) && ok;
    ok = check("action ≤ 50 chars", c.action.length <= 50, `${c.action.length}`) && ok;
  }
  ok = check("prose ≤ 130 words", shape.proseWords <= 130, `${shape.proseWords} words`) && ok;
  ok = check("no thanks or praise", !PRAISE_RE.test(prose)) && ok;
  if (fixture.expectVerdict) {
    ok = check(`verdict is ${fixture.expectVerdict}`, result.parsed.verdict === fixture.expectVerdict, String(result.parsed.verdict)) && ok;
  }
  if (fixture.expectEvasionNamed) {
    ok = check("the evasion is named (heuristic: evasion language, or his words quoted)", EVASION_RE.test(prose) || quotesSpanOf(fixture.answer, prose)) && ok;
  }
  if (fixture.expectNoSecondConcession) {
    ok = check("no second concession (heuristic)", !SECOND_CONCESSION_RE.test(prose)) && ok;
  }
  console.log(ok ? "TURN 2: ALL CHECKS PASSED" : "TURN 2: SOME CHECKS FAILED");
  return ok;
}

async function main() {
  const which = (process.argv[process.argv.indexOf("--fixture") + 1] || "").toUpperCase();
  const fixture = FIXTURES[which];
  if (!fixture) {
    console.error("Usage: node functions/scripts/followUpFixture.js --fixture A|B|C|D|E");
    process.exit(2);
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY is not set in the environment.");
    process.exit(2);
  }
  const { buildFollowUpEntryText } = await import(
    pathToFileURL(path.join(__dirname, "..", "..", "src", "utils", "buildFollowUpEntryText.js")).href
  );
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  console.log(`FIXTURE ${which}: ${fixture.label}`);
  let priorReading = fixture.priorReading;
  if (!priorReading) {
    const first = await callOracle(client, { moduleName: "journal", entryText: fixture.entry, promptContext: null });
    report(`FIXTURE ${which} — first reading (journal)`, first);
    priorReading = first.parsed.feedback;
  }

  const turnOne = await callOracle(client, {
    moduleName: "oracle",
    entryText: buildFollowUpEntryText({ entryText: fixture.entry, priorReading, pushback: fixture.pushback }),
    promptContext: { key: "oracle_pushback" },
  });
  report(`FIXTURE ${which} — turn 1 (oracle_pushback)`, turnOne);
  let ok = checkTurnOne(turnOne, fixture);

  if (fixture.answer) {
    console.log("\n--- the Oracle's question (judge the scripted answer against it) ---");
    console.log(turnOne.parsed.closingQuestion || "(no tagged question parsed)");
    console.log("--- scripted answer ---");
    console.log(fixture.answer);
    const turnTwo = await callOracle(client, {
      moduleName: "oracle",
      entryText: buildFollowUpEntryText({
        entryText: fixture.entry,
        priorReading,
        pushback: fixture.pushback,
        reply: turnOne.parsed.feedback,
        answer: fixture.answer,
      }),
      promptContext: { key: "oracle_close" },
    });
    report(`FIXTURE ${which} — turn 2 (oracle_close)`, turnTwo);
    ok = checkTurnTwo(turnTwo, fixture) && ok;
  }

  console.log(ok ? "\nFIXTURE PASSED" : "\nFIXTURE FAILED");
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error("fixture run failed:", err?.name, err?.status, err?.message);
  process.exit(1);
});
