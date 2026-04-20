"use client";

import { useEffect, useRef, useState } from "react";
import type { TeamCodexLogEntry } from "@/lib/team/types";

type TeamThreadLogPanelProps = {
  threadId: string | null;
  seedEntries?: TeamCodexLogEntry[];
  startedAt?: string | null;
  eyebrow?: string;
  title?: string;
  description: string;
  emptyMessage: string;
  pendingMessage?: string;
  isPending?: boolean;
};

type TeamLogsResponse = {
  entries: TeamCodexLogEntry[];
};

type TeamCodexLogGroup = {
  id: string;
  source: TeamCodexLogEntry["source"];
  contextEntry: TeamCodexLogEntry;
  startedAt: string;
  endedAt: string;
  message: string;
  lineCount: number;
};

const LOG_POLL_INTERVAL_MS = 3000;
const MAX_VISIBLE_LOGS = 240;
const EMPTY_LOG_ENTRIES: TeamCodexLogEntry[] = [];

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

export const isTeamCodexLogEntry = (value: unknown): value is TeamCodexLogEntry => {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.threadId === "string" &&
    typeof value.source === "string" &&
    typeof value.message === "string" &&
    typeof value.createdAt === "string"
  );
};

const isLogsResponse = (value: unknown): value is TeamLogsResponse => {
  return (
    isRecord(value) && Array.isArray(value.entries) && value.entries.every(isTeamCodexLogEntry)
  );
};

const readErrorMessage = (value: unknown): string | null => {
  if (!isRecord(value) || typeof value.error !== "string" || !value.error.trim()) {
    return null;
  }

  return value.error;
};

const buildUnexpectedLogsResponseMessage = (response: Response, body: string): string => {
  const trimmed = body.trim();
  if (trimmed.startsWith("<!DOCTYPE") || trimmed.startsWith("<html")) {
    return `Unable to refresh persisted Codex CLI logs (HTTP ${response.status}). The server returned an HTML error page instead of JSON.`;
  }

  if (!trimmed) {
    return `Unable to refresh persisted Codex CLI logs (HTTP ${response.status}). The server returned an empty response.`;
  }

  return `Unable to refresh persisted Codex CLI logs (HTTP ${response.status}).`;
};

