import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAgentLaunches,
  buildMergePlan,
  buildPaseoRunArgs,
  parseArgs,
  parsePaseoRunOutput,
  parseStableVersion,
} from "./prepare-upstream-merge-pr.mjs";

test("normalizes versions with or without a leading v", () => {
  assert.deepEqual(parseStableVersion("0.1.72"), {
    major: 0,
    minor: 1,
    patch: 72,
    version: "0.1.72",
    tag: "v0.1.72",
  });
  assert.equal(parseStableVersion("v0.1.72").version, "0.1.72");
});

test("builds the default upstream merge plan", () => {
  assert.deepEqual(buildMergePlan("v0.1.72"), {
    branchName: "merge-v0.1.72",
    previousTag: "v0.1.71",
    targetTag: "v0.1.72",
    targetVersion: "0.1.72",
    title: "build: merge v0.1.71..v0.1.72",
    upstreamCompareUrl: "https://github.com/getpaseo/paseo/compare/v0.1.71...v0.1.72",
  });
});

test("allows overriding the previous release version", () => {
  assert.equal(buildMergePlan("v0.2.0", { previousVersion: "0.1.99" }).previousTag, "v0.1.99");
});

test("parses script options", () => {
  const parsed = parseArgs([
    "0.1.72",
    "--provider",
    "codex/gpt-5.4-mini",
    "--mode=full-access",
    "--origin",
    "fork",
    "--upstream",
    "upstream",
    "--base",
    "fork/main",
    "--previous",
    "0.1.70",
    "--reset-existing",
    "--skip-fetch",
    "--no-agents",
  ]);

  assert.equal(parsed.version, "0.1.72");
  assert.equal(parsed.options.provider, "codex/gpt-5.4-mini");
  assert.equal(parsed.options.mode, "full-access");
  assert.equal(parsed.options.originRemote, "fork");
  assert.equal(parsed.options.upstreamRemote, "upstream");
  assert.equal(parsed.options.baseRef, "fork/main");
  assert.equal(parsed.options.previousVersion, "0.1.70");
  assert.equal(parsed.options.resetExisting, true);
  assert.equal(parsed.options.skipFetch, true);
  assert.equal(parsed.options.noAgents, true);
});

test("builds paseo run args with labels, provider, mode, and prompt", () => {
  const plan = buildMergePlan("0.1.72");
  const [launch] = buildAgentLaunches(plan, {
    baseRef: "origin/main",
    originRemote: "origin",
    upstreamRemote: "paseo",
  });
  const args = buildPaseoRunArgs(launch, {
    provider: "codex/gpt-5.4",
    mode: "full-access",
  });

  assert.equal(args[0], "run");
  assert.ok(args.includes("--json"));
  assert.ok(args.includes("--detach"));
  assert.ok(args.includes("upstream-merge-role=resolve-conflicts"));
  assert.ok(args.includes("upstream-merge-version=v0.1.72"));
  assert.ok(args.includes("upstream-merge-branch=merge-v0.1.72"));
  assert.ok(args.includes("codex/gpt-5.4"));
  assert.ok(args.includes("full-access"));
  assert.match(args.at(-1), /You are the Resolve conflict agent/);
});

test("parses paseo json and fallback output", () => {
  assert.deepEqual(parsePaseoRunOutput('{"agentId":"abc-123"}'), { agentId: "abc-123" });
  assert.deepEqual(parsePaseoRunOutput("agent-id: def_456"), { agentId: "def_456" });
  assert.equal(parsePaseoRunOutput("{}"), null);
});
