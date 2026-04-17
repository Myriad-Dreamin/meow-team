import { describe, expect, it } from "vitest";
import { classifyHarnessCommitType, formatHarnessCommitMessage } from "@/lib/team/commit-message";

describe("classifyHarnessCommitType", () => {
  it("falls back to dev for ambiguous implementation work", () => {
    expect(classifyHarnessCommitType({})).toBe("dev");
    expect(
      classifyHarnessCommitType({
        conventionalTitle: {
          type: "feat",
          scope: "team/dispatch",
        },
      }),
    ).toBe("dev");
  });

  it("maps proposal and archive work to docs", () => {
    expect(classifyHarnessCommitType({ intent: "proposal" })).toBe("docs");
    expect(classifyHarnessCommitType({ intent: "archive" })).toBe("docs");
  });

  it("maps repair work to fix", () => {
    expect(
      classifyHarnessCommitType({
        intent: "repair",
        conventionalTitle: {
          type: "docs",
          scope: "team/roles",
        },
      }),
    ).toBe("fix");
  });

  it("preserves explicit dev, docs, fix, and test implementation metadata", () => {
    expect(
      classifyHarnessCommitType({
        conventionalTitle: {
          type: "dev",
          scope: "team/dispatch",
        },
      }),
    ).toBe("dev");
    expect(
      classifyHarnessCommitType({
        conventionalTitle: {
          type: "docs",
          scope: "team/roles",
        },
      }),
    ).toBe("docs");
    expect(
      classifyHarnessCommitType({
        conventionalTitle: {
          type: "fix",
          scope: "team/dispatch",
        },
      }),
    ).toBe("fix");
    expect(
      classifyHarnessCommitType({
        conventionalTitle: {
          type: "test",
          scope: "team/dispatch",
        },
      }),
    ).toBe("test");
  });
});

describe("formatHarnessCommitMessage", () => {
  it("formats ambiguous implementation work with a dev prefix", () => {
    expect(
      formatHarnessCommitMessage({
        summary: "implement lane 1",
      }),
    ).toBe("dev: implement lane 1");
  });

  it("formats proposal and archive work with a docs prefix", () => {
    expect(
      formatHarnessCommitMessage({
        intent: "proposal",
        summary: "add openspec proposals",
      }),
    ).toBe("docs: add openspec proposals");
    expect(
      formatHarnessCommitMessage({
        intent: "archive",
        summary: "archive change-1",
      }),
    ).toBe("docs: archive change-1");
  });

  it("formats repair and explicit test-only work with fix and test prefixes", () => {
    expect(
      formatHarnessCommitMessage({
        intent: "repair",
        summary: "address review feedback for lane 1",
      }),
    ).toBe("fix: address review feedback for lane 1");
    expect(
      formatHarnessCommitMessage({
        conventionalTitle: {
          type: "test",
          scope: "team/dispatch",
        },
        summary: "add regression coverage",
      }),
    ).toBe("test: add regression coverage");
  });

  it("normalizes an existing conventional subject before prefixing", () => {
    expect(
      formatHarnessCommitMessage({
        conventionalTitle: {
          type: "docs",
          scope: "team/roles",
        },
        summary: "docs: refresh reviewer guidance",
      }),
    ).toBe("docs: refresh reviewer guidance");
  });
});
