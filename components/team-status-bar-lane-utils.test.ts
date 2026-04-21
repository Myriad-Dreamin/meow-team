import { describe, expect, it } from "vitest";
import {
  buildTeamStatusLaneThreadBuckets,
  describeTeamStatusLanePopover,
  getNextTeamStatusLanePopoverState,
} from "@/components/team-status-bar-lane-utils";
import type { TeamThreadSummary } from "@/lib/team/history";
import type { TeamWorkerLaneRecord } from "@/lib/team/types";

const createLane = (overrides: Partial<TeamWorkerLaneRecord> = {}): TeamWorkerLaneRecord => ({
  laneId: "lane-1",
  laneIndex: 1,
  status: "queued",
  executionPhase: null,
  taskTitle: "Thread Tooltip on Status Lanes",
  taskObjective: "Show matching threads from status lane pills.",
  proposalChangeName: "status-lane-tooltip-a1-p1-thread-tooltip-on-status-lanes",
  proposalPath: "openspec/changes/status-lane-tooltip-a1-p1-thread-tooltip-on-status-lanes",
  workerSlot: 1,
  branchName: "requests/status-lane-tooltip/thread-1",
  baseBranch: "main",
  worktreePath: "/tmp/meow-1",
  latestImplementationCommit: null,
  pushedCommit: null,
  latestCoderHandoff: null,
  latestReviewerHandoff: null,
  latestDecision: null,
  latestCoderSummary: null,
  latestReviewerSummary: null,
  latestActivity: null,
  approvalRequestedAt: null,
  approvalGrantedAt: null,
  queuedAt: "2026-04-16T10:00:00.000Z",
  runCount: 1,
  revisionCount: 0,
  requeueReason: null,
  lastError: null,
  pullRequest: null,
  events: [],
  startedAt: "2026-04-16T10:00:00.000Z",
  finishedAt: null,
  updatedAt: "2026-04-16T10:05:00.000Z",
  ...overrides,
});

const createThread = (overrides: Partial<TeamThreadSummary> = {}): TeamThreadSummary => ({
  threadId: "abcd1234efgh5678",
  assignmentNumber: 1,
  status: "running",
  archivedAt: null,
  requestTitle: "Status lane tooltip",
  requestText: "Show matching living threads from status pills.",
  latestInput: "Show matching living threads from status pills.",
  repository: null,
  workflow: ["planner", "coder", "reviewer"],
  latestRoleId: "coder",
  latestRoleName: "Coder",
  nextRoleId: "reviewer",
  latestDecision: "continue",
  handoffCount: 1,
  stepCount: 0,
  userMessageCount: 1,
  startedAt: "2026-04-16T09:55:00.000Z",
  finishedAt: null,
  updatedAt: "2026-04-16T10:05:00.000Z",
  lastError: null,
  plannerRetryAwaitingConfirmation: false,
  latestAssignmentStatus: "running",
  latestPlanSummary: "Implement lane tooltip interactions.",
  latestBranchPrefix: "requests/status-lane-tooltip",
  latestCanonicalBranchName: "requests/status-lane-tooltip/thread-1",
  dispatchWorkerCount: 1,
  workerCounts: {
    idle: 0,
    queued: 1,
    coding: 0,
    reviewing: 0,
    awaitingHumanApproval: 0,
    approved: 0,
    failed: 0,
  },
  workerLanes: [createLane()],
  plannerNotes: [],
  humanFeedback: [],
  ...overrides,
});

