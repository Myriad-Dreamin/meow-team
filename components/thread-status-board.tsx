"use client";

import { startTransition, useEffect, useState } from "react";
import type { TeamThreadSummary } from "@/lib/team/history";
import type {
  TeamHumanFeedbackScope,
  TeamPullRequestStatus,
  TeamThreadStatus,
  TeamWorkerLaneRecord,
} from "@/lib/team/types";

type ThreadStatusBoardProps = {
  initialThreads: TeamThreadSummary[];
};

type TeamThreadsResponse = {
  threads: TeamThreadSummary[];
};

const POLL_INTERVAL_MS = 5000;

const threadStatusLabels: Record<TeamThreadStatus, string> = {
  planning: "Planning",
  running: "Coding / Reviewing",
  awaiting_human_approval: "Awaiting Proposal Approval",
  completed: "Completed",
  approved: "Machine Reviewed",
  needs_revision: "Needs Revision",
  failed: "Failed",
};

const pullRequestStatusLabels: Record<TeamPullRequestStatus, string> = {
  draft: "Draft PR",
  awaiting_human_approval: "Awaiting Approval",
  approved: "Machine Reviewed",
  conflict: "Conflict",
  failed: "Failed",
};

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

const isThreadsResponse = (value: unknown): value is TeamThreadsResponse => {
  return isRecord(value) && Array.isArray(value.threads);
};

const fetchThreads = async (): Promise<TeamThreadSummary[]> => {
  const response = await fetch("/api/team/threads", {
    cache: "no-store",
  });
  const rawPayload = await response.text();
  const payload = tryParseJson(rawPayload);

  if (!response.ok || !isThreadsResponse(payload)) {
    throw new Error("Unable to refresh live thread status.");
  }

  return payload.threads;
};

const formatTimestamp = (value: string | null): string => {
  if (!value) {
    return "Not recorded";
  }

  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) {
    return value;
  }

  return date.toLocaleString();
};

const formatThreadId = (threadId: string): string => {
  return threadId.slice(0, 8);
};

const buildFeedbackKey = (
  threadId: string,
  assignmentNumber: number,
  scope: TeamHumanFeedbackScope,
  laneId?: string,
): string => {
  return `${threadId}:${assignmentNumber}:${scope}:${laneId ?? "request-group"}`;
};

const canRestartPlanning = (thread: TeamThreadSummary): boolean => {
  return (
    thread.workerCounts.queued === 0 &&
    thread.workerCounts.coding === 0 &&
    thread.workerCounts.reviewing === 0
  );
};

const describeThreadProgress = (thread: TeamThreadSummary): string => {
  if (thread.lastError) {
    return thread.lastError;
  }

  if (thread.latestPlanSummary) {
    return thread.latestPlanSummary;
  }

  if (thread.latestInput) {
    return thread.latestInput;
  }

  return "No planner summary recorded yet.";
};

const describeLane = (lane: TeamWorkerLaneRecord): string => {
  if (lane.status === "idle") {
    return "Idle and waiting for planner work.";
  }

  if (lane.status === "awaiting_human_approval") {
    return "Planner proposed this work and is waiting for human approval before coding and review begin.";
  }

  if (lane.pullRequest?.status === "conflict") {
    return "Planner detected a pull request conflict and requeued this proposal.";
  }

  if (lane.requeueReason === "reviewer_requested_changes") {
    return "Reviewer requested changes; the approved proposal is queued for another coding pass.";
  }

  if (lane.requeueReason === "planner_detected_conflict") {
    return "Planner detected a conflict; the proposal is queued for conflict resolution.";
  }

  if (lane.status === "approved") {
    return "Coding and machine review are complete. Human feedback can start a fresh planning pass from this proposal or the whole request group.";
  }

  return lane.latestActivity ?? "Proposal work is active.";
};

const getLaneStatusLabel = (lane: TeamWorkerLaneRecord): string => {
  switch (lane.status) {
    case "idle":
      return "Idle";
    case "queued":
      return lane.pullRequest?.status === "conflict" ? "Queued for Conflict Fix" : "Queued";
    case "coding":
      return "Coding";
    case "reviewing":
      return "Reviewing";
    case "awaiting_human_approval":
      return "Awaiting Approval";
    case "approved":
      return "Machine Reviewed";
    case "failed":
      return "Failed";
  }
};

