import { describe, expect, it } from "vitest";
import {
  collectThreadAttentionNotifications,
  mergeStoredAttentionFingerprints,
  selectUndeliveredAttentionNotifications,
} from "@/components/thread-attention-utils";
import type { TeamThreadSummary } from "@/lib/team/history";
import type { TeamWorkerLaneRecord } from "@/lib/team/types";

const createLane = (overrides: Partial<TeamWorkerLaneRecord> = {}): TeamWorkerLaneRecord => ({
  laneId: "lane-1",
  laneIndex: 1,
  status: "queued",
  taskTitle: "Notify on Attention-Needed Threads",
  taskObjective: "Add desktop alerts for approval waits and failures.",
  proposalChangeName: "desktop-attention-a1-p1-notify-on-attention-needed-threads",
  proposalPath: "openspec/changes/desktop-attention-a1-p1-notify-on-attention-needed-threads",
  workerSlot: 1,
  branchName: "requests/desktop-attention/thread-1",
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
  queuedAt: "2026-04-11T10:00:00.000Z",
  runCount: 1,
  revisionCount: 0,
  requeueReason: null,
  lastError: null,
  pullRequest: null,
  events: [],
  startedAt: "2026-04-11T10:00:00.000Z",
  finishedAt: null,
  updatedAt: "2026-04-11T10:05:00.000Z",
  ...overrides,
});

const createThread = (overrides: Partial<TeamThreadSummary> = {}): TeamThreadSummary => ({
  threadId: "thread-12345678",
  assignmentNumber: 1,
  status: "running",
  requestTitle: "Desktop attention alerts",
  requestText: "Add desktop attention alerts.",
  latestInput: "Add desktop attention alerts.",
  repository: null,
  workflow: ["planner", "coder", "reviewer"],
  latestRoleId: "planner",
  latestRoleName: "Planner",
  nextRoleId: "coder",
  latestDecision: "continue",
  handoffCount: 1,
  stepCount: 0,
  userMessageCount: 1,
  startedAt: "2026-04-11T09:55:00.000Z",
  finishedAt: null,
  updatedAt: "2026-04-11T10:05:00.000Z",
  lastError: null,
  latestAssignmentStatus: "running",
  latestPlanSummary: "Waiting on coding lanes.",
  latestBranchPrefix: "requests/desktop-attention",
  latestCanonicalBranchName: "requests/desktop-attention/thread-1",
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

describe("collectThreadAttentionNotifications", () => {
  it("creates approval and lane-failure notifications from worker lane states", () => {
    const approvalLane = createLane({
      laneId: "lane-approval",
      laneIndex: 1,
      status: "awaiting_human_approval",
      approvalRequestedAt: "2026-04-11T10:04:00.000Z",
      updatedAt: "2026-04-11T10:04:30.000Z",
    });
    const failedLane = createLane({
      laneId: "lane-failed",
      laneIndex: 2,
      status: "failed",
      finishedAt: "2026-04-11T10:05:00.000Z",
      lastError: "Reviewer lane exited with status 1.",
      updatedAt: "2026-04-11T10:05:00.000Z",
    });

    const notifications = collectThreadAttentionNotifications([
      createThread({
        status: "running",
        workerCounts: {
          idle: 0,
          queued: 0,
          coding: 0,
          reviewing: 0,
          awaitingHumanApproval: 1,
          approved: 0,
          failed: 1,
        },
        workerLanes: [approvalLane, failedLane],
      }),
    ]);

    expect(notifications).toHaveLength(2);
    expect(notifications).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          laneId: "lane-approval",
          reason: "awaiting_human_approval",
          title: "Desktop attention alerts requires approval",
          body: expect.stringContaining("Proposal 1 is waiting for human approval"),
          fingerprint: expect.stringContaining("lane-approval:awaiting_human_approval"),
        }),
        expect.objectContaining({
          laneId: "lane-failed",
          reason: "lane_failed",
          title: "Desktop attention alerts failed",
          body: expect.stringContaining("Proposal 2 failed"),
          fingerprint: expect.stringContaining("lane-failed:lane_failed"),
        }),
      ]),
    );
  });

  it("treats machine-reviewed final approval waits as attention-needed", () => {
    const notifications = collectThreadAttentionNotifications([
      createThread({
        status: "approved",
        latestAssignmentStatus: "approved",
        workerCounts: {
          idle: 0,
          queued: 0,
          coding: 0,
          reviewing: 0,
          awaitingHumanApproval: 0,
          approved: 1,
          failed: 0,
        },
        workerLanes: [
          createLane({
            laneId: "lane-reviewed",
            status: "approved",
            updatedAt: "2026-04-11T10:08:00.000Z",
            pullRequest: {
              id: "pr-1",
              provider: "local-ci",
              title: "Ready for merge",
              summary: "Machine review approved the branch.",
              branchName: "requests/desktop-attention/thread-1",
              baseBranch: "main",
              status: "awaiting_human_approval",
              requestedAt: "2026-04-11T10:07:00.000Z",
              humanApprovalRequestedAt: "2026-04-11T10:07:00.000Z",
              humanApprovedAt: null,
              machineReviewedAt: "2026-04-11T10:07:00.000Z",
              updatedAt: "2026-04-11T10:08:00.000Z",
              url: null,
            },
          }),
        ],
      }),
    ]);

    expect(notifications).toEqual([
      expect.objectContaining({
        laneId: "lane-reviewed",
        reason: "awaiting_human_approval",
        body: expect.stringContaining("final human approval"),
        fingerprint: expect.stringContaining("lane-reviewed:awaiting_human_approval"),
      }),
    ]);
  });

  it("falls back to a thread-level failure when no worker lane failed", () => {
    const notifications = collectThreadAttentionNotifications([
      createThread({
        status: "failed",
        lastError: "Planner crashed before lane dispatch.",
        finishedAt: "2026-04-11T10:06:00.000Z",
        updatedAt: "2026-04-11T10:06:00.000Z",
        workerCounts: {
          idle: 0,
          queued: 0,
          coding: 0,
          reviewing: 0,
          awaitingHumanApproval: 0,
          approved: 0,
          failed: 0,
        },
        workerLanes: [],
      }),
    ]);

    expect(notifications).toEqual([
      expect.objectContaining({
        laneId: null,
        reason: "thread_failed",
        body: "Thread thread-1 failed. Planner crashed before lane dispatch.",
        fingerprint: "thread:thread-12345678:failed:2026-04-11T10:06:00.000Z:1",
      }),
    ]);
  });
});

