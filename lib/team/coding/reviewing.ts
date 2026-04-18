import "server-only";

import { promises as fs } from "node:fs";
import path from "node:path";

import { teamConfig } from "@/team.config";
import { formatCommitActivityReference } from "@/lib/team/activity-markdown";
import { applyHandoff } from "@/lib/team/agent-helpers";
import {
  commitWorktreeChanges,
  detectBranchConflict,
  getBranchHead,
  hasWorktreeChanges,
  inspectOpenSpecChangeArchiveState,
  tryRebaseWorktreeBranch,
} from "@/lib/git/ops";
import { synchronizePullRequest } from "@/lib/platform";
import { formatHarnessCommitMessage } from "@/lib/team/commit-message";
import {
  getLaneFinalizationCheckpoint,
  getLaneFinalizationMode,
  getLaneProposalDisposition,
} from "@/lib/team/finalization";
import { ensureLaneWorktree, pushLaneBranch } from "@/lib/team/git";
import {
  assignPendingDispatchWorkerSlots,
  buildLanePoolStateKey,
  captureLanePoolSchedulingState,
  lanePoolSchedulingStateMatches,
  type LanePoolSchedulingState,
  type PlannedLanePoolState,
} from "@/lib/team/coding/dispatch-worktrees";
import { applyThreadOwnedWorktreeToAssignment } from "@/lib/team/coding/thread-worktree";
import {
  appendLaneEvent,
  appendPlannerNote,
  buildCanonicalLanePullRequestDraft,
  createPullRequestRecord,
  findAssignment,
  findLane,
  isFinalArchivePhase,
  resolveAssignmentCanonicalBranchName,
  summarizeGitFailure,
  type TeamRunCompletedState,
  type TeamRunEnv,
  type TeamRunReviewingStageState,
} from "@/lib/team/coding/shared";
import { buildLaneRunState } from "@/lib/team/coding/lane-state";
import {
  getTeamThreadRecord,
  listPendingDispatchAssignments,
  synchronizeDispatchAssignment,
  type PendingDispatchAssignment,
  updateTeamThreadRecord,
} from "@/lib/team/history";
import { appendTeamCodexLogEvent } from "@/lib/team/logs";
import type { ConventionalTitleMetadata } from "@/lib/team/request-title";
import { coderRole } from "@/lib/team/roles/coder";
import { reviewerRole } from "@/lib/team/roles/reviewer";
import type { Worktree } from "@/lib/team/coding/worktree";
import type {
  TeamLaneFinalizationCheckpoint,
  TeamLaneFinalizationMode,
  TeamLaneProposalDisposition,
  TeamRoleHandoff,
  TeamWorkerLaneRecord,
} from "@/lib/team/types";

const activeLaneRuns = new Map<string, Promise<void>>();

const laneRunKey = (threadId: string, assignmentNumber: number, laneId: string): string => {
  return `${threadId}:${assignmentNumber}:${laneId}`;
};

export const waitForLaneRunCompletion = async (
  threadId: string,
  assignmentNumber: number,
  laneId: string,
): Promise<void> => {
  await activeLaneRuns.get(laneRunKey(threadId, assignmentNumber, laneId));
};

const getLaneWorkflow = (): string[] => {
  return teamConfig.workflow.filter((roleId) => roleId === "coder" || roleId === "reviewer");
};

const getThreadOwnedWorktreeOrThrow = ({
  threadId,
  worktree,
}: {
  threadId: string;
  worktree: Worktree | null;
}): Worktree => {
  if (!worktree?.slot) {
    throw new Error(
      `Thread ${threadId} is missing the claimed meow worktree required for repository-backed execution.`,
    );
  }

  return worktree;
};

const inferReviewerDecisionFromLane = (
  lane: Pick<
    TeamWorkerLaneRecord,
    "latestDecision" | "latestReviewerSummary" | "requeueReason" | "status" | "updatedAt"
  >,
): TeamRoleHandoff["decision"] | null => {
  if (!lane.latestReviewerSummary) {
    return null;
  }

  if (lane.requeueReason === "reviewer_requested_changes") {
    return "needs_revision";
  }

  if (lane.requeueReason === "planner_detected_conflict" || lane.status === "approved") {
    return "approved";
  }

  if (lane.latestDecision === "approved" || lane.latestDecision === "needs_revision") {
    return lane.latestDecision;
  }

  return null;
};

const buildSyntheticReviewerHandoff = (
  lane: Pick<
    TeamWorkerLaneRecord,
    | "latestDecision"
    | "latestReviewerSummary"
    | "requeueReason"
    | "status"
    | "updatedAt"
    | "finishedAt"
  >,
  assignmentNumber: number,
  sequence: number,
): TeamRoleHandoff | null => {
  if (!lane.latestReviewerSummary) {
    return null;
  }

  const decision = inferReviewerDecisionFromLane(lane);
  if (!decision) {
    return null;
  }

  return {
    roleId: "reviewer",
    roleName: "Reviewer",
    summary: lane.latestReviewerSummary,
    deliverable: lane.latestReviewerSummary,
    decision,
    sequence,
    assignmentNumber,
    updatedAt: lane.finishedAt ?? lane.updatedAt,
  };
};

const buildLanePersistedHandoffs = ({
  lane,
  assignmentNumber,
}: {
  lane: TeamWorkerLaneRecord;
  assignmentNumber: number;
}): Partial<Record<string, TeamRoleHandoff>> => {
  const handoffs: Partial<Record<string, TeamRoleHandoff>> = {};

  if (lane.latestCoderHandoff) {
    handoffs.coder = lane.latestCoderHandoff;
  }

  const reviewerHandoff =
    lane.latestReviewerHandoff ??
    buildSyntheticReviewerHandoff(
      lane,
      assignmentNumber,
      Math.max((lane.latestCoderHandoff?.sequence ?? 0) + 1, 1),
    );

  if (reviewerHandoff) {
    handoffs.reviewer = reviewerHandoff;
  }

  return handoffs;
};

const buildCoderCommitMessage = ({
  lane,
  conventionalTitle,
}: {
  lane: Pick<
    TeamWorkerLaneRecord,
    "executionPhase" | "laneIndex" | "proposalChangeName" | "taskTitle" | "requeueReason"
  >;
  conventionalTitle: ConventionalTitleMetadata | null;
}): string => {
  if (lane.executionPhase === "final_archive" && lane.proposalChangeName) {
    return formatHarnessCommitMessage({
      intent: "archive",
      summary: `archive ${lane.proposalChangeName}`,
    });
  }

  const taskLabel = lane.taskTitle?.trim() || `proposal ${lane.laneIndex}`;

  if (lane.requeueReason === "reviewer_requested_changes") {
    return formatHarnessCommitMessage({
      intent: "repair",
      summary: `address review feedback for ${taskLabel}`,
    });
  }

  if (lane.requeueReason === "planner_detected_conflict") {
    return formatHarnessCommitMessage({
      intent: "repair",
      summary: `resolve conflict for ${taskLabel}`,
    });
  }

  return formatHarnessCommitMessage({
    conventionalTitle,
    summary: `implement ${taskLabel}`,
  });
};

const noBranchOutputMessage =
  "Coder completed without producing a new branch commit. The lane was stopped to avoid an infinite coder/reviewer loop.";

const buildFinalArchiveInput = ({
  lane,
}: {
  lane: Pick<TeamWorkerLaneRecord, "proposalChangeName" | "proposalPath">;
}): string => {
  if (!lane.proposalChangeName) {
    return "Complete the non-interactive final archive continuation for this approved proposal.";
  }

  const archiveCommand = `/opsx:archive ${lane.proposalChangeName}`;
  const archivePathContext = lane.proposalPath ?? `openspec/changes/${lane.proposalChangeName}`;

  return [
    "Complete the dedicated final archive continuation for an already machine-reviewed proposal.",
    `Run \`${archiveCommand}\`.`,
    "You are not in an interactive context. Do not ask the user to select a change or confirm archive decisions.",
    "If archive inspection finds unsynced delta specs, sync them before archiving.",
    "If the archive creates or exposes `TBD` placeholders, replace them before finishing.",
    `Archive path context: ${archivePathContext}.`,
    "Finish with the branch ready for system commit detection, roadmap archive linking, GitHub push, and GitHub PR refresh.",
  ].join("\n");
};

