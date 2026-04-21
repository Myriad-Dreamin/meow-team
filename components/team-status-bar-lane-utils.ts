import { isTerminalTeamThreadStatus } from "@/components/team-thread-status";
import { formatThreadId } from "@/components/thread-view-utils";
import type { TeamThreadSummary } from "@/lib/team/history";
import type { TeamWorkerLaneStatus } from "@/lib/team/types";

export const teamStatusLaneItems = [
  {
    key: "queued",
    workerStatus: "queued",
    label: "Queued",
    className: "status-queued",
  },
  {
    key: "coding",
    workerStatus: "coding",
    label: "Coding",
    className: "status-coding",
  },
  {
    key: "reviewing",
    workerStatus: "reviewing",
    label: "Reviewing",
    className: "status-reviewing",
  },
  {
    key: "awaitingHumanApproval",
    workerStatus: "awaiting_human_approval",
    label: "Awaiting Approval",
    className: "status-awaiting_human_approval",
  },
  {
    key: "approved",
    workerStatus: "approved",
    label: "Approved",
    className: "status-approved",
  },
  {
    key: "failed",
    workerStatus: "failed",
    label: "Failed",
    className: "status-failed",
  },
] as const;

export type TeamStatusLaneCountKey = (typeof teamStatusLaneItems)[number]["key"];

export type TeamStatusLaneThreadItem = {
  threadId: string;
  title: string;
  shortThreadId: string;
  matchingLaneCount: number;
};

export type TeamStatusLaneThreadBuckets = Record<
  TeamStatusLaneCountKey,
  TeamStatusLaneThreadItem[]
>;

export type TeamStatusLanePopoverCopy = {
  summary: string;
  detail: string | null;
};

export type TeamStatusLanePopoverTrigger = "hover" | "focus" | "click";

export type TeamStatusLanePopoverState = {
  key: TeamStatusLaneCountKey;
  trigger: TeamStatusLanePopoverTrigger;
};

const createEmptyTeamStatusLaneThreadBuckets = (): TeamStatusLaneThreadBuckets => {
  return {
    queued: [],
    coding: [],
    reviewing: [],
    awaitingHumanApproval: [],
    approved: [],
    failed: [],
  };
};

const pluralize = (count: number, singular: string): string => {
  return `${count} ${count === 1 ? singular : `${singular}s`}`;
};

const getTeamStatusLaneBucketKey = (
  status: TeamWorkerLaneStatus,
): TeamStatusLaneCountKey | null => {
  switch (status) {
    case "queued":
      return "queued";
    case "coding":
      return "coding";
    case "reviewing":
      return "reviewing";
    case "awaiting_human_approval":
    case "awaiting_retry_approval":
      return "awaitingHumanApproval";
    case "cancelled":
      return null;
    case "approved":
      return "approved";
    case "failed":
      return "failed";
    case "idle":
      return null;
  }
};

const getTeamStatusLaneThreadTitle = (
  thread: Pick<TeamThreadSummary, "requestTitle" | "threadId">,
): string => {
  const trimmedTitle = thread.requestTitle.trim();
  return trimmedTitle || `Thread ${formatThreadId(thread.threadId)}`;
};

export const buildTeamStatusLaneThreadBuckets = (
  threads: Array<
    Pick<TeamThreadSummary, "archivedAt" | "requestTitle" | "status" | "threadId" | "workerLanes">
  >,
): TeamStatusLaneThreadBuckets => {
  const buckets = createEmptyTeamStatusLaneThreadBuckets();

  for (const thread of threads) {
    if (thread.archivedAt || isTerminalTeamThreadStatus(thread.status)) {
      continue;
    }

    const matchingLaneCounts: Partial<Record<TeamStatusLaneCountKey, number>> = {};

    for (const lane of thread.workerLanes) {
      const bucketKey = getTeamStatusLaneBucketKey(lane.status);
      if (!bucketKey) {
        continue;
      }

      matchingLaneCounts[bucketKey] = (matchingLaneCounts[bucketKey] ?? 0) + 1;
    }

    for (const item of teamStatusLaneItems) {
      const matchingLaneCount = matchingLaneCounts[item.key];
      if (!matchingLaneCount) {
        continue;
      }

      buckets[item.key].push({
        threadId: thread.threadId,
        title: getTeamStatusLaneThreadTitle(thread),
        shortThreadId: formatThreadId(thread.threadId),
        matchingLaneCount,
      });
    }
  }

  return buckets;
};

export const getNextTeamStatusLanePopoverState = (
  currentState: TeamStatusLanePopoverState | null,
  laneKey: TeamStatusLaneCountKey,
  trigger: TeamStatusLanePopoverTrigger,
): TeamStatusLanePopoverState | null => {
  if (trigger === "click") {
    if (currentState?.key === laneKey && currentState.trigger === "click") {
      return null;
    }

    return {
      key: laneKey,
      trigger,
    };
  }

  if (currentState?.key === laneKey && currentState.trigger === "click") {
    return currentState;
  }

  return {
    key: laneKey,
    trigger,
  };
};

export const describeTeamStatusLanePopover = (
  threads: TeamStatusLaneThreadItem[],
  pillLaneCount: number,
): TeamStatusLanePopoverCopy => {
  if (threads.length === 0) {
    return {
      summary: `${pluralize(pillLaneCount, "lane")} reported`,
      detail: "Thread summaries are still refreshing for this status.",
    };
  }

  const groupedLaneCount = threads.reduce((total, thread) => {
    return total + thread.matchingLaneCount;
  }, 0);

  return {
    summary: `${pluralize(pillLaneCount, "lane")} across ${pluralize(threads.length, "living thread")}`,
    detail:
      groupedLaneCount !== pillLaneCount
        ? "Thread summaries are still refreshing for this status."
        : threads.some((thread) => thread.matchingLaneCount > 1)
          ? "Rows collapse repeated same-status lane matches per thread."
          : null,
  };
};
