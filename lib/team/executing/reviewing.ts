import "server-only";

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
import { ensureLaneWorktree, pushLaneBranch } from "@/lib/team/git";
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
  type TeamRunEnv,
} from "@/lib/team/coding/shared";
import {
  getTeamThreadRecord,
  synchronizeDispatchAssignment,
  updateTeamThreadRecord,
} from "@/lib/team/history";
import { appendTeamCodexLogEvent } from "@/lib/team/logs";
import type { ConventionalTitleMetadata } from "@/lib/team/request-title";
import { buildExecutionLaneRunState } from "@/lib/team/executing/lane-state";
import { executionReviewerRole } from "@/lib/team/roles/execution-reviewer";
import { executorRole } from "@/lib/team/roles/executor";
import type { Worktree } from "@/lib/team/coding/worktree";
import type { TeamRoleHandoff, TeamWorkerLaneRecord } from "@/lib/team/types";

const getLaneWorkflow = (): string[] => {
  return ["executor", "execution-reviewer"];
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

const inferExecutionReviewerDecisionFromLane = (
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

const buildSyntheticExecutionReviewerHandoff = (
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

  const decision = inferExecutionReviewerDecisionFromLane(lane);
  if (!decision) {
    return null;
  }

  return {
    roleId: "execution-reviewer",
    roleName: "Execution Reviewer",
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
    handoffs.executor = lane.latestCoderHandoff;
  }

  const reviewerHandoff =
    lane.latestReviewerHandoff ??
    buildSyntheticExecutionReviewerHandoff(
      lane,
      assignmentNumber,
      Math.max((lane.latestCoderHandoff?.sequence ?? 0) + 1, 1),
    );

  if (reviewerHandoff) {
    handoffs["execution-reviewer"] = reviewerHandoff;
  }

  return handoffs;
};

const buildExecutorCommitMessage = ({
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
    summary: `execute ${taskLabel}`,
  });
};

const noBranchOutputMessage =
  "Executor completed without producing a new branch commit. The lane was stopped to avoid an infinite executor/execution-reviewer loop.";

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
  let latestImplementationCommit = lane.latestImplementationCommit;
  let updatedPushedCommit = lane.pushedCommit;
  let archivedProposalPath = lane.proposalPath;
  let archivePersistedToBranch =
    lane.proposalPath?.startsWith("openspec/changes/archive/") ?? false;
  let executorHandoff: TeamRoleHandoff | null = null;
  let executorArchivedThisRun = false;
  const refreshLatestImplementationCommit = async (): Promise<string> => {
    latestImplementationCommit = await getBranchHead({
      repositoryPath,
      branchName: laneBranchName,
    });

    return latestImplementationCommit;
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
        mutableLane.lastError = null;
        mutableLane.startedAt = mutableLane.startedAt ?? now;
        mutableLane.finishedAt = null;
        mutableLane.latestActivity = mutableLane.proposalPath?.startsWith(
          "openspec/changes/archive/",
        )
          ? "Final approval is refreshing GitHub delivery for the archived OpenSpec change."
          : `Executor is running non-interactive /opsx:archive ${mutableLane.proposalChangeName} for final approval.`;
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

    const preArchiveState = await inspectOpenSpecChangeArchiveState({
      worktreePath: laneWorktree.path,
      changeName: lane.proposalChangeName,
    });

    if (preArchiveState.sourceExists && preArchiveState.archivedPath) {
      throw new Error(
        `OpenSpec change ${lane.proposalChangeName} exists in both active and archived paths.`,
      );
    }

    if (preArchiveState.sourceExists) {
      const executorState = await buildExecutionLaneRunState({
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
      const executorResponse = await env.deps.executorAgent.run({
        state: executorState,
        input: buildFinalArchiveInput({
          lane,
        }),
        onEvent: async (event) => {
          await appendTeamCodexLogEvent({
            threadFile: teamConfig.storage.threadFile,
            threadId,
            assignmentNumber,
            roleId: executorRole.id,
            laneId,
            event,
          });
        },
      });

      executorHandoff = applyHandoff({
        state: executorState,
        role: executorRole,
        summary: executorResponse.summary,
        deliverable: executorResponse.deliverable,
        decision: executorResponse.decision,
      });

      if (await hasWorktreeChanges(laneWorktree.path)) {
        await commitWorktreeChanges({
          worktreePath: laneWorktree.path,
          message: buildExecutorCommitMessage({
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
          `Final archive executor pass did not archive OpenSpec change ${lane.proposalChangeName}.`,
        );
      }

      archivedProposalPath = postArchiveState.archivedPath;
      archivePersistedToBranch = true;
      executorArchivedThisRun = true;
    } else if (preArchiveState.archivedPath) {
      archivedProposalPath = preArchiveState.archivedPath;
      archivePersistedToBranch = true;
    } else {
      throw new Error(
        `OpenSpec change ${lane.proposalChangeName} was not found in the active or archived OpenSpec directories.`,
      );
    }

    await refreshLatestImplementationCommit();

    updatedPushedCommit = latestImplementationCommit
      ? await pushLaneBranch({
          repositoryPath: assignment.repository.path,
          branchName: lane.branchName,
          commitHash: latestImplementationCommit,
        })
      : null;

    if (!latestImplementationCommit || !updatedPushedCommit) {
      throw new Error(
        "Final approval could not resolve the archived branch head for GitHub delivery.",
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
        mutableLane.proposalPath = archivedProposalPath;
        mutableLane.latestImplementationCommit = finalizedCommitHash;
        mutableLane.pushedCommit = finalizedPushedCommit;
        if (executorHandoff) {
          mutableLane.latestCoderHandoff = executorHandoff;
          mutableLane.latestCoderSummary = executorHandoff.summary;
        }
        mutableLane.latestActivity =
          "Human approval finalized the machine-reviewed branch, archived the OpenSpec change, and refreshed the GitHub PR.";
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
        if (executorHandoff) {
          appendLaneEvent(
            mutableLane,
            "executor",
            `Executor completed final archive pass: ${executorHandoff.summary}`,
            now,
          );
        }
        appendLaneEvent(
          mutableLane,
          "system",
          executorArchivedThisRun || archivedProposalPath !== lane.proposalPath
            ? `Archived OpenSpec change to ${archivedProposalPath} and pushed commit ${formatCommitActivityReference(
                {
                  commitHash: finalizedCommitHash,
                  commitUrl: finalizedPushedCommit.commitUrl,
                },
              )} to GitHub via ${finalizedPushedCommit.remoteName}.`
            : `Verified archived OpenSpec change at ${archivedProposalPath} and refreshed commit ${formatCommitActivityReference(
                {
                  commitHash: finalizedCommitHash,
                  commitUrl: finalizedPushedCommit.commitUrl,
                },
              )} on GitHub via ${finalizedPushedCommit.remoteName}.`,
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
          `Human approved proposal ${mutableLane.laneIndex}; ${archivedProposalPath} is archived on ${mutableLane.branchName ?? lane.branchName}, and the GitHub PR was refreshed at ${synchronizedPullRequest.url}.`,
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
        if (archivePersistedToBranch) {
          mutableLane.proposalPath = archivedProposalPath;
        }
        mutableLane.latestImplementationCommit = latestImplementationCommit;
        mutableLane.pushedCommit = updatedPushedCommit;
        if (executorHandoff) {
          mutableLane.latestCoderHandoff = executorHandoff;
          mutableLane.latestCoderSummary = executorHandoff.summary;
        }
        mutableLane.latestActivity = archivePersistedToBranch
          ? "Final human approval archived the OpenSpec change, but the GitHub PR refresh did not complete."
          : "Final human approval failed before the executor archive pass and GitHub PR refresh could complete.";
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
        if (executorHandoff) {
          appendLaneEvent(
            mutableLane,
            "executor",
            `Executor completed final archive pass: ${executorHandoff.summary}`,
            now,
          );
        }
        appendLaneEvent(mutableLane, "system", errorSummary, now);
        appendPlannerNote(
          mutableAssignment,
          archivePersistedToBranch &&
            archivedProposalPath &&
            archivedProposalPath !== lane.proposalPath
            ? `Final approval for proposal ${mutableLane.laneIndex} failed after archiving ${archivedProposalPath}: ${errorSummary}`
            : `Final approval for proposal ${mutableLane.laneIndex} failed: ${errorSummary}`,
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

export const runExecutingLaneCycle = async ({
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

    if (!assignment.executionMode) {
      throw new Error("Execute lane is missing execute-mode assignment metadata.");
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
            ? "Executor is resolving a planner-detected pull request conflict."
            : mutableLane.requeueReason === "reviewer_requested_changes"
              ? "Executor is addressing execution-reviewer feedback."
              : "Executor is implementing the approved execution plan in the dedicated worktree.";
        mutableLane.updatedAt = now;
        appendLaneEvent(mutableLane, "executor", mutableLane.latestActivity, now);
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

    const branchHeadBeforeExecution = await getBranchHead({
      repositoryPath: assignment.repository.path,
      branchName: lane.branchName,
    });

    const executorState = await buildExecutionLaneRunState({
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
    const executorResponse = await env.deps.executorAgent.run({
      state: executorState,
      input:
        lane.taskObjective ?? lane.taskTitle ?? assignment.plannerSummary ?? "Execute the task.",
      onEvent: async (event) => {
        await appendTeamCodexLogEvent({
          threadFile: teamConfig.storage.threadFile,
          threadId,
          assignmentNumber,
          roleId: executorRole.id,
          laneId,
          event,
        });
      },
    });

    const executorHandoff = applyHandoff({
      state: executorState,
      role: executorRole,
      summary: executorResponse.summary,
      deliverable: executorResponse.deliverable,
      decision: executorResponse.decision,
    });

    if (await hasWorktreeChanges(laneWorktree.path)) {
      await commitWorktreeChanges({
        worktreePath: laneWorktree.path,
        message: buildExecutorCommitMessage({
          lane,
          conventionalTitle: assignment.conventionalTitle,
        }),
      });
    }

    const branchHeadAfterExecution = await getBranchHead({
      repositoryPath: assignment.repository.path,
      branchName: lane.branchName,
    });

    if (branchHeadAfterExecution === branchHeadBeforeExecution) {
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
          mutableLane.latestCoderHandoff = executorHandoff;
          mutableLane.latestCoderSummary = executorHandoff.summary;
          mutableLane.latestDecision = executorHandoff.decision;
          mutableLane.latestActivity = "Executor finished without producing branch output.";
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
          appendLaneEvent(
            mutableLane,
            "executor",
            `Executor handoff: ${executorHandoff.summary}`,
            now,
          );
          appendLaneEvent(mutableLane, "system", noBranchOutputMessage, now);
          appendPlannerNote(
            mutableAssignment,
            `Lane ${mutableLane.laneIndex} stopped because the executor produced no branch output.`,
            now,
          );
          synchronizeDispatchAssignment(mutableAssignment, now);
        },
      });

      await appendTeamCodexLogEvent({
        threadFile: teamConfig.storage.threadFile,
        threadId,
        assignmentNumber,
        roleId: executorRole.id,
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
          commitHash: branchHeadAfterExecution,
        });
        mutableLane.status = "reviewing";
        mutableLane.executionPhase = "implementation";
        mutableLane.latestImplementationCommit = branchHeadAfterExecution;
        mutableLane.pushedCommit = null;
        mutableLane.latestCoderHandoff = executorHandoff;
        mutableLane.latestCoderSummary = executorHandoff.summary;
        mutableLane.latestDecision = executorHandoff.decision;
        mutableLane.latestActivity = `Execution reviewer is validating implementation commit ${reviewCommit}.`;
        mutableLane.updatedAt = now;
        appendLaneEvent(
          mutableLane,
          "executor",
          `Executor requested review for commit ${reviewCommit}: ${executorHandoff.summary}`,
          now,
        );
        appendLaneEvent(mutableLane, "execution-reviewer", mutableLane.latestActivity, now);
        synchronizeDispatchAssignment(mutableAssignment, now);
      },
    });

    const reviewerLane: TeamWorkerLaneRecord = {
      ...lane,
      status: "reviewing",
      executionPhase: "implementation",
      latestImplementationCommit: branchHeadAfterExecution,
      pushedCommit: null,
      latestCoderHandoff: executorHandoff,
      latestCoderSummary: executorHandoff.summary,
      latestDecision: executorHandoff.decision,
    };

    const executionReviewerState = await buildExecutionLaneRunState({
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
        executor: executorHandoff,
      },
    });
    const executionReviewerResponse = await env.deps.executionReviewerAgent.run({
      state: executionReviewerState,
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
          roleId: executionReviewerRole.id,
          laneId,
          event,
        });
      },
    });
    const executionReviewerHandoff = applyHandoff({
      state: executionReviewerState,
      role: executionReviewerRole,
      summary: executionReviewerResponse.summary,
      deliverable: executionReviewerResponse.deliverable,
      decision: executionReviewerResponse.decision,
    });
    executionReviewerState.pullRequestDraft =
      executionReviewerResponse.pullRequestTitle && executionReviewerResponse.pullRequestSummary
        ? buildCanonicalLanePullRequestDraft({
            assignment,
            lane,
            summary: executionReviewerResponse.pullRequestSummary,
          })
        : null;

    if (executionReviewerHandoff.decision === "needs_revision") {
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
          mutableLane.latestDecision = executionReviewerHandoff.decision;
          mutableLane.latestCoderHandoff = executorHandoff;
          mutableLane.latestReviewerHandoff = executionReviewerHandoff;
          mutableLane.latestCoderSummary = executorHandoff.summary;
          mutableLane.latestReviewerSummary = executionReviewerHandoff.summary;
          mutableLane.latestActivity =
            "Execution reviewer requested changes and returned the proposal to the execution-review queue.";
          mutableLane.runCount += 1;
          mutableLane.revisionCount += 1;
          mutableLane.queuedAt = now;
          mutableLane.requeueReason = "reviewer_requested_changes";
          mutableLane.updatedAt = now;
          mutableLane.finishedAt = null;
          appendLaneEvent(
            mutableLane,
            "execution-reviewer",
            `Execution reviewer requested changes: ${executionReviewerHandoff.summary}`,
            now,
          );
          synchronizeDispatchAssignment(mutableAssignment, now);
        },
      });

      continue;
    }

    const now = new Date().toISOString();
    const reviewPullRequestDraft =
      executionReviewerState.pullRequestDraft ??
      buildCanonicalLanePullRequestDraft({
        assignment,
        lane,
        summary: executionReviewerHandoff.summary,
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

    let latestImplementationCommit = branchHeadAfterExecution;
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

    const rebasedOntoBase = latestImplementationCommit !== branchHeadAfterExecution;
    const rebaseFailureActivity = hasConflict
      ? "Planner detected a pull request conflict and the auto-rebase attempt failed, so the proposal was requeued."
      : "Planner could not rebase the lane onto the base branch, so the proposal was requeued for conflict resolution.";
    const rebaseFailureReviewerEvent = hasConflict
      ? `Execution reviewer approved the proposal, but the planner auto-rebase attempt failed after detecting a conflict: ${executionReviewerHandoff.summary}`
      : `Execution reviewer approved the proposal, but the planner auto-rebase attempt onto ${lane.baseBranch} failed: ${executionReviewerHandoff.summary}`;
    const rebaseFailurePlannerNote = hasConflict
      ? `Conflict detected for proposal ${lane.laneIndex}; automatic rebase onto ${lane.baseBranch} failed (${rebaseErrorSummary}), so the executor was requeued before machine review could complete.`
      : `Proposal ${lane.laneIndex} passed machine review, but the automatic rebase onto ${lane.baseBranch} failed (${rebaseErrorSummary}), so the executor was requeued before machine review could complete.`;

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
          mutableLane.latestDecision = executionReviewerHandoff.decision;
          mutableLane.latestCoderHandoff = executorHandoff;
          mutableLane.latestReviewerHandoff = executionReviewerHandoff;
          mutableLane.latestCoderSummary = executorHandoff.summary;
          mutableLane.latestReviewerSummary = executionReviewerHandoff.summary;
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
          appendLaneEvent(
            mutableLane,
            "execution-reviewer",
            rebaseFailureReviewerEvent,
            mutableNow,
          );
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
          mutableLane.latestDecision = executionReviewerHandoff.decision;
          mutableLane.latestCoderHandoff = executorHandoff;
          mutableLane.latestReviewerHandoff = executionReviewerHandoff;
          mutableLane.latestCoderSummary = executorHandoff.summary;
          mutableLane.latestReviewerSummary = executionReviewerHandoff.summary;
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
            "execution-reviewer",
            `Execution reviewer completed machine review: ${executionReviewerHandoff.summary}`,
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
          mutableLane.latestImplementationCommit = latestImplementationCommit;
          mutableLane.pushedCommit = pushedCommit;
          mutableLane.latestDecision = executionReviewerHandoff.decision;
          mutableLane.latestCoderHandoff = executorHandoff;
          mutableLane.latestReviewerHandoff = executionReviewerHandoff;
          mutableLane.latestCoderSummary = executorHandoff.summary;
          mutableLane.latestReviewerSummary = executionReviewerHandoff.summary;
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
            "execution-reviewer",
            `Execution reviewer completed machine review: ${executionReviewerHandoff.summary}`,
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
        mutableLane.latestImplementationCommit = latestImplementationCommit;
        mutableLane.pushedCommit = pushedCommit;
        mutableLane.latestDecision = executionReviewerHandoff.decision;
        mutableLane.latestCoderHandoff = executorHandoff;
        mutableLane.latestReviewerHandoff = executionReviewerHandoff;
        mutableLane.latestCoderSummary = executorHandoff.summary;
        mutableLane.latestReviewerSummary = executionReviewerHandoff.summary;
        mutableLane.latestActivity =
          "Execution reviewer completed validation review, pushed the branch to GitHub, and marked the tracking PR ready for final human approval.";
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
          "execution-reviewer",
          `Execution reviewer completed machine review: ${executionReviewerHandoff.summary}`,
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
          "Machine review completed. Human approval can now archive the OpenSpec change while the GitHub PR stays ready for review.",
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
