"use client";

import { startTransition, useEffect, useState } from "react";
import { ThreadDetailTimeline } from "@/components/thread-detail-timeline";
import {
  canArchiveThread,
  formatTimestamp,
  type LaneApprovalAction,
} from "@/components/thread-view-utils";
import type { TeamThreadDetail, TeamThreadSummary } from "@/lib/team/history";
import type { TeamHumanFeedbackScope } from "@/lib/team/types";

type ThreadDetailPanelProps = {
  threadId: string;
  initialSummary: TeamThreadSummary | null;
  onThreadMutation?: () => Promise<void> | void;
};

type TeamThreadDetailResponse = {
  thread: TeamThreadDetail;
};

const POLL_INTERVAL_MS = 5000;

const tryParseJson = (value: string): unknown => {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null;
};

const isThreadDetailResponse = (value: unknown): value is TeamThreadDetailResponse => {
  return (
    isRecord(value) &&
    isRecord(value.thread) &&
    isRecord(value.thread.summary) &&
    Array.isArray(value.thread.userMessages) &&
    Array.isArray(value.thread.steps) &&
    Array.isArray(value.thread.handoffs) &&
    Array.isArray(value.thread.dispatchAssignments)
  );
};

const readErrorMessage = (value: unknown): string | null => {
  if (!isRecord(value) || typeof value.error !== "string" || !value.error.trim()) {
    return null;
  }

  return value.error;
};

const buildUnexpectedResponseMessage = (response: Response): string => {
  return `Unable to recover thread details (HTTP ${response.status}).`;
};

const fetchThreadDetail = async (threadId: string): Promise<TeamThreadDetail> => {
  const response = await fetch(`/api/team/threads/${encodeURIComponent(threadId)}`, {
    cache: "no-store",
  });
  const rawPayload = await response.text();
  const payload = tryParseJson(rawPayload);

  if (!response.ok || !isThreadDetailResponse(payload)) {
    throw new Error(readErrorMessage(payload) ?? buildUnexpectedResponseMessage(response));
  }

  return payload.thread;
};

const buildFeedbackKey = (
  threadId: string,
  assignmentNumber: number,
  scope: TeamHumanFeedbackScope,
  laneId?: string,
): string => {
  return `${threadId}:${assignmentNumber}:${scope}:${laneId ?? "request-group"}`;
};

