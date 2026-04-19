import { describe, expect, it } from "vitest";
import {
  getThreadCommandAutocomplete,
  getThreadCommandDisabledReason,
  parseThreadCommand,
  THREAD_COMMAND_DEFINITIONS,
  THREAD_COMMAND_NO_ASSIGNMENT_REASON,
  THREAD_COMMAND_PLACEHOLDER,
  THREAD_COMMAND_REPLANNING_REASON,
  ThreadCommandParseError,
} from "@/lib/team/thread-command";
import type { TeamThreadSummary } from "@/lib/team/history";

const FIXED_TIMESTAMP = "2026-04-18T08:00:00.000Z";

const createThreadSummary = (overrides: Partial<TeamThreadSummary> = {}): TeamThreadSummary => {
  return {
    threadId: "thread-1",
    assignmentNumber: 1,
    status: "completed",
    archivedAt: null,
    requestTitle: "Support thread commands",
    requestText: "Support thread slash commands.",
    latestInput: "Support thread slash commands.",
    repository: null,
    workflow: ["planner", "coder", "reviewer"],
    latestRoleId: "reviewer",
    latestRoleName: "Reviewer",
    nextRoleId: null,
    latestDecision: "approved",
    handoffCount: 3,
    stepCount: 3,
    userMessageCount: 1,
    startedAt: FIXED_TIMESTAMP,
    finishedAt: FIXED_TIMESTAMP,
    updatedAt: FIXED_TIMESTAMP,
    lastError: null,
    latestAssignmentStatus: "completed",
    latestPlanSummary: "Machine review is done.",
    latestBranchPrefix: "requests/thread-command",
    latestCanonicalBranchName: "requests/thread-command/a1",
    dispatchWorkerCount: 2,
    workerCounts: {
      idle: 0,
      queued: 0,
      coding: 0,
      reviewing: 0,
      awaitingHumanApproval: 0,
      approved: 2,
      failed: 0,
    },
    workerLanes: [],
    plannerNotes: [],
    humanFeedback: [],
    ...overrides,
  };
};

describe("parseThreadCommand", () => {
  it("parses batch and single-target approval commands", () => {
    expect(parseThreadCommand("/approve")).toEqual({
      kind: "approve",
      original: "/approve",
      proposalNumber: null,
    });
    expect(parseThreadCommand("/ready 2")).toEqual({
      kind: "ready",
      original: "/ready 2",
      proposalNumber: 2,
    });
    expect(parseThreadCommand("/cancel")).toEqual({
      kind: "cancel",
      original: "/cancel",
    });
  });

  it("parses replan commands with preserved requirement text", () => {
    expect(parseThreadCommand("/replan 3 tighten the scope")).toEqual({
      kind: "replan",
      original: "/replan 3 tighten the scope",
      proposalNumber: 3,
      requirement: "tighten the scope",
    });
    expect(parseThreadCommand("/replan-all reduce to one proposal")).toEqual({
      kind: "replan-all",
      original: "/replan-all reduce to one proposal",
      requirement: "reduce to one proposal",
    });
  });

  it("rejects unsupported or incomplete command syntax", () => {
    expect(() => parseThreadCommand("/approve 2 extra")).toThrowError(ThreadCommandParseError);
    expect(() => parseThreadCommand("/cancel later")).toThrowError(ThreadCommandParseError);
    expect(() => parseThreadCommand("/replan 2")).toThrowError(ThreadCommandParseError);
    expect(() => parseThreadCommand("/replan-all")).toThrowError(ThreadCommandParseError);
    expect(() => parseThreadCommand("/unknown")).toThrowError(ThreadCommandParseError);
  });
});

