import "server-only";

import type { TeamRepositoryOption } from "@/lib/git/repository";
import type { TeamThreadRecord } from "@/lib/team/history";
import type { ConventionalTitleMetadata } from "@/lib/team/request-title";
import type { TeamRoleDependencies } from "@/lib/team/roles/dependencies";
import type { TeamCodexLogEntry, TeamExecutionStep, TeamRoleHandoff } from "@/lib/team/types";

export type TeamRunState = {
  teamId: string;
  teamName: string;
  ownerName: string;
  objective: string;
  selectedRepository: TeamRepositoryOption | null;
  workflow: string[];
  handoffs: Partial<Record<string, TeamRoleHandoff>>;
  handoffCounter: number;
  assignmentNumber: number;
  requestTitle: string | null;
  conventionalTitle: ConventionalTitleMetadata | null;
  requestText: string | null;
  latestInput: string | null;
  forceReset: boolean;
};

export type TeamRunSummary = {
  threadId: string | null;
  assignmentNumber: number;
  requestTitle: string;
  requestText: string;
  approved: boolean;
  repository: TeamRepositoryOption | null;
  workflow: string[];
  handoffs: TeamRoleHandoff[];
  steps: TeamExecutionStep[];
};

export type TeamPlanningRunArgs = {
  kind: "planning";
  input: string;
  threadId: string;
  title?: string;
  requestText?: string;
  repositoryId?: string;
  reset?: boolean;
  deleteExistingBranches?: boolean;
};

export type TeamDispatchRunArgs = {
  kind: "dispatch";
  threadId?: string;
};

export type TeamProposalApprovalRunArgs = {
  kind: "proposal-approval";
  threadId: string;
  assignmentNumber: number;
  laneId: string;
};

export type TeamPullRequestApprovalRunArgs = {
  kind: "pull-request-approval";
  threadId: string;
  assignmentNumber: number;
  laneId: string;
};

export type TeamRunArgs =
  | TeamPlanningRunArgs
  | TeamDispatchRunArgs
  | TeamProposalApprovalRunArgs
  | TeamPullRequestApprovalRunArgs;

export type TeamRunStage =
  | "init"
  | "planning"
  | "metadata-generation"
  | "coding"
  | "reviewing"
  | "archiving"
  | "completed";

export type TeamRunResult = TeamRunSummary | null;

export type TeamRunEnv = {
  deps: TeamRoleDependencies;
  persistState: (state: TeamRunMachineState) => Promise<void> | void;
  onPlannerLogEntry?: (entry: TeamCodexLogEntry) => Promise<void> | void;
};

export type ResolvedRequestMetadata = {
  requestTitle: string;
  conventionalTitle: ConventionalTitleMetadata | null;
  requestText: string;
};

export type InitialRequestMetadata = {
  requestTitle: string | null;
  conventionalTitle: ConventionalTitleMetadata | null;
  requestText: string;
};

export type PlannerAgentResult = Awaited<ReturnType<TeamRoleDependencies["plannerAgent"]["run"]>>;
export type PersistedTeamThread = TeamThreadRecord;

export type TeamRunPlanningContext = {
  threadId: string;
  selectedRepository: TeamRepositoryOption | null;
  existingThread: TeamThreadRecord | null;
  shouldResetAssignment: boolean;
  state: TeamRunState;
  requestMetadata: InitialRequestMetadata;
};

export type TeamRunInitState = {
  stage: "init";
  args: TeamRunArgs;
};

export type TeamRunPlanningStageState = {
  stage: "planning";
  args: TeamPlanningRunArgs;
  context: TeamRunPlanningContext;
};

export type TeamRunMetadataGenerationStageState = {
  stage: "metadata-generation";
  args: TeamPlanningRunArgs;
  context: TeamRunPlanningContext;
  plannerResponse: PlannerAgentResult;
  plannerRoleName: string;
};

export type TeamRunCodingStageState = {
  stage: "coding";
  args: TeamProposalApprovalRunArgs;
};

export type TeamRunReviewingStageState = {
  stage: "reviewing";
  args: TeamRunArgs;
  threadId?: string;
  result: TeamRunResult;
};

export type TeamRunArchivingStageState = {
  stage: "archiving";
  args: TeamPullRequestApprovalRunArgs;
};

export type TeamRunCompletedState = {
  stage: "completed";
  args: TeamRunArgs;
  result: TeamRunResult;
};

export type TeamRunMachineState =
  | TeamRunInitState
  | TeamRunPlanningStageState
  | TeamRunMetadataGenerationStageState
  | TeamRunCodingStageState
  | TeamRunReviewingStageState
  | TeamRunArchivingStageState
  | TeamRunCompletedState;
