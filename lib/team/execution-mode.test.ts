import { describe, expect, it } from "vitest";
import { buildExecutionModeGuidePath, parseExecutionModeInput } from "@/lib/team/execution-mode";

describe("parseExecutionModeInput", () => {
  it("detects execute-mode prefixes and strips them from the request text", () => {
    expect(parseExecutionModeInput("benchmark: compare worktree reuse latency")).toEqual({
      executionMode: "benchmark",
      requestText: "compare worktree reuse latency",
      prefix: "benchmark:",
    });
    expect(parseExecutionModeInput("execution: refresh fixture dataset")).toEqual({
      executionMode: "execution",
      requestText: "refresh fixture dataset",
      prefix: "execution:",
    });
    expect(parseExecutionModeInput("experiment: measure cache hit rate")).toEqual({
      executionMode: "experiment",
      requestText: "measure cache hit rate",
      prefix: "experiment:",
    });
  });

  it("leaves unprefixed requests unchanged", () => {
    expect(parseExecutionModeInput("implement execute mode routing")).toEqual({
      executionMode: null,
      requestText: "implement execute mode routing",
      prefix: null,
    });
  });
});

describe("buildExecutionModeGuidePath", () => {
  it("maps each execution subtype to its guide path", () => {
    expect(buildExecutionModeGuidePath("execution")).toBe("docs/guide/execution.md");
    expect(buildExecutionModeGuidePath("benchmark")).toBe("docs/guide/benchmark.md");
    expect(buildExecutionModeGuidePath("experiment")).toBe("docs/guide/experiment.md");
  });
});
