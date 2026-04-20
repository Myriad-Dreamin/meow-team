import "server-only";

import { promises as fs } from "node:fs";
import path from "node:path";
import { teamConfig } from "@/team.config";
import {
  commitWorktreeChanges,
  commitContainsPath,
  ensureBranchRef,
  findCommitContainingPathInReflog,
  getBranchHead,
} from "@/lib/git/ops";
import { synchronizePullRequest } from "@/lib/platform";
import { ensureLaneWorktree, pushLaneBranch } from "@/lib/team/git";
import {
  getTeamThreadRecord,
  synchronizeDispatchAssignment,
  updateTeamThreadRecord,
} from "@/lib/team/history";
import { runExecutingCodingStage } from "@/lib/team/executing/coding";
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

const hasFileAtPath = async (candidatePath: string): Promise<boolean> => {
  try {
    return (await fs.stat(candidatePath)).isFile();
  } catch (error) {
    const errorCode = (error as NodeJS.ErrnoException).code;

    if (errorCode === "ENOENT" || errorCode === "ENOTDIR") {
      return false;
    }

    throw error;
  }
};

export const resolveProposalCommitForApproval = async ({
  repositoryPath,
  laneBranchName,
  canonicalBranchName,
  plannerWorktreePath,
  proposalCommitHash,
  proposalPath,
  proposalArtifactPath,
  threadWorktree,
}: {
  repositoryPath: string;
  laneBranchName: string;
  canonicalBranchName: string | null;
  plannerWorktreePath: string | null | undefined;
  proposalCommitHash: string | null | undefined;
  proposalPath: string;
  proposalArtifactPath: string;
  threadWorktree: Worktree | null;
}): Promise<string> => {
  const resolveCommitIfProposalArtifactExists = async ({
    gitPath,
    revision,
  }: {
    gitPath: string;
    revision: string;
  }): Promise<string | null> => {
    try {
      const commitHash = await getBranchHead({
        repositoryPath: gitPath,
        branchName: revision,
      });
      return (await commitContainsPath({
        repositoryPath: gitPath,
        revision: commitHash,
        relativePath: proposalArtifactPath,
      }))
        ? commitHash
        : null;
    } catch {
      return null;
    }
  };

  const snapshotProposalArtifactFromWorktree = async (
    worktreePath: string,
  ): Promise<string | null> => {
    if (!(await hasFileAtPath(path.join(worktreePath, proposalArtifactPath)))) {
      return null;
    }

    await commitWorktreeChanges({
      worktreePath,
      message: `planner: recover proposal snapshot for ${laneBranchName}`,
      pathspecs: [proposalPath],
    });

    const recoveredCommit = await getBranchHead({
      repositoryPath: worktreePath,
      branchName: "HEAD",
    });
    if (
      !(await commitContainsPath({
        repositoryPath: worktreePath,
        revision: recoveredCommit,
        relativePath: proposalArtifactPath,
      }))
    ) {
      return null;
    }

    await ensureBranchRef({
      repositoryPath,
      branchName: laneBranchName,
      startPoint: recoveredCommit,
      forceUpdate: true,
    });
    return recoveredCommit;
  };

  if (proposalCommitHash) {
    const storedCommit = await resolveCommitIfProposalArtifactExists({
      gitPath: repositoryPath,
      revision: proposalCommitHash,
    });
    if (storedCommit) {
      await ensureBranchRef({
        repositoryPath,
        branchName: laneBranchName,
        startPoint: storedCommit,
        forceUpdate: true,
      });
      return storedCommit;
    }
  }

  if (canonicalBranchName) {
    const canonicalCommit = await resolveCommitIfProposalArtifactExists({
      gitPath: repositoryPath,
      revision: canonicalBranchName,
    });
    if (canonicalCommit) {
      await ensureBranchRef({
        repositoryPath,
        branchName: laneBranchName,
        startPoint: canonicalBranchName,
        forceUpdate: true,
      });
      return canonicalCommit;
    }
  }

  const laneCommit = await resolveCommitIfProposalArtifactExists({
    gitPath: repositoryPath,
    revision: laneBranchName,
  });
  if (laneCommit) {
    return laneCommit;
  }

  const worktreePaths = Array.from(
    new Set(
      [threadWorktree?.path ?? null, plannerWorktreePath ?? null].filter((value): value is string =>
        Boolean(value),
      ),
    ),
  );
  for (const worktreePath of worktreePaths) {
    const currentHeadCommit = await resolveCommitIfProposalArtifactExists({
      gitPath: worktreePath,
      revision: "HEAD",
    });
    if (currentHeadCommit) {
      await ensureBranchRef({
        repositoryPath,
        branchName: laneBranchName,
        startPoint: currentHeadCommit,
        forceUpdate: true,
      });
      return currentHeadCommit;
    }

    const reflogCommit = await findCommitContainingPathInReflog({
      worktreePath,
      relativePath: proposalArtifactPath,
    });
    if (reflogCommit) {
      await ensureBranchRef({
        repositoryPath,
        branchName: laneBranchName,
        startPoint: reflogCommit,
        forceUpdate: true,
      });
      return reflogCommit;
    }

    const recoveredCommit = await snapshotProposalArtifactFromWorktree(worktreePath);
    if (recoveredCommit) {
      return recoveredCommit;
    }
  }

  throw new Error(
    [
      `Unable to resolve proposal branch ${laneBranchName} for approval.`,
      `No valid proposal commit containing ${proposalArtifactPath} was found on ${laneBranchName}${canonicalBranchName ? `, ${canonicalBranchName}` : ""}, in the claimed planner worktree reflog, or in the current planner worktree changes.`,
    ].join(" "),
  );
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

  if (!lane.branchName || !lane.baseBranch || !lane.proposalPath) {
    throw new Error(
      "This proposal is missing the branch or OpenSpec metadata required for approval.",
    );
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
    plannerWorktreePath: assignment.plannerWorktreePath,
    proposalCommitHash: lane.proposalCommitHash,
    proposalPath: lane.proposalPath,
    proposalArtifactPath: `${lane.proposalPath}/.openspec.yaml`,
    threadWorktree,
  });

  let pushedCommit: Awaited<ReturnType<typeof pushLaneBranch>> | null = null;

  try {
    await ensureLaneWorktree({
      repositoryPath: assignment.repository.path,
      worktreeRoot: threadWorktree.rootPath ?? undefined,
      worktreePath: threadWorktree.path,
      branchName: lane.branchName,
      startPoint: proposalCommit,
    });

    pushedCommit = await pushLaneBranch({
      repositoryPath: threadWorktree.path,
      branchName: lane.branchName,
      commitHash: proposalCommit,
    });

    const synchronizedPullRequest = await synchronizePullRequest({
      repositoryPath: threadWorktree.path,
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
        mutableLane.proposalCommitHash = proposalCommit;
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
        mutableLane.proposalCommitHash = proposalCommit;
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
  const persistedAssignment = persistedThread
    ? findAssignment(persistedThread.dispatchAssignments, currentState.args.assignmentNumber)
    : null;

  if (persistedAssignment?.executionMode) {
    return runExecutingCodingStage(env, currentState);
  }

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
