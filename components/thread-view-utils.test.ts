import { describe, expect, it } from "vitest";
import {
  describeLane,
  formatCommitHash,
  getLaneApprovalAction,
  getLaneBranchDisplay,
  getLaneCommitDisplay,
  getLaneStatusClassName,
  getLaneStatusLabel,
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

describe("thread view approval helpers", () => {
  it("surfaces proposal approval before coding starts", () => {
    const lane = createLane({
      status: "awaiting_human_approval",
      pullRequest: null,
    });

    expect(getLaneApprovalAction(lane)).toEqual({
      target: "proposal",
      buttonLabel: "Approve Proposal",
      pendingLabel: "Queueing proposal...",
      successNotice: "Proposal approval recorded. The coding-review queue is refreshing.",
      errorFallback: "Unable to approve this proposal.",
    });
    expect(describeLane(lane)).toContain("waiting for human approval");
  });

  it("surfaces final approval in machine-reviewed state and hides it once finalization starts", () => {
    const lane = createLane({
      pullRequest: {
        id: "pr-1",
        provider: "local-ci",
        title: "Ship the feature",
        summary: "Machine review approved the branch.",
        branchName: "requests/example/a1-proposal-1",
        baseBranch: "main",
        status: "awaiting_human_approval",
        requestedAt: FIXED_TIMESTAMP,
        humanApprovalRequestedAt: FIXED_TIMESTAMP,
        humanApprovedAt: null,
        machineReviewedAt: FIXED_TIMESTAMP,
        updatedAt: FIXED_TIMESTAMP,
        url: null,
      },
    });

    expect(getLaneApprovalAction(lane)).toEqual({
      target: "pull_request",
      buttonLabel: "Approve and Open PR",
      pendingLabel: "Archiving and opening PR...",
      successNotice:
        "Final approval recorded. The OpenSpec change was archived and the GitHub PR was refreshed.",
      errorFallback: "Unable to finalize this reviewed branch.",
    });
    expect(describeLane(lane)).toContain("open or refresh the GitHub PR");

    expect(
      getLaneApprovalAction({
        ...lane,
        pullRequest: {
          ...lane.pullRequest!,
          humanApprovedAt: "2026-04-11T09:00:00.000Z",
        },
      }),
    ).toBeNull();
  });

  it("marks finalized lanes as completed and exposes retry after finalization failures", () => {
    const finalizedLane = createLane({
      pullRequest: {
        id: "pr-1",
        provider: "github",
        title: "Ship the feature",
        summary: "Machine review approved the branch.",
        branchName: "requests/example/a1-proposal-1",
        baseBranch: "main",
        status: "approved",
        requestedAt: FIXED_TIMESTAMP,
        humanApprovalRequestedAt: FIXED_TIMESTAMP,
        humanApprovedAt: FIXED_TIMESTAMP,
        machineReviewedAt: FIXED_TIMESTAMP,
        updatedAt: FIXED_TIMESTAMP,
        url: "https://github.com/example/meow-team/pull/42",
      },
    });
    const failedLane = createLane({
      pullRequest: {
        ...finalizedLane.pullRequest!,
        provider: "local-ci",
        status: "failed",
        url: null,
      },
    });

    expect(getLaneStatusLabel(finalizedLane)).toBe("Completed");
    expect(getLaneStatusClassName(finalizedLane)).toBe("status-completed");
    expect(describeLane(finalizedLane)).toContain("GitHub PR");
    expect(getLaneApprovalAction(failedLane)).toEqual({
      target: "pull_request",
      buttonLabel: "Retry Finalization",
      pendingLabel: "Retrying finalization...",
      successNotice:
        "Finalization retried. The OpenSpec change was archived and the GitHub PR was refreshed.",
      errorFallback: "Unable to retry GitHub PR finalization.",
    });
  });
});