const getLaneStatusClassName = (lane: TeamWorkerLaneRecord): string => {
  if (lane.status === "queued" && lane.pullRequest?.status === "conflict") {
    return "status-conflict";
  }

  switch (lane.status) {
    case "idle":
      return "status-idle";
    case "queued":
      return "status-queued";
    case "coding":
      return "status-coding";
    case "reviewing":
      return "status-reviewing";
    case "awaiting_human_approval":
      return "status-awaiting_human_approval";
    case "approved":
      return "status-approved";
    case "failed":
      return "status-failed";
  }
};

const formatFeedbackLabel = (thread: TeamThreadSummary, laneId: string | null): string => {
  if (!laneId) {
    return "Request-group feedback";
  }

  const lane = thread.workerLanes.find((candidate) => candidate.laneId === laneId);
  return lane ? `Proposal ${lane.laneIndex} feedback` : "Proposal feedback";
};

export function ThreadStatusBoard({ initialThreads }: ThreadStatusBoardProps) {
  const [threads, setThreads] = useState(initialThreads);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [approvalKey, setApprovalKey] = useState<string | null>(null);
  const [feedbackKey, setFeedbackKey] = useState<string | null>(null);
  const [feedbackDrafts, setFeedbackDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    let isCancelled = false;

    const load = async () => {
      try {
        const nextThreads = await fetchThreads();
        if (!isCancelled) {
          setThreads(nextThreads);
          setRefreshError(null);
        }
      } catch (error) {
        if (!isCancelled) {
          setRefreshError(
            error instanceof Error ? error.message : "Unable to refresh live thread status.",
          );
        }
      }
    };

    void load();
    const intervalId = window.setInterval(() => {
      if (!isCancelled) {
        void load();
      }
    }, POLL_INTERVAL_MS);

    return () => {
      isCancelled = true;
      window.clearInterval(intervalId);
    };
  }, []);

  const handleApprove = (threadId: string, assignmentNumber: number, laneId: string) => {
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
            }),
          });

          const rawPayload = await response.text();
          const payload = tryParseJson(rawPayload);

          if (!response.ok) {
            const message =
              isRecord(payload) && typeof payload.error === "string"
                ? payload.error
                : "Unable to approve this proposal.";
            throw new Error(message);
          }

          setThreads(await fetchThreads());
          setActionNotice("Proposal approval recorded. The coding-review queue is refreshing.");
          setRefreshError(null);
        } catch (error) {
          setRefreshError(error instanceof Error ? error.message : "Unable to approve this proposal.");
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

  const handleFeedback = ({
    threadId,
    assignmentNumber,
    scope,
    laneId,
  }: {
    threadId: string;
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
            const message =
              isRecord(payload) && typeof payload.error === "string"
                ? payload.error
                : "Unable to submit human feedback.";
            throw new Error(message);
          }

          setFeedbackDrafts((current) => {
            const next = { ...current };
            delete next[key];
            return next;
          });
          setThreads(await fetchThreads());
          setActionNotice("Human feedback recorded. Planner replanning started for this request.");
          setRefreshError(null);
        } catch (error) {
          setRefreshError(
            error instanceof Error ? error.message : "Unable to submit human feedback.",
          );
        } finally {
          setFeedbackKey((current) => (current === key ? null : current));
        }
      })();
    });
  };

  return (
    <section className="info-panel">
      <div className="section-header">
        <p className="eyebrow">Living Threads</p>
        <h2>Live Dispatch Status</h2>
        <p className="section-copy">
          This board tracks request-group proposals, human approvals, the coding-review queue, and
          post-review feedback loops while the backend keeps running in the background.
        </p>
      </div>

      {actionNotice ? <p className="info-callout">{actionNotice}</p> : null}
      {refreshError ? <p className="error-callout">{refreshError}</p> : null}

      {threads.length > 0 ? (
        <div className="thread-board">
          {threads.map((thread) => {
            const canRestart = canRestartPlanning(thread);
            const threadFeedbackKey = buildFeedbackKey(
              thread.threadId,
              thread.assignmentNumber,
              "assignment",
            );

            return (
              <article className="thread-card" key={thread.threadId}>
                <div className="thread-card-head">
                  <div>
                    <p className="timeline-title">Thread {formatThreadId(thread.threadId)}</p>
                    <p className="thread-card-subtitle">{describeThreadProgress(thread)}</p>
                  </div>
                  <span className={`status-pill status-${thread.status}`}>
                    {threadStatusLabels[thread.status]}
                  </span>
                </div>

                <p className="thread-request">{thread.latestInput ?? "No request recorded yet."}</p>

                <div className="thread-meta-grid">
                  <div>
                    <span className="meta-label">Assignment</span>
                    <p>#{thread.assignmentNumber}</p>
                  </div>
                  <div>
                    <span className="meta-label">Repository</span>
                    <p>{thread.repository?.name ?? "None selected"}</p>
                  </div>
                  <div>
                    <span className="meta-label">Workers</span>
                    <p>{thread.dispatchWorkerCount || 0} configured</p>
                  </div>
                  <div>
                    <span className="meta-label">Updated</span>
                    <p>{formatTimestamp(thread.updatedAt)}</p>
                  </div>
                </div>

                <div className="thread-meta-strip">
                  <span>{thread.workerCounts.awaitingHumanApproval} awaiting approval</span>
                  <span>{thread.workerCounts.queued} queued</span>
                  <span>{thread.workerCounts.coding} coding</span>
                  <span>{thread.workerCounts.reviewing} reviewing</span>
                  <span>{thread.workerCounts.approved} machine reviewed</span>
                </div>

                {thread.latestCanonicalBranchName ? (
                  <p className="thread-branch">Canonical branch: {thread.latestCanonicalBranchName}</p>
                ) : thread.latestBranchPrefix ? (
                  <p className="thread-branch">Branch prefix: {thread.latestBranchPrefix}</p>
                ) : null}

                {thread.plannerNotes.length > 0 ? (
                  <div className="planner-note-list">
                    {thread.plannerNotes.map((note) => (
                      <p className="planner-note" key={note.id}>
                        {note.message}
                      </p>
                    ))}
                  </div>
                ) : null}

                {thread.humanFeedback.length > 0 ? (
                  <div className="planner-note-list">
                    {thread.humanFeedback.map((feedback) => (
                      <p className="planner-note" key={feedback.id}>
                        {formatFeedbackLabel(thread, feedback.laneId)}: {feedback.message}
                      </p>
                    ))}
                  </div>
                ) : null}

                {thread.workerLanes.length > 0 ? (
                  <div className="lane-grid">
                    {thread.workerLanes.map((lane) => {
                      const currentApprovalKey = `${thread.threadId}:${thread.assignmentNumber}:${lane.laneId}`;
                      const laneFeedbackKey = buildFeedbackKey(
                        thread.threadId,
                        thread.assignmentNumber,
                        "proposal",
                        lane.laneId,
                      );
                      const isApproving = approvalKey === currentApprovalKey;
                      const isSendingFeedback = feedbackKey === laneFeedbackKey;
                      const canApprove = lane.status === "awaiting_human_approval";
                      const canSendLaneFeedback =
                        canRestart && lane.status !== "idle" && lane.status !== "failed";

                      return (
                        <article className="lane-card" key={`${thread.threadId}-${lane.laneId}`}>
                          <div className="lane-card-head">
                            <div>
                              <p className="timeline-title">Proposal {lane.laneIndex}</p>
                              <p className="lane-task-title">{lane.taskTitle ?? "Idle"}</p>
                            </div>
                            <span className={`status-pill ${getLaneStatusClassName(lane)}`}>
                              {getLaneStatusLabel(lane)}
                            </span>
                          </div>

                          <p className="lane-copy">{describeLane(lane)}</p>

                          <div className="lane-meta-grid">
                            <div>
                              <span className="meta-label">Branch</span>
                              <p>{lane.branchName ?? "Not allocated"}</p>
                            </div>
                            <div>
                              <span className="meta-label">Worktree</span>
                              <p>{lane.worktreePath ?? "Not allocated"}</p>
                            </div>
                            <div>
                              <span className="meta-label">Pool Slot</span>
                              <p>{lane.workerSlot ? `moew-${lane.workerSlot}` : "Waiting for pool"}</p>
                            </div>
                            <div>
                              <span className="meta-label">OpenSpec Change</span>
                              <p>{lane.proposalChangeName ?? "Not materialized"}</p>
                            </div>
                            <div>
                              <span className="meta-label">Change Path</span>
                              <p>{lane.proposalPath ?? "Not materialized"}</p>
                            </div>
                            <div>
                              <span className="meta-label">Runs</span>
                              <p>{lane.runCount}</p>
                            </div>
                            <div>
                              <span className="meta-label">Revisions</span>
                              <p>{lane.revisionCount}</p>
                            </div>
                          </div>

                          {lane.pullRequest ? (
                            <div className="lane-pr-strip">
                              <span>{pullRequestStatusLabels[lane.pullRequest.status]}</span>
                              <span>{lane.pullRequest.title}</span>
                              <span>{formatTimestamp(lane.pullRequest.updatedAt)}</span>
                            </div>
                          ) : null}

                          {canApprove ? (
                            <button
                              className="secondary-button"
                              type="button"
                              disabled={isApproving}
                              onClick={() =>
                                handleApprove(thread.threadId, thread.assignmentNumber, lane.laneId)
                              }
                            >
                              {isApproving ? "Recording approval..." : "Approve Proposal"}
                            </button>
                          ) : null}

                          {canSendLaneFeedback ? (
                            <div className="feedback-stack">
                              <label className="field feedback-field">
                                <span>Proposal Feedback</span>
                                <textarea
                                  rows={3}
                                  value={feedbackDrafts[laneFeedbackKey] ?? ""}
                                  onChange={(event) =>
                                    handleFeedbackChange(laneFeedbackKey, event.target.value)
                                  }
                                  placeholder="Adjust this proposal and replan the request group."
                                  disabled={isSendingFeedback}
                                />
                              </label>
                              <button
                                className="secondary-button"
                                type="button"
                                disabled={isSendingFeedback}
                                onClick={() =>
                                  handleFeedback({
                                    threadId: thread.threadId,
                                    assignmentNumber: thread.assignmentNumber,
                                    scope: "proposal",
                                    laneId: lane.laneId,
                                  })
                                }
                              >
                                {isSendingFeedback ? "Restarting planning..." : "Replan Proposal"}
                              </button>
                            </div>
                          ) : null}

                          {lane.lastError ? <p className="error-callout">{lane.lastError}</p> : null}
                        </article>
                      );
                    })}
                  </div>
                ) : null}

                {thread.workerLanes.length > 0 ? (
                  canRestart ? (
                    <div className="feedback-stack thread-feedback">
                      <label className="field feedback-field">
                        <span>Request-Group Feedback</span>
                        <textarea
                          rows={3}
                          value={feedbackDrafts[threadFeedbackKey] ?? ""}
                          onChange={(event) =>
                            handleFeedbackChange(threadFeedbackKey, event.target.value)
                          }
                          placeholder="Shift the overall request direction and ask the planner for a fresh proposal set."
                          disabled={feedbackKey === threadFeedbackKey}
                        />
                      </label>
                      <button
                        className="secondary-button"
                        type="button"
                        disabled={feedbackKey === threadFeedbackKey}
                        onClick={() =>
                          handleFeedback({
                            threadId: thread.threadId,
                            assignmentNumber: thread.assignmentNumber,
                            scope: "assignment",
                          })
                        }
                      >
                        {feedbackKey === threadFeedbackKey
                          ? "Restarting planning..."
                          : "Replan Request Group"}
                      </button>
                    </div>
                  ) : (
                    <p className="lane-copy">
                      Request-group replanning unlocks after queued coding and review work finish.
                    </p>
                  )
                ) : null}

                {thread.lastError ? <p className="error-callout">{thread.lastError}</p> : null}
              </article>
            );
          })}
        </div>
      ) : (
        <p className="section-copy">
          No threads have been started yet. Launch a run from the console to populate live status.
        </p>
      )}
    </section>
  );
}
