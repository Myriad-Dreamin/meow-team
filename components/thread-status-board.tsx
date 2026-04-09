"use client";

import { startTransition, useEffect, useState } from "react";
import type { TeamThreadSummary } from "@/lib/team/history";
import type { TeamPullRequestStatus, TeamThreadStatus, TeamWorkerLaneRecord } from "@/lib/team/types";

type ThreadStatusBoardProps = {
  initialThreads: TeamThreadSummary[];
};

type TeamThreadsResponse = {
  threads: TeamThreadSummary[];
};

const POLL_INTERVAL_MS = 5000;

const threadStatusLabels: Record<TeamThreadStatus, string> = {
  planning: "Planning",
  running: "Running",
  awaiting_human_approval: "Awaiting Approval",
  completed: "Completed",
  approved: "Approved",
  needs_revision: "Needs Revision",
  failed: "Failed",
};

const pullRequestStatusLabels: Record<TeamPullRequestStatus, string> = {
  draft: "Draft PR",
  awaiting_human_approval: "Awaiting Approval",
  approved: "Approved",
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

  if (lane.pullRequest?.status === "conflict") {
    return "Planner detected a pull request conflict and requeued this lane.";
  }

  if (lane.requeueReason === "reviewer_requested_changes") {
    return "Reviewer requested changes; the lane is queued for another coding pass.";
  }

  if (lane.requeueReason === "planner_detected_conflict") {
    return "Planner detected a conflict; the lane is queued for conflict resolution.";
  }

  return lane.latestActivity ?? "Lane is active.";
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
      return "Approved";
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

export function ThreadStatusBoard({ initialThreads }: ThreadStatusBoardProps) {
  const [threads, setThreads] = useState(initialThreads);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [approvalKey, setApprovalKey] = useState<string | null>(null);

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
                : "Unable to approve this pull request.";
            throw new Error(message);
          }

          setThreads(await fetchThreads());
          setRefreshError(null);
        } catch (error) {
          setRefreshError(
            error instanceof Error ? error.message : "Unable to approve this pull request.",
          );
        } finally {
          setApprovalKey((current) => (current === nextApprovalKey ? null : current));
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
          This board polls the local thread store so long-running planner dispatches, worker lanes,
          pull requests, conflicts, and approvals stay visible while the backend keeps running.
        </p>
      </div>

      {refreshError ? <p className="error-callout">{refreshError}</p> : null}

      {threads.length > 0 ? (
        <div className="thread-board">
          {threads.map((thread) => (
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
                <span>{thread.workerCounts.coding} coding</span>
                <span>{thread.workerCounts.reviewing} reviewing</span>
                <span>{thread.workerCounts.awaitingHumanApproval} awaiting approval</span>
                <span>{thread.workerCounts.idle} idle</span>
              </div>

              {thread.latestBranchPrefix ? (
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

              {thread.workerLanes.length > 0 ? (
                <div className="lane-grid">
                  {thread.workerLanes.map((lane) => {
                    const currentApprovalKey = `${thread.threadId}:${thread.assignmentNumber}:${lane.laneId}`;
                    const isApproving = approvalKey === currentApprovalKey;
                    const canApprove =
                      lane.status === "awaiting_human_approval" &&
                      lane.pullRequest?.status === "awaiting_human_approval";

                    return (
                      <article className="lane-card" key={`${thread.threadId}-${lane.laneId}`}>
                        <div className="lane-card-head">
                          <div>
                            <p className="timeline-title">Lane {lane.laneIndex}</p>
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
                            {isApproving ? "Recording approval..." : "Approve PR"}
                          </button>
                        ) : null}

                        {lane.lastError ? <p className="error-callout">{lane.lastError}</p> : null}
                      </article>
                    );
                  })}
                </div>
              ) : null}

              {thread.lastError ? <p className="error-callout">{thread.lastError}</p> : null}
            </article>
          ))}
        </div>
      ) : (
        <p className="section-copy">
          No threads have been started yet. Launch a run from the console to populate live status.
        </p>
      )}
    </section>
  );
}
