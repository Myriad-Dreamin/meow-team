"use client";

import { startTransition, useEffect, useState } from "react";
import { LaneMarkdownText } from "@/components/lane-markdown";
import {
  buildFeedbackKey,
  canRestartPlanning,
  describeLane,
  describeThreadProgress,
  formatFeedbackLabel,
  formatPoolSlot,
  formatThreadId,
  formatTimestamp,
  getLaneApprovalActions,
  getLaneBranchDisplay,
  getLaneCommitDisplay,
  getLaneStatusClassName,
  getLaneStatusLabel,
  pullRequestStatusLabels,
  threadStatusLabels,
} from "@/components/thread-view-utils";
import type { TeamThreadSummary } from "@/lib/team/history";
import type { TeamHumanFeedbackScope } from "@/lib/team/types";
import type { LaneApprovalAction } from "@/components/thread-view-utils";

type ThreadStatusBoardProps = {
  initialThreads: TeamThreadSummary[];
};

type TeamThreadsResponse = {
  threads: TeamThreadSummary[];
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

  const handleApprove = (
    threadId: string,
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
            const message =
              isRecord(payload) && typeof payload.error === "string"
                ? payload.error
                : approvalAction.errorFallback;
            throw new Error(message);
          }

          setThreads(await fetchThreads());
          setActionNotice(approvalAction.successNotice);
          setRefreshError(null);
        } catch (error) {
          setRefreshError(error instanceof Error ? error.message : approvalAction.errorFallback);
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
                    <p className="eyebrow">Thread {formatThreadId(thread.threadId)}</p>
                    <p className="timeline-title thread-card-title">{thread.requestTitle}</p>
                    <p className="thread-card-subtitle">{describeThreadProgress(thread)}</p>
                  </div>
                  <span className={`status-pill status-${thread.status}`}>
                    {threadStatusLabels[thread.status]}
                  </span>
                </div>

                <p className="thread-request">{thread.requestText ?? "No request recorded yet."}</p>

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
                  <p className="thread-branch">
                    Canonical branch: {thread.latestCanonicalBranchName}
                  </p>
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
                      const isApproving = approvalKey?.startsWith(`${currentApprovalKey}:`) ?? false;
                      const isSendingFeedback = feedbackKey === laneFeedbackKey;
                      const approvalActions = getLaneApprovalActions(lane);
                      const canSendLaneFeedback =
                        canRestart &&
                        lane.status !== "idle" &&
                        lane.status !== "failed" &&
                        lane.status !== "cancelled";
                      const branchDisplay = getLaneBranchDisplay(lane);
                      const commitDisplay = getLaneCommitDisplay(lane);

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

                          <LaneMarkdownText className="lane-copy" text={describeLane(lane)} />

                          <div className="lane-meta-grid">
                            <div>
                              <span className="meta-label">{branchDisplay.label}</span>
                              <p>
                                {branchDisplay.href ? (
                                  <a
                                    className="lane-meta-link"
                                    href={branchDisplay.href}
                                    rel="noreferrer"
                                    target="_blank"
                                  >
                                    {branchDisplay.value}
                                  </a>
                                ) : (
                                  branchDisplay.value
                                )}
                              </p>
                            </div>
                            <div>
                              <span className="meta-label">Worktree</span>
                              <p>{lane.worktreePath ?? "Not allocated"}</p>
                            </div>
                            <div>
                              <span className="meta-label">
                                {commitDisplay?.label ?? "Review Commit"}
                              </span>
                              <p>
                                {commitDisplay ? (
                                  commitDisplay.href ? (
                                    <a
                                      className="lane-meta-link"
                                      href={commitDisplay.href}
                                      rel="noreferrer"
                                      target="_blank"
                                      title={commitDisplay.fullValue}
                                    >
                                      {commitDisplay.value}
                                    </a>
                                  ) : (
                                    commitDisplay.value
                                  )
                                ) : (
                                  "Not requested"
                                )}
                              </p>
                            </div>
                            <div>
                              <span className="meta-label">Pool Slot</span>
                              <p>{formatPoolSlot(lane.workerSlot)}</p>
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
                              {lane.pullRequest.url ? (
                                <a
                                  className="lane-meta-link"
                                  href={lane.pullRequest.url}
                                  rel="noreferrer"
                                  target="_blank"
                                >
                                  {lane.pullRequest.title}
                                </a>
                              ) : (
                                <span>{lane.pullRequest.title}</span>
                              )}
                              <span>{formatTimestamp(lane.pullRequest.updatedAt)}</span>
                            </div>
                          ) : null}

                          {approvalActions.length > 0 ? (
                            <div className="approval-action-stack">
                              {approvalActions.map((approvalAction) => {
                                const isPendingAction =
                                  approvalKey ===
                                  `${thread.threadId}:${thread.assignmentNumber}:${lane.laneId}:${approvalAction.key}`;

                                return (
                                  <button
                                    className="secondary-button"
                                    key={approvalAction.key}
                                    type="button"
                                    disabled={isApproving}
                                    onClick={() =>
                                      handleApprove(
                                        thread.threadId,
                                        thread.assignmentNumber,
                                        lane.laneId,
                                        approvalAction,
                                      )
                                    }
                                  >
                                    {isPendingAction
                                      ? approvalAction.pendingLabel
                                      : approvalAction.buttonLabel}
                                  </button>
                                );
                              })}
                            </div>
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

                          {lane.lastError ? (
                            <p className="error-callout">{lane.lastError}</p>
                          ) : null}
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