describe("buildTeamStatusLaneThreadBuckets", () => {
  it("groups living threads by lane status and collapses repeated same-status matches", () => {
    const buckets = buildTeamStatusLaneThreadBuckets([
      createThread({
        threadId: "queued1234alpha5678",
        requestTitle: "Queued tooltip thread",
        workerLanes: [
          createLane({
            laneId: "lane-queued-1",
            status: "queued",
          }),
          createLane({
            laneId: "lane-queued-2",
            laneIndex: 2,
            status: "queued",
          }),
          createLane({
            laneId: "lane-coding-1",
            laneIndex: 3,
            status: "coding",
          }),
        ],
      }),
      createThread({
        threadId: "review9876beta5432",
        requestTitle: "Review tooltip thread",
        workerLanes: [
          createLane({
            laneId: "lane-review-1",
            status: "reviewing",
          }),
        ],
      }),
    ]);

    expect(buckets.queued).toEqual([
      {
        threadId: "queued1234alpha5678",
        title: "Queued tooltip thread",
        shortThreadId: "queued12",
        matchingLaneCount: 2,
      },
    ]);
    expect(buckets.coding).toEqual([
      {
        threadId: "queued1234alpha5678",
        title: "Queued tooltip thread",
        shortThreadId: "queued12",
        matchingLaneCount: 1,
      },
    ]);
    expect(buckets.reviewing).toEqual([
      {
        threadId: "review9876beta5432",
        title: "Review tooltip thread",
        shortThreadId: "review98",
        matchingLaneCount: 1,
      },
    ]);
    expect(buckets.awaitingHumanApproval).toEqual([]);
    expect(buckets.approved).toEqual([]);
    expect(buckets.failed).toEqual([]);
  });

  it("skips archived threads, ignores idle lanes, and falls back to the short thread id for blank titles", () => {
    const buckets = buildTeamStatusLaneThreadBuckets([
      createThread({
        threadId: "failed1111archived",
        archivedAt: "2026-04-16T10:10:00.000Z",
        requestTitle: "Archived failed thread",
        workerLanes: [
          createLane({
            laneId: "lane-failed-1",
            status: "failed",
          }),
        ],
      }),
      createThread({
        threadId: "blank9999title0000",
        requestTitle: "   ",
        workerLanes: [
          createLane({
            laneId: "lane-idle-1",
            status: "idle",
          }),
          createLane({
            laneId: "lane-approved-1",
            laneIndex: 2,
            status: "approved",
          }),
        ],
      }),
    ]);

    expect(buckets.failed).toEqual([]);
    expect(buckets.approved).toEqual([
      {
        threadId: "blank9999title0000",
        title: "Thread blank999",
        shortThreadId: "blank999",
        matchingLaneCount: 1,
      },
    ]);
  });

  it("skips terminal living threads so only active threads contribute to lane pills", () => {
    const buckets = buildTeamStatusLaneThreadBuckets([
      createThread({
        threadId: "approved1111terminal",
        status: "approved",
        requestTitle: "Approved terminal thread",
        workerLanes: [
          createLane({
            laneId: "lane-approved-terminal",
            status: "approved",
          }),
        ],
      }),
      createThread({
        threadId: "approved2222active00",
        requestTitle: "Approved lane still active",
        workerLanes: [
          createLane({
            laneId: "lane-approved-active",
            status: "approved",
          }),
        ],
      }),
    ]);

    expect(buckets.approved).toEqual([
      {
        threadId: "approved2222active00",
        title: "Approved lane still active",
        shortThreadId: "approved",
        matchingLaneCount: 1,
      },
    ]);
  });
});

describe("describeTeamStatusLanePopover", () => {
  it("explains when one thread accounts for multiple matching lanes", () => {
    expect(
      describeTeamStatusLanePopover(
        [
          {
            threadId: "queued1234alpha5678",
            title: "Queued tooltip thread",
            shortThreadId: "queued12",
            matchingLaneCount: 2,
          },
        ],
        2,
      ),
    ).toEqual({
      summary: "2 lanes across 1 living thread",
      detail: "Rows collapse repeated same-status lane matches per thread.",
    });
  });

  it("flags when the polled lane count is ahead of the living-thread snapshot", () => {
    expect(
      describeTeamStatusLanePopover(
        [
          {
            threadId: "queued1234alpha5678",
            title: "Queued tooltip thread",
            shortThreadId: "queued12",
            matchingLaneCount: 1,
          },
        ],
        2,
      ),
    ).toEqual({
      summary: "2 lanes across 1 living thread",
      detail: "Thread summaries are still refreshing for this status.",
    });
  });
});

describe("getNextTeamStatusLanePopoverState", () => {
  it("keeps click as an open action when hover or focus already revealed the same lane", () => {
    expect(
      getNextTeamStatusLanePopoverState(
        {
          key: "queued",
          trigger: "hover",
        },
        "queued",
        "click",
      ),
    ).toEqual({
      key: "queued",
      trigger: "click",
    });

    expect(
      getNextTeamStatusLanePopoverState(
        {
          key: "reviewing",
          trigger: "focus",
        },
        "reviewing",
        "click",
      ),
    ).toEqual({
      key: "reviewing",
      trigger: "click",
    });
  });

  it("only closes on click when that lane was already opened by click", () => {
    const clickOpenState = {
      key: "queued",
      trigger: "click",
    } as const;

    expect(getNextTeamStatusLanePopoverState(clickOpenState, "queued", "hover")).toEqual(
      clickOpenState,
    );
    expect(getNextTeamStatusLanePopoverState(clickOpenState, "queued", "focus")).toEqual(
      clickOpenState,
    );
    expect(getNextTeamStatusLanePopoverState(clickOpenState, "queued", "click")).toBeNull();
    expect(getNextTeamStatusLanePopoverState(clickOpenState, "coding", "click")).toEqual({
      key: "coding",
      trigger: "click",
    });
  });
});
