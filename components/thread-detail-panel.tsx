"use client";

import { startTransition, useEffect, useState } from "react";
import {
  ThreadCommandComposer,
  type ThreadCommandComposerNotice,
} from "@/components/thread-command-composer";
import { ThreadDetailTimeline } from "@/components/thread-detail-timeline";
import { type LaneApprovalAction } from "@/components/thread-view-utils";
import {
  getThreadCommandDisabledReason,
  getThreadCommandProposalNumbers,
} from "@/lib/team/thread-command";
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

type ThreadCommandResponse = {
  message: string;
  ok: true;
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

const isThreadCommandResponse = (value: unknown): value is ThreadCommandResponse => {
  return isRecord(value) && value.ok === true && typeof value.message === "string";
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

const buildUnexpectedThreadCommandResponseMessage = (response: Response): string => {
  return `Unable to execute the thread slash command (HTTP ${response.status}).`;
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

const getLatestAssignment = (
  assignments: TeamThreadDetail["dispatchAssignments"],
): TeamThreadDetail["dispatchAssignments"][number] | null => {
  return assignments.reduce<TeamThreadDetail["dispatchAssignments"][number] | null>(
    (latestAssignment, assignment) => {
      if (!latestAssignment || assignment.assignmentNumber > latestAssignment.assignmentNumber) {
        return assignment;
      }

      return latestAssignment;
    },
    null,
  );
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
  const [feedbackKey, setFeedbackKey] = useState<string | null>(null);
  const [feedbackDrafts, setFeedbackDrafts] = useState<Record<string, string>>({});
  const [commandDraft, setCommandDraft] = useState("");
  const [commandPending, setCommandPending] = useState(false);
  const [commandNotice, setCommandNotice] = useState<ThreadCommandComposerNotice | null>(null);

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
    setCommandDraft("");
    setCommandNotice(null);
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
  const commandDisabledReason = thread ? getThreadCommandDisabledReason(thread) : null;
  const commandProposalNumbers = detail
    ? getThreadCommandProposalNumbers(getLatestAssignment(detail.dispatchAssignments)?.lanes ?? [])
    : thread
      ? getThreadCommandProposalNumbers(thread.workerLanes)
      : [];

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
    const nextApprovalKey = `${threadId}:${assignmentNumber}:${laneId}:${approvalAction.key}`;

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
              finalizationMode: approvalAction.finalizationMode,
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

  const handleFeedbackChange = (key: string, value: string) => {
    setFeedbackDrafts((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const handleCommand = () => {
    const command = commandDraft.trim();
    if (!command) {
      setCommandNotice({
        kind: "error",
        message: "Enter a slash command before submitting.",
      });
      return;
    }

    startTransition(() => {
      setCommandPending(true);
      void (async () => {
        try {
          const response = await fetch(
            `/api/team/threads/${encodeURIComponent(threadId)}/command`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                command,
              }),
            },
          );

          const rawPayload = await response.text();
          const payload = tryParseJson(rawPayload);

          if (!response.ok) {
            throw new Error(
              readErrorMessage(payload) ?? "Unable to execute the thread slash command.",
            );
          }

          if (!isThreadCommandResponse(payload)) {
            throw new Error(buildUnexpectedThreadCommandResponseMessage(response));
          }

          setCommandDraft("");
          setCommandNotice({
            kind: "info",
            message: payload.message,
          });
          setRefreshError(null);
          try {
            await refreshAll();
          } catch (error) {
            setRefreshError(
              error instanceof Error ? error.message : "Unable to recover thread details.",
            );
          }
        } catch (error) {
          setCommandNotice({
            kind: "error",
            message:
              error instanceof Error
                ? error.message
                : "Unable to execute the thread slash command.",
          });
        } finally {
          setCommandPending(false);
        }
      })();
    });
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

      <ThreadCommandComposer
        disabledReason={commandDisabledReason}
        isPending={commandPending}
        notice={commandNotice}
        proposalNumbers={commandProposalNumbers}
        value={commandDraft}
        onChange={setCommandDraft}
        onSubmit={handleCommand}
      />
    </section>
  );
}
