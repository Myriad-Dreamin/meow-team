"use client";

import { useEffect, useRef, useState } from "react";
import {
  describeLogEntryContext,
  formatAssignmentStatusLabel,
  formatTimestamp,
  getLanePullRequestStatusLabel,
  getLaneStatusClassName,
  getLaneStatusLabel,
  groupThreadLogEntries,
  threadStatusLabels,
} from "@/components/thread-view-utils";
import type { TeamThreadDetail } from "@/lib/team/history";
import type { TeamCodexLogCursorEntry, TeamCodexLogPageInfo } from "@/lib/team/types";
import styles from "./agent-task-output-window.module.css";

type AgentTaskOutputWindowProps = {
  threadId: string;
  assignmentNumber: number | null;
  laneId: string | null;
  roleId: string | null;
};

type WindowResponse = {
  entries: TeamCodexLogCursorEntry[];
  pageInfo: TeamCodexLogPageInfo;
};

type TeamThreadDetailResponse = {
  thread: TeamThreadDetail;
};

const LOG_POLL_INTERVAL_MS = 3000;
const LOG_WINDOW_LIMIT = 200;
const SCROLL_THRESHOLD_PX = 56;

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

const isCursorEntry = (value: unknown): value is TeamCodexLogCursorEntry => {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.threadId === "string" &&
    typeof value.source === "string" &&
    typeof value.message === "string" &&
    typeof value.createdAt === "string" &&
    typeof value.startCursor === "number" &&
    typeof value.endCursor === "number"
  );
};

const isPageInfo = (value: unknown): value is TeamCodexLogPageInfo => {
  return (
    isRecord(value) &&
    (typeof value.beforeCursor === "number" || value.beforeCursor === null) &&
    (typeof value.afterCursor === "number" || value.afterCursor === null) &&
    typeof value.hasOlder === "boolean" &&
    typeof value.hasNewer === "boolean"
  );
};

