import "server-only";

import { teamConfig } from "@/team.config";
import {
  getTeamThreadRecord,
  synchronizeDispatchAssignment,
  updateTeamThreadRecord,
} from "@/lib/team/history";
import {
  appendLaneEvent,
  buildCanonicalLanePullRequestDraft,
  buildFinalArchiveApprovalActivity,
  findAssignment,
  findLane,
  isFinalArchivePhase,
  type TeamRunArchivingStageState,
  type TeamRunCompletedState,
  type TeamRunEnv,
} from "@/lib/team/coding/shared";
import { findPersistedLane, isLanePullRequestFinalized } from "@/lib/team/coding/plan";
import { ensurePendingDispatchWork, waitForLaneRunCompletion } from "@/lib/team/coding/reviewing";
import type { Worktree } from "@/lib/team/coding/worktree";

export const approveLanePullRequest = async ({
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
  const pullRequest = lane.pullRequest;
  const archiveInProgress =
    isFinalArchivePhase(lane) && (lane.status === "queued" || lane.status === "coding");

  if ((!archiveInProgress && lane.status !== "approved") || !pullRequest) {
    throw new Error("This reviewed branch is not waiting for final human approval.");
  }

  if (pullRequest.status === "approved") {
    return;
  }

  if (pullRequest.status !== "awaiting_human_approval" && pullRequest.status !== "failed") {
    throw new Error(
      "This reviewed branch cannot be finalized from its current pull request state.",
    );
  }

  if (!assignment.repository) {
    throw new Error("Finalizing a reviewed branch requires a repository.");
  }

  if (!lane.branchName || !lane.baseBranch || !lane.proposalChangeName) {
    throw new Error(
      "This reviewed branch is missing the branch or OpenSpec metadata required for final approval.",
    );
  }

  const threadWorktree = worktree ?? thread.data.threadWorktree;
  if (!threadWorktree?.slot) {
    throw new Error(
      "This reviewed branch is missing the claimed thread worktree required for final approval.",
    );
  }

  const pullRequestSummary =
    pullRequest.summary?.trim() ||
    lane.latestReviewerSummary?.trim() ||
    `Proposal ${lane.laneIndex} passed machine review.`;
  const pullRequestTitle = buildCanonicalLanePullRequestDraft({
    assignment,
    lane,
    summary: pullRequestSummary,
  }).title;
  await updateTeamThreadRecord({
    threadFile: teamConfig.storage.threadFile,
    threadId,
    updater: (mutableThread, now) => {
      const mutableAssignment = findAssignment(mutableThread.dispatchAssignments, assignmentNumber);
      const mutableLane = findLane(mutableAssignment, laneId);
      const mutablePullRequest = mutableLane.pullRequest;
      const mutableArchiveInProgress =
        isFinalArchivePhase(mutableLane) &&
        (mutableLane.status === "queued" || mutableLane.status === "coding");

      if ((!mutableArchiveInProgress && mutableLane.status !== "approved") || !mutablePullRequest) {
        throw new Error("This reviewed branch is not waiting for final human approval.");
      }

      if (mutablePullRequest.status === "approved") {
        return;
      }

      if (
        mutablePullRequest.status !== "awaiting_human_approval" &&
        mutablePullRequest.status !== "failed"
      ) {
        throw new Error(
          "This reviewed branch cannot be finalized from its current pull request state.",
        );
      }

      const nextHumanApprovedAt = mutablePullRequest.humanApprovedAt ?? now;
      const isRetry = mutablePullRequest.status === "failed";
      const isResume =
        mutablePullRequest.status === "awaiting_human_approval" &&
        mutablePullRequest.humanApprovedAt !== null;

      if (mutableArchiveInProgress) {
        mutableLane.lastError = null;
        mutableLane.pullRequest = {
          ...mutablePullRequest,
          title: pullRequestTitle,
          summary: pullRequestSummary,
          status: "awaiting_human_approval",
          humanApprovedAt: nextHumanApprovedAt,
          updatedAt: now,
        };
        mutableLane.updatedAt = now;
        synchronizeDispatchAssignment(mutableAssignment, now);
        return;
      }

      mutableLane.status = "queued";
      mutableLane.executionPhase = "final_archive";
      mutableLane.latestActivity = buildFinalArchiveApprovalActivity({
        lane: mutableLane,
        isRetry,
        isResume,
      });
      mutableLane.lastError = null;
      mutableLane.workerSlot = null;
      mutableLane.worktreePath = threadWorktree.path;
      mutableLane.queuedAt = now;
      mutableLane.finishedAt = null;
      mutableLane.pullRequest = {
        ...mutablePullRequest,
        title: pullRequestTitle,
        summary: pullRequestSummary,
        status: "awaiting_human_approval",
        humanApprovedAt: nextHumanApprovedAt,
        updatedAt: now,
      };
      mutableLane.updatedAt = now;
      if (!isResume && !mutableArchiveInProgress) {
        appendLaneEvent(
          mutableLane,
          "human",
          isRetry
            ? "Human retried final approval for the machine-reviewed branch."
            : "Human approved the machine-reviewed branch for OpenSpec archive and GitHub PR refresh.",
          now,
        );
      }
      synchronizeDispatchAssignment(mutableAssignment, now);
    },
  });

  await ensurePendingDispatchWork(env, threadId);

  await waitForLaneRunCompletion(threadId, assignmentNumber, laneId);

  const refreshedThread = await getTeamThreadRecord(teamConfig.storage.threadFile, threadId);
  if (!refreshedThread) {
    throw new Error(`Thread ${threadId} was not found in ${teamConfig.storage.threadFile}.`);
  }

  const refreshedLane = findLane(
    findAssignment(refreshedThread.dispatchAssignments, assignmentNumber),
    laneId,
  );

  if (refreshedLane.pullRequest?.status === "failed") {
    throw new Error(refreshedLane.lastError ?? "Final approval failed.");
  }
};

export const runArchivingStage = async (
  env: TeamRunEnv,
  currentState: TeamRunArchivingStageState,
): Promise<TeamRunCompletedState> => {
  const persistedThread = await getTeamThreadRecord(
    teamConfig.storage.threadFile,
    currentState.args.threadId,
  );
  const persistedLane = findPersistedLane(
    persistedThread,
    currentState.args.assignmentNumber,
    currentState.args.laneId,
  );

  if (!persistedLane || !isLanePullRequestFinalized(persistedLane)) {
    await approveLanePullRequest({
      env,
      threadId: currentState.args.threadId,
      assignmentNumber: currentState.args.assignmentNumber,
      laneId: currentState.args.laneId,
      worktree: currentState.worktree,
    });
  }

  return {
    stage: "completed",
    args: currentState.args,
    result: null,
  };
};
