import "server-only";

import { teamConfig } from "@/team.config";
import { ensureBranchRef, getBranchHead } from "@/lib/git/ops";
import { synchronizePullRequest } from "@/lib/platform";
import { pushLaneBranch } from "@/lib/team/git";
import {
  getTeamThreadRecord,
  synchronizeDispatchAssignment,
  updateTeamThreadRecord,
} from "@/lib/team/history";
import {
  appendLaneEvent,
  appendPlannerNote,
  buildProposalApprovalPullRequestDraft,
  createPullRequestRecord,
  findAssignment,
  findLane,
  resolveAssignmentCanonicalBranchName,
  summarizeGitFailure,
  type TeamRunCodingStageState,
  type TeamRunEnv,
  type TeamRunReviewingStageState,
} from "@/lib/team/coding/shared";
import { findPersistedLane, isLaneQueuedForExecution } from "@/lib/team/coding/plan";
import { ensurePendingDispatchWork } from "@/lib/team/coding/reviewing";
import { formatCommitActivityReference } from "@/lib/team/activity-markdown";
import type { Worktree } from "@/lib/team/coding/worktree";
import type { TeamWorkerLaneRecord } from "@/lib/team/types";

const resolveProposalCommitForApproval = async ({
  repositoryPath,
  laneBranchName,
  canonicalBranchName,
  threadWorktree,
}: {
  repositoryPath: string;
  laneBranchName: string;
  canonicalBranchName: string | null;
  threadWorktree: Worktree | null;
}): Promise<string> => {
  if (canonicalBranchName) {
    try {
      await ensureBranchRef({
        repositoryPath,
        branchName: laneBranchName,
        startPoint: canonicalBranchName,
      });
    } catch {
      // Keep approval resilient when a legacy or cleaned-up branch ref must be
      // recovered from the claimed thread worktree instead.
    }
  }

  try {
    return await getBranchHead({
      repositoryPath,
      branchName: laneBranchName,
    });
  } catch (branchError) {
    if (!threadWorktree?.path) {
      throw branchError;
    }

    try {
      const proposalCommit = await getBranchHead({
        repositoryPath: threadWorktree.path,
        branchName: "HEAD",
      });
      await ensureBranchRef({
        repositoryPath,
        branchName: laneBranchName,
        startPoint: proposalCommit,
        forceUpdate: true,
      });
      return proposalCommit;
    } catch (worktreeError) {
      const branchMessage =
        branchError instanceof Error ? branchError.message : "Unknown branch lookup failure.";
      const worktreeMessage =
        worktreeError instanceof Error
          ? worktreeError.message
          : "Unknown thread worktree recovery failure.";
      throw new Error(
        `Unable to resolve proposal branch ${laneBranchName} for approval. Branch lookup failed (${branchMessage}). Recovery from claimed thread worktree HEAD at ${threadWorktree.path} also failed (${worktreeMessage}).`,
      );
    }
  }
};

