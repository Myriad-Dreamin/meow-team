"use client";

import { startTransition, useEffect, useRef, useState, type FormEvent } from "react";
import type { TeamRunSummary } from "@/lib/team/network";
import type { TeamRepositoryOption } from "@/lib/team/repository-types";
import type { TeamCodexLogEntry } from "@/lib/team/types";

type TeamConsoleProps = {
  disabled: boolean;
  initialPrompt: string;
  initialLogThreadId: string | null;
  repositories: TeamRepositoryOption[];
  workerCount: number;
};

type RunState =
  | {
      status: "idle";
      error: null;
      result: TeamRunSummary | null;
    }
  | {
      status: "running";
      error: null;
      result: TeamRunSummary | null;
    }
  | {
      status: "success";
      error: null;
      result: TeamRunSummary;
    }
  | {
      status: "error";
      error: string;
      result: TeamRunSummary | null;
    };

type TeamRunAcceptedStreamEvent = {
  type: "accepted";
  status: "running";
  threadId: string;
  startedAt: string;
};

type TeamRunCodexEventStreamEvent = {
  type: "codex_event";
  entry: TeamCodexLogEntry;
};

type TeamRunResultStreamEvent = {
  type: "result";
  result: TeamRunSummary;
};

type TeamRunErrorStreamEvent = {
  type: "error";
  threadId: string;
  error: string;
};

type TeamRunStreamEvent =
  | TeamRunAcceptedStreamEvent
  | TeamRunCodexEventStreamEvent
  | TeamRunResultStreamEvent
  | TeamRunErrorStreamEvent;

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
const ACTIVE_LOG_THREAD_ID_STORAGE_KEY = "team-console.active-log-thread-id";
const ACTIVE_LOG_STARTED_AT_STORAGE_KEY = "team-console.active-log-started-at";

const initialRunState: RunState = {
  status: "idle",
  error: null,
  result: null,
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

const isTeamRunSummary = (value: unknown): value is TeamRunSummary => {
  return (
    isRecord(value) &&
    "threadId" in value &&
    "assignmentNumber" in value &&
    "handoffs" in value &&
    "steps" in value
  );
};

const isTeamCodexLogEntry = (value: unknown): value is TeamCodexLogEntry => {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.threadId === "string" &&
    typeof value.source === "string" &&
    typeof value.message === "string" &&
    typeof value.createdAt === "string"
  );
};

const isAcceptedStreamEvent = (value: unknown): value is TeamRunAcceptedStreamEvent => {
  return (
    isRecord(value) &&
    value.type === "accepted" &&
    value.status === "running" &&
    typeof value.threadId === "string" &&
    typeof value.startedAt === "string"
  );
};

const isCodexEventStreamEvent = (value: unknown): value is TeamRunCodexEventStreamEvent => {
  return isRecord(value) && value.type === "codex_event" && isTeamCodexLogEntry(value.entry);
};

const isResultStreamEvent = (value: unknown): value is TeamRunResultStreamEvent => {
  return isRecord(value) && value.type === "result" && isTeamRunSummary(value.result);
};

const isErrorStreamEvent = (value: unknown): value is TeamRunErrorStreamEvent => {
  return (
    isRecord(value) &&
    value.type === "error" &&
    typeof value.threadId === "string" &&
    typeof value.error === "string"
  );
};

const isLogsResponse = (value: unknown): value is TeamLogsResponse => {
  return isRecord(value) && Array.isArray(value.entries) && value.entries.every(isTeamCodexLogEntry);
};

const readErrorMessage = (value: unknown): string | null => {
  if (!isRecord(value) || typeof value.error !== "string" || !value.error.trim()) {
    return null;
  }

  return value.error;
};

const buildUnexpectedResponseMessage = (response: Response, body: string): string => {
  const trimmed = body.trim();
  if (trimmed.startsWith("<!DOCTYPE") || trimmed.startsWith("<html")) {
    return `Team run failed with HTTP ${response.status}. The server returned an HTML error page instead of JSON, which usually means the request crashed or timed out. Check Live Thread Status below for partial progress.`;
  }

  if (!trimmed) {
    return `Team run failed with HTTP ${response.status}. The server returned an empty response.`;
  }

  return `Team run failed with HTTP ${response.status}. The server returned an unexpected response body.`;
};

