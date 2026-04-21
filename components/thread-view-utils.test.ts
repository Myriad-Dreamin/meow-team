import { describe, expect, it } from "vitest";
import {
  canArchiveThread,
  canRestartPlanning,
  describeLane,
  formatAssignmentStatusLabel,
  formatPoolSlot,
  formatCommitHash,
  getLaneApprovalAction,
  getLaneApprovalActions,
  groupThreadLogEntries,
  getLaneBranchDisplay,
  getLaneCommitDisplay,
  getLanePullRequestStatusLabel,
  getLaneStatusClassName,
  getLaneStatusLabel,
  mergeThreadLogGroups,
  selectPrimaryLane,
} from "@/components/thread-view-utils";
import type { TeamThreadSummary } from "@/lib/team/history";
import type { TeamCodexLogCursorEntry, TeamWorkerLaneRecord } from "@/lib/team/types";

const FIXED_TIMESTAMP = "2026-04-11T08:00:00.000Z";

const createLane = (overrides: Partial<TeamWorkerLaneRecord> = {}): TeamWorkerLaneRecord => {
  return {
    laneId: "lane-1",
    laneIndex: 1,
    status: "approved",
    executionPhase: null,
    taskTitle: "Ship the feature",
    taskObjective: "Publish the reviewed branch.",
    proposalChangeName: "change-1",
    proposalPath: "openspec/changes/change-1",
    finalizationMode: null,
    proposalDisposition: "active",
    finalizationCheckpoint: null,
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

const createLogEntry = (
  index: number,
  overrides: Partial<TeamCodexLogCursorEntry> = {},
): TeamCodexLogCursorEntry => {
  return {
    id: `entry-${index}`,
    threadId: "thread-1",
    assignmentNumber: 1,
    roleId: "coder",
    laneId: "lane-1",
    source: "stdout",
    message: `line ${index}`,
    createdAt: `2026-04-11T08:00:0${index}.000Z`,
    startCursor: index * 10,
    endCursor: index * 10 + 9,
    ...overrides,
  };
};

const createThread = (overrides: Partial<TeamThreadSummary> = {}): TeamThreadSummary => {
  return {
    threadId: "thread-1",
    assignmentNumber: 1,
    status: "completed",
    archivedAt: null,
    requestTitle: "Archive thread",
    requestText: "Archive the finished thread.",
    latestInput: "Archive the finished thread.",
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
    plannerRetryAwaitingConfirmation: false,
    latestAssignmentStatus: "completed",
    latestPlanSummary: "Thread is complete.",
    latestBranchPrefix: "requests/archive-thread",
    latestCanonicalBranchName: "requests/archive-thread/a1-proposal-1",
    dispatchWorkerCount: 1,
    workerCounts: {
      idle: 0,
      queued: 0,
      coding: 0,
      reviewing: 0,
      awaitingHumanApproval: 0,
      approved: 1,
      failed: 0,
    },
    workerLanes: [],
    plannerNotes: [],
    humanFeedback: [],
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

    expect(getLaneApprovalActions(lane)).toEqual([
      {
        key: "approve-proposal",
        target: "proposal",
        buttonLabel: "Approve Proposal",
        pendingLabel: "Queueing proposal...",
        successNotice:
          "Proposal approval recorded. The draft GitHub PR is synced and the coding-review queue is refreshing.",
        errorFallback: "Unable to approve this proposal.",
      },
    ]);
    expect(describeLane(lane)).toContain("waiting for human approval");
  });

  it("surfaces both finalization modes in machine-reviewed state and hides them once finalization starts", () => {
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

    expect(getLaneApprovalActions(lane)).toEqual([
      {
        key: "approve-archive",
        target: "pull_request",
        finalizationMode: "archive",
        buttonLabel: "Approve and Archive",
        pendingLabel: "Queueing archive finalization...",
        successNotice:
          "Archive finalization recorded. The reviewed branch is archiving the OpenSpec change and refreshing the GitHub PR.",
        errorFallback: "Unable to queue archive finalization.",
      },
      {
        key: "approve-delete",
        target: "pull_request",
        finalizationMode: "delete",
        buttonLabel: "Approve and Delete",
        pendingLabel: "Queueing delete finalization...",
        successNotice:
          "Delete finalization recorded. The reviewed branch is deleting the OpenSpec change and refreshing the GitHub PR.",
        errorFallback: "Unable to queue delete finalization.",
      },
    ]);
    expect(describeLane(lane)).toContain("refresh the existing GitHub PR");

    expect(
      getLaneApprovalActions({
        ...lane,
        finalizationMode: "archive",
        finalizationCheckpoint: "requested",
        pullRequest: {
          ...lane.pullRequest!,
          humanApprovedAt: "2026-04-11T09:00:00.000Z",
        },
      }),
    ).toEqual([]);
  });

  it("marks finalized lanes as completed and exposes mode-specific retry after finalization failures", () => {
    const finalizedLane = createLane({
      finalizationMode: "delete",
      proposalDisposition: "deleted",
      finalizationCheckpoint: "completed",
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
      finalizationMode: "delete",
      proposalDisposition: "deleted",
      finalizationCheckpoint: "branch_pushed",
      pullRequest: {
        ...finalizedLane.pullRequest!,
        provider: "local-ci",
        status: "failed",
        url: null,
      },
    });

    expect(getLaneStatusLabel(finalizedLane)).toBe("Completed");
    expect(getLaneStatusClassName(finalizedLane)).toBe("status-completed");
    expect(describeLane(finalizedLane)).toContain("deleted this lane's OpenSpec change");
    expect(getLaneApprovalActions(failedLane)).toEqual([
      {
        key: "retry-delete",
        target: "pull_request",
        finalizationMode: "delete",
        buttonLabel: "Retry Delete Finalization",
        pendingLabel: "Retrying delete finalization...",
        successNotice:
          "Delete finalization retried. The reviewed branch is resuming OpenSpec deletion and GitHub PR refresh.",
        errorFallback: "Unable to retry delete finalization.",
      },
    ]);
  });

  it("renders cancelled request groups with terminal copy and no approval controls", () => {
    const lane = createLane({
      status: "cancelled",
      latestActivity:
        "Human cancelled this request group while it was waiting for proposal approval.",
      finishedAt: "2026-04-11T09:00:00.000Z",
    });

    expect(getLaneApprovalAction(lane)).toBeNull();
    expect(getLaneStatusLabel(lane)).toBe("Cancelled");
    expect(getLaneStatusClassName(lane)).toBe("status-cancelled");
    expect(describeLane(lane)).toContain("cancelled this request group");
    expect(formatAssignmentStatusLabel("cancelled")).toBe("Cancelled");
  });

  it("renders cancelled PR strips with the cancelled lifecycle label", () => {
    const lane = createLane({
      status: "cancelled",
      latestActivity: "Human cancelled this request group while it was waiting for final approval.",
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

    expect(getLanePullRequestStatusLabel(lane)).toBe("Cancelled");
  });

  it("shows archive-specific labels and messaging while the final archive pass is running", () => {
    const lane = createLane({
      status: "coding",
      executionPhase: "final_archive",
      latestActivity: "Coder is running non-interactive /opsx:archive change-1 for final approval.",
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
        humanApprovedAt: FIXED_TIMESTAMP,
        machineReviewedAt: FIXED_TIMESTAMP,
        updatedAt: FIXED_TIMESTAMP,
        url: null,
      },
    });

    expect(getLaneStatusLabel(lane)).toBe("Archiving");
    expect(describeLane(lane)).toContain("/opsx:archive");
    expect(getLaneApprovalActions(lane)).toEqual([]);
  });

  it("shows delete-specific labels and retry messaging while delete finalization is running or failed", () => {
    const lane = createLane({
      executionPhase: "final_archive",
      finalizationMode: "delete",
      finalizationCheckpoint: "artifacts_applied",
      latestActivity:
        "Final approval deleted the OpenSpec change and is pushing the refreshed branch head.",
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
        humanApprovedAt: FIXED_TIMESTAMP,
        machineReviewedAt: FIXED_TIMESTAMP,
        updatedAt: FIXED_TIMESTAMP,
        url: null,
      },
      status: "coding",
    });

    expect(getLaneStatusLabel(lane)).toBe("Deleting");
    expect(describeLane(lane)).toContain("deleted the OpenSpec change");

    expect(
      getLaneApprovalActions({
        ...lane,
        executionPhase: null,
        status: "approved",
        pullRequest: {
          ...lane.pullRequest!,
          status: "failed",
        },
      }),
    ).toEqual([
      {
        key: "retry-delete",
        target: "pull_request",
        finalizationMode: "delete",
        buttonLabel: "Retry Delete Finalization",
        pendingLabel: "Retrying delete finalization...",
        successNotice:
          "Delete finalization retried. The reviewed branch is resuming OpenSpec deletion and GitHub PR refresh.",
        errorFallback: "Unable to retry delete finalization.",
      },
    ]);
  });
});

