import { formatThreadId } from "@/components/thread-view-utils";
import type { TeamThreadSummary } from "@/lib/team/history";
import type { TeamWorkerLaneRecord } from "@/lib/team/types";

export type ThreadAttentionReason = "awaiting_human_approval" | "lane_failed" | "thread_failed";

export type ThreadAttentionNotification = {
  body: string;
  fingerprint: string;
  laneId: string | null;
  reason: ThreadAttentionReason;
  tag: string;
  threadId: string;
  title: string;
};

const MAX_STORED_ATTENTION_FINGERPRINTS = 64;

const FALLBACK_FAILURE_MESSAGE = "Open the thread for details";

const trimNotificationBody = (value: string): string => value.replaceAll(/\s+/gu, " ").trim();

const summarizeFailureMessage = (message: string | null | undefined): string =>
  trimNotificationBody(message ?? "").replace(/\.+$/u, "") || FALLBACK_FAILURE_MESSAGE;

const formatProposalLabel = (lane: TeamWorkerLaneRecord): string => `Proposal ${lane.laneIndex}`;

const buildLaneFingerprint = (
  threadId: string,
  lane: TeamWorkerLaneRecord,
  reason: Exclude<ThreadAttentionReason, "thread_failed">,
  marker: string,
): string =>
  `thread:${threadId}:lane:${lane.laneId}:${reason}:${marker}:${lane.runCount}:${lane.revisionCount}`;

const buildThreadFingerprint = (thread: TeamThreadSummary, marker: string): string =>
  `thread:${thread.threadId}:failed:${marker}:${thread.assignmentNumber}`;

const createApprovalNotification = (
  thread: TeamThreadSummary,
  lane: TeamWorkerLaneRecord,
): ThreadAttentionNotification => {
  const marker =
    lane.approvalRequestedAt ??
    lane.pullRequest?.humanApprovalRequestedAt ??
    lane.queuedAt ??
    lane.updatedAt;

  return {
    body: `${formatProposalLabel(lane)} is waiting for human approval in thread ${formatThreadId(thread.threadId)}.`,
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
): ThreadAttentionNotification => {
  const marker = lane.finishedAt ?? lane.updatedAt;

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

const createThreadFailureNotification = (
  thread: TeamThreadSummary,
): ThreadAttentionNotification => {
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
): ThreadAttentionNotification[] => {
  const notifications: ThreadAttentionNotification[] = [];

  for (const thread of threads) {
    const failedLanes = thread.workerLanes.filter((lane) => lane.status === "failed");
    const approvalLanes = thread.workerLanes.filter(
      (lane) => lane.status === "awaiting_human_approval",
    );

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

export const buildAttentionFingerprintSet = (
  notifications: ThreadAttentionNotification[],
): Set<string> => new Set(notifications.map((notification) => notification.fingerprint));

export const selectFreshAttentionNotifications = ({
  nextNotifications,
  previousFingerprints,
  seenFingerprints,
}: {
  nextNotifications: ThreadAttentionNotification[];
  previousFingerprints: ReadonlySet<string>;
  seenFingerprints: ReadonlySet<string>;
}): ThreadAttentionNotification[] =>
  nextNotifications.filter(
    (notification) =>
      !previousFingerprints.has(notification.fingerprint) &&
      !seenFingerprints.has(notification.fingerprint),
  );

export const mergeStoredAttentionFingerprints = (
  seenFingerprints: Iterable<string>,
  activeFingerprints: Iterable<string>,
): string[] =>
  Array.from(new Set([...seenFingerprints, ...activeFingerprints])).slice(
    -MAX_STORED_ATTENTION_FINGERPRINTS,
  );