export const approveLaneProposal = async ({
  env,
  threadId,
  assignmentNumber,
  laneId,
  worktree,
}: {
  env: TeamRunEnv;
  threadId: string;
  assignmentNumber: number;
  laneId: string;
  worktree?: Worktree;
}): Promise<void> => {
  const thread = await getTeamThreadRecord(teamConfig.storage.threadFile, threadId);
  if (!thread) {
    throw new Error(`Thread ${threadId} was not found in ${teamConfig.storage.threadFile}.`);
  }

  const assignment = findAssignment(thread.dispatchAssignments, assignmentNumber);
  const lane = findLane(assignment, laneId);

  if (lane.status !== "awaiting_human_approval") {
    throw new Error("This proposal is not waiting for human approval.");
  }

  if (!assignment.repository) {
    throw new Error("Approving a proposal requires a repository.");
  }

  if (!lane.branchName || !lane.baseBranch) {
    throw new Error("This proposal is missing the branch metadata required for approval.");
  }

  const threadWorktree = worktree ?? thread.data.threadWorktree;
  if (!threadWorktree?.slot) {
    throw new Error("This proposal is missing the claimed thread worktree required for approval.");
  }

  const pullRequestDraft = buildProposalApprovalPullRequestDraft({
    assignment,
    lane,
  });
  const resolvedCanonicalBranchName = resolveAssignmentCanonicalBranchName({
    threadId,
    assignment,
  });
  const proposalCommit = await resolveProposalCommitForApproval({
    repositoryPath: assignment.repository.path,
    laneBranchName: lane.branchName,
    canonicalBranchName: resolvedCanonicalBranchName,
    threadWorktree,
  });

  let pushedCommit: Awaited<ReturnType<typeof pushLaneBranch>> | null = null;

  try {
    pushedCommit = await pushLaneBranch({
      repositoryPath: assignment.repository.path,
      branchName: lane.branchName,
      commitHash: proposalCommit,
    });

    const synchronizedPullRequest = await synchronizePullRequest({
      repositoryPath: assignment.repository.path,
      branchName: lane.branchName,
      baseBranch: lane.baseBranch,
      title: pullRequestDraft.title,
      body: pullRequestDraft.summary,
      draft: true,
    });

    await updateTeamThreadRecord({
      threadFile: teamConfig.storage.threadFile,
      threadId,
      updater: (mutableThread, now) => {
        const mutableAssignment = findAssignment(
          mutableThread.dispatchAssignments,
          assignmentNumber,
        );
        if (!mutableAssignment.canonicalBranchName && resolvedCanonicalBranchName) {
          mutableAssignment.canonicalBranchName = resolvedCanonicalBranchName;
        }
        const mutableLane = findLane(mutableAssignment, laneId);
        if (mutableLane.status !== "awaiting_human_approval") {
          throw new Error("This proposal is not waiting for human approval.");
        }

        const isRetry = mutableLane.pullRequest?.status === "failed";
        const trackingPullRequest =
          mutableLane.pullRequest ??
          createPullRequestRecord({
            threadId,
            assignmentNumber,
            lane: mutableLane,
            draft: pullRequestDraft,
            now,
            provider: "github",
            status: "draft",
            humanApprovalRequestedAt: null,
            machineReviewedAt: null,
            url: synchronizedPullRequest.url,
          });

        mutableLane.status = "queued";
        mutableLane.executionPhase = "implementation";
        mutableLane.latestActivity =
          "Human approved the proposal, refreshed the tracking GitHub draft PR, and queued coding plus machine review.";
        mutableLane.approvalGrantedAt = now;
        mutableLane.workerSlot = null;
        mutableLane.worktreePath = threadWorktree.path;
        mutableLane.queuedAt = now;
        mutableLane.pushedCommit = pushedCommit;
        mutableLane.lastError = null;
        mutableLane.pullRequest = {
          ...trackingPullRequest,
          provider: "github",
          title: pullRequestDraft.title,
          summary: pullRequestDraft.summary,
          status: "draft",
          humanApprovalRequestedAt: null,
          humanApprovedAt: null,
          machineReviewedAt: null,
          updatedAt: now,
          url: synchronizedPullRequest.url,
        };
        mutableLane.updatedAt = now;
        mutableLane.finishedAt = null;
        appendLaneEvent(
          mutableLane,
          "human",
          isRetry
            ? "Human retried proposal approval after GitHub draft PR setup failed."
            : "Human approved the proposal and sent it to GitHub draft PR setup plus the coding-review queue.",
          now,
        );
        appendLaneEvent(
          mutableLane,
          "system",
          `Published commit ${formatCommitActivityReference({
            commitHash: pushedCommit?.commitHash ?? proposalCommit,
            commitUrl: pushedCommit?.commitUrl ?? null,
          })} to GitHub via ${pushedCommit?.remoteName ?? "origin"}.`,
          now,
        );
        appendLaneEvent(
          mutableLane,
          "system",
          `GitHub draft PR ready: ${synchronizedPullRequest.url}`,
          now,
        );
        appendPlannerNote(
          mutableAssignment,
          `Human approved proposal ${mutableLane.laneIndex}; ${mutableLane.branchName ?? lane.branchName} was pushed and is now tracked by draft GitHub PR ${synchronizedPullRequest.url} while coding plus machine review run.`,
          now,
        );
        synchronizeDispatchAssignment(mutableAssignment, now);
      },
    });
  } catch (error) {
    const errorSummary = summarizeGitFailure(
      error instanceof Error ? error.message : "GitHub draft PR setup failed.",
    );

    await updateTeamThreadRecord({
      threadFile: teamConfig.storage.threadFile,
      threadId,
      updater: (mutableThread, now) => {
        const mutableAssignment = findAssignment(
          mutableThread.dispatchAssignments,
          assignmentNumber,
        );
        if (!mutableAssignment.canonicalBranchName && resolvedCanonicalBranchName) {
          mutableAssignment.canonicalBranchName = resolvedCanonicalBranchName;
        }
        const mutableLane = findLane(mutableAssignment, laneId);
        if (mutableLane.status !== "awaiting_human_approval") {
          throw new Error("This proposal is not waiting for human approval.");
        }

        const trackingPullRequest =
          mutableLane.pullRequest ??
          createPullRequestRecord({
            threadId,
            assignmentNumber,
            lane: mutableLane,
            draft: pullRequestDraft,
            now,
            status: "failed",
            humanApprovalRequestedAt: null,
            machineReviewedAt: null,
          });

        mutableLane.executionPhase = null;
        mutableLane.latestActivity = pushedCommit
          ? "Human approval pushed the proposal branch, but GitHub draft PR setup failed before coding could be queued."
          : "Human approval failed before the proposal branch could be pushed and tracked with a GitHub draft PR.";
        mutableLane.approvalGrantedAt = null;
        mutableLane.workerSlot = null;
        mutableLane.worktreePath = threadWorktree.path;
        mutableLane.queuedAt = null;
        mutableLane.pushedCommit = pushedCommit;
        mutableLane.lastError = errorSummary;
        mutableLane.pullRequest = {
          ...trackingPullRequest,
          title: pullRequestDraft.title,
          summary: pullRequestDraft.summary,
          status: "failed",
          humanApprovalRequestedAt: null,
          humanApprovedAt: null,
          machineReviewedAt: null,
          updatedAt: now,
        };
        mutableLane.updatedAt = now;
        mutableLane.finishedAt = now;
        if (pushedCommit) {
          appendLaneEvent(
            mutableLane,
            "system",
            `Published commit ${formatCommitActivityReference({
              commitHash: pushedCommit.commitHash,
              commitUrl: pushedCommit.commitUrl,
            })} to GitHub via ${pushedCommit.remoteName}.`,
            now,
          );
        }
        appendLaneEvent(mutableLane, "system", errorSummary, now);
        appendPlannerNote(
          mutableAssignment,
          `Human approval for proposal ${mutableLane.laneIndex} could not finish draft PR setup: ${errorSummary}`,
          now,
        );
        synchronizeDispatchAssignment(mutableAssignment, now);
      },
    });

    throw error;
  }

  void ensurePendingDispatchWork(env, threadId);
};

export const runCodingStage = async (
  env: TeamRunEnv,
  currentState: TeamRunCodingStageState,
): Promise<TeamRunReviewingStageState> => {
  const persistedThread = await getTeamThreadRecord(
    teamConfig.storage.threadFile,
    currentState.args.threadId,
  );
  const persistedLane = findPersistedLane(
    persistedThread,
    currentState.args.assignmentNumber,
    currentState.args.laneId,
  );

  if (!persistedLane || persistedLane.status === "awaiting_human_approval") {
    await approveLaneProposal({
      env,
      threadId: currentState.args.threadId,
      assignmentNumber: currentState.args.assignmentNumber,
      laneId: currentState.args.laneId,
      worktree: currentState.worktree,
    });
  } else if (!isLaneQueuedForExecution(persistedLane as TeamWorkerLaneRecord)) {
    throw new Error("This proposal is not waiting for human approval.");
  }

  return {
    stage: "reviewing",
    args: currentState.args,
    threadId: currentState.args.threadId,
    result: null,
  };
};