describe("thread view primary lane helpers", () => {
  it("formats pool slots with the corrected meow label", () => {
    expect(formatPoolSlot(4)).toBe("meow-4");
    expect(formatPoolSlot(null)).toBe("Waiting for pool");
  });

  it("prefers the freshest non-idle lane with branch or PR data for the header strip", () => {
    const primaryLane = selectPrimaryLane([
      createLane({
        laneId: "idle-lane",
        laneIndex: 1,
        status: "idle",
        updatedAt: "2026-04-11T12:00:00.000Z",
      }),
      createLane({
        laneId: "assigned-no-branch",
        laneIndex: 2,
        status: "queued",
        branchName: null,
        updatedAt: "2026-04-11T12:30:00.000Z",
      }),
      createLane({
        laneId: "coding-branch",
        laneIndex: 3,
        status: "coding",
        branchName: "requests/example/a1-proposal-3",
        updatedAt: "2026-04-11T13:00:00.000Z",
      }),
    ]);

    expect(primaryLane?.laneId).toBe("coding-branch");
  });

  it("falls back to the newest assigned lane when no branch or PR metadata exists", () => {
    const primaryLane = selectPrimaryLane([
      createLane({
        laneId: "idle-lane",
        laneIndex: 1,
        status: "idle",
        taskTitle: null,
        taskObjective: null,
      }),
      createLane({
        laneId: "queued-lane",
        laneIndex: 2,
        status: "queued",
        branchName: null,
        pullRequest: null,
        updatedAt: "2026-04-11T13:00:00.000Z",
      }),
    ]);

    expect(primaryLane?.laneId).toBe("queued-lane");
  });
});

