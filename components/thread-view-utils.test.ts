import { describe, expect, it } from "vitest";
import {
  formatCommitHash,
  getLaneBranchDisplay,
  getLaneCommitDisplay,
} from "@/components/thread-view-utils";
import type { TeamWorkerLaneRecord } from "@/lib/team/types";

const FIXED_TIMESTAMP = "2026-04-11T08:00:00.000Z";

const createLane = (overrides: Partial<TeamWorkerLaneRecord> = {}): TeamWorkerLaneRecord => {
  return {
    laneId: "lane-1",
    laneIndex: 1,
    status: "approved",
    taskTitle: "Ship the feature",
    taskObjective: "Publish the reviewed branch.",
    proposalChangeName: "change-1",
    proposalPath: "openspec/changes/change-1",
    workerSlot: null,
    branchName: "requests/example/a1-proposal-1",
    baseBranch: "main",
    worktreePath: "/tmp/meow-1",
    latestImplementationCommit: "1234567890abcdef1234567890abcdef12345678",
    pushedCommit: null,
    latestCoderHandoff: null,
    latestReviewerHandoff: null,
    latestDecision: "approved",
    latestCoderSummary: null,
    latestReviewerSummary: null,
    latestActivity: null,
    approvalRequestedAt: FIXED_TIMESTAMP,
    approvalGrantedAt: FIXED_TIMESTAMP,
    queuedAt: FIXED_TIMESTAMP,
    runCount: 1,
    revisionCount: 0,
    requeueReason: null,
    lastError: null,
    pullRequest: null,
    events: [],
    startedAt: FIXED_TIMESTAMP,
    finishedAt: FIXED_TIMESTAMP,
    updatedAt: FIXED_TIMESTAMP,
    ...overrides,
  };
};

describe("thread view commit helpers", () => {
  it("formats review commits when the lane has not been pushed yet", () => {
    const lane = createLane();

    expect(formatCommitHash("1234567890abcdef1234567890abcdef12345678")).toBe("1234567890ab");
    expect(getLaneBranchDisplay(lane)).toEqual({
      label: "Branch",
      value: "requests/example/a1-proposal-1",
      href: null,
    });
    expect(getLaneCommitDisplay(lane)).toEqual({
      label: "Review Commit",
      value: "1234567890ab",
      fullValue: "1234567890abcdef1234567890abcdef12345678",
      href: null,
    });
  });

  it("switches to GitHub commit and branch links after publish metadata is present", () => {
    const lane = createLane({
      pushedCommit: {
        remoteName: "origin",
        repositoryUrl: "https://github.com/example/meow-team",
        branchUrl: "https://github.com/example/meow-team/tree/requests/example/a1-proposal-1",
        commitUrl:
          "https://github.com/example/meow-team/commit/abcdefabcdefabcdefabcdefabcdefabcdefabcd",
        commitHash: "abcdefabcdefabcdefabcdefabcdefabcdefabcd",
        pushedAt: FIXED_TIMESTAMP,
      },
    });

    expect(getLaneBranchDisplay(lane)).toEqual({
      label: "GitHub Branch",
      value: "requests/example/a1-proposal-1",
      href: "https://github.com/example/meow-team/tree/requests/example/a1-proposal-1",
    });
    expect(getLaneCommitDisplay(lane)).toEqual({
      label: "GitHub Commit",
      value: "abcdefabcdef",
      fullValue: "abcdefabcdefabcdefabcdefabcdefabcdefabcd",
      href: "https://github.com/example/meow-team/commit/abcdefabcdefabcdefabcdefabcdefabcdefabcd",
    });
  });
});
