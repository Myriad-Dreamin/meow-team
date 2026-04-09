"use client";

import { useEffect, useState } from "react";
import type { TeamThreadStatus, TeamThreadSummary } from "@/lib/team/history";

type ThreadStatusBoardProps = {
  initialThreads: TeamThreadSummary[];
};

type TeamThreadsResponse = {
  threads: TeamThreadSummary[];
};

const POLL_INTERVAL_MS = 5000;

const statusLabels: Record<TeamThreadStatus, string> = {
  running: "Running",
  completed: "Completed",
  approved: "Approved",
  needs_revision: "Needs Revision",
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

const describeProgress = (thread: TeamThreadSummary): string => {
  if (thread.status === "failed" && thread.lastError) {
    return "Last run failed before completion.";
  }

  if (thread.status === "running") {
    if (thread.nextRoleId) {
      return thread.handoffCount > 0 ? `Next role: ${thread.nextRoleId}` : `Waiting for ${thread.nextRoleId}`;
    }

    return "Run is still in progress.";
  }

  if (thread.latestRoleId) {
    return `Latest role: ${thread.latestRoleId}`;
  }

  return "No role handoffs recorded yet.";
};

export function ThreadStatusBoard({ initialThreads }: ThreadStatusBoardProps) {
  const [threads, setThreads] = useState(initialThreads);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;

    const refreshThreads = async () => {
      try {
        const response = await fetch("/api/team/threads", {
          cache: "no-store",
        });
        const rawPayload = await response.text();
        const payload = tryParseJson(rawPayload);

        if (!response.ok || !isThreadsResponse(payload)) {
          throw new Error("Unable to refresh live thread status.");
        }

        if (!isCancelled) {
          setThreads(payload.threads);
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

    void refreshThreads();
    const intervalId = window.setInterval(() => {
      void refreshThreads();
    }, POLL_INTERVAL_MS);

    return () => {
      isCancelled = true;
      window.clearInterval(intervalId);
    };
  }, []);

  return (
    <section className="info-panel">
      <div className="section-header">
        <p className="eyebrow">Living Threads</p>
        <h2>Live Thread Status</h2>
        <p className="section-copy">
          This board polls the local thread store so long-running assignments stay visible while
          the backend continues working.
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
                  <p className="thread-card-subtitle">{describeProgress(thread)}</p>
                </div>
                <span className={`status-pill status-${thread.status}`}>{statusLabels[thread.status]}</span>
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
                  <span className="meta-label">Latest Step</span>
                  <p>{thread.latestRoleName ?? thread.latestRoleId ?? "Not started"}</p>
                </div>
                <div>
                  <span className="meta-label">Updated</span>
                  <p>{formatTimestamp(thread.updatedAt)}</p>
                </div>
              </div>

              <div className="thread-meta-strip">
                <span>{thread.stepCount} steps</span>
                <span>{thread.userMessageCount} requests</span>
                <span>{thread.handoffCount} handoffs</span>
              </div>

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