const hasFinalizationArtifactsApplied = (
  checkpoint: TeamLaneFinalizationCheckpoint | null,
): boolean => {
  return (
    checkpoint === "artifacts_applied" ||
    checkpoint === "branch_pushed" ||
    checkpoint === "completed"
  );
};

const hasFinalizationBranchPush = (checkpoint: TeamLaneFinalizationCheckpoint | null): boolean => {
  return checkpoint === "branch_pushed" || checkpoint === "completed";
};

const buildDeleteFinalizationCommitMessage = (
  lane: Pick<TeamWorkerLaneRecord, "proposalChangeName">,
): string => {
  return formatHarnessCommitMessage({
    intent: "proposal",
    summary: `delete ${lane.proposalChangeName ?? "openspec change"}`,
  });
};

const buildFinalizationWorkActivity = ({
  checkpoint,
  lane,
  mode,
  proposalDisposition,
}: {
  checkpoint: TeamLaneFinalizationCheckpoint | null;
  lane: Pick<TeamWorkerLaneRecord, "proposalChangeName">;
  mode: TeamLaneFinalizationMode;
  proposalDisposition: TeamLaneProposalDisposition | null;
}): string => {
  if (mode === "delete") {
    if (hasFinalizationBranchPush(checkpoint)) {
      return "Final approval is refreshing GitHub delivery for the deleted OpenSpec change.";
    }

    if (proposalDisposition === "deleted" || checkpoint === "artifacts_applied") {
      return "Final approval deleted the OpenSpec change and is pushing the refreshed branch head.";
    }

    return "Final approval is deleting the OpenSpec change before GitHub PR refresh.";
  }

  return proposalDisposition === "archived"
    ? "Final approval is refreshing GitHub delivery for the archived OpenSpec change."
    : `Coder is running non-interactive /opsx:archive ${lane.proposalChangeName} for final approval.`;
};

const buildFinalizationSuccessActivity = (mode: TeamLaneFinalizationMode): string => {
  return mode === "delete"
    ? "Human approval finalized the machine-reviewed branch, deleted the OpenSpec change, and refreshed the GitHub PR."
    : "Human approval finalized the machine-reviewed branch, archived the OpenSpec change, and refreshed the GitHub PR.";
};

const buildFinalizationFailureActivity = ({
  checkpoint,
  mode,
}: {
  checkpoint: TeamLaneFinalizationCheckpoint | null;
  mode: TeamLaneFinalizationMode;
}): string => {
  if (mode === "delete") {
    if (hasFinalizationBranchPush(checkpoint)) {
      return "Final human approval deleted the OpenSpec change, but the GitHub PR refresh did not complete.";
    }

    if (hasFinalizationArtifactsApplied(checkpoint)) {
      return "Final human approval deleted the OpenSpec change locally, but the branch push and GitHub PR refresh did not complete.";
    }

    return "Final human approval failed before deleting the OpenSpec change and refreshing the GitHub PR.";
  }

  return hasFinalizationArtifactsApplied(checkpoint)
    ? "Final human approval archived the OpenSpec change, but the GitHub PR refresh did not complete."
    : "Final human approval failed before the coder archive pass and GitHub PR refresh could complete.";
};

const buildFinalizationPlannerNote = ({
  branchName,
  laneIndex,
  mode,
  proposalPath,
  pullRequestUrl,
}: {
  branchName: string;
  laneIndex: number;
  mode: TeamLaneFinalizationMode;
  proposalPath: string;
  pullRequestUrl: string;
}): string => {
  return mode === "delete"
    ? `Human approved proposal ${laneIndex}; ${proposalPath} was deleted from ${branchName}, and the GitHub PR was refreshed at ${pullRequestUrl}.`
    : `Human approved proposal ${laneIndex}; ${proposalPath} is archived on ${branchName}, and the GitHub PR was refreshed at ${pullRequestUrl}.`;
};

const buildFinalizationFailurePlannerNote = ({
  checkpoint,
  errorSummary,
  laneIndex,
  mode,
  proposalPath,
  proposalPathChanged,
}: {
  checkpoint: TeamLaneFinalizationCheckpoint | null;
  errorSummary: string;
  laneIndex: number;
  mode: TeamLaneFinalizationMode;
  proposalPath: string | null;
  proposalPathChanged: boolean;
}): string => {
  if (mode === "delete" && hasFinalizationArtifactsApplied(checkpoint) && proposalPath) {
    return `Final approval for proposal ${laneIndex} failed after deleting ${proposalPath}: ${errorSummary}`;
  }

  if (
    mode === "archive" &&
    hasFinalizationArtifactsApplied(checkpoint) &&
    proposalPathChanged &&
    proposalPath
  ) {
    return `Final approval for proposal ${laneIndex} failed after archiving ${proposalPath}: ${errorSummary}`;
  }

  return `Final approval for proposal ${laneIndex} failed: ${errorSummary}`;
};

const buildFinalizationArtifactEventMessage = ({
  commitHash,
  commitUrl,
  mode,
  proposalPath,
  pushedCommit,
  proposalPathChanged,
}: {
  commitHash: string;
  commitUrl: string | null;
  mode: TeamLaneFinalizationMode;
  proposalPath: string;
  pushedCommit: NonNullable<TeamWorkerLaneRecord["pushedCommit"]>;
  proposalPathChanged: boolean;
}): string => {
  const commitReference = formatCommitActivityReference({
    commitHash,
    commitUrl,
  });

  if (mode === "delete") {
    return proposalPathChanged
      ? `Deleted OpenSpec change at ${proposalPath} and pushed commit ${commitReference} to GitHub via ${pushedCommit.remoteName}.`
      : `Verified deleted OpenSpec change at ${proposalPath} and refreshed commit ${commitReference} on GitHub via ${pushedCommit.remoteName}.`;
  }

  return proposalPathChanged
    ? `Archived OpenSpec change to ${proposalPath} and pushed commit ${commitReference} to GitHub via ${pushedCommit.remoteName}.`
    : `Verified archived OpenSpec change at ${proposalPath} and refreshed commit ${commitReference} on GitHub via ${pushedCommit.remoteName}.`;
};

