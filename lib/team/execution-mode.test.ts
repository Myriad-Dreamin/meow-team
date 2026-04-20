import { describe, expect, it } from "vitest";
import {
  buildExecutionModeGuidePath,
  getTeamExecutionModeAutocomplete,
  parseExecutionModeInput,
  TEAM_EXECUTION_MODE_DEFINITIONS,
} from "@/lib/team/execution-mode";

describe("parseExecutionModeInput", () => {
  it("detects start-bound slash prefixes and strips them from the request text", () => {
    expect(parseExecutionModeInput("/benchmark compare worktree reuse latency")).toEqual({
      executionMode: "benchmark",
      requestText: "compare worktree reuse latency",
      prefix: "/benchmark ",
    });
    expect(parseExecutionModeInput("/execution refresh fixture dataset")).toEqual({
      executionMode: "execution",
      requestText: "refresh fixture dataset",
      prefix: "/execution ",
    });
    expect(parseExecutionModeInput("/experiment measure cache hit rate")).toEqual({
      executionMode: "experiment",
      requestText: "measure cache hit rate",
      prefix: "/experiment ",
    });
  });

  it("allows leading whitespace before the slash command", () => {
    expect(parseExecutionModeInput("  /benchmark compare worktree reuse latency")).toEqual({
      executionMode: "benchmark",
      requestText: "compare worktree reuse latency",
      prefix: "/benchmark ",
    });
  });

  it("normalizes accepted slash prefixes to the canonical contract", () => {
    expect(parseExecutionModeInput("/BENCHMARK compare worktree reuse latency")).toEqual({
      executionMode: "benchmark",
      requestText: "compare worktree reuse latency",
      prefix: "/benchmark ",
    });
  });

  it("rejects colon, mid-sentence, and missing-space mode tokens", () => {
    expect(parseExecutionModeInput("benchmark: compare worktree reuse latency")).toEqual({
      executionMode: null,
      requestText: "benchmark: compare worktree reuse latency",
      prefix: null,
    });
    expect(parseExecutionModeInput("please run /execution compare worktree reuse latency")).toEqual(
      {
        executionMode: null,
        requestText: "please run /execution compare worktree reuse latency",
        prefix: null,
      },
    );
    expect(parseExecutionModeInput("/experiment")).toEqual({
      executionMode: null,
      requestText: "/experiment",
      prefix: null,
    });
    expect(parseExecutionModeInput("/benchmarkcompare worktree reuse latency")).toEqual({
      executionMode: null,
      requestText: "/benchmarkcompare worktree reuse latency",
      prefix: null,
    });
  });

  it("leaves bare and unprefixed requests unchanged", () => {
    expect(parseExecutionModeInput("benchmark compare worktree reuse latency")).toEqual({
      executionMode: null,
      requestText: "benchmark compare worktree reuse latency",
      prefix: null,
    });
    expect(parseExecutionModeInput("implement execute mode routing")).toEqual({
      executionMode: null,
      requestText: "implement execute mode routing",
      prefix: null,
    });
  });
});

describe("execution mode metadata and autocomplete", () => {
  it("keeps canonical request prefixes in one shared definition list", () => {
    expect(TEAM_EXECUTION_MODE_DEFINITIONS.map((definition) => definition.prefix)).toEqual([
      "/execution ",
      "/benchmark ",
      "/experiment ",
    ]);
  });

  it("suggests only canonical slash-prefixed modes at the start of the request", () => {
    expect(
      getTeamExecutionModeAutocomplete({ cursorIndex: "/".length, value: "/" })?.suggestions,
    ).toEqual([
      {
        detail: "Queue the standard execution workflow for implementation work.",
        insertText: "/execution ",
        label: "/execution ",
        mode: "execution",
      },
      {
        detail: "Queue the benchmark workflow for performance measurement work.",
        insertText: "/benchmark ",
        label: "/benchmark ",
        mode: "benchmark",
      },
      {
        detail: "Queue the experiment workflow for exploratory or data-gathering work.",
        insertText: "/experiment ",
        label: "/experiment ",
        mode: "experiment",
      },
    ]);
    expect(
      getTeamExecutionModeAutocomplete({
        cursorIndex: "/be".length,
        value: "/be",
      })?.suggestions.map((suggestion) => suggestion.label),
    ).toEqual(["/benchmark "]);
  });

  it("suggests slash-prefixed modes after leading whitespace", () => {
    expect(
      getTeamExecutionModeAutocomplete({
        cursorIndex: "  /ex".length,
        value: "  /ex",
      })?.suggestions.map((suggestion) => suggestion.label),
    ).toEqual(["/execution ", "/experiment "]);
  });

  it("does not suggest empty, bare, mid-sentence, or completed command input", () => {
    expect(getTeamExecutionModeAutocomplete({ cursorIndex: 0, value: "" })).toBeNull();
    expect(
      getTeamExecutionModeAutocomplete({
        cursorIndex: "be".length,
        value: "be",
      }),
    ).toBeNull();
    expect(
      getTeamExecutionModeAutocomplete({
        cursorIndex: "implement".length,
        value: "implement execute mode routing",
      }),
    ).toBeNull();
    expect(
      getTeamExecutionModeAutocomplete({
        cursorIndex: "compare this /be".length,
        value: "compare this /be",
      }),
    ).toBeNull();
    expect(
      getTeamExecutionModeAutocomplete({
        cursorIndex: "/benchmark compare".length,
        value: "/benchmark compare worktree reuse latency",
      }),
    ).toBeNull();
  });
});

describe("buildExecutionModeGuidePath", () => {
  it("maps each execution subtype to its guide path", () => {
    expect(buildExecutionModeGuidePath("execution")).toBe("docs/guide/execution.md");
    expect(buildExecutionModeGuidePath("benchmark")).toBe("docs/guide/benchmark.md");
    expect(buildExecutionModeGuidePath("experiment")).toBe("docs/guide/experiment.md");
  });
});