const mergeLogEntries = (
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

export function TeamConsole({
  disabled,
  initialPrompt,
  initialLogThreadId,
  repositories,
  workerCount,
}: TeamConsoleProps) {
  const [prompt, setPrompt] = useState(initialPrompt);
  const [threadId, setThreadId] = useState("");
  const [repositoryId, setRepositoryId] = useState("");
  const [reset, setReset] = useState(false);
  const [runState, setRunState] = useState<RunState>(initialRunState);
  const [notice, setNotice] = useState<string | null>(null);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(initialLogThreadId);
  const [activeLogStartedAt, setActiveLogStartedAt] = useState<string | null>(null);
  const [logEntries, setLogEntries] = useState<TeamCodexLogEntry[]>([]);
  const [logError, setLogError] = useState<string | null>(null);
  const stderrScrollRef = useRef<HTMLDivElement | null>(null);

  const isRunning = runState.status === "running";
  const hasRepositories = repositories.length > 0;
  const visibleLogEntries = activeLogStartedAt
    ? logEntries.filter((entry) => entry.createdAt >= activeLogStartedAt)
    : logEntries;
  const stderrEntries = visibleLogEntries.filter((entry) => entry.source === "stderr");
  const groupedStderrEntries = groupConsecutiveLogEntries(stderrEntries);
  const timelineLogEntries = visibleLogEntries.filter((entry) => entry.source !== "stderr");

  useEffect(() => {
    const storedThreadId = window.localStorage.getItem(ACTIVE_LOG_THREAD_ID_STORAGE_KEY);
    const storedStartedAt = window.localStorage.getItem(ACTIVE_LOG_STARTED_AT_STORAGE_KEY);

    if (storedThreadId) {
      setActiveThreadId(storedThreadId);
      setActiveLogStartedAt(storedStartedAt || null);
      return;
    }

    if (initialLogThreadId) {
      setActiveThreadId(initialLogThreadId);
    }
  }, [initialLogThreadId]);

  useEffect(() => {
    setLogEntries([]);

    if (!activeThreadId) {
      setLogError(null);
      return;
    }

    let isCancelled = false;

    const loadLogs = async () => {
      try {
        const response = await fetch(
          `/api/team/logs?threadId=${encodeURIComponent(activeThreadId)}&limit=${MAX_VISIBLE_LOGS}`,
          {
            cache: "no-store",
          },
        );

        const rawPayload = await response.text();
        const payload = tryParseJson(rawPayload);
        if (!response.ok || !isLogsResponse(payload)) {
          throw new Error(
            readErrorMessage(payload) ?? buildUnexpectedResponseMessage(response, rawPayload),
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
  }, [activeThreadId]);

  useEffect(() => {
    if (!activeThreadId) {
      window.localStorage.removeItem(ACTIVE_LOG_THREAD_ID_STORAGE_KEY);
      window.localStorage.removeItem(ACTIVE_LOG_STARTED_AT_STORAGE_KEY);
      return;
    }

    window.localStorage.setItem(ACTIVE_LOG_THREAD_ID_STORAGE_KEY, activeThreadId);

    if (activeLogStartedAt) {
      window.localStorage.setItem(ACTIVE_LOG_STARTED_AT_STORAGE_KEY, activeLogStartedAt);
      return;
    }

    window.localStorage.removeItem(ACTIVE_LOG_STARTED_AT_STORAGE_KEY);
  }, [activeLogStartedAt, activeThreadId]);

  useEffect(() => {
    const stderrElement = stderrScrollRef.current;
    if (!stderrElement) {
      return;
    }

    stderrElement.scrollTop = stderrElement.scrollHeight;
  }, [stderrEntries.length]);

  const handleSubmit = async (formData: FormData) => {
    const nextPrompt = String(formData.get("prompt") ?? "").trim();
    const nextThreadId = String(formData.get("threadId") ?? "").trim();
    const nextRepositoryId = String(formData.get("repositoryId") ?? "").trim();
    const shouldReset = formData.get("reset") === "on";
    const previousResult = runState.result;

    if (!nextPrompt) {
      setRunState({
        status: "error",
        error: "Enter a request before running the team.",
        result: previousResult,
      });
      setNotice(null);
      return;
    }

    setPrompt(nextPrompt);
    setThreadId(nextThreadId);
    setRepositoryId(nextRepositoryId);
    setReset(shouldReset);
    setRunState({
      status: "running",
      error: null,
      result: previousResult,
    });
    setNotice(null);
    setLogError(null);
    setLogEntries([]);
    setActiveThreadId(null);
    setActiveLogStartedAt(null);

    try {
      const response = await fetch("/api/team/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          input: nextPrompt,
          threadId: nextThreadId || undefined,
          repositoryId: nextRepositoryId || undefined,
          reset: shouldReset,
        }),
      });

      if (!response.ok) {
        const rawPayload = await response.text();
        const payload = tryParseJson(rawPayload);
        throw new Error(readErrorMessage(payload) ?? buildUnexpectedResponseMessage(response, rawPayload));
      }

      if (!response.body) {
        throw new Error("Team run started without a readable stream response.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let sawTerminalEvent = false;

      const handleStreamEvent = (event: TeamRunStreamEvent) => {
        if (isAcceptedStreamEvent(event)) {
          setThreadId(event.threadId);
          setActiveThreadId(event.threadId);
          setActiveLogStartedAt(event.startedAt);
          setNotice(
            `Streaming planner output on thread ${event.threadId}. Planner logs appear live here, and coder or reviewer lanes will keep appending to the persisted thread log after proposal approval.`,
          );
          return;
        }

        if (isCodexEventStreamEvent(event)) {
          setLogEntries((current) => mergeLogEntries(current, [event.entry]));
          return;
        }

        if (isResultStreamEvent(event)) {
          sawTerminalEvent = true;
          setThreadId(event.result.threadId ?? "");
          setActiveThreadId(event.result.threadId ?? null);
          setRunState({
            status: "success",
            error: null,
            result: event.result,
          });
          setNotice(
            "Planner finished. Approve the proposals in Live Thread Status to start coder and reviewer lanes; their Codex CLI logs will continue appearing here.",
          );
          return;
        }

        sawTerminalEvent = true;
        setThreadId(event.threadId);
        setActiveThreadId(event.threadId);
        setRunState({
          status: "error",
          error: event.error,
          result: previousResult,
        });
        setNotice(null);
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) {
            continue;
          }

          const parsed = tryParseJson(trimmed);
          if (
            !isAcceptedStreamEvent(parsed) &&
            !isCodexEventStreamEvent(parsed) &&
            !isResultStreamEvent(parsed) &&
            !isErrorStreamEvent(parsed)
          ) {
            throw new Error("Team run stream returned an unexpected event payload.");
          }

          handleStreamEvent(parsed);
        }
      }

      const trailing = buffer.trim();
      if (trailing) {
        const parsed = tryParseJson(trailing);
        if (
          !isAcceptedStreamEvent(parsed) &&
          !isCodexEventStreamEvent(parsed) &&
          !isResultStreamEvent(parsed) &&
          !isErrorStreamEvent(parsed)
        ) {
          throw new Error("Team run stream returned an unexpected final payload.");
        }

        handleStreamEvent(parsed);
      }

      if (!sawTerminalEvent) {
        throw new Error("Team run stream ended before a final result was returned.");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Team run failed.";
      setRunState({
        status: "error",
        error: message,
        result: previousResult,
      });
      setNotice(null);
    }
  };

  const handleFormSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    startTransition(() => {
      void handleSubmit(formData);
    });
  };

  return (
    <section className="console-panel">
      <div className="section-header">
        <p className="eyebrow">Run Team</p>
        <h2>Continuous Assignment Console</h2>
        <p className="section-copy">
          Reuse the same thread ID to keep the planning conversation continuous. The planner
          creates one or more proposals for the current request group, and the shared
          coding-review pool runs up to {workerCount} approved proposals at a time using reusable
          worktrees.
        </p>
        {hasRepositories ? (
          <p className="field-hint">
            Select a repository before planning proposals. Only repositories discovered from
            directories configured in `team.config.ts` can be selected here.
          </p>
        ) : null}
      </div>

      <form className="console-form" onSubmit={handleFormSubmit}>
        <label className="field">
          <span>Request</span>
          <textarea
            name="prompt"
            rows={8}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Plan multiple proposals for a new onboarding flow, wait for human approval, then queue coding and machine review for the approved proposals."
            disabled={disabled || isRunning}
          />
        </label>

        <div className="field-row">
          <label className="field">
            <span>Thread ID</span>
            <input
              name="threadId"
              value={threadId}
              onChange={(event) => setThreadId(event.target.value)}
              placeholder="Optional continuous thread"
              disabled={disabled || isRunning}
            />
          </label>

          {hasRepositories ? (
            <label className="field">
              <span>Repository</span>
              <select
                name="repositoryId"
                value={repositoryId}
                onChange={(event) => setRepositoryId(event.target.value)}
                disabled={disabled || isRunning}
              >
                <option value="">No repository selected</option>
                {repositories.map((repository) => (
                  <option key={repository.id} value={repository.id}>
                    {repository.rootLabel} /{" "}
                    {repository.relativePath === "." ? repository.name : repository.relativePath}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label className="checkbox-field">
              <input
                name="reset"
                type="checkbox"
                checked={reset}
                onChange={(event) => setReset(event.target.checked)}
                disabled={disabled || isRunning}
              />
              <span>Start a fresh assignment cycle</span>
            </label>
          )}
        </div>

        {hasRepositories ? (
          <label className="checkbox-field">
            <input
              name="reset"
              type="checkbox"
              checked={reset}
              onChange={(event) => setReset(event.target.checked)}
              disabled={disabled || isRunning}
            />
            <span>Start a fresh assignment cycle</span>
          </label>
        ) : null}

        <button className="primary-button" type="submit" disabled={disabled || isRunning}>
          {isRunning ? "Planning proposals..." : "Plan Proposals"}
        </button>
      </form>

      {notice ? <p className="info-callout">{notice}</p> : null}
      {runState.error ? <p className="error-callout">{runState.error}</p> : null}
      {logError ? <p className="error-callout">{logError}</p> : null}

      {activeThreadId ? (
        <div className="timeline-panel codex-log-panel">
          <div className="section-header compact">
            <p className="eyebrow">Codex Output</p>
            <h3>Live Thread Log</h3>
            <p className="section-copy">
              Streaming planner output appears immediately, and the same thread-scoped log file is
              polled so coder and reviewer lane output continues showing up here after proposal
              approval.
            </p>
            <p className="field-hint">Watching thread {activeThreadId}.</p>
          </div>

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
                      {group.lineCount > 1 ? (
                        <span>{group.lineCount} lines</span>
                      ) : null}
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
              {isRunning
                ? "Waiting for Codex CLI output..."
                : "No Codex CLI output has been recorded for this thread yet."}
            </p>
          ) : null}
        </div>
      ) : null}

      {runState.result ? (
        <div className="run-result">
          <div className="result-meta">
            <div>
              <span className="meta-label">Thread</span>
              <p>{runState.result.threadId ?? "Not created"}</p>
            </div>
            <div>
              <span className="meta-label">Assignment</span>
              <p>#{runState.result.assignmentNumber}</p>
            </div>
            <div>
              <span className="meta-label">Review</span>
              <p>{runState.result.approved ? "Approved" : "Needs attention"}</p>
            </div>
            <div>
              <span className="meta-label">Repository</span>
              <p>{runState.result.repository?.name ?? "None selected"}</p>
              {runState.result.repository ? (
                <p className="meta-detail">{runState.result.repository.path}</p>
              ) : null}
            </div>
          </div>

          <div className="handoff-grid">
            {runState.result.handoffs.map((handoff) => (
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

          <div className="timeline-panel">
            <div className="section-header compact">
              <p className="eyebrow">Timeline</p>
              <h3>Agent Steps</h3>
            </div>
            <div className="timeline-list">
              {runState.result.steps.map((step, index) => (
                <article className="timeline-item" key={`${step.agentName}-${step.createdAt}-${index}`}>
                  <div className="timeline-marker" />
                  <div>
                    <p className="timeline-title">{step.agentName}</p>
                    <p className="timeline-copy">
                      {step.text || "This step completed through tool calls and state updates."}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
