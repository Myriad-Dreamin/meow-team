import { describe, expect, it } from "vitest";
import {
  getThreadCommandDisabledReason,
  parseThreadCommand,
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
    expect(() => parseThreadCommand("/replan 2")).toThrowError(ThreadCommandParseError);
    expect(() => parseThreadCommand("/replan-all")).toThrowError(ThreadCommandParseError);
    expect(() => parseThreadCommand("/unknown")).toThrowError(ThreadCommandParseError);
  });
});

describe("getThreadCommandDisabledReason", () => {
  it("allows idle living threads", () => {
    expect(getThreadCommandDisabledReason(createThreadSummary())).toBeNull();
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
});
