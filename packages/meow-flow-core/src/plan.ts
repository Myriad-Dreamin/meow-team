import type { NormalizedMeowFlowRepositoryRoot, NormalizedMeowFlowTeamConfig } from "./config.js";

export type MeowFlowRepositoryCandidate = Pick<
  NormalizedMeowFlowRepositoryRoot,
  "id" | "label" | "directory" | "priority"
>;

export type MeowFlowWorktreeAllocationDescriptor = {
  readonly repositoryId: string;
  readonly repositoryLabel: string;
  readonly repositoryDirectory: string;
  readonly worktreeParentDirectory: string;
  readonly worktreeTheme: string;
  readonly worktreeNameTemplate: string;
  readonly priority: number;
};

export type MeowFlowTeamPlan = {
  readonly repositoryCandidates: readonly MeowFlowRepositoryCandidate[];
  readonly worktreeAllocations: readonly MeowFlowWorktreeAllocationDescriptor[];
};

export function createMeowFlowTeamPlan(config: NormalizedMeowFlowTeamConfig): MeowFlowTeamPlan {
  const repositoryCandidates = config.repositories.map((repository) => ({
    id: repository.id,
    label: repository.label,
    directory: repository.directory,
    priority: repository.priority,
  }));

  const worktreeAllocations = config.repositories.map((repository) => ({
    repositoryId: repository.id,
    repositoryLabel: repository.label,
    repositoryDirectory: repository.directory,
    worktreeParentDirectory: repository.worktreeParentDirectory,
    worktreeTheme: repository.worktreeTheme,
    worktreeNameTemplate: `${repository.worktreeTheme}-{assignment}`,
    priority: repository.priority,
  }));

  return {
    repositoryCandidates,
    worktreeAllocations,
  };
}
