import type { TeamRepositoryOption } from "@/lib/git/repository";

export type TeamRepositoryUsageRecord = {
  repositoryId: string;
  requestedAt: string;
};

export type TeamRepositoryPickerModel = {
  suggestedRepositories: TeamRepositoryOption[];
  remainingRepositories: TeamRepositoryOption[];
  orderedRepositories: TeamRepositoryOption[];
};

const isMoreRecentTimestamp = (candidate: string, current: string): boolean => {
  return candidate.localeCompare(current) > 0;
};

export const buildTeamRepositoryPickerModel = ({
  repositories,
  usageRecords,
}: {
  repositories: TeamRepositoryOption[];
  usageRecords: TeamRepositoryUsageRecord[];
}): TeamRepositoryPickerModel => {
  const repositoryOrder = new Map(repositories.map((repository, index) => [repository.id, index]));
  const latestRequestedAtByRepositoryId = new Map<string, string>();

  for (const usageRecord of usageRecords) {
    if (!repositoryOrder.has(usageRecord.repositoryId)) {
      continue;
    }

    const latestRequestedAt = latestRequestedAtByRepositoryId.get(usageRecord.repositoryId);
    if (!latestRequestedAt || isMoreRecentTimestamp(usageRecord.requestedAt, latestRequestedAt)) {
      latestRequestedAtByRepositoryId.set(usageRecord.repositoryId, usageRecord.requestedAt);
    }
  }

  const suggestedRepositories = repositories
    .filter((repository) => latestRequestedAtByRepositoryId.has(repository.id))
    .sort((left, right) => {
      const leftRequestedAt = latestRequestedAtByRepositoryId.get(left.id) ?? "";
      const rightRequestedAt = latestRequestedAtByRepositoryId.get(right.id) ?? "";
      const requestedAtComparison = rightRequestedAt.localeCompare(leftRequestedAt);

      if (requestedAtComparison !== 0) {
        return requestedAtComparison;
      }

      return (repositoryOrder.get(left.id) ?? 0) - (repositoryOrder.get(right.id) ?? 0);
    });

  const suggestedRepositoryIds = new Set(suggestedRepositories.map((repository) => repository.id));
  const remainingRepositories = repositories.filter(
    (repository) => !suggestedRepositoryIds.has(repository.id),
  );

  return {
    suggestedRepositories,
    remainingRepositories,
    orderedRepositories: [...suggestedRepositories, ...remainingRepositories],
  };
};