const runFinalArchiveCycle = async ({
  threadId,
  assignmentNumber,
  laneId,
  env,
}: {
  threadId: string;
  assignmentNumber: number;
  laneId: string;
  env: TeamRunEnv;
}): Promise<void> => {
  const thread = await getTeamThreadRecord(teamConfig.storage.threadFile, threadId);
  if (!thread) {
    return;
  }

  const assignment = findAssignment(thread.dispatchAssignments, assignmentNumber);
  const lane = findLane(assignment, laneId);
  const laneWorktree = getThreadOwnedWorktreeOrThrow({
    threadId,
    worktree: thread.data.threadWorktree,
  });

  if (
    !assignment.repository ||
    !lane.branchName ||
    !lane.baseBranch ||
    !lane.proposalChangeName ||
    !lane.pullRequest
  ) {
    throw new Error("Final archive lane is missing repository, branch, or OpenSpec metadata.");
  }

  const repositoryPath = assignment.repository.path;
  const laneWorktreeRoot = path.isAbsolute(teamConfig.dispatch.worktreeRoot)
    ? teamConfig.dispatch.worktreeRoot
    : path.join(repositoryPath, teamConfig.dispatch.worktreeRoot);
  const laneBranchName = lane.branchName;
  const pullRequestSummary =
    lane.pullRequest.summary?.trim() ||
    lane.latestReviewerSummary?.trim() ||
    `Proposal ${lane.laneIndex} passed machine review.`;
  const pullRequestTitle =
    lane.pullRequest.title?.trim() ||
    buildCanonicalLanePullRequestDraft({
      assignment,
      lane,
      summary: pullRequestSummary,
    }).title;
  const humanApprovedAt = lane.pullRequest.humanApprovedAt ?? new Date().toISOString();
  const finalizationMode = getLaneFinalizationMode(lane) ?? "archive";
  let latestImplementationCommit = lane.latestImplementationCommit;
  let updatedPushedCommit = lane.pushedCommit;
  let proposalPath = lane.proposalPath ?? `openspec/changes/${lane.proposalChangeName}`;
  let proposalDisposition =
    getLaneProposalDisposition(lane) ??
    (proposalPath.startsWith("openspec/changes/archive/") ? "archived" : "active");
  let finalizationCheckpoint = getLaneFinalizationCheckpoint(lane) ?? "requested";
  let coderHandoff: TeamRoleHandoff | null = null;
  let proposalArtifactsChangedThisRun = false;
  const refreshLatestImplementationCommit = async (): Promise<string> => {
    latestImplementationCommit = await getBranchHead({
      repositoryPath,
      branchName: laneBranchName,
    });

    return latestImplementationCommit;
  };
  const persistFinalizationProgress = async (latestActivity: string) => {
    await updateTeamThreadRecord({
      threadFile: teamConfig.storage.threadFile,
      threadId,
      updater: (mutableThread, now) => {
        const mutableAssignment = findAssignment(
          mutableThread.dispatchAssignments,
          assignmentNumber,
        );
        const mutableLane = findLane(mutableAssignment, laneId);
        const mutablePullRequest = mutableLane.pullRequest;

        if (!mutablePullRequest) {
          throw new Error("This reviewed branch no longer has pull request metadata.");
        }

        mutableLane.status = "coding";
        mutableLane.executionPhase = "final_archive";
        mutableLane.finalizationMode = finalizationMode;
        mutableLane.proposalDisposition = proposalDisposition;
        mutableLane.finalizationCheckpoint = finalizationCheckpoint;
        mutableLane.proposalPath = proposalPath;
        mutableLane.latestImplementationCommit = latestImplementationCommit;
        mutableLane.pushedCommit = updatedPushedCommit;
        if (coderHandoff) {
          mutableLane.latestCoderHandoff = coderHandoff;
          mutableLane.latestCoderSummary = coderHandoff.summary;
        }
        mutableLane.latestActivity = latestActivity;
        mutableLane.lastError = null;
        mutableLane.startedAt = mutableLane.startedAt ?? now;
        mutableLane.finishedAt = null;
        mutableLane.workerSlot = null;
        mutableLane.pullRequest = {
          ...mutablePullRequest,
          title: pullRequestTitle,
          summary: pullRequestSummary,
          status: "awaiting_human_approval",
          humanApprovedAt,
          updatedAt: now,
        };
        mutableLane.updatedAt = now;
        synchronizeDispatchAssignment(mutableAssignment, now);
      },
    });
  };

  try {
    await updateTeamThreadRecord({
      threadFile: teamConfig.storage.threadFile,
      threadId,
      updater: (mutableThread, now) => {
        const mutableAssignment = findAssignment(
          mutableThread.dispatchAssignments,
          assignmentNumber,
        );
        const mutableLane = findLane(mutableAssignment, laneId);
        mutableLane.status = "coding";
        mutableLane.executionPhase = "final_archive";
        mutableLane.finalizationMode = finalizationMode;
        mutableLane.proposalDisposition = proposalDisposition;
        mutableLane.finalizationCheckpoint = finalizationCheckpoint;
        mutableLane.lastError = null;
        mutableLane.startedAt = mutableLane.startedAt ?? now;
        mutableLane.finishedAt = null;
        mutableLane.latestActivity = buildFinalizationWorkActivity({
          checkpoint: finalizationCheckpoint,
          lane: mutableLane,
          mode: finalizationMode,
          proposalDisposition,
        });
        mutableLane.updatedAt = now;
        appendLaneEvent(mutableLane, "system", mutableLane.latestActivity, now);
        synchronizeDispatchAssignment(mutableAssignment, now);
      },
    });

    await ensureLaneWorktree({
      repositoryPath: assignment.repository.path,
      worktreeRoot: laneWorktreeRoot,
      worktreePath: laneWorktree.path,
      branchName: lane.branchName,
      startPoint: lane.latestImplementationCommit ?? lane.baseBranch,
    });

    if (finalizationMode === "archive" && proposalDisposition === "deleted") {
      throw new Error(
        `OpenSpec change ${lane.proposalChangeName} is already deleted; archive finalization cannot archive deleted proposals.`,
      );
    }

    if (finalizationMode === "delete" && proposalDisposition === "archived") {
      throw new Error(
        `OpenSpec change ${lane.proposalChangeName} is already archived; delete finalization cannot remove archived proposals.`,
      );
    }

    if (
      finalizationMode === "delete" &&
      proposalDisposition === "deleted" &&
      !hasFinalizationArtifactsApplied(finalizationCheckpoint)
    ) {
      latestImplementationCommit = null;
      finalizationCheckpoint = "artifacts_applied";
      await persistFinalizationProgress(
        buildFinalizationWorkActivity({
          checkpoint: finalizationCheckpoint,
          lane,
          mode: finalizationMode,
          proposalDisposition,
        }),
      );
    }

    if (!hasFinalizationArtifactsApplied(finalizationCheckpoint)) {
      const preArchiveState = await inspectOpenSpecChangeArchiveState({
        worktreePath: laneWorktree.path,
        changeName: lane.proposalChangeName,
      });

      if (preArchiveState.sourceExists && preArchiveState.archivedPath) {
        throw new Error(
          `OpenSpec change ${lane.proposalChangeName} exists in both active and archived paths.`,
        );
      }

      if (finalizationMode === "delete") {
        if (preArchiveState.archivedPath) {
          throw new Error(
            `OpenSpec change ${lane.proposalChangeName} is already archived at ${preArchiveState.archivedPath}; delete finalization cannot remove archived proposals.`,
          );
        }

        if (!preArchiveState.sourceExists) {
          throw new Error(
            `OpenSpec change ${lane.proposalChangeName} was not found in the active OpenSpec directory for delete finalization.`,
          );
        }

        await fs.rm(path.join(laneWorktree.path, preArchiveState.sourcePath), {
          recursive: true,
          force: true,
        });

        if (!(await hasWorktreeChanges(laneWorktree.path))) {
          throw new Error(
            `Deleting OpenSpec change ${lane.proposalChangeName} did not modify the lane worktree.`,
          );
        }

        await commitWorktreeChanges({
          worktreePath: laneWorktree.path,
          message: buildDeleteFinalizationCommitMessage(lane),
          pathspecs: [preArchiveState.sourcePath],
        });

        proposalPath = lane.proposalPath ?? preArchiveState.sourcePath;
        proposalDisposition = "deleted";
        proposalArtifactsChangedThisRun = true;
        latestImplementationCommit = null;
        finalizationCheckpoint = "artifacts_applied";
        await persistFinalizationProgress(
          buildFinalizationWorkActivity({
            checkpoint: finalizationCheckpoint,
            lane,
            mode: finalizationMode,
            proposalDisposition,
          }),
        );
      } else if (preArchiveState.sourceExists) {
        const coderState = buildLaneRunState({
          repository: assignment.repository,
          worktree: laneWorktree,
          lane,
          assignment,
          workflow: getLaneWorkflow(),
          handoffs: buildLanePersistedHandoffs({
            lane,
            assignmentNumber,
          }),
        });
        const coderResponse = await env.deps.coderAgent.run({
          state: coderState,
          input: buildFinalArchiveInput({
            lane,
          }),
          onEvent: async (event) => {
            await appendTeamCodexLogEvent({
              threadFile: teamConfig.storage.threadFile,
              threadId,
              assignmentNumber,
              roleId: coderRole.id,
              laneId,
              event,
            });
          },
        });

        coderHandoff = applyHandoff({
          state: coderState,
          role: coderRole,
          summary: coderResponse.summary,
          deliverable: coderResponse.deliverable,
          decision: coderResponse.decision,
        });

        if (await hasWorktreeChanges(laneWorktree.path)) {
          await commitWorktreeChanges({
            worktreePath: laneWorktree.path,
            message: buildCoderCommitMessage({
              lane,
              conventionalTitle: assignment.conventionalTitle,
            }),
          });
        }

        const postArchiveState = await inspectOpenSpecChangeArchiveState({
          worktreePath: laneWorktree.path,
          changeName: lane.proposalChangeName,
        });

        if (postArchiveState.sourceExists || !postArchiveState.archivedPath) {
          throw new Error(
            `Final archive coder pass did not archive OpenSpec change ${lane.proposalChangeName}.`,
          );
        }

        proposalPath = postArchiveState.archivedPath;
        proposalDisposition = "archived";
        proposalArtifactsChangedThisRun = true;
      } else if (preArchiveState.archivedPath) {
        proposalPath = preArchiveState.archivedPath;
        proposalDisposition = "archived";
      } else {
        throw new Error(
          `OpenSpec change ${lane.proposalChangeName} was not found in the active or archived OpenSpec directories.`,
        );
      }

      if (!hasFinalizationArtifactsApplied(finalizationCheckpoint)) {
        await refreshLatestImplementationCommit();
        finalizationCheckpoint = "artifacts_applied";
        await persistFinalizationProgress(
          buildFinalizationWorkActivity({
            checkpoint: finalizationCheckpoint,
            lane,
            mode: finalizationMode,
            proposalDisposition,
          }),
        );
      }
    }

    if (!hasFinalizationBranchPush(finalizationCheckpoint)) {
      if (!latestImplementationCommit) {
        await refreshLatestImplementationCommit();
      }

      updatedPushedCommit = latestImplementationCommit
        ? await pushLaneBranch({
            repositoryPath: assignment.repository.path,
            branchName: lane.branchName,
            commitHash: latestImplementationCommit,
          })
        : null;

      if (!latestImplementationCommit || !updatedPushedCommit) {
        throw new Error(
          finalizationMode === "delete"
            ? "Final approval could not resolve the deleted branch head for GitHub delivery."
            : "Final approval could not resolve the archived branch head for GitHub delivery.",
        );
      }

      finalizationCheckpoint = "branch_pushed";
      await persistFinalizationProgress(
        buildFinalizationWorkActivity({
          checkpoint: finalizationCheckpoint,
          lane,
          mode: finalizationMode,
          proposalDisposition,
        }),
      );
    } else if (!latestImplementationCommit || !updatedPushedCommit) {
      throw new Error(
        "Final approval recorded a completed branch push but is missing the persisted commit metadata required to refresh the GitHub PR.",
      );
    }

    const finalizedCommitHash = latestImplementationCommit;
    const finalizedPushedCommit = updatedPushedCommit;

    const synchronizedPullRequest = await synchronizePullRequest({
      repositoryPath: laneWorktree.path,
      branchName: lane.branchName,
      baseBranch: lane.baseBranch,
      title: pullRequestTitle,
      body: pullRequestSummary,
      draft: false,
    });

    await updateTeamThreadRecord({
      threadFile: teamConfig.storage.threadFile,
      threadId,
      updater: (mutableThread, now) => {
        const mutableAssignment = findAssignment(
          mutableThread.dispatchAssignments,
          assignmentNumber,
        );
        const mutableLane = findLane(mutableAssignment, laneId);
        const mutablePullRequest = mutableLane.pullRequest;

        if (!mutablePullRequest) {
          throw new Error("This reviewed branch no longer has pull request metadata.");
        }

        mutableLane.status = "approved";
        mutableLane.executionPhase = null;
        mutableLane.finalizationMode = finalizationMode;
        mutableLane.proposalDisposition = proposalDisposition;
        mutableLane.finalizationCheckpoint = "completed";
        mutableLane.proposalPath = proposalPath;
        mutableLane.latestImplementationCommit = finalizedCommitHash;
        mutableLane.pushedCommit = finalizedPushedCommit;
        if (coderHandoff) {
          mutableLane.latestCoderHandoff = coderHandoff;
          mutableLane.latestCoderSummary = coderHandoff.summary;
        }
        mutableLane.latestActivity = buildFinalizationSuccessActivity(finalizationMode);
        mutableLane.lastError = null;
        mutableLane.workerSlot = null;
        mutableLane.requeueReason = null;
        mutableLane.pullRequest = {
          ...mutablePullRequest,
          provider: "github",
          title: pullRequestTitle,
          summary: pullRequestSummary,
          status: "approved",
          humanApprovedAt,
          updatedAt: now,
          url: synchronizedPullRequest.url,
        };
        mutableLane.updatedAt = now;
        mutableLane.finishedAt = now;
        if (coderHandoff) {
          appendLaneEvent(
            mutableLane,
            "coder",
            `Coder completed final archive pass: ${coderHandoff.summary}`,
            now,
          );
        }
        appendLaneEvent(
          mutableLane,
          "system",
          buildFinalizationArtifactEventMessage({
            commitHash: finalizedCommitHash,
            commitUrl: finalizedPushedCommit.commitUrl,
            mode: finalizationMode,
            proposalPath,
            pushedCommit: finalizedPushedCommit,
            proposalPathChanged:
              proposalArtifactsChangedThisRun || proposalPath !== lane.proposalPath,
          }),
          now,
        );
        appendLaneEvent(
          mutableLane,
          "system",
          `GitHub PR refreshed: ${synchronizedPullRequest.url}`,
          now,
        );
        appendPlannerNote(
          mutableAssignment,
          buildFinalizationPlannerNote({
            branchName: mutableLane.branchName ?? laneBranchName,
            laneIndex: mutableLane.laneIndex,
            mode: finalizationMode,
            proposalPath,
            pullRequestUrl: synchronizedPullRequest.url,
          }),
          now,
        );
        synchronizeDispatchAssignment(mutableAssignment, now);
      },
    });
  } catch (error) {
    const errorSummary = summarizeGitFailure(
      error instanceof Error ? error.message : "GitHub PR finalization failed.",
    );

    await updateTeamThreadRecord({
      threadFile: teamConfig.storage.threadFile,
      threadId,
      updater: (mutableThread, now) => {
        const mutableAssignment = findAssignment(
          mutableThread.dispatchAssignments,
          assignmentNumber,
        );
        const mutableLane = findLane(mutableAssignment, laneId);
        const mutablePullRequest = mutableLane.pullRequest;

        if (!mutablePullRequest) {
          throw new Error("This reviewed branch no longer has pull request metadata.");
        }

        mutableLane.status = "approved";
        mutableLane.executionPhase = null;
        mutableLane.finalizationMode = finalizationMode;
        mutableLane.proposalDisposition = proposalDisposition;
        mutableLane.finalizationCheckpoint = finalizationCheckpoint;
        mutableLane.proposalPath = proposalPath;
        mutableLane.latestImplementationCommit = latestImplementationCommit;
        mutableLane.pushedCommit = updatedPushedCommit;
        if (coderHandoff) {
          mutableLane.latestCoderHandoff = coderHandoff;
          mutableLane.latestCoderSummary = coderHandoff.summary;
        }
        mutableLane.latestActivity = buildFinalizationFailureActivity({
          checkpoint: finalizationCheckpoint,
          mode: finalizationMode,
        });
        mutableLane.lastError = errorSummary;
        mutableLane.workerSlot = null;
        mutableLane.requeueReason = null;
        mutableLane.pullRequest = {
          ...mutablePullRequest,
          title: pullRequestTitle,
          summary: pullRequestSummary,
          status: "failed",
          humanApprovedAt,
          updatedAt: now,
        };
        mutableLane.updatedAt = now;
        mutableLane.finishedAt = now;
        if (coderHandoff) {
          appendLaneEvent(
            mutableLane,
            "coder",
            `Coder completed final archive pass: ${coderHandoff.summary}`,
            now,
          );
        }
        appendLaneEvent(mutableLane, "system", errorSummary, now);
        appendPlannerNote(
          mutableAssignment,
          buildFinalizationFailurePlannerNote({
            checkpoint: finalizationCheckpoint,
            errorSummary,
            laneIndex: mutableLane.laneIndex,
            mode: finalizationMode,
            proposalPath,
            proposalPathChanged:
              proposalArtifactsChangedThisRun || proposalPath !== lane.proposalPath,
          }),
          now,
        );
        synchronizeDispatchAssignment(mutableAssignment, now);
      },
    });

    await appendTeamCodexLogEvent({
      threadFile: teamConfig.storage.threadFile,
      threadId,
      assignmentNumber,
      roleId: null,
      laneId,
      event: {
        source: "system",
        message: errorSummary,
        createdAt: new Date().toISOString(),
      },
    });
  }
};

