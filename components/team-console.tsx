"use client";

import { startTransition, useEffect, useState, type FormEvent } from "react";
import {
  applyRequestedTeamConsoleRepositorySelection,
  createAutoTeamConsoleRepositorySelection,
  createManualTeamConsoleRepositorySelection,
  reconcileTeamConsoleRepositorySelection,
} from "@/components/team-console-repository-selection";
import {
  TeamThreadLogPanel,
  isTeamCodexLogEntry,
  mergeLogEntries,
} from "@/components/thread-log-panel";
import type { TeamRunSummary } from "@/lib/team/coding";
import type { TeamRepositoryOption } from "@/lib/git/repository";
import type { TeamRepositoryPickerModel } from "@/lib/team/repository-picker";
import type { TeamCodexLogEntry } from "@/lib/team/types";

type TeamConsoleProps = {
  disabled: boolean;
  initialPrompt: string;
  initialLogThreadId: string | null;
  onThreadActivity?: (threadId: string | null) => void;
  repositoryPicker: TeamRepositoryPickerModel;
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

type TeamRunBranchDeleteRequiredStreamEvent = {
  type: "branch_delete_required";
  threadId: string;
  error: string;
  branches: string[];
};

type TeamRunStreamEvent =
  | TeamRunAcceptedStreamEvent
  | TeamRunCodexEventStreamEvent
  | TeamRunResultStreamEvent
  | TeamRunErrorStreamEvent
  | TeamRunBranchDeleteRequiredStreamEvent;

type TeamRunRequest = {
  input: string;
  title?: string;
  threadId?: string;
  repositoryId?: string;
  reset: boolean;
  deleteExistingBranches?: boolean;
};

type PendingBranchDeletion = {
  request: TeamRunRequest;
  previousResult: TeamRunSummary | null;
  threadId: string;
  branches: string[];
};

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
    typeof value.requestTitle === "string" &&
    typeof value.requestText === "string" &&
    "handoffs" in value &&
    "steps" in value
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

const isBranchDeleteRequiredStreamEvent = (
  value: unknown,
): value is TeamRunBranchDeleteRequiredStreamEvent => {
  return (
    isRecord(value) &&
    value.type === "branch_delete_required" &&
    typeof value.threadId === "string" &&
    typeof value.error === "string" &&
    Array.isArray(value.branches) &&
    value.branches.every((branch) => typeof branch === "string")
  );
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

const formatRepositoryLabel = (repository: TeamRepositoryOption): string => {
  return `${repository.rootLabel} / ${repository.relativePath === "." ? repository.name : repository.relativePath}`;
};

export function TeamConsole({
  disabled,
  initialPrompt,
  initialLogThreadId,
  onThreadActivity,
  repositoryPicker,
  workerCount,
}: TeamConsoleProps) {
  const [prompt, setPrompt] = useState(initialPrompt);
  const [title, setTitle] = useState("");
  const [threadId, setThreadId] = useState("");
  const [repositorySelection, setRepositorySelection] = useState(() =>
    createAutoTeamConsoleRepositorySelection(repositoryPicker),
  );
  const [reset, setReset] = useState(false);
  const [runState, setRunState] = useState<RunState>(initialRunState);
  const [notice, setNotice] = useState<string | null>(null);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(initialLogThreadId);
  const [activeLogStartedAt, setActiveLogStartedAt] = useState<string | null>(null);
  const [logEntries, setLogEntries] = useState<TeamCodexLogEntry[]>([]);
  const [pendingBranchDeletion, setPendingBranchDeletion] = useState<PendingBranchDeletion | null>(
    null,
  );

  const isRunning = runState.status === "running";
  const isAwaitingBranchDeletion = pendingBranchDeletion !== null;
  const isBusy = isRunning || isAwaitingBranchDeletion;
  const hasRepositories = repositoryPicker.orderedRepositories.length > 0;
  const hasSuggestedRepositories = repositoryPicker.suggestedRepositories.length > 0;
  const repositoryId = repositorySelection.repositoryId;

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
    setRepositorySelection((currentSelection) =>
      reconcileTeamConsoleRepositorySelection(currentSelection, repositoryPicker),
    );
  }, [repositoryPicker]);

  const executeRun = async (
    request: TeamRunRequest,
    previousResult = runState.result,
    options: {
      preserveLogs?: boolean;
    } = {},
  ) => {
    if (!request.input) {
      setRunState({
        status: "error",
        error: "Enter a request before running the team.",
        result: previousResult,
      });
      setNotice(null);
      return;
    }

    setPrompt(request.input);
    setTitle(request.title ?? "");
    setThreadId(request.threadId ?? "");
    setRepositorySelection((currentSelection) =>
      applyRequestedTeamConsoleRepositorySelection(currentSelection, request.repositoryId),
    );
    setReset(request.reset);
    setPendingBranchDeletion(null);
    setRunState({
      status: "running",
      error: null,
      result: previousResult,
    });

    if (options.preserveLogs) {
      setNotice("Branch deletion confirmed. Rerunning the planner.");
    } else {
      setNotice(null);
      setLogEntries([]);
      setActiveThreadId(null);
      setActiveLogStartedAt(null);
    }

    try {
      const response = await fetch("/api/team/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          input: request.input,
          title: request.title || undefined,
          threadId: request.threadId || undefined,
          repositoryId: request.repositoryId || undefined,
          reset: request.reset,
          deleteExistingBranches: request.deleteExistingBranches,
        }),
      });

      if (!response.ok) {
        const rawPayload = await response.text();
        const payload = tryParseJson(rawPayload);
        throw new Error(
          readErrorMessage(payload) ?? buildUnexpectedResponseMessage(response, rawPayload),
        );
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
          onThreadActivity?.(event.threadId);
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
          onThreadActivity?.(event.result.threadId ?? null);
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

        if (isBranchDeleteRequiredStreamEvent(event)) {
          sawTerminalEvent = true;
          setThreadId(event.threadId);
          setActiveThreadId(event.threadId);
          onThreadActivity?.(event.threadId);
          setRunState({
            status: "idle",
            error: null,
            result: previousResult,
          });
          setPendingBranchDeletion({
            request,
            previousResult,
            threadId: event.threadId,
            branches: event.branches,
          });
          setNotice(
            "Planner is waiting for confirmation to delete the existing proposal branches and rerun the assignment.",
          );
          return;
        }

        sawTerminalEvent = true;
        setPendingBranchDeletion(null);
        setThreadId(event.threadId);
        setActiveThreadId(event.threadId);
        onThreadActivity?.(event.threadId);
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
            !isErrorStreamEvent(parsed) &&
            !isBranchDeleteRequiredStreamEvent(parsed)
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
          !isErrorStreamEvent(parsed) &&
          !isBranchDeleteRequiredStreamEvent(parsed)
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

  const handleConfirmBranchDeletion = () => {
    if (!pendingBranchDeletion) {
      return;
    }

    const nextRequest: TeamRunRequest = {
      ...pendingBranchDeletion.request,
      threadId: pendingBranchDeletion.threadId,
      deleteExistingBranches: true,
    };
    const previousResult = pendingBranchDeletion.previousResult;

    setPendingBranchDeletion(null);
    startTransition(() => {
      void executeRun(nextRequest, previousResult, {
        preserveLogs: true,
      });
    });
  };

  const handleKeepExistingBranches = () => {
    if (!pendingBranchDeletion) {
      return;
    }

    setRunState({
      status: "error",
      error: "Planning stopped because the existing branches were left in place.",
      result: pendingBranchDeletion.previousResult,
    });
    setPendingBranchDeletion(null);
    setNotice(null);
  };

  const handleSubmit = async (formData: FormData) => {
    const nextPrompt = String(formData.get("prompt") ?? "").trim();
    const nextTitle = String(formData.get("title") ?? "").trim();
    const nextThreadId = String(formData.get("threadId") ?? "").trim();
    const nextRepositoryId = String(formData.get("repositoryId") ?? "").trim();
    const shouldReset = formData.get("reset") === "on";

    return executeRun({
      input: nextPrompt,
      title: nextTitle || undefined,
      threadId: nextThreadId || undefined,
      repositoryId: nextRepositoryId || undefined,
      reset: shouldReset,
    });
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
        <h2>Continuous Assignment Console</h2>
        <p className="section-copy">
          Reuse the same thread ID to keep the planning conversation continuous. The planner creates
          one or more proposals for the current request group, and the shared coding-review pool
          runs up to {workerCount} approved proposals at a time using reusable worktrees.
        </p>
        {hasRepositories ? (
          <p className="field-hint">
            Suggested repositories are ranked from prior Run Team requests. Every repository
            discovered from directories configured in `team.config.ts` stays selectable, and the
            picker keeps your current choice until you change it.
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
            disabled={disabled || isBusy}
          />
        </label>

        <label className="field">
          <span>Request Title</span>
          <input
            name="title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Optional human title. Leave blank to generate one."
            disabled={disabled || isBusy}
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
              disabled={disabled || isBusy}
            />
          </label>

          {hasRepositories ? (
            <label className="field">
              <span>Repository</span>
              <select
                name="repositoryId"
                value={repositoryId}
                onChange={(event) =>
                  setRepositorySelection(
                    createManualTeamConsoleRepositorySelection(event.target.value),
                  )
                }
                disabled={disabled || isBusy}
              >
                <option value="">No repository selected</option>
                {hasSuggestedRepositories ? (
                  <optgroup label="Suggested from prior team runs">
                    {repositoryPicker.suggestedRepositories.map((repository) => (
                      <option key={repository.id} value={repository.id}>
                        {formatRepositoryLabel(repository)}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
                {repositoryPicker.remainingRepositories.length > 0 ? (
                  <optgroup
                    label={
                      hasSuggestedRepositories
                        ? "Other accessible repositories"
                        : "Accessible repositories"
                    }
                  >
                    {repositoryPicker.remainingRepositories.map((repository) => (
                      <option key={repository.id} value={repository.id}>
                        {formatRepositoryLabel(repository)}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
              </select>
            </label>
          ) : (
            <label className="checkbox-field">
              <input
                name="reset"
                type="checkbox"
                checked={reset}
                onChange={(event) => setReset(event.target.checked)}
                disabled={disabled || isBusy}
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
              disabled={disabled || isBusy}
            />
            <span>Start a fresh assignment cycle</span>
          </label>
        ) : null}

        <button className="primary-button" type="submit" disabled={disabled || isBusy}>
          {isRunning ? "Planning proposals..." : "Plan Proposals"}
        </button>
      </form>

      {notice ? <p className="info-callout">{notice}</p> : null}
      {runState.error ? <p className="error-callout">{runState.error}</p> : null}
      {pendingBranchDeletion ? (
        <div className="branch-delete-callout" role="alert">
          <p className="branch-delete-title">Existing proposal branches found</p>
          <p className="branch-delete-copy">
            Delete these branches and any managed harness worktrees attached to them, then rerun the
            planner for the same request?
          </p>
          <ul className="branch-delete-list">
            {pendingBranchDeletion.branches.map((branchName) => (
              <li key={branchName}>
                <code>{branchName}</code>
              </li>
            ))}
          </ul>
          <div className="branch-delete-actions">
            <button
              className="primary-button"
              type="button"
              onClick={handleConfirmBranchDeletion}
              disabled={disabled}
            >
              Delete And Continue
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={handleKeepExistingBranches}
              disabled={disabled}
            >
              Keep Existing Branches
            </button>
          </div>
        </div>
      ) : null}

      <TeamThreadLogPanel
        description="Streaming planner output appears immediately, and the same thread-scoped log file is polled so coder and reviewer lane output continues showing up here after proposal approval."
        emptyMessage="No Codex CLI output has been recorded for this thread yet."
        isPending={isBusy}
        pendingMessage={
          isAwaitingBranchDeletion
            ? "Waiting for branch deletion confirmation..."
            : "Waiting for Codex CLI output..."
        }
        seedEntries={logEntries}
        startedAt={activeLogStartedAt}
        threadId={activeThreadId}
      />

      {runState.result ? (
        <div className="run-result">
          <div className="result-request-card">
            <span className="meta-label">Request Title</span>
            <p className="result-request-title">{runState.result.requestTitle}</p>
            <p className="result-request-copy">{runState.result.requestText}</p>
          </div>

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
                <article
                  className="timeline-item"
                  key={`${step.agentName}-${step.createdAt}-${index}`}
                >
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