describe("thread visibility helpers", () => {
  it("blocks replanning for archived thread summaries", () => {
    expect(canRestartPlanning(createThread())).toBe(true);
    expect(canRestartPlanning(createThread({ archivedAt: FIXED_TIMESTAMP }))).toBe(false);
    expect(
      canRestartPlanning(
        createThread({
          workerCounts: {
            idle: 0,
            queued: 1,
            coding: 0,
            reviewing: 0,
            awaitingHumanApproval: 0,
            approved: 0,
            failed: 0,
          },
        }),
      ),
    ).toBe(false);
  });

  it("only allows archiving inactive, unarchived thread summaries", () => {
    expect(canArchiveThread(createThread())).toBe(true);
    expect(
      canArchiveThread(createThread({ status: "cancelled", latestAssignmentStatus: "cancelled" })),
    ).toBe(true);
    expect(canArchiveThread(createThread({ status: "running" }))).toBe(false);
    expect(canArchiveThread(createThread({ status: "planning" }))).toBe(false);
    expect(canArchiveThread(createThread({ latestAssignmentStatus: "approved" }))).toBe(false);
    expect(canArchiveThread(createThread({ archivedAt: FIXED_TIMESTAMP }))).toBe(false);
  });
});

describe("thread log grouping helpers", () => {
  it("groups consecutive log entries that share the same source and lane context", () => {
    const groupedEntries = groupThreadLogEntries([
      createLogEntry(1, { message: "alpha", source: "stdout" }),
      createLogEntry(2, { message: "beta", source: "stdout" }),
      createLogEntry(3, { message: "stderr", source: "stderr" }),
    ]);

    expect(groupedEntries).toHaveLength(2);
    expect(groupedEntries[0]).toMatchObject({
      lineCount: 2,
      message: "alpha\nbeta",
      preview: "alpha",
      source: "stdout",
    });
    expect(groupedEntries[1]).toMatchObject({
      lineCount: 1,
      message: "stderr",
      source: "stderr",
    });
  });

  it("merges boundary groups when paged log windows split one contiguous block", () => {
    const currentGroups = groupThreadLogEntries([
      createLogEntry(3, { message: "tail 1", source: "stderr" }),
      createLogEntry(4, { message: "tail 2", source: "stderr" }),
    ]);
    const olderGroups = groupThreadLogEntries([
      createLogEntry(1, { message: "head 1", source: "stderr" }),
      createLogEntry(2, { message: "head 2", source: "stderr" }),
    ]);

    expect(mergeThreadLogGroups(currentGroups, olderGroups, "prepend")).toEqual([
      expect.objectContaining({
        lineCount: 4,
        message: "head 1\nhead 2\ntail 1\ntail 2",
        source: "stderr",
      }),
    ]);
  });
});
