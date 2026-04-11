"use client";

import { startTransition, useEffect, useState } from "react";
import { LaneMarkdownText } from "@/components/lane-markdown";
import { TeamThreadLogPanel } from "@/components/thread-log-panel";
import type { TeamThreadDetail, TeamThreadSummary } from "@/lib/team/history";
import {
  buildFeedbackKey,
  canRestartPlanning,
  describeLane,
  describeThreadProgress,
  formatFeedbackLabel,
  formatTimestamp,
  getLaneApprovalAction,
  getLaneBranchDisplay,
  getLaneCommitDisplay,
  getLaneStatusClassName,
  getLaneStatusLabel,
  pullRequestStatusLabels,
  threadStatusLabels,
} from "@/components/thread-view-utils";
import type { TeamHumanFeedbackScope } from "@/lib/team/types";
import type { LaneApprovalAction } from "@/components/thread-view-utils";

type ThreadDetailPanelProps = {
  threadId: string;
  initialSummary: TeamThreadSummary | null;
  onThreadMutation?: () => Promise<void> | void;
};

type TeamThreadDetailResponse = {
  thread: TeamThreadDetail;
};

type ConversationEntry =
  | {
      id: string;
      kind: "user";
      title: string;
      createdAt: string;
      text: string;
    }
  | {
      id: string;
      kind: "agent";
      title: string;
      createdAt: string;
      text: string;
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

const buildConversationEntries = (detail: TeamThreadDetail): ConversationEntry[] => {
  const userMessages = detail.userMessages.map((message, index) => ({
    id: message.id,
    kind: "user" as const,
    title: index === 0 ? "Human Request" : "Human Follow-up",
    createdAt: message.timestamp,
    text: message.content,
  }));

  const agentSteps = detail.steps.map((step, index) => ({
    id: `${step.agentName}-${step.createdAt}-${index}`,
    kind: "agent" as const,
    title: step.agentName,
    createdAt: step.createdAt,
    text: step.text || "This step completed through tool calls and state updates.",
  }));

  return [...userMessages, ...agentSteps].sort((left, right) => {
    if (left.createdAt !== right.createdAt) {
      return left.createdAt.localeCompare(right.createdAt);
    }

    return left.id.localeCompare(right.id);
  });
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
  const conversationEntries = detail ? buildConversationEntries(detail) : [];
  const assignmentHistory = detail?.dispatchAssignments ?? [];

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
          <p className="eyebrow">Living Thread</p>
          <h2>Thread Not Found</h2>
          <p className="section-copy">
            This thread is no longer available in local storage. Pick another tab or start a new
            request from Run Team.
          </p>
        </div>
      </section>
    );
  }

  const canRestart = canRestartPlanning(thread);

  return (
    <section className="thread-detail-panel">
      <div className="thread-detail-hero">
        <div>
          <p className="eyebrow">Living Thread</p>
          <h2>{thread.requestTitle}</h2>
          <p className="section-copy">{describeThreadProgress(thread)}</p>
        </div>
        <span className={`status-pill status-${thread.status}`}>
          {threadStatusLabels[thread.status]}
        </span>
      </div>

      <div className="thread-meta-strip thread-meta-strip-strong">
        <span>Thread {thread.threadId}</span>
        <span>Assignment #{thread.assignmentNumber}</span>
        <span>{thread.repository?.name ?? "No repository selected"}</span>
        <span>Updated {formatTimestamp(thread.updatedAt)}</span>
      </div>

      {actionNotice ? <p className="info-callout">{actionNotice}</p> : null}
      {refreshError ? <p className="error-callout">{refreshError}</p> : null}
      {thread.lastError ? <p className="error-callout">{thread.lastError}</p> : null}

      <div className="thread-detail-grid">
        <section className="thread-section">
          <div className="section-header compact">
            <p className="eyebrow">Conversation</p>
            <h3>Recovered History</h3>
            <p className="section-copy">
              Persisted human requests and planner execution steps are restored from local thread
              storage.
            </p>
          </div>

          {isLoading && conversationEntries.length === 0 ? (
            <p className="section-copy">Recovering this thread from storage...</p>
          ) : conversationEntries.length > 0 ? (
            <div className="conversation-list">
              {conversationEntries.map((entry) => (
                <article
                  className={`conversation-item conversation-item-${entry.kind}`}
                  key={entry.id}
                >
                  <div className="conversation-meta">
                    <span className="conversation-kind">
                      {entry.kind === "user" ? "Human" : "Agent"}
                    </span>
                    <span>{entry.title}</span>
                    <span>{formatTimestamp(entry.createdAt)}</span>
                  </div>
                  <pre className="conversation-text">{entry.text}</pre>
                </article>
              ))}
            </div>
          ) : (
            <p className="section-copy">
              No persisted conversation has been recorded for this thread yet.
            </p>
          )}
        </section>

        <section className="thread-section">
          <div className="section-header compact">
            <p className="eyebrow">Overview</p>
            <h3>Request Group</h3>
          </div>

          <div className="detail-meta-grid">
            <div className="detail-metric-card">
              <span className="meta-label">Request</span>
              <p>{thread.requestText ?? "No request recorded yet."}</p>
            </div>
            <div className="detail-metric-card">
              <span className="meta-label">Workers</span>
              <p>{thread.dispatchWorkerCount || 0} configured</p>
            </div>
            <div className="detail-metric-card">
              <span className="meta-label">Proposal Queue</span>
              <p>{thread.workerCounts.awaitingHumanApproval} awaiting approval</p>
            </div>
            <div className="detail-metric-card">
              <span className="meta-label">Latest Branch</span>
              <p>
                {thread.latestCanonicalBranchName ?? thread.latestBranchPrefix ?? "Not assigned"}
              </p>
            </div>
          </div>

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

          {assignmentHistory.length > 0 ? (
            <div className="assignment-history-list">
              {assignmentHistory.map((assignment) => (
                <article className="assignment-history-card" key={assignment.assignmentNumber}>
                  <div className="thread-card-head">
                    <div>
                      <p className="eyebrow">Assignment {assignment.assignmentNumber}</p>
                      <p className="timeline-title">
                        {assignment.requestTitle ?? thread.requestTitle}
                      </p>
                    </div>
                    <span className={`status-pill status-${assignment.status}`}>
                      {assignment.status.replaceAll("_", " ")}
                    </span>
                  </div>
                  <p className="thread-card-subtitle">
                    {assignment.plannerSummary ?? "No planner summary recorded yet."}
                  </p>
                </article>
              ))}
            </div>
          ) : null}
        </section>
      </div>

      {detail && detail.handoffs.length > 0 ? (
        <section className="thread-section">
          <div className="section-header compact">
            <p className="eyebrow">Workflow</p>
            <h3>Role Handoffs</h3>
          </div>
          <div className="handoff-grid">
            {detail.handoffs.map((handoff) => (
              <article className="handoff-card" key={`${handoff.roleId}-${handoff.sequence}`}>
                <div className="handoff-head">
                  <p className="eyebrow">{handoff.roleId}</p>
                  <span className={`decision-pill decision-${handoff.decision}`}>
                    {handoff.decision.replace("_", " ")}
                  </span>
                </div>
                <h3>{handoff.roleName}</h3>
                <p className="handoff-summary">{handoff.summary}</p>
                <pre>{handoff.deliverable}</pre>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <TeamThreadLogPanel
        description="Recovered Codex CLI output stays attached to this thread, and the panel keeps polling so new planner, coder, and reviewer entries appear while the background work continues."
        emptyMessage="No Codex CLI output has been recorded for this thread yet."
        threadId={thread.threadId}
        title="Recovered Thread Log"
      />

      {thread.workerLanes.length > 0 ? (
        <section className="thread-section">
          <div className="section-header compact">
            <p className="eyebrow">Proposals</p>
            <h3>Current Lane Details</h3>
            <p className="section-copy">
              Approve proposals, inspect machine-review progress, or send human feedback back into
              the planner from this selected thread.
            </p>
          </div>

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
              const approvalAction = getLaneApprovalAction(lane);
              const canSendLaneFeedback =
                canRestart && lane.status !== "idle" && lane.status !== "failed";
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
                      <span className="meta-label">{commitDisplay?.label ?? "Review Commit"}</span>
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

                  {lane.events.length > 0 ? (
                    <div className="lane-event-list">
                      {lane.events
                        .slice()
                        .reverse()
                        .map((event) => (
                          <article className="lane-event-item" key={event.id}>
                            <div className="conversation-meta">
                              <span className="conversation-kind">{event.actor}</span>
                              <span>{formatTimestamp(event.createdAt)}</span>
                            </div>
                            <LaneMarkdownText className="lane-copy" text={event.message} />
                          </article>
                        ))}
                    </div>
                  ) : null}

                  {approvalAction ? (
                    <button
                      className="secondary-button"
                      type="button"
                      disabled={isApproving}
                      onClick={() =>
                        handleApprove(thread.assignmentNumber, lane.laneId, approvalAction)
                      }
                    >
                      {isApproving ? approvalAction.pendingLabel : approvalAction.buttonLabel}
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

          {canRestart ? (
            <div className="feedback-stack thread-feedback">
              <label className="field feedback-field">
                <span>Request-Group Feedback</span>
                <textarea
                  rows={3}
                  value={
                    feedbackDrafts[
                      buildFeedbackKey(thread.threadId, thread.assignmentNumber, "assignment")
                    ] ?? ""
                  }
                  onChange={(event) =>
                    handleFeedbackChange(
                      buildFeedbackKey(thread.threadId, thread.assignmentNumber, "assignment"),
                      event.target.value,
                    )
                  }
                  placeholder="Shift the overall request direction and ask the planner for a fresh proposal set."
                  disabled={
                    feedbackKey ===
                    buildFeedbackKey(thread.threadId, thread.assignmentNumber, "assignment")
                  }
                />
              </label>
              <button
                className="secondary-button"
                type="button"
                disabled={
                  feedbackKey ===
                  buildFeedbackKey(thread.threadId, thread.assignmentNumber, "assignment")
                }
                onClick={() =>
                  handleFeedback({
                    assignmentNumber: thread.assignmentNumber,
                    scope: "assignment",
                  })
                }
              >
                {feedbackKey ===
                buildFeedbackKey(thread.threadId, thread.assignmentNumber, "assignment")
                  ? "Restarting planning..."
                  : "Replan Request Group"}
              </button>
            </div>
          ) : (
            <p className="lane-copy">
              Request-group replanning unlocks after queued coding and review work finish.
            </p>
          )}
        </section>
      ) : null}
    </section>
  );
}