export function ThreadDetailPanel({
  threadId,
  initialSummary,
  onThreadMutation,
}: ThreadDetailPanelProps) {
  const [detail, setDetail] = useState<TeamThreadDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [approvalKey, setApprovalKey] = useState<string | null>(null);
  const [archivePending, setArchivePending] = useState(false);
  const [feedbackKey, setFeedbackKey] = useState<string | null>(null);
  const [feedbackDrafts, setFeedbackDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    let isCancelled = false;

    const load = async (silent = false) => {
      if (!silent && !isCancelled) {
        setIsLoading(true);
      }

      try {
        const nextDetail = await fetchThreadDetail(threadId);
        if (!isCancelled) {
          setDetail(nextDetail);
          setRefreshError(null);
        }
      } catch (error) {
        if (!isCancelled) {
          setRefreshError(
            error instanceof Error ? error.message : "Unable to recover thread details.",
          );
        }
      } finally {
        if (!silent && !isCancelled) {
          setIsLoading(false);
        }
      }
    };

    setDetail(null);
    setActionNotice(null);
    setRefreshError(null);
    void load();

    const intervalId = window.setInterval(() => {
      if (!isCancelled) {
        void load(true);
      }
    }, POLL_INTERVAL_MS);

    return () => {
      isCancelled = true;
      window.clearInterval(intervalId);
    };
  }, [threadId]);

  const thread = detail?.summary ?? initialSummary;
  const isThreadArchived = Boolean(thread?.archivedAt);
  const archiveEnabled = thread ? canArchiveThread(thread) : false;

  const refreshAll = async () => {
    const [nextDetail] = await Promise.all([
      fetchThreadDetail(threadId),
      Promise.resolve(onThreadMutation?.()),
    ]);
    setDetail(nextDetail);
    setRefreshError(null);
  };

  const handleApprove = (
    assignmentNumber: number,
    laneId: string,
    approvalAction: LaneApprovalAction,
  ) => {
    const nextApprovalKey = `${threadId}:${assignmentNumber}:${laneId}`;

    startTransition(() => {
      setApprovalKey(nextApprovalKey);
      void (async () => {
        try {
          const response = await fetch("/api/team/approval", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              threadId,
              assignmentNumber,
              laneId,
              target: approvalAction.target,
            }),
          });

          const rawPayload = await response.text();
          const payload = tryParseJson(rawPayload);

          if (!response.ok) {
            throw new Error(readErrorMessage(payload) ?? approvalAction.errorFallback);
          }

          await refreshAll();
          setActionNotice(approvalAction.successNotice);
        } catch (error) {
          setRefreshError(error instanceof Error ? error.message : approvalAction.errorFallback);
          setActionNotice(null);
        } finally {
          setApprovalKey((current) => (current === nextApprovalKey ? null : current));
        }
      })();
    });
  };

  const handleArchive = () => {
    if (!thread || !archiveEnabled) {
      return;
    }

    startTransition(() => {
      setArchivePending(true);
      void (async () => {
        try {
          const response = await fetch(
            `/api/team/threads/${encodeURIComponent(threadId)}/archive`,
            {
              method: "POST",
            },
          );
          const rawPayload = await response.text();
          const payload = tryParseJson(rawPayload);

          if (!response.ok) {
            throw new Error(readErrorMessage(payload) ?? "Unable to archive this thread.");
          }

          await refreshAll();
          setActionNotice("Thread archived. It now appears in Archived Threads.");
        } catch (error) {
          setRefreshError(error instanceof Error ? error.message : "Unable to archive this thread.");
          setActionNotice(null);
        } finally {
          setArchivePending(false);
        }
      })();
    });
  };

  const handleFeedbackChange = (key: string, value: string) => {
    setFeedbackDrafts((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const handleFeedback = ({
    assignmentNumber,
    scope,
    laneId,
  }: {
    assignmentNumber: number;
    scope: TeamHumanFeedbackScope;
    laneId?: string;
  }) => {
    const key = buildFeedbackKey(threadId, assignmentNumber, scope, laneId);
    const suggestion = (feedbackDrafts[key] ?? "").trim();

    if (!suggestion) {
      setRefreshError("Enter human feedback before restarting planning.");
      setActionNotice(null);
      return;
    }

    startTransition(() => {
      setFeedbackKey(key);
      void (async () => {
        try {
          const response = await fetch("/api/team/feedback", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              threadId,
              assignmentNumber,
              scope,
              laneId,
              suggestion,
            }),
          });

          const rawPayload = await response.text();
          const payload = tryParseJson(rawPayload);

          if (!response.ok) {
            throw new Error(readErrorMessage(payload) ?? "Unable to submit human feedback.");
          }

          setFeedbackDrafts((current) => {
            const next = { ...current };
            delete next[key];
            return next;
          });
          await refreshAll();
          setActionNotice("Human feedback recorded. Planner replanning started for this request.");
        } catch (error) {
          setRefreshError(
            error instanceof Error ? error.message : "Unable to submit human feedback.",
          );
          setActionNotice(null);
        } finally {
          setFeedbackKey((current) => (current === key ? null : current));
        }
      })();
    });
  };

  if (!thread) {
    return (
      <section className="thread-detail-panel">
        <div className="section-header compact">
          <p className="eyebrow">Thread</p>
          <h2>Thread Not Found</h2>
          <p className="section-copy">
            This thread is no longer available in local storage. Pick another tab or start a new
            request from Run Team.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="thread-detail-panel">
      {actionNotice ? <p className="info-callout">{actionNotice}</p> : null}
      {refreshError ? <p className="error-callout">{refreshError}</p> : null}
      {thread.lastError ? <p className="error-callout">{thread.lastError}</p> : null}

      <section className="thread-detail-actions">
        <div className="thread-detail-actions-copy">
          <p className="workspace-notification-label">Thread Visibility</p>
          <p className="workspace-notification-copy">
            {isThreadArchived
              ? `Archived ${formatTimestamp(thread.archivedAt)}. This thread stays available from Archived Threads.`
              : archiveEnabled
                ? "Archive hides this inactive thread from Living Threads and moves it into Archived Threads."
                : "Only inactive threads can be archived. Active planning, coding, and approval flows stay in Living Threads."}
          </p>
        </div>

        {isThreadArchived ? (
          <span className="status-pill status-completed">Archived</span>
        ) : archiveEnabled ? (
          <button
            className="workspace-notification-action"
            disabled={archivePending}
            type="button"
            onClick={handleArchive}
          >
            {archivePending ? "Archiving..." : "Archive Thread"}
          </button>
        ) : (
          <p className="thread-detail-action-note">Archive becomes available after the thread is inactive.</p>
        )}
      </section>

      <ThreadDetailTimeline
        approvalKey={approvalKey}
        detail={detail}
        feedbackDrafts={feedbackDrafts}
        feedbackKey={feedbackKey}
        isLoadingDetail={isLoading}
        thread={thread}
        onApprove={handleApprove}
        onFeedback={handleFeedback}
        onFeedbackChange={handleFeedbackChange}
      />
    </section>
  );
}
