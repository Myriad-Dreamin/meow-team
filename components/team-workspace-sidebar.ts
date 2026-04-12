import {
  formatThreadId,
  formatTimestamp,
  threadStatusLabels,
} from "@/components/thread-view-utils";
import type { TeamRepositoryOption } from "@/lib/git/repository";
import type { TeamThreadSummary } from "@/lib/team/history";

export type ThreadRepositoryGroup = {
  key: string;
  title: string;
  description: string;
  threads: TeamThreadSummary[];
};

export type ThreadSidebarMetadata = {
  statusLine: string;
  updatedLine: string;
};

export const NO_REPOSITORY_GROUP_KEY = "__no_repository__";

const alphabeticalCollator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

const compareAlphabetically = (left: string, right: string): number => {
  return alphabeticalCollator.compare(left, right);
};

const getThreadSortTitle = (thread: TeamThreadSummary): string => {
  const title = thread.requestTitle.trim();
  return title || thread.threadId;
};

const compareThreadSummaries = (left: TeamThreadSummary, right: TeamThreadSummary): number => {
  return (
    compareAlphabetically(getThreadSortTitle(left), getThreadSortTitle(right)) ||
    compareAlphabetically(left.threadId, right.threadId)
  );
};

const compareThreadRepositoryGroups = (
  left: ThreadRepositoryGroup,
  right: ThreadRepositoryGroup,
): number => {
  if (left.key === NO_REPOSITORY_GROUP_KEY) {
    return right.key === NO_REPOSITORY_GROUP_KEY ? 0 : 1;
  }

  if (right.key === NO_REPOSITORY_GROUP_KEY) {
    return -1;
  }

  return (
    compareAlphabetically(left.title, right.title) ||
    compareAlphabetically(left.description, right.description) ||
    compareAlphabetically(left.key, right.key)
  );
};

export const formatRepositoryGroupDescription = (repository: TeamRepositoryOption): string => {
  const repositoryLabel =
    repository.relativePath === "." ? repository.name : repository.relativePath;
  return `${repository.rootLabel} / ${repositoryLabel}`;
};

export const getThreadRepositoryGroupKey = (
  thread: Pick<TeamThreadSummary, "repository">,
): string => {
  return thread.repository?.id ?? NO_REPOSITORY_GROUP_KEY;
};

export const buildThreadRepositoryGroups = (
  threads: TeamThreadSummary[],
): ThreadRepositoryGroup[] => {
  const groups = new Map<string, ThreadRepositoryGroup>();

  for (const thread of threads) {
    const repository = thread.repository;
    const groupKey = getThreadRepositoryGroupKey(thread);
    const existingGroup = groups.get(groupKey);

    if (existingGroup) {
      existingGroup.threads.push(thread);
      continue;
    }

    groups.set(groupKey, {
      key: groupKey,
      title: repository?.name ?? "No Repository",
      description: repository
        ? formatRepositoryGroupDescription(repository)
        : "Threads without a selected repository",
      threads: [thread],
    });
  }

  const nextGroups = Array.from(groups.values());
  for (const group of nextGroups) {
    group.threads.sort(compareThreadSummaries);
  }

  return nextGroups.sort(compareThreadRepositoryGroups);
};

export const formatThreadSidebarMetadata = (
  thread: Pick<TeamThreadSummary, "threadId" | "status" | "updatedAt">,
): ThreadSidebarMetadata => {
  return {
    statusLine: `Thread ${formatThreadId(thread.threadId)} - ${threadStatusLabels[thread.status]}`,
    updatedLine: `Updated ${formatTimestamp(thread.updatedAt)}`,
  };
};