const isWindowResponse = (value: unknown): value is WindowResponse => {
  return (
    isRecord(value) &&
    Array.isArray(value.entries) &&
    value.entries.every(isCursorEntry) &&
    isPageInfo(value.pageInfo)
  );
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

const buildUnexpectedLogsResponseMessage = (response: Response): string => {
  return `Unable to refresh task output (HTTP ${response.status}).`;
};

const buildUnexpectedThreadResponseMessage = (response: Response): string => {
  return `Unable to recover task metadata (HTTP ${response.status}).`;
};

const fetchTaskLogWindow = async ({
  afterCursor,
  assignmentNumber,
  laneId,
  roleId,
  threadId,
}: {
  afterCursor?: number | null;
  assignmentNumber: number | null;
  laneId: string | null;
  roleId: string | null;
  threadId: string;
}): Promise<WindowResponse> => {
  const searchParams = new URLSearchParams({
    limit: String(LOG_WINDOW_LIMIT),
    threadId,
  });

  if (typeof afterCursor === "number") {
    searchParams.set("afterCursor", String(afterCursor));
  }

  if (typeof assignmentNumber === "number") {
    searchParams.set("assignmentNumber", String(assignmentNumber));
  }

  if (laneId) {
    searchParams.set("laneId", laneId);
  }

  if (roleId) {
    searchParams.set("roleId", roleId);
  }

  const response = await fetch(`/api/team/logs?${searchParams.toString()}`, {
    cache: "no-store",
  });
  const rawPayload = await response.text();
  const payload = tryParseJson(rawPayload);

  if (!response.ok || !isWindowResponse(payload)) {
    throw new Error(readErrorMessage(payload) ?? buildUnexpectedLogsResponseMessage(response));
  }

  return payload;
};

const fetchThreadDetail = async (threadId: string): Promise<TeamThreadDetail> => {
  const response = await fetch(`/api/team/threads/${encodeURIComponent(threadId)}`, {
    cache: "no-store",
  });
  const rawPayload = await response.text();
  const payload = tryParseJson(rawPayload);

  if (!response.ok || !isThreadDetailResponse(payload)) {
    throw new Error(readErrorMessage(payload) ?? buildUnexpectedThreadResponseMessage(response));
  }

  return payload.thread;
};

const isNearBottom = (element: HTMLDivElement): boolean => {
  return element.scrollHeight - element.scrollTop - element.clientHeight <= SCROLL_THRESHOLD_PX;
};

const titleizeIdentifier = (value: string): string => {
  return value
    .split(/[-_]/gu)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
};

const formatRoleName = (roleId: string | null): string => {
  if (!roleId) {
    return "Agent";
  }

  return titleizeIdentifier(roleId);
};

export function AgentTaskOutputWindow({
  threadId,
  assignmentNumber,
  laneId,
  roleId,
}: AgentTaskOutputWindowProps) {
  const [entries, setEntries] = useState<TeamCodexLogCursorEntry[]>([]);
  const [afterCursor, setAfterCursor] = useState<number | null>(null);
  const [detail, setDetail] = useState<TeamThreadDetail | null>(null);
  const [logError, setLogError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [isLoadingLogs, setIsLoadingLogs] = useState(true);
  const [isPinnedToTail, setIsPinnedToTail] = useState(true);
  const streamRef = useRef<HTMLDivElement | null>(null);
  const afterCursorRef = useRef<number | null>(null);

  useEffect(() => {
    afterCursorRef.current = afterCursor;
  }, [afterCursor]);

  useEffect(() => {
    const element = streamRef.current;
    if (!element) {
      return;
    }

    const handleScroll = () => {
      setIsPinnedToTail(isNearBottom(element));
    };

    handleScroll();
    element.addEventListener("scroll", handleScroll);

    return () => {
      element.removeEventListener("scroll", handleScroll);
    };
  }, []);

  useEffect(() => {
    const element = streamRef.current;
    if (!element || !isPinnedToTail) {
      return;
    }

    element.scrollTop = element.scrollHeight;
  }, [entries, isPinnedToTail]);

  useEffect(() => {
    let isCancelled = false;
    let isFetchingLogs = false;
    let isFetchingDetail = false;

    setEntries([]);
    setAfterCursor(null);
    setDetail(null);
    setLogError(null);
    setDetailError(null);
    setIsLoadingLogs(true);
    setIsPinnedToTail(true);
    afterCursorRef.current = null;

    const loadLogs = async (mode: "initial" | "poll") => {
      if (isFetchingLogs) {
        return;
      }

      isFetchingLogs = true;

      try {
        const response = await fetchTaskLogWindow({
          afterCursor: mode === "poll" ? afterCursorRef.current : null,
          assignmentNumber,
          laneId,
          roleId,
          threadId,
        });

        if (isCancelled) {
          return;
        }

        const nextEntries = response.entries.filter((entry) => entry.source !== "system");

        if (mode === "initial") {
          setEntries(nextEntries);
        } else if (nextEntries.length > 0) {
          setEntries((current) => {
            const seenEntryIds = new Set(current.map((entry) => entry.id));
            const dedupedEntries = nextEntries.filter((entry) => !seenEntryIds.has(entry.id));
            return dedupedEntries.length > 0 ? [...current, ...dedupedEntries] : current;
          });
        }

        setAfterCursor(
          response.pageInfo.afterCursor ?? response.pageInfo.beforeCursor ?? afterCursorRef.current,
        );
        setLogError(null);
      } catch (error) {
        if (!isCancelled) {
          setLogError(error instanceof Error ? error.message : "Unable to refresh task output.");
        }
      } finally {
        if (!isCancelled && mode === "initial") {
          setIsLoadingLogs(false);
        }

        isFetchingLogs = false;
      }
    };

    const loadDetail = async () => {
      if (isFetchingDetail) {
        return;
      }

      isFetchingDetail = true;

      try {
        const nextDetail = await fetchThreadDetail(threadId);
        if (!isCancelled) {
          setDetail(nextDetail);
          setDetailError(null);
        }
      } catch (error) {
        if (!isCancelled) {
          setDetailError(
            error instanceof Error ? error.message : "Unable to recover task metadata.",
          );
        }
      } finally {
        isFetchingDetail = false;
      }
    };

    void loadLogs("initial");
    void loadDetail();

    const intervalId = window.setInterval(() => {
      if (!isCancelled) {
        void loadLogs("poll");
        void loadDetail();
      }
    }, LOG_POLL_INTERVAL_MS);

    return () => {
      isCancelled = true;
      window.clearInterval(intervalId);
    };
  }, [assignmentNumber, laneId, roleId, threadId]);

  const assignment =
    typeof assignmentNumber === "number"
      ? (detail?.dispatchAssignments.find(
          (candidate) => candidate.assignmentNumber === assignmentNumber,
        ) ?? null)
      : null;
  const lane = laneId
    ? (assignment?.lanes.find((candidate) => candidate.laneId === laneId) ?? null)
    : null;

  const streamGroups = groupThreadLogEntries(entries);
  const sourceTitle = `stdout / stderr from ${formatRoleName(roleId)}`;
  const headingParts = [
    sourceTitle,
    lane ? `Proposal ${lane.laneIndex}` : laneId,
    typeof assignmentNumber === "number" ? `Assignment ${assignmentNumber}` : null,
  ].filter((value): value is string => Boolean(value));
  const heading = headingParts.join(" · ");
  const subheading =
    lane?.taskTitle ??
    lane?.taskObjective ??
    assignment?.requestTitle ??
    detail?.summary.requestTitle ??
    null;

  const laneIsTerminal = lane
    ? lane.status === "awaiting_human_approval" ||
      lane.status === "cancelled" ||
      lane.status === "approved" ||
      lane.status === "failed" ||
      Boolean(lane.finishedAt)
    : false;
  const assignmentIsTerminal = assignment
    ? assignment.status === "awaiting_human_approval" ||
      assignment.status === "cancelled" ||
      assignment.status === "approved" ||
      assignment.status === "completed" ||
      assignment.status === "superseded" ||
      assignment.status === "failed" ||
      Boolean(assignment.finishedAt)
    : false;
  const showResultCard = Boolean(lane || assignment || detail?.summary);
  const resultStatusClassName = lane
    ? getLaneStatusClassName(lane)
    : assignment
      ? `status-${assignment.status}`
      : detail?.summary
        ? `status-${detail.summary.status}`
        : "status-planning";
  const resultStatusLabel = lane
    ? getLaneStatusLabel(lane)
    : assignment
      ? formatAssignmentStatusLabel(assignment.status)
      : detail?.summary
        ? threadStatusLabels[detail.summary.status]
        : "Loading";
  const resultSummary =
    lane?.lastError ??
    lane?.latestReviewerSummary ??
    lane?.latestCoderSummary ??
    lane?.latestActivity ??
    assignment?.plannerSummary ??
    detail?.summary.latestPlanSummary ??
    "No result has been recorded for this task yet.";
  const resultUpdatedAt =
    lane?.finishedAt ?? lane?.updatedAt ?? assignment?.finishedAt ?? assignment?.updatedAt;
  const streamStateLabel = lane
    ? laneIsTerminal
      ? "Finished"
      : "Streaming"
    : assignment
      ? assignmentIsTerminal
        ? "Finished"
        : "Streaming"
      : "Streaming";

  return (
    <div className={styles["task-output-window"]}>
      <header className={styles["task-output-window-header"]}>
        <div className={styles["task-output-window-copy"]}>
          <p className="eyebrow">Agent Task Output</p>
          <h1>{heading}</h1>
          {subheading ? <p>{subheading}</p> : null}
        </div>

        <div className={styles["task-output-window-meta"]}>
          <span title={threadId}>Thread {threadId.slice(0, 8)}</span>
          {roleId ? <span>{formatRoleName(roleId)}</span> : null}
          {typeof assignmentNumber === "number" ? <span>Assignment {assignmentNumber}</span> : null}
          {lane ? <span>Proposal {lane.laneIndex}</span> : null}
        </div>
      </header>

      <div className={styles["task-output-window-body"]}>
        {logError ? <p className="error-callout">{logError}</p> : null}
        {detailError ? <p className="error-callout">{detailError}</p> : null}

        <section className={styles["task-output-window-panel"]}>
          <div className={styles["task-output-window-panel-head"]}>
            <div className={styles["task-output-window-panel-copy"]}>
              <span
                className={`status-pill ${
                  streamStateLabel === "Finished" ? resultStatusClassName : "status-running"
                }`}
              >
                {streamStateLabel}
              </span>
              <span className={styles["task-output-window-source-label"]}>stdout / stderr</span>
            </div>
            {resultUpdatedAt ? <span>Updated {formatTimestamp(resultUpdatedAt)}</span> : null}
          </div>

          <div className={styles["task-output-window-stream"]} ref={streamRef}>
            {streamGroups.length > 0 ? (
              <div className={styles["task-output-window-stream-list"]}>
                {streamGroups.map((group) => (
                  <article
                    className={`${styles["task-output-window-log"]} ${group.source === "stderr" ? styles["task-output-window-log-stderr"] : ""}` }
                    key={group.id}
                  >
                    <div className={styles["task-output-window-log-meta"]}>
                      <span className={styles["task-output-window-source-label"]}>{group.source}</span>
                      <span>{describeLogEntryContext(group.contextEntry)}</span>
                      <span>{formatTimestamp(group.startedAt)}</span>
                    </div>
                    <pre className={styles["task-output-window-pre"]}>{group.message}</pre>
                  </article>
                ))}
              </div>
            ) : (
              <p className={styles["task-output-window-empty"]}>
                {isLoadingLogs
                  ? "Loading stdout / stderr output..."
                  : "No stdout or stderr output has been recorded for this task yet."}
              </p>
            )}
          </div>
        </section>

        {showResultCard ? (
          <section className={`${styles["task-output-window-panel"]} ${styles["task-output-window-result"]}`}>
            <div className={styles["task-output-window-panel-head"]}>
              <div className={styles["task-output-window-panel-copy"]}>
                <p className="eyebrow">
                  {laneIsTerminal || assignmentIsTerminal ? "Result" : "Task Status"}
                </p>
                <span className={`status-pill ${resultStatusClassName}`}>{resultStatusLabel}</span>
              </div>
              {resultUpdatedAt ? <span>{formatTimestamp(resultUpdatedAt)}</span> : null}
            </div>

            <p className={styles["task-output-window-result-copy"]}>{resultSummary}</p>

            {lane?.pullRequest ? (
              <div className={styles["task-output-window-meta"]}>
                <span>{getLanePullRequestStatusLabel(lane)}</span>
                {lane.pullRequest.url ? (
                  <a
                    className={styles["task-output-window-link"]}
                    href={lane.pullRequest.url}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {lane.pullRequest.title}
                  </a>
                ) : (
                  <span>{lane.pullRequest.title}</span>
                )}
              </div>
            ) : null}
          </section>
        ) : null}
      </div>
    </div>
  );
}
