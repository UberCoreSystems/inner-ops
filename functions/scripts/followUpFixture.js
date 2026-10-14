#!/usr/bin/env node
/**
 * Manual fixture runner for the Oracle follow-up ("Go deeper") turn.
 *
 * Assembles the exact request the deployed `oracle` function sends for a
 * follow-up — same system-prompt blocks, same oracle_challenge fragment, same
 * user prompt, same model and max_tokens — and calls the Anthropic API
 * directly, so the template can be exercised without a deploy. Prints the raw
 * model output, the parsed response, and a few mechanical checks.
 *
 * Usage (repo root, functions deps installed):
 *   ANTHROPIC_API_KEY=... node functions/scripts/followUpFixture.js --fixture A
 *   ANTHROPIC_API_KEY=... node functions/scripts/followUpFixture.js --fixture B
 *
 * A (hold): the first reading is generated live, then challenged with
 *   rhetoric the record does not support. Expect: holds position, one
 *   commitment line, no closing question.
 * B (concede): a hand-written reading misstates the record; the pushback
 *   cites the logged session. Expect: a plain concession naming the error,
 *   a corrected read, one commitment line.
 *
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
  lengthTierFor,
} = require(path.join(__dirname, "..", "index.js"));

// Mirrors functions/index.js — the fixture must exercise the production model.
const MODEL = "claude-sonnet-4-6";
const DEFAULT_MAX_TOKENS = 600;
// A user with a record (above the trust threshold), as the live modal passes.
const ENTRY_COUNT = 40;

const FIXTURES = {
  A: {
    label: "hold — rhetoric against a record of two circumstantial gym skips",
    entry: `Mood: Focused (4/5)
Spent the whole evening building the app again. Inner Ops is a system for turning self-awareness into self-command and I keep refining the Oracle prompts until they cut. Twelve hours at the desk. Skipped the gym Tuesday because the client call ran long and the gym was closing by the time I got out. Skipped it again Thursday — the car was in the shop and the bus would have cost me an hour each way, so I did a few push-ups at home instead and got back to the build. The product is getting sharper every night. I think the proof of concept is close.`,
    priorReading: null, // generated live
    pushback: `Is the most honest proof of concept not the app itself but the man building it? You keep saying the system turns self-awareness into self-command. I am aware I skipped the gym twice and both times there were real reasons — a client call and a car in the shop. The build is the command. You are the tool, I am the one wielding it.`,
  },
  B: {
    label: "concede — the reading claims a skipped session the entry shows completed",
    entry: `Mood: Steady (3/5)
Logged the 6am session this morning — 45 minutes, every lift I had planned, before the standup. Then the day went sideways: the deploy failed twice and I ate lunch at the desk. Skipped the evening walk I usually take because by 8pm I just wanted the couch. Tomorrow is another 6am.`,
    priorReading: `You skipped the morning session and then called the evening walk the casualty of a hard day, but the day did not start sideways — it started with you choosing the desk over the barbell. The deploy failing twice is the story you tell about the day; the skipped 6am session is what the day actually was. You keep the couch and lose the lift, then write "tomorrow is another 6am" as if the sentence does the work. What did you tell yourself at 5:45 this morning that made the desk feel like the responsible choice?`,
    pushback: `Read the entry again. I did the 6am session — 45 minutes, every lift I planned, before standup. It is logged. What I skipped was the evening walk. You built your whole read on a session I completed.`,
  },
};

function countWords(text) {
  return String(text || "").trim().split(/\s+/).filter(Boolean).length;
}

function buildSystem(moduleName, entryText, promptContext) {
  const words = countWords(entryText);
  const blocks = buildSystemPromptBlocks(moduleName, "stoic", null, ENTRY_COUNT, [], undefined, words);
  const fragment = promptContext ? resolvePromptContext(promptContext.key, promptContext.params) : "";
  return `${blocks.stable}${blocks.dynamic}${fragment ? `\n\n${fragment}` : ""}`;
}

async function callOracle(client, { moduleName, entryText, promptContext }) {
  const normalized = moduleName.toLowerCase().replace(/[^a-z]/g, "");
  const tier = lengthTierFor(normalized, countWords(entryText));
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

function checkFollowUp(result, { expectConcession }) {
  const raw = result.raw.trim();
  const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
  const finalLine = lines[lines.length - 1] || "";
  const tagCount = (raw.match(/<commitment\b/gi) || []).length;
  const c = result.parsed.commitment;
  console.log("--- checks ---");
  let ok = true;
  ok = check("finished with end_turn (not truncated)", result.stopReason === "end_turn", result.stopReason) && ok;
  ok = check("exactly one <commitment> tag", tagCount === 1, `found ${tagCount}`) && ok;
  ok = check("no <closing_question> tag", !/<closing_question/i.test(raw)) && ok;
  ok = check("final line is the commitment", /<\/commitment>\s*$/i.test(raw), finalLine.slice(0, 80)) && ok;
  ok = check("no question mark in the final line", !finalLine.includes("?")) && ok;
  ok = check("commitment parsed into trigger/action/check", !!(c && c.trigger && c.action && c.check)) && ok;
  if (c && c.trigger && c.action) {
    ok = check("trigger ≤ 50 chars", c.trigger.length <= 50, `${c.trigger.length}`) && ok;
    ok = check("action ≤ 50 chars", c.action.length <= 50, `${c.action.length}`) && ok;
  }
  const proseWords = countWords(result.parsed.feedback);
  ok = check("prose ≤ 160 words", proseWords <= 160, `${proseWords} words`) && ok;
  if (expectConcession) {
    const conceded = /\b(wrong|misread|mistaken|misstated|got that wrong|I said you skipped|stand corrected|you did (do|complete)|you completed|you logged|the record shows you)/i.test(result.parsed.feedback);
    ok = check("concession language present (heuristic)", conceded) && ok;
  }
  console.log(ok ? "ALL CHECKS PASSED" : "SOME CHECKS FAILED");
  return ok;
}

async function main() {
  const which = (process.argv[process.argv.indexOf("--fixture") + 1] || "").toUpperCase();
  const fixture = FIXTURES[which];
  if (!fixture) {
    console.error("Usage: node functions/scripts/followUpFixture.js --fixture A|B");
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

  const entryText = buildFollowUpEntryText({ entryText: fixture.entry, priorReading, pushback: fixture.pushback });
  const followUp = await callOracle(client, {
    moduleName: "oracle",
    entryText,
    promptContext: { key: "oracle_challenge", params: { pushback: fixture.pushback } },
  });
  report(`FIXTURE ${which} — follow-up (oracle_challenge)`, followUp);
  const ok = checkFollowUp(followUp, { expectConcession: which === "B" });
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error("fixture run failed:", err?.name, err?.status, err?.message);
  process.exit(1);
});