describe("selectUndeliveredAttentionNotifications", () => {
  it("keeps active notifications pending until desktop delivery is available", () => {
    const notifications = collectThreadAttentionNotifications([
      createThread({
        workerCounts: {
          idle: 0,
          queued: 0,
          coding: 0,
          reviewing: 0,
          awaitingHumanApproval: 1,
          approved: 0,
          failed: 0,
        },
        workerLanes: [
          createLane({
            laneId: "lane-approval",
            status: "awaiting_human_approval",
            approvalRequestedAt: "2026-04-11T10:04:00.000Z",
          }),
        ],
      }),
      createThread({
        threadId: "thread-87654321",
        requestTitle: "Broken review lane",
        status: "failed",
        latestAssignmentStatus: "failed",
        lastError: "Reviewer failed.",
        finishedAt: "2026-04-11T10:06:00.000Z",
        updatedAt: "2026-04-11T10:06:00.000Z",
        workerCounts: {
          idle: 0,
          queued: 0,
          coding: 0,
          reviewing: 0,
          awaitingHumanApproval: 0,
          approved: 0,
          failed: 0,
        },
        workerLanes: [],
      }),
    ]);
    const deliveredFingerprints = new Set<string>();

    expect(
      selectUndeliveredAttentionNotifications({
        nextNotifications: notifications,
        deliveredFingerprints,
        deliveryAvailable: false,
      }),
    ).toEqual([]);

    expect(
      selectUndeliveredAttentionNotifications({
        nextNotifications: notifications,
        deliveredFingerprints,
        deliveryAvailable: true,
      }),
    ).toEqual(notifications);

    const nextDeliveredFingerprints = new Set(
      mergeStoredAttentionFingerprints(
        deliveredFingerprints,
        notifications.map((notification) => notification.fingerprint),
      ),
    );

    expect(
      selectUndeliveredAttentionNotifications({
        nextNotifications: notifications,
        deliveredFingerprints: nextDeliveredFingerprints,
        deliveryAvailable: true,
      }),
    ).toEqual([]);
  });
});