export const mergeLogEntries = (
  currentEntries: TeamCodexLogEntry[],
  nextEntries: TeamCodexLogEntry[],
): TeamCodexLogEntry[] => {
  const byId = new Map<string, TeamCodexLogEntry>();

  for (const entry of currentEntries) {
    byId.set(entry.id, entry);
  }

  for (const entry of nextEntries) {
    byId.set(entry.id, entry);
  }

  return Array.from(byId.values())
    .sort((left, right) => {
      if (left.createdAt !== right.createdAt) {
        return left.createdAt.localeCompare(right.createdAt);
      }

      return left.id.localeCompare(right.id);
    })
    .slice(-MAX_VISIBLE_LOGS);
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

const describeLogContext = (entry: TeamCodexLogEntry): string => {
  const parts = [
    entry.roleId ?? "system",
    entry.laneId ?? null,
    entry.assignmentNumber ? `Assignment #${entry.assignmentNumber}` : null,
  ].filter((value): value is string => Boolean(value));

  return parts.join(" | ");
};

const shareLogContext = (left: TeamCodexLogEntry, right: TeamCodexLogEntry): boolean => {
  return (
    left.source === right.source &&
    left.roleId === right.roleId &&
    left.laneId === right.laneId &&
    left.assignmentNumber === right.assignmentNumber
  );
};

const groupConsecutiveLogEntries = (entries: TeamCodexLogEntry[]): TeamCodexLogGroup[] => {
  const groups: TeamCodexLogGroup[] = [];

  for (const entry of entries) {
    const previousGroup = groups.at(-1);
    if (previousGroup && shareLogContext(previousGroup.contextEntry, entry)) {
      previousGroup.message = `${previousGroup.message}\n${entry.message}`;
      previousGroup.endedAt = entry.createdAt;
      previousGroup.lineCount += 1;
      continue;
    }

    groups.push({
      id: entry.id,
      source: entry.source,
      contextEntry: entry,
      startedAt: entry.createdAt,
      endedAt: entry.createdAt,
      message: entry.message,
      lineCount: 1,
    });
  }

  return groups;
};

const formatLogGroupTimestamp = (group: TeamCodexLogGroup): string => {
  const startedAt = formatTimestamp(group.startedAt);
  if (group.startedAt === group.endedAt) {
    return startedAt;
  }

  return `${startedAt} -> ${formatTimestamp(group.endedAt)}`;
};

export function TeamThreadLogPanel({
  threadId,
  seedEntries,
  startedAt = null,
  eyebrow = "Codex Output",
  title = "Live Thread Log",
  description,
  emptyMessage,
  pendingMessage,
  isPending = false,
}: TeamThreadLogPanelProps) {
  const safeSeedEntries = seedEntries ?? EMPTY_LOG_ENTRIES;
  const [logEntries, setLogEntries] = useState<TeamCodexLogEntry[]>(safeSeedEntries);
  const [logError, setLogError] = useState<string | null>(null);
  const stderrScrollRef = useRef<HTMLDivElement | null>(null);
  const latestSeedEntriesRef = useRef<TeamCodexLogEntry[]>(safeSeedEntries);

  useEffect(() => {
    latestSeedEntriesRef.current = safeSeedEntries;
  }, [safeSeedEntries]);

  useEffect(() => {
    setLogEntries(latestSeedEntriesRef.current);
    setLogError(null);
  }, [threadId]);

  useEffect(() => {
    if (safeSeedEntries.length === 0) {
      return;
    }

    setLogEntries((current) => mergeLogEntries(current, safeSeedEntries));
  }, [safeSeedEntries]);

  useEffect(() => {
    if (!threadId) {
      setLogEntries(latestSeedEntriesRef.current);
      setLogError(null);
      return;
    }

    let isCancelled = false;

    const loadLogs = async () => {
      try {
        const response = await fetch(
          `/api/team/logs?threadId=${encodeURIComponent(threadId)}&limit=${MAX_VISIBLE_LOGS}`,
          {
            cache: "no-store",
          },
        );

        const rawPayload = await response.text();
        const payload = tryParseJson(rawPayload);
        if (!response.ok || !isLogsResponse(payload)) {
          throw new Error(
            readErrorMessage(payload) ?? buildUnexpectedLogsResponseMessage(response, rawPayload),
          );
        }

        if (!isCancelled) {
          setLogEntries((current) => mergeLogEntries(current, payload.entries));
          setLogError(null);
        }
      } catch (error) {
        if (!isCancelled) {
          setLogError(
            error instanceof Error ? error.message : "Unable to refresh persisted Codex CLI logs.",
          );
        }
      }
    };

    void loadLogs();
    const intervalId = window.setInterval(() => {
      if (!isCancelled) {
        void loadLogs();
      }
    }, LOG_POLL_INTERVAL_MS);

    return () => {
      isCancelled = true;
      window.clearInterval(intervalId);
    };
  }, [threadId]);

  useEffect(() => {
    const stderrElement = stderrScrollRef.current;
    if (!stderrElement) {
      return;
    }

    stderrElement.scrollTop = stderrElement.scrollHeight;
  }, [logEntries]);

  if (!threadId) {
    return null;
  }

  const visibleLogEntries = startedAt
    ? logEntries.filter((entry) => entry.createdAt >= startedAt)
    : logEntries;
  const stderrEntries = visibleLogEntries.filter((entry) => entry.source === "stderr");
  const groupedStderrEntries = groupConsecutiveLogEntries(stderrEntries);
  const timelineLogEntries = visibleLogEntries.filter((entry) => entry.source !== "stderr");

  return (
    <div className="timeline-panel codex-log-panel">
      <div className="section-header compact">
        <p className="eyebrow">{eyebrow}</p>
        <h3>{title}</h3>
        <p className="section-copy">{description}</p>
        <p className="harness-form-hint">Watching thread {threadId}.</p>
      </div>

      {logError ? <p className="error-callout">{logError}</p> : null}

      {stderrEntries.length > 0 ? (
        <article className="codex-stderr-panel">
          <div className="codex-log-meta">
            <span className="log-source log-source-stderr">stderr</span>
            <span>
              {stderrEntries.length} line{stderrEntries.length === 1 ? "" : "s"}
            </span>
            <span>
              {groupedStderrEntries.length} block{groupedStderrEntries.length === 1 ? "" : "s"}
            </span>
          </div>
          <div ref={stderrScrollRef} className="codex-stderr-list">
            {groupedStderrEntries.map((group) => (
              <article className="codex-log-item codex-log-item-stderr" key={group.id}>
                <div className="codex-log-meta">
                  <span>{describeLogContext(group.contextEntry)}</span>
                  <span>{formatLogGroupTimestamp(group)}</span>
                  {group.lineCount > 1 ? <span>{group.lineCount} lines</span> : null}
                </div>
                <pre className="codex-log-message codex-stderr-message">{group.message}</pre>
              </article>
            ))}
          </div>
        </article>
      ) : null}

      {timelineLogEntries.length > 0 ? (
        <div className="codex-log-list">
          {timelineLogEntries.map((entry) => (
            <article className="codex-log-item" key={entry.id}>
              <div className="codex-log-meta">
                <span className={`log-source log-source-${entry.source}`}>{entry.source}</span>
                <span>{describeLogContext(entry)}</span>
                <span>{formatTimestamp(entry.createdAt)}</span>
              </div>
              <pre className="codex-log-message">{entry.message}</pre>
            </article>
          ))}
        </div>
      ) : visibleLogEntries.length === 0 ? (
        <p className="timeline-copy">
          {isPending && pendingMessage ? pendingMessage : emptyMessage}
        </p>
      ) : null}
    </div>
  );
}
