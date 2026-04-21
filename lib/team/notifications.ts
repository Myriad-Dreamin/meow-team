import type { TeamNotificationTarget } from "@/lib/config/team";
import type { TeamThreadSummary } from "@/lib/team/history";
import type { TeamWorkerLaneRecord } from "@/lib/team/types";

export type TeamAttentionReason = "awaiting_human_approval" | "lane_failed" | "thread_failed";

export type TeamAttentionNotification = {
  body: string;
  fingerprint: string;
  laneId: string | null;
  reason: TeamAttentionReason;
  tag: string;
  threadId: string;
  title: string;
};

export type TeamNotificationsResponse = {
  generatedAt: string;
  notifications: TeamAttentionNotification[];
  target: TeamNotificationTarget;
};

const MAX_STORED_ATTENTION_FINGERPRINTS = 64;
const FALLBACK_FAILURE_MESSAGE = "Open the thread for details";

const formatThreadId = (threadId: string): string => threadId.slice(0, 8);

const trimNotificationBody = (value: string): string => value.replaceAll(/\s+/gu, " ").trim();

const summarizeFailureMessage = (message: string | null | undefined): string =>
  trimNotificationBody(message ?? "").replace(/\.+$/u, "") || FALLBACK_FAILURE_MESSAGE;

const formatProposalLabel = (lane: TeamWorkerLaneRecord): string => `Proposal ${lane.laneIndex}`;

const buildLaneFingerprint = (
  threadId: string,
  lane: TeamWorkerLaneRecord,
  reason: Exclude<TeamAttentionReason, "thread_failed">,
  marker: string,
): string =>
  `thread:${threadId}:lane:${lane.laneId}:${reason}:${marker}:${lane.runCount}:${lane.revisionCount}`;

const buildThreadFingerprint = (thread: TeamThreadSummary, marker: string): string =>
  `thread:${thread.threadId}:failed:${marker}:${thread.assignmentNumber}`;

const createApprovalNotification = (
  thread: TeamThreadSummary,
  lane: TeamWorkerLaneRecord,
): TeamAttentionNotification => {
  const isFinalApprovalWait = lane.status === "approved";
  const marker = isFinalApprovalWait
    ? (lane.pullRequest?.humanApprovalRequestedAt ?? lane.updatedAt)
    : (lane.approvalRequestedAt ?? lane.queuedAt ?? lane.updatedAt);

  return {
    body: `${formatProposalLabel(lane)} is waiting for ${isFinalApprovalWait ? "final human approval" : "human approval"} in thread ${formatThreadId(thread.threadId)}.`,
    fingerprint: buildLaneFingerprint(thread.threadId, lane, "awaiting_human_approval", marker),
    laneId: lane.laneId,
    reason: "awaiting_human_approval",
    tag: `thread-attention:${lane.laneId}:awaiting_human_approval`,
    threadId: thread.threadId,
    title: `${thread.requestTitle} requires approval`,
  };
};

const createLaneFailureNotification = (
  thread: TeamThreadSummary,
  lane: TeamWorkerLaneRecord,
): TeamAttentionNotification => {
  const marker = lane.status === "approved" ? lane.updatedAt : (lane.finishedAt ?? lane.updatedAt);

  return {
    body: `${formatProposalLabel(lane)} failed in thread ${formatThreadId(thread.threadId)}. ${summarizeFailureMessage(lane.lastError)}.`,
    fingerprint: buildLaneFingerprint(thread.threadId, lane, "lane_failed", marker),
    laneId: lane.laneId,
    reason: "lane_failed",
    tag: `thread-attention:${lane.laneId}:lane_failed`,
    threadId: thread.threadId,
    title: `${thread.requestTitle} failed`,
  };
};

const createThreadFailureNotification = (thread: TeamThreadSummary): TeamAttentionNotification => {
  const marker = thread.finishedAt ?? thread.updatedAt;

  return {
    body: `Thread ${formatThreadId(thread.threadId)} failed. ${summarizeFailureMessage(thread.lastError)}.`,
    fingerprint: buildThreadFingerprint(thread, marker),
    laneId: null,
    reason: "thread_failed",
    tag: `thread-attention:${thread.threadId}:thread_failed`,
    threadId: thread.threadId,
    title: `${thread.requestTitle} failed`,
  };
};

export const collectThreadAttentionNotifications = (
  threads: TeamThreadSummary[],
): TeamAttentionNotification[] => {
  const notifications: TeamAttentionNotification[] = [];

  for (const thread of threads) {
    if (thread.status === "cancelled" || thread.latestAssignmentStatus === "cancelled") {
      continue;
    }

    const failedLanes = thread.workerLanes.filter(
      (lane) => lane.status === "failed" || lane.pullRequest?.status === "failed",
    );
    const approvalLanes = thread.workerLanes.filter((lane) => {
      if (lane.status === "awaiting_human_approval" || lane.status === "awaiting_retry_approval") {
        return true;
      }

      return (
        lane.status === "approved" &&
        lane.pullRequest?.status === "awaiting_human_approval" &&
        !lane.pullRequest.humanApprovedAt
      );
    });

    for (const lane of approvalLanes) {
      notifications.push(createApprovalNotification(thread, lane));
    }

    for (const lane of failedLanes) {
      notifications.push(createLaneFailureNotification(thread, lane));
    }

    if (thread.status === "failed" && failedLanes.length === 0) {
      notifications.push(createThreadFailureNotification(thread));
    }
  }

  return notifications;
};

export const buildTeamNotificationsResponse = ({
  generatedAt = new Date().toISOString(),
  target,
  threads,
}: {
  generatedAt?: string;
  target: TeamNotificationTarget;
  threads: TeamThreadSummary[];
}): TeamNotificationsResponse => {
  return {
    generatedAt,
    notifications: collectThreadAttentionNotifications(threads),
    target,
  };
};

export const selectUndeliveredAttentionNotifications = ({
  nextNotifications,
  deliveredFingerprints,
  deliveryAvailable,
}: {
  nextNotifications: TeamAttentionNotification[];
  deliveredFingerprints: ReadonlySet<string>;
  deliveryAvailable: boolean;
}): TeamAttentionNotification[] => {
  if (!deliveryAvailable) {
    return [];
  }

  return nextNotifications.filter(
    (notification) => !deliveredFingerprints.has(notification.fingerprint),
  );
};

export const mergeStoredAttentionFingerprints = (
  storedFingerprints: Iterable<string>,
  nextFingerprints: Iterable<string>,
): string[] =>
  Array.from(new Set([...storedFingerprints, ...nextFingerprints])).slice(
    -MAX_STORED_ATTENTION_FINGERPRINTS,
  );