describe("thread command metadata and autocomplete", () => {
  it("keeps placeholder guidance aligned with the supported commands", () => {
    expect(THREAD_COMMAND_DEFINITIONS.map((definition) => definition.command)).toEqual([
      "/approve",
      "/ready",
      "/cancel",
      "/replan",
      "/replan-all",
    ]);
    expect(THREAD_COMMAND_PLACEHOLDER).toBe("/approve\n/ready\n/cancel\n/replan\n/replan-all");
  });

  it("suggests only supported slash commands with parser-aligned syntax copy", () => {
    const result = getThreadCommandAutocomplete({
      cursorIndex: "/re".length,
      proposalNumbers: [3, 1, 2],
      value: "/re",
    });

    expect(result?.suggestions.map((suggestion) => suggestion.label)).toEqual([
      "/ready",
      "/replan",
      "/replan-all",
    ]);
    expect(result?.suggestions.map((suggestion) => suggestion.detail)).toEqual([
      "/ready [proposal-number]",
      "/replan [proposal-number] requirement",
      "/replan-all requirement",
    ]);
  });

  it("offers /cancel as a thread-scoped command without proposal autocomplete", () => {
    const commandResult = getThreadCommandAutocomplete({
      cursorIndex: "/c".length,
      proposalNumbers: [1, 2],
      value: "/c",
    });

    expect(commandResult?.suggestions.map((suggestion) => suggestion.label)).toEqual(["/cancel"]);
    expect(
      getThreadCommandAutocomplete({
        cursorIndex: "/cancel ".length,
        proposalNumbers: [1, 2],
        value: "/cancel ",
      }),
    ).toBeNull();
  });

  it("sorts and filters proposal-number suggestions from latest-assignment lanes", () => {
    const result = getThreadCommandAutocomplete({
      cursorIndex: "/approve ".length,
      proposalNumbers: [3, 2, 2, 1],
      value: "/approve ",
    });

    expect(result?.suggestions.map((suggestion) => suggestion.label)).toEqual([
      "Proposal 1",
      "Proposal 2",
      "Proposal 3",
    ]);
    expect(result?.suggestions.map((suggestion) => suggestion.insertText)).toEqual(["1", "2", "3"]);
  });

  it("stops offering proposal suggestions after free-form requirement text begins", () => {
    expect(
      getThreadCommandAutocomplete({
        cursorIndex: "/replan 2 ".length,
        proposalNumbers: [1, 2],
        value: "/replan 2 ",
      }),
    ).toBeNull();
    expect(
      getThreadCommandAutocomplete({
        cursorIndex: "/replan 2 tighten scope".length,
        proposalNumbers: [1, 2],
        value: "/replan 2 tighten scope",
      }),
    ).toBeNull();
  });
});

describe("getThreadCommandDisabledReason", () => {
  it("allows idle living threads", () => {
    expect(getThreadCommandDisabledReason(createThreadSummary())).toBeNull();
  });

  it("blocks threads before the first assignment exists", () => {
    expect(
      getThreadCommandDisabledReason(
        createThreadSummary({
          latestAssignmentStatus: null,
          dispatchWorkerCount: 0,
          latestPlanSummary: null,
          latestBranchPrefix: null,
          latestCanonicalBranchName: null,
          workerCounts: {
            idle: 0,
            queued: 0,
            coding: 0,
            reviewing: 0,
            awaitingHumanApproval: 0,
            approved: 0,
            failed: 0,
          },
        }),
      ),
    ).toBe(THREAD_COMMAND_NO_ASSIGNMENT_REASON);
  });

  it("blocks archived and busy latest assignments", () => {
    expect(
      getThreadCommandDisabledReason(
        createThreadSummary({
          archivedAt: "2026-04-18T09:00:00.000Z",
        }),
      ),
    ).toContain("Archived threads are read-only");
    expect(
      getThreadCommandDisabledReason(
        createThreadSummary({
          workerCounts: {
            idle: 0,
            queued: 1,
            coding: 0,
            reviewing: 0,
            awaitingHumanApproval: 0,
            approved: 1,
            failed: 0,
          },
        }),
      ),
    ).toContain("latest assignment is idle");
  });

  it("blocks superseded and replanning latest assignments", () => {
    expect(
      getThreadCommandDisabledReason(
        createThreadSummary({
          latestAssignmentStatus: "superseded",
        }),
      ),
    ).toBe(THREAD_COMMAND_REPLANNING_REASON);
    expect(
      getThreadCommandDisabledReason(
        createThreadSummary({
          latestAssignmentStatus: "planning",
          workerCounts: {
            idle: 1,
            queued: 0,
            coding: 0,
            reviewing: 0,
            awaitingHumanApproval: 0,
            approved: 0,
            failed: 0,
          },
        }),
      ),
    ).toBe(THREAD_COMMAND_REPLANNING_REASON);
  });
});