const runLaneCycle = async ({
  threadId,
  assignmentNumber,
  laneId,
  env,
}: {
  threadId: string;
  assignmentNumber: number;
  laneId: string;
  env: TeamRunEnv;
}): Promise<void> => {
  while (true) {
    const thread = await getTeamThreadRecord(teamConfig.storage.threadFile, threadId);
    if (!thread) {
      return;
    }

    const assignment = findAssignment(thread.dispatchAssignments, assignmentNumber);
    const lane = findLane(assignment, laneId);
    if (lane.status !== "queued" && lane.status !== "coding" && lane.status !== "reviewing") {
      return;
    }

    if (!lane.workerSlot) {
      return;
    }

    if (!assignment.repository || !lane.branchName || !lane.baseBranch) {
      throw new Error("Lane is missing repository, branch, or worktree metadata.");
    }

    const laneWorktree = getThreadOwnedWorktreeOrThrow({
      threadId,
      worktree: thread.data.threadWorktree,
    });
    const laneWorktreeRoot = path.isAbsolute(teamConfig.dispatch.worktreeRoot)
      ? teamConfig.dispatch.worktreeRoot
      : path.join(assignment.repository.path, teamConfig.dispatch.worktreeRoot);

    if (isFinalArchivePhase(lane)) {
      await runFinalArchiveCycle({
        threadId,
        assignmentNumber,
        laneId,
        env,
      });
      return;
    }

    await updateTeamThreadRecord({
      threadFile: teamConfig.storage.threadFile,
      threadId,
      updater: (mutableThread, now) => {
        const mutableAssignment = findAssignment(
          mutableThread.dispatchAssignments,
          assignmentNumber,
        );
        const mutableLane = findLane(mutableAssignment, laneId);
        mutableLane.status = "coding";
        mutableLane.executionPhase ??= "implementation";
        mutableLane.lastError = null;
        mutableLane.latestImplementationCommit = null;
        mutableLane.pushedCommit = null;
        mutableLane.startedAt = mutableLane.startedAt ?? now;
        mutableLane.finishedAt = null;
        mutableLane.latestActivity =
          mutableLane.requeueReason === "planner_detected_conflict"
            ? "Coder is resolving a planner-detected pull request conflict."
            : mutableLane.requeueReason === "reviewer_requested_changes"
              ? "Coder is addressing reviewer-requested changes."
              : "Coder is implementing the approved proposal in the dedicated worktree.";
        mutableLane.updatedAt = now;
        appendLaneEvent(mutableLane, "coder", mutableLane.latestActivity, now);
        synchronizeDispatchAssignment(mutableAssignment, now);
      },
    });

    await ensureLaneWorktree({
      repositoryPath: assignment.repository.path,
      worktreeRoot: laneWorktreeRoot,
      worktreePath: laneWorktree.path,
      branchName: lane.branchName,
      startPoint:
        lane.latestImplementationCommit ??
        lane.proposalCommitHash ??
        resolveAssignmentCanonicalBranchName({
          threadId,
          assignment,
        }) ??
        lane.baseBranch,
    });

    const branchHeadBeforeCoding = await getBranchHead({
      repositoryPath: assignment.repository.path,
      branchName: lane.branchName,
    });

    const coderState = buildLaneRunState({
      repository: assignment.repository,
      worktree: laneWorktree,
      lane,
      assignment,
      workflow: getLaneWorkflow(),
      handoffs: buildLanePersistedHandoffs({
        lane,
        assignmentNumber,
      }),
    });
    const coderResponse = await env.deps.coderAgent.run({
      state: coderState,
      input:
        lane.taskObjective ?? lane.taskTitle ?? assignment.plannerSummary ?? "Implement the task.",
      onEvent: async (event) => {
        await appendTeamCodexLogEvent({
          threadFile: teamConfig.storage.threadFile,
          threadId,
          assignmentNumber,
          roleId: coderRole.id,
          laneId,
          event,
        });
      },
    });

    const coderHandoff = applyHandoff({
      state: coderState,
      role: coderRole,
      summary: coderResponse.summary,
      deliverable: coderResponse.deliverable,
      decision: coderResponse.decision,
    });

    if (await hasWorktreeChanges(laneWorktree.path)) {
      await commitWorktreeChanges({
        worktreePath: laneWorktree.path,
        message: buildCoderCommitMessage({
          lane,
          conventionalTitle: assignment.conventionalTitle,
        }),
      });
    }

    const branchHeadAfterCoding = await getBranchHead({
      repositoryPath: assignment.repository.path,
      branchName: lane.branchName,
    });

    if (branchHeadAfterCoding === branchHeadBeforeCoding) {
      await updateTeamThreadRecord({
        threadFile: teamConfig.storage.threadFile,
        threadId,
        updater: (mutableThread, now) => {
          const mutableAssignment = findAssignment(
            mutableThread.dispatchAssignments,
            assignmentNumber,
          );
          const mutableLane = findLane(mutableAssignment, laneId);
          mutableLane.status = "failed";
          mutableLane.executionPhase = null;
          mutableLane.latestImplementationCommit = null;
          mutableLane.pushedCommit = null;
          mutableLane.latestCoderHandoff = coderHandoff;
          mutableLane.latestCoderSummary = coderHandoff.summary;
          mutableLane.latestDecision = coderHandoff.decision;
          mutableLane.latestActivity = "Coder finished without producing branch output.";
          mutableLane.lastError = noBranchOutputMessage;
          mutableLane.runCount += 1;
          mutableLane.workerSlot = null;
          mutableLane.worktreePath = laneWorktree.path;
          if (mutableLane.pullRequest) {
            mutableLane.pullRequest = {
              ...mutableLane.pullRequest,
              status: "failed",
              updatedAt: now,
            };
          }
          mutableLane.updatedAt = now;
          mutableLane.finishedAt = now;
          appendLaneEvent(mutableLane, "coder", `Coder handoff: ${coderHandoff.summary}`, now);
          appendLaneEvent(mutableLane, "system", noBranchOutputMessage, now);
          appendPlannerNote(
            mutableAssignment,
            `Lane ${mutableLane.laneIndex} stopped because the coder produced no branch output.`,
            now,
          );
          synchronizeDispatchAssignment(mutableAssignment, now);
        },
      });

      await appendTeamCodexLogEvent({
        threadFile: teamConfig.storage.threadFile,
        threadId,
        assignmentNumber,
        roleId: coderRole.id,
        laneId,
        event: {
          source: "system",
          message: noBranchOutputMessage,
          createdAt: new Date().toISOString(),
        },
      });

      return;
    }

    await updateTeamThreadRecord({
      threadFile: teamConfig.storage.threadFile,
      threadId,
      updater: (mutableThread, now) => {
        const mutableAssignment = findAssignment(
          mutableThread.dispatchAssignments,
          assignmentNumber,
        );
        const mutableLane = findLane(mutableAssignment, laneId);
        const reviewCommit = formatCommitActivityReference({
          commitHash: branchHeadAfterCoding,
        });
        mutableLane.status = "reviewing";
        mutableLane.executionPhase = "implementation";
        mutableLane.latestImplementationCommit = branchHeadAfterCoding;
        mutableLane.pushedCommit = null;
        mutableLane.latestCoderHandoff = coderHandoff;
        mutableLane.latestCoderSummary = coderHandoff.summary;
        mutableLane.latestDecision = coderHandoff.decision;
        mutableLane.latestActivity = `Reviewer is evaluating implementation commit ${reviewCommit}.`;
        mutableLane.updatedAt = now;
        appendLaneEvent(
          mutableLane,
          "coder",
          `Coder requested review for commit ${reviewCommit}: ${coderHandoff.summary}`,
          now,
        );
        appendLaneEvent(mutableLane, "reviewer", mutableLane.latestActivity, now);
        synchronizeDispatchAssignment(mutableAssignment, now);
      },
    });

    const reviewerLane: TeamWorkerLaneRecord = {
      ...lane,
      status: "reviewing",
      executionPhase: "implementation",
      latestImplementationCommit: branchHeadAfterCoding,
      pushedCommit: null,
      latestCoderHandoff: coderHandoff,
      latestCoderSummary: coderHandoff.summary,
      latestDecision: coderHandoff.decision,
    };

    const reviewerState = buildLaneRunState({
      repository: assignment.repository,
      worktree: laneWorktree,
      lane: reviewerLane,
      assignment,
      workflow: getLaneWorkflow(),
      handoffs: {
        ...buildLanePersistedHandoffs({
          lane: reviewerLane,
          assignmentNumber,
        }),
        coder: coderHandoff,
      },
    });
    const reviewerResponse = await env.deps.reviewerAgent.run({
      state: reviewerState,
      input:
        lane.taskObjective ??
        lane.taskTitle ??
        assignment.plannerSummary ??
        "Review the lane output.",
      onEvent: async (event) => {
        await appendTeamCodexLogEvent({
          threadFile: teamConfig.storage.threadFile,
          threadId,
          assignmentNumber,
          roleId: reviewerRole.id,
          laneId,
          event,
        });
      },
    });
    const reviewerHandoff = applyHandoff({
      state: reviewerState,
      role: reviewerRole,
      summary: reviewerResponse.summary,
      deliverable: reviewerResponse.deliverable,
      decision: reviewerResponse.decision,
    });
    reviewerState.pullRequestDraft =
      reviewerResponse.pullRequestTitle && reviewerResponse.pullRequestSummary
        ? buildCanonicalLanePullRequestDraft({
            assignment,
            lane,
            summary: reviewerResponse.pullRequestSummary,
          })
        : null;

    if (reviewerHandoff.decision === "needs_revision") {
      await updateTeamThreadRecord({
        threadFile: teamConfig.storage.threadFile,
        threadId,
        updater: (mutableThread, now) => {
          const mutableAssignment = findAssignment(
            mutableThread.dispatchAssignments,
            assignmentNumber,
          );
          const mutableLane = findLane(mutableAssignment, laneId);
          mutableLane.status = "queued";
          mutableLane.executionPhase = "implementation";
          mutableLane.pushedCommit = null;
          mutableLane.latestDecision = reviewerHandoff.decision;
          mutableLane.latestCoderHandoff = coderHandoff;
          mutableLane.latestReviewerHandoff = reviewerHandoff;
          mutableLane.latestCoderSummary = coderHandoff.summary;
          mutableLane.latestReviewerSummary = reviewerHandoff.summary;
          mutableLane.latestActivity =
            "Reviewer requested changes and returned the proposal to the coding-review queue.";
          mutableLane.runCount += 1;
          mutableLane.revisionCount += 1;
          mutableLane.queuedAt = now;
          mutableLane.requeueReason = "reviewer_requested_changes";
          mutableLane.updatedAt = now;
          mutableLane.finishedAt = null;
          appendLaneEvent(
            mutableLane,
            "reviewer",
            `Reviewer requested changes: ${reviewerHandoff.summary}`,
            now,
          );
          synchronizeDispatchAssignment(mutableAssignment, now);
        },
      });

      continue;
    }

    const now = new Date().toISOString();
    const reviewPullRequestDraft =
      reviewerState.pullRequestDraft ??
      buildCanonicalLanePullRequestDraft({
        assignment,
        lane,
        summary: reviewerHandoff.summary,
      });
    const trackingPullRequest =
      lane.pullRequest ??
      createPullRequestRecord({
        threadId,
        assignmentNumber,
        lane,
        draft: reviewPullRequestDraft,
        now,
        status: "draft",
        humanApprovalRequestedAt: null,
        machineReviewedAt: null,
      });

    const hasConflict = await detectBranchConflict({
      repositoryPath: assignment.repository.path,
      baseBranch: lane.baseBranch,
      branchName: lane.branchName,
    });

    let latestImplementationCommit = branchHeadAfterCoding;
    let rebaseErrorSummary: string | null = null;

    const rebaseAttempt = await tryRebaseWorktreeBranch({
      worktreePath: laneWorktree.path,
      baseBranch: lane.baseBranch,
    });

    if (rebaseAttempt.applied) {
      latestImplementationCommit = await getBranchHead({
        repositoryPath: assignment.repository.path,
        branchName: lane.branchName,
      });
    } else {
      rebaseErrorSummary = rebaseAttempt.error
        ? summarizeGitFailure(rebaseAttempt.error)
        : "Git rebase failed.";
    }

    const rebasedOntoBase = latestImplementationCommit !== branchHeadAfterCoding;
    const rebaseFailureActivity = hasConflict
      ? "Planner detected a pull request conflict and the auto-rebase attempt failed, so the proposal was requeued."
      : "Planner could not rebase the lane onto the base branch, so the proposal was requeued for conflict resolution.";
    const rebaseFailureReviewerEvent = hasConflict
      ? `Reviewer approved the proposal, but the planner auto-rebase attempt failed after detecting a conflict: ${reviewerHandoff.summary}`
      : `Reviewer approved the proposal, but the planner auto-rebase attempt onto ${lane.baseBranch} failed: ${reviewerHandoff.summary}`;
    const rebaseFailurePlannerNote = hasConflict
      ? `Conflict detected for proposal ${lane.laneIndex}; automatic rebase onto ${lane.baseBranch} failed (${rebaseErrorSummary}), so the coder was requeued before machine review could complete.`
      : `Proposal ${lane.laneIndex} passed machine review, but the automatic rebase onto ${lane.baseBranch} failed (${rebaseErrorSummary}), so the coder was requeued before machine review could complete.`;

    if (rebaseErrorSummary) {
      await updateTeamThreadRecord({
        threadFile: teamConfig.storage.threadFile,
        threadId,
        updater: (mutableThread, mutableNow) => {
          const mutableAssignment = findAssignment(
            mutableThread.dispatchAssignments,
            assignmentNumber,
          );
          const mutableLane = findLane(mutableAssignment, laneId);
          mutableLane.status = "queued";
          mutableLane.executionPhase = "implementation";
          mutableLane.pushedCommit = null;
          mutableLane.latestDecision = reviewerHandoff.decision;
          mutableLane.latestCoderHandoff = coderHandoff;
          mutableLane.latestReviewerHandoff = reviewerHandoff;
          mutableLane.latestCoderSummary = coderHandoff.summary;
          mutableLane.latestReviewerSummary = reviewerHandoff.summary;
          mutableLane.latestActivity = rebaseFailureActivity;
          mutableLane.runCount += 1;
          mutableLane.revisionCount += 1;
          mutableLane.queuedAt = mutableNow;
          mutableLane.requeueReason = "planner_detected_conflict";
          mutableLane.pullRequest = {
            ...trackingPullRequest,
            title: reviewPullRequestDraft.title,
            summary: reviewPullRequestDraft.summary,
            status: "conflict",
            updatedAt: mutableNow,
            humanApprovalRequestedAt: null,
            humanApprovedAt: null,
            machineReviewedAt: null,
          };
          mutableLane.updatedAt = mutableNow;
          mutableLane.finishedAt = null;
          appendLaneEvent(mutableLane, "reviewer", rebaseFailureReviewerEvent, mutableNow);
          appendPlannerNote(mutableAssignment, rebaseFailurePlannerNote, mutableNow);
          synchronizeDispatchAssignment(mutableAssignment, mutableNow);
        },
      });

      continue;
    }

    let pushedCommit: Awaited<ReturnType<typeof pushLaneBranch>> | null = null;
    try {
      pushedCommit = await pushLaneBranch({
        repositoryPath: assignment.repository.path,
        branchName: lane.branchName,
        commitHash: latestImplementationCommit,
      });
    } catch (error) {
      const pushErrorSummary = summarizeGitFailure(
        error instanceof Error ? error.message : "Git push failed.",
      );
      const pushErrorMessage = `GitHub push failed for ${lane.branchName}: ${pushErrorSummary}`;

      await updateTeamThreadRecord({
        threadFile: teamConfig.storage.threadFile,
        threadId,
        updater: (mutableThread, mutableNow) => {
          const mutableAssignment = findAssignment(
            mutableThread.dispatchAssignments,
            assignmentNumber,
          );
          const mutableLane = findLane(mutableAssignment, laneId);
          mutableLane.status = "failed";
          mutableLane.executionPhase = null;
          mutableLane.latestImplementationCommit = latestImplementationCommit;
          mutableLane.pushedCommit = null;
          mutableLane.latestDecision = reviewerHandoff.decision;
          mutableLane.latestCoderHandoff = coderHandoff;
          mutableLane.latestReviewerHandoff = reviewerHandoff;
          mutableLane.latestCoderSummary = coderHandoff.summary;
          mutableLane.latestReviewerSummary = reviewerHandoff.summary;
          mutableLane.latestActivity =
            "Machine review approved the proposal, but publishing the lane branch to GitHub failed.";
          mutableLane.runCount += 1;
          mutableLane.workerSlot = null;
          mutableLane.requeueReason = null;
          mutableLane.lastError = pushErrorMessage;
          mutableLane.pullRequest = {
            ...trackingPullRequest,
            title: reviewPullRequestDraft.title,
            summary: reviewPullRequestDraft.summary,
            status: "failed",
            humanApprovalRequestedAt: null,
            humanApprovedAt: null,
            updatedAt: mutableNow,
            machineReviewedAt: null,
          };
          mutableLane.updatedAt = mutableNow;
          mutableLane.finishedAt = mutableNow;
          if (rebasedOntoBase) {
            appendLaneEvent(
              mutableLane,
              "planner",
              `Planner rebased the lane onto ${mutableLane.baseBranch ?? lane.baseBranch} before final approval.`,
              mutableNow,
            );
          }
          appendLaneEvent(
            mutableLane,
            "reviewer",
            `Reviewer completed machine review: ${reviewerHandoff.summary}`,
            mutableNow,
          );
          appendLaneEvent(mutableLane, "system", pushErrorMessage, mutableNow);
          appendPlannerNote(
            mutableAssignment,
            rebasedOntoBase
              ? `Proposal ${mutableLane.laneIndex} was automatically rebased onto ${mutableLane.baseBranch ?? lane.baseBranch} after machine review, but publishing ${mutableLane.branchName ?? lane.branchName} to GitHub failed (${pushErrorSummary}).`
              : `Proposal ${mutableLane.laneIndex} passed machine review, but publishing ${mutableLane.branchName ?? lane.branchName} to GitHub failed (${pushErrorSummary}).`,
            mutableNow,
          );
          synchronizeDispatchAssignment(mutableAssignment, mutableNow);
        },
      });

      await appendTeamCodexLogEvent({
        threadFile: teamConfig.storage.threadFile,
        threadId,
        assignmentNumber,
        roleId: null,
        laneId,
        event: {
          source: "system",
          message: pushErrorMessage,
          createdAt: new Date().toISOString(),
        },
      });

      return;
    }

    if (!pushedCommit) {
      return;
    }

    let synchronizedPullRequest: Awaited<ReturnType<typeof synchronizePullRequest>> | null = null;
    try {
      synchronizedPullRequest = await synchronizePullRequest({
        repositoryPath: laneWorktree.path,
        branchName: lane.branchName,
        baseBranch: lane.baseBranch,
        title: reviewPullRequestDraft.title,
        body: reviewPullRequestDraft.summary,
        draft: false,
      });
    } catch (error) {
      const pullRequestErrorSummary = summarizeGitFailure(
        error instanceof Error ? error.message : "GitHub pull request refresh failed.",
      );
      const pullRequestErrorMessage = `GitHub PR refresh failed for ${lane.branchName}: ${pullRequestErrorSummary}`;

      await updateTeamThreadRecord({
        threadFile: teamConfig.storage.threadFile,
        threadId,
        updater: (mutableThread, mutableNow) => {
          const mutableAssignment = findAssignment(
            mutableThread.dispatchAssignments,
            assignmentNumber,
          );
          const mutableLane = findLane(mutableAssignment, laneId);
          mutableLane.status = "approved";
          mutableLane.executionPhase = null;
          mutableLane.finalizationMode = null;
          mutableLane.proposalDisposition = "active";
          mutableLane.finalizationCheckpoint = null;
          mutableLane.latestImplementationCommit = latestImplementationCommit;
          mutableLane.pushedCommit = pushedCommit;
          mutableLane.latestDecision = reviewerHandoff.decision;
          mutableLane.latestCoderHandoff = coderHandoff;
          mutableLane.latestReviewerHandoff = reviewerHandoff;
          mutableLane.latestCoderSummary = coderHandoff.summary;
          mutableLane.latestReviewerSummary = reviewerHandoff.summary;
          mutableLane.latestActivity =
            "Machine review approved the proposal, but refreshing the tracking GitHub PR for final approval failed.";
          mutableLane.runCount += 1;
          mutableLane.workerSlot = null;
          mutableLane.requeueReason = null;
          mutableLane.lastError = pullRequestErrorMessage;
          mutableLane.pullRequest = {
            ...trackingPullRequest,
            provider: trackingPullRequest.provider === "github" ? "github" : "local-ci",
            title: reviewPullRequestDraft.title,
            summary: reviewPullRequestDraft.summary,
            status: "failed",
            humanApprovalRequestedAt: null,
            humanApprovedAt: null,
            machineReviewedAt: mutableNow,
            updatedAt: mutableNow,
          };
          mutableLane.updatedAt = mutableNow;
          mutableLane.finishedAt = mutableNow;
          if (rebasedOntoBase) {
            appendLaneEvent(
              mutableLane,
              "planner",
              `Planner rebased the lane onto ${mutableLane.baseBranch ?? lane.baseBranch} before final approval.`,
              mutableNow,
            );
          }
          appendLaneEvent(
            mutableLane,
            "reviewer",
            `Reviewer completed machine review: ${reviewerHandoff.summary}`,
            mutableNow,
          );
          appendLaneEvent(
            mutableLane,
            "system",
            `Published commit ${formatCommitActivityReference({
              commitHash: pushedCommit.commitHash,
              commitUrl: pushedCommit.commitUrl,
            })} to GitHub via ${pushedCommit.remoteName}.`,
            mutableNow,
          );
          appendLaneEvent(mutableLane, "system", pullRequestErrorMessage, mutableNow);
          appendPlannerNote(
            mutableAssignment,
            rebasedOntoBase
              ? `Proposal ${mutableLane.laneIndex} was automatically rebased onto ${mutableLane.baseBranch ?? lane.baseBranch} and pushed to GitHub after machine review, but refreshing the tracking PR failed (${pullRequestErrorSummary}).`
              : `Proposal ${mutableLane.laneIndex} passed machine review and was pushed to GitHub, but refreshing the tracking PR failed (${pullRequestErrorSummary}).`,
            mutableNow,
          );
          synchronizeDispatchAssignment(mutableAssignment, mutableNow);
        },
      });

      await appendTeamCodexLogEvent({
        threadFile: teamConfig.storage.threadFile,
        threadId,
        assignmentNumber,
        roleId: null,
        laneId,
        event: {
          source: "system",
          message: pullRequestErrorMessage,
          createdAt: new Date().toISOString(),
        },
      });

      return;
    }

    await updateTeamThreadRecord({
      threadFile: teamConfig.storage.threadFile,
      threadId,
      updater: (mutableThread, mutableNow) => {
        const mutableAssignment = findAssignment(
          mutableThread.dispatchAssignments,
          assignmentNumber,
        );
        const mutableLane = findLane(mutableAssignment, laneId);
        mutableLane.status = "approved";
        mutableLane.executionPhase = null;
        mutableLane.finalizationMode = null;
        mutableLane.proposalDisposition = "active";
        mutableLane.finalizationCheckpoint = null;
        mutableLane.latestImplementationCommit = latestImplementationCommit;
        mutableLane.pushedCommit = pushedCommit;
        mutableLane.latestDecision = reviewerHandoff.decision;
        mutableLane.latestCoderHandoff = coderHandoff;
        mutableLane.latestReviewerHandoff = reviewerHandoff;
        mutableLane.latestCoderSummary = coderHandoff.summary;
        mutableLane.latestReviewerSummary = reviewerHandoff.summary;
        mutableLane.latestActivity =
          "Reviewer completed machine review, pushed the branch to GitHub, and marked the tracking PR ready for final human approval.";
        mutableLane.runCount += 1;
        mutableLane.workerSlot = null;
        mutableLane.requeueReason = null;
        mutableLane.pullRequest = {
          ...trackingPullRequest,
          provider: "github",
          title: reviewPullRequestDraft.title,
          summary: reviewPullRequestDraft.summary,
          updatedAt: mutableNow,
          status: "awaiting_human_approval",
          humanApprovalRequestedAt: mutableNow,
          humanApprovedAt: null,
          machineReviewedAt: mutableNow,
          url: synchronizedPullRequest?.url ?? trackingPullRequest.url,
        };
        mutableLane.updatedAt = mutableNow;
        mutableLane.finishedAt = mutableNow;
        if (rebasedOntoBase) {
          appendLaneEvent(
            mutableLane,
            "planner",
            `Planner rebased the lane onto ${mutableLane.baseBranch ?? lane.baseBranch} before final approval.`,
            mutableNow,
          );
        }
        appendLaneEvent(
          mutableLane,
          "reviewer",
          `Reviewer completed machine review: ${reviewerHandoff.summary}`,
          mutableNow,
        );
        appendLaneEvent(
          mutableLane,
          "system",
          `Published commit ${formatCommitActivityReference({
            commitHash: pushedCommit.commitHash,
            commitUrl: pushedCommit.commitUrl,
          })} to GitHub via ${pushedCommit.remoteName}.`,
          mutableNow,
        );
        appendLaneEvent(
          mutableLane,
          "system",
          `GitHub PR ready: ${synchronizedPullRequest?.url ?? trackingPullRequest.url ?? "Not available"}`,
          mutableNow,
        );
        appendLaneEvent(
          mutableLane,
          "system",
          "Machine review completed. Human approval can now archive or delete the OpenSpec change while the GitHub PR stays ready for review.",
          mutableNow,
        );
        appendPlannerNote(
          mutableAssignment,
          rebasedOntoBase
            ? `Proposal ${mutableLane.laneIndex} was automatically rebased onto ${mutableLane.baseBranch ?? lane.baseBranch}, pushed to GitHub, and marked ready on GitHub after machine review. It is now waiting for final human approval.`
            : `Proposal ${mutableLane.laneIndex} was pushed to GitHub, marked ready on GitHub after machine review, and is now waiting for final human approval.`,
          mutableNow,
        );
        synchronizeDispatchAssignment(mutableAssignment, mutableNow);
      },
    });

    return;
  }
};

