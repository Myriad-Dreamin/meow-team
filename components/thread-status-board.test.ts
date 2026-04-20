import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ThreadStatusBoard } from "@/components/thread-status-board";
import type { TeamThreadSummary } from "@/lib/team/history";
import type { TeamWorkerLaneRecord } from "@/lib/team/types";

const FIXED_TIMESTAMP = "2026-04-19T08:00:00.000Z";

const createLane = (overrides: Partial<TeamWorkerLaneRecord> = {}): TeamWorkerLaneRecord => ({
  laneId: "lane-1",
  laneIndex: 1,
  status: "cancelled",
  executionPhase: null,
  taskTitle: "Ship the feature",
  taskObjective: "Publish the reviewed branch.",
  proposalChangeName: "thread-cancel-a1-p1-add-cancel-for-approval-waiting-threads",
  proposalPath: "openspec/changes/thread-cancel-a1-p1-add-cancel-for-approval-waiting-threads",
  workerSlot: 1,
  branchName: "requests/thread-cancel/a1-proposal-1",
  baseBranch: "main",
  worktreePath: "/tmp/meow-1",
  latestImplementationCommit: "1234567890abcdef1234567890abcdef12345678",
  pushedCommit: null,
  latestCoderHandoff: null,
  latestReviewerHandoff: null,
  latestDecision: "approved",
  latestCoderSummary: null,
  latestReviewerSummary: null,
  latestActivity: "Human cancelled this request group while it was waiting for final approval.",
  approvalRequestedAt: FIXED_TIMESTAMP,
  approvalGrantedAt: FIXED_TIMESTAMP,
  queuedAt: FIXED_TIMESTAMP,
  runCount: 1,
  revisionCount: 0,
  requeueReason: null,
  lastError: null,
  pullRequest: {
    id: "pr-1",
    provider: "local-ci",
    title: "Ship the feature",
    summary: "Machine review approved the branch.",
    branchName: "requests/thread-cancel/a1-proposal-1",
    baseBranch: "main",
    status: "awaiting_human_approval",
    requestedAt: FIXED_TIMESTAMP,
    humanApprovalRequestedAt: FIXED_TIMESTAMP,
    humanApprovedAt: null,
    machineReviewedAt: FIXED_TIMESTAMP,
    updatedAt: FIXED_TIMESTAMP,
    url: null,
  },
  events: [],
  startedAt: FIXED_TIMESTAMP,
  finishedAt: FIXED_TIMESTAMP,
  updatedAt: FIXED_TIMESTAMP,
  ...overrides,
});

const createThread = (overrides: Partial<TeamThreadSummary> = {}): TeamThreadSummary => ({
  threadId: "thread-cancelled",
  assignmentNumber: 1,
  status: "cancelled",
  archivedAt: null,
  requestTitle: "Cancel the approval wait",
  requestText: "Stop the latest request group while it waits for final approval.",
  latestInput: "Stop the latest request group while it waits for final approval.",
  repository: null,
  workflow: ["planner", "coder", "reviewer"],
  latestRoleId: "reviewer",
  latestRoleName: "Reviewer",
  nextRoleId: null,
  latestDecision: "continue",
  handoffCount: 3,
  stepCount: 3,
  userMessageCount: 1,
  startedAt: FIXED_TIMESTAMP,
  finishedAt: FIXED_TIMESTAMP,
  updatedAt: FIXED_TIMESTAMP,
  lastError: null,
  latestAssignmentStatus: "cancelled",
  latestPlanSummary: "Cancel the stale approval wait.",
  latestBranchPrefix: "requests/thread-cancel",
  latestCanonicalBranchName: "requests/thread-cancel/a1-proposal-1",
  dispatchWorkerCount: 1,
  workerCounts: {
    idle: 0,
    queued: 0,
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

describe("ThreadStatusBoard", () => {
  it("renders cancelled final-approval lanes without stale PR approval copy", () => {
    const html = renderToStaticMarkup(
      createElement(ThreadStatusBoard, {
        initialThreads: [createThread()],
      }),
    );

    expect(html).toContain("Ship the feature");
    expect(html).toContain("Cancelled");
    expect(html).not.toContain("Awaiting Final Approval");
  });

  it("keeps feedback textareas on the explicit native-control styling path", () => {
    const html = renderToStaticMarkup(
      createElement(ThreadStatusBoard, {
        initialThreads: [
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
                latestDecision: "approved",
                latestActivity: "Machine review approved the proposal branch.",
                status: "approved",
              }),
            ],
          }),
        ],
      }),
    );

    const proposalFeedbackTag = html.match(
      /<textarea[^>]*placeholder="Adjust this proposal and replan the request group\."[^>]*>/,
    )?.[0];
    const requestGroupFeedbackTag = html.match(
      /<textarea[^>]*placeholder="Shift the overall request direction and ask the planner for a fresh proposal set\."[^>]*>/,
    )?.[0];

    expect(html).toContain('<span class="harness-form-label">Proposal Feedback</span>');
    expect(html).toContain('<span class="harness-form-label">Request-Group Feedback</span>');
    expect(proposalFeedbackTag).toContain('class="harness-native-control"');
    expect(requestGroupFeedbackTag).toContain('class="harness-native-control"');
  });
});
