import { describe, expect, it } from "vitest";
import { buildTeamNotificationsResponse } from "@/lib/team/notifications";
import type { TeamThreadSummary } from "@/lib/team/history";
import type { TeamWorkerLaneRecord } from "@/lib/team/types";

const createLane = (overrides: Partial<TeamWorkerLaneRecord> = {}): TeamWorkerLaneRecord => ({
  laneId: "lane-1",
  laneIndex: 1,
  status: "queued",
  executionPhase: null,
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
  archivedAt: null,
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
  plannerRetryAwaitingConfirmation: false,
  latestAssignmentStatus: "running",
  latestPlanSummary: "Waiting on coding lanes.",
  latestBranchPrefix: "requests/desktop-attention",
  latestCanonicalBranchName: "requests/desktop-attention/thread-1",
  dispatchWorkerCount: 1,
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
      status: "awaiting_human_approval",
      approvalRequestedAt: "2026-04-11T10:04:00.000Z",
      updatedAt: "2026-04-11T10:04:30.000Z",
    }),
  ],
  plannerNotes: [],
  humanFeedback: [],
  ...overrides,
});

describe("buildTeamNotificationsResponse", () => {
  it("packages active attention notifications with the backend target", () => {
    const response = buildTeamNotificationsResponse({
      generatedAt: "2026-04-14T00:00:00.000Z",
      target: "vscode",
      threads: [createThread()],
    });

    expect(response.generatedAt).toBe("2026-04-14T00:00:00.000Z");
    expect(response.target).toBe("vscode");
    expect(response.notifications).toEqual([
      expect.objectContaining({
        reason: "awaiting_human_approval",
        threadId: "thread-12345678",
      }),
    ]);
  });
});