const ensureLaneRun = ({
  threadId,
  assignmentNumber,
  laneId,
  env,
}: {
  threadId: string;
  assignmentNumber: number;
  laneId: string;
  env: TeamRunEnv;
}): void => {
  const key = laneRunKey(threadId, assignmentNumber, laneId);
  if (activeLaneRuns.has(key)) {
    return;
  }

  const runPromise = (async () => {
    try {
      await runLaneCycle({
        threadId,
        assignmentNumber,
        laneId,
        env,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Background lane execution failed.";
      await updateTeamThreadRecord({
        threadFile: teamConfig.storage.threadFile,
        threadId,
        updater: (thread, now) => {
          const assignment = findAssignment(thread.dispatchAssignments, assignmentNumber);
          const lane = findLane(assignment, laneId);
          const isFinalArchiveLane = isFinalArchivePhase(lane);
          lane.status = isFinalArchiveLane ? "approved" : "failed";
          lane.executionPhase = null;
          lane.workerSlot = null;
          lane.lastError = message;
          lane.latestActivity = isFinalArchiveLane
            ? "Final human approval failed before the coder archive pass and GitHub PR refresh could complete."
            : "Background lane execution failed.";
          if (lane.pullRequest) {
            lane.pullRequest = {
              ...lane.pullRequest,
              status: "failed",
              updatedAt: now,
            };
          }
          lane.updatedAt = now;
          lane.finishedAt = now;
          appendLaneEvent(lane, "system", message, now);
          appendPlannerNote(
            assignment,
            isFinalArchiveLane
              ? `Final approval for proposal ${lane.laneIndex} failed: ${message}`
              : `Lane ${lane.laneIndex} failed and needs attention: ${message}`,
            now,
          );
          synchronizeDispatchAssignment(assignment, now);
        },
      });
      await appendTeamCodexLogEvent({
        threadFile: teamConfig.storage.threadFile,
        threadId,
        assignmentNumber,
        roleId: null,
        laneId,
        event: {
          source: "system",
          message,
          createdAt: new Date().toISOString(),
        },
      });
    } finally {
      activeLaneRuns.delete(key);
      void ensurePendingDispatchWork(env, threadId);
    }
  })();

  activeLaneRuns.set(key, runPromise);
};

const prioritizeThreadIds = (threadIds: string[], prioritizedThreadId?: string): string[] => {
  if (!prioritizedThreadId) {
    return threadIds;
  }

  return [...threadIds].sort((left, right) => {
    const leftPriority = left === prioritizedThreadId ? 0 : 1;
    const rightPriority = right === prioritizedThreadId ? 0 : 1;
    return leftPriority - rightPriority || left.localeCompare(right);
  });
};

export const ensurePendingDispatchWork = async (
  env: TeamRunEnv,
  threadId?: string,
): Promise<void> => {
  const pendingAssignments = await listPendingDispatchAssignments(teamConfig.storage.threadFile);
  for (const pending of pendingAssignments) {
    const thread = await getTeamThreadRecord(teamConfig.storage.threadFile, pending.threadId);
    applyThreadOwnedWorktreeToAssignment({
      assignment: pending.assignment,
      worktree: thread?.data.threadWorktree ?? null,
    });
  }

  const expectedLaneStateByKey = new Map<string, LanePoolSchedulingState>();
  for (const pending of pendingAssignments) {
    for (const lane of pending.assignment.lanes) {
      expectedLaneStateByKey.set(
        buildLanePoolStateKey({
          threadId: pending.threadId,
          assignmentNumber: pending.assignment.assignmentNumber,
          laneId: lane.laneId,
        }),
        captureLanePoolSchedulingState(lane),
      );
    }
  }

  assignPendingDispatchWorkerSlots({
    pendingAssignments,
    resolveAssignmentWorktreeRoot: (pending) =>
      path.isAbsolute(teamConfig.dispatch.worktreeRoot)
        ? teamConfig.dispatch.worktreeRoot
        : path.join(pending.assignment.repository?.path ?? "", teamConfig.dispatch.worktreeRoot),
  });

  const plannedLaneStateByKey = new Map<string, PlannedLanePoolState>();
  const pendingAssignmentsByThread = new Map<string, PendingDispatchAssignment[]>();
  for (const pending of pendingAssignments) {
    for (const lane of pending.assignment.lanes) {
      const lanePoolStateKey = buildLanePoolStateKey({
        threadId: pending.threadId,
        assignmentNumber: pending.assignment.assignmentNumber,
        laneId: lane.laneId,
      });
      const expectedLaneState = expectedLaneStateByKey.get(lanePoolStateKey);
      if (!expectedLaneState) {
        continue;
      }

      plannedLaneStateByKey.set(lanePoolStateKey, {
        expected: expectedLaneState,
        planned: {
          workerSlot: lane.workerSlot,
          worktreePath: lane.worktreePath,
        },
      });
    }

    const pendingForThread = pendingAssignmentsByThread.get(pending.threadId) ?? [];
    pendingForThread.push(pending);
    pendingAssignmentsByThread.set(pending.threadId, pendingForThread);
  }

  for (const currentThreadId of prioritizeThreadIds(
    [...pendingAssignmentsByThread.keys()],
    threadId,
  )) {
    const pendingForThread = pendingAssignmentsByThread.get(currentThreadId);
    if (!pendingForThread) {
      continue;
    }

    await updateTeamThreadRecord({
      threadFile: teamConfig.storage.threadFile,
      threadId: currentThreadId,
      updater: (thread, now) => {
        for (const pending of pendingForThread) {
          const assignment = findAssignment(
            thread.dispatchAssignments,
            pending.assignment.assignmentNumber,
          );
          applyThreadOwnedWorktreeToAssignment({
            assignment,
            worktree: thread.data.threadWorktree ?? null,
          });

          for (const lane of assignment.lanes) {
            const plannedLaneState = plannedLaneStateByKey.get(
              buildLanePoolStateKey({
                threadId: currentThreadId,
                assignmentNumber: assignment.assignmentNumber,
                laneId: lane.laneId,
              }),
            );
            if (!plannedLaneState) {
              continue;
            }

            if (!lanePoolSchedulingStateMatches(lane, plannedLaneState.expected)) {
              continue;
            }

            lane.workerSlot = plannedLaneState.planned.workerSlot;
            lane.worktreePath = plannedLaneState.planned.worktreePath;
          }

          synchronizeDispatchAssignment(assignment, now);
        }
      },
    });
  }

  const refreshedAssignments = await listPendingDispatchAssignments(teamConfig.storage.threadFile);

  for (const pending of refreshedAssignments) {
    for (const lane of pending.assignment.lanes) {
      if (
        (lane.status === "queued" || lane.status === "coding" || lane.status === "reviewing") &&
        lane.workerSlot
      ) {
        ensureLaneRun({
          threadId: pending.threadId,
          assignmentNumber: pending.assignment.assignmentNumber,
          laneId: lane.laneId,
          env,
        });
      }
    }
  }
};

export const runReviewingStage = async (
  env: TeamRunEnv,
  currentState: TeamRunReviewingStageState,
): Promise<TeamRunCompletedState> => {
  await ensurePendingDispatchWork(env, currentState.threadId);

  return {
    stage: "completed",
    args: currentState.args,
    result: currentState.result,
  };
};
