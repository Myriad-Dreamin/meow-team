"use client";

import { startTransition, useState, type FormEvent } from "react";
import type { TeamRunSummary } from "@/lib/team/network";
import type { TeamRepositoryOption } from "@/lib/team/repository-types";

type TeamConsoleProps = {
  disabled: boolean;
  initialPrompt: string;
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

const initialRunState: RunState = {
  status: "idle",
  error: null,
  result: null,
};

type TeamRunAcceptedResponse = {
  accepted: true;
  status: "running";
  threadId: string;
  startedAt: string;
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

const isAcceptedResponse = (value: unknown): value is TeamRunAcceptedResponse => {
  return isRecord(value) && value.accepted === true && typeof value.threadId === "string";
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
    return `Team run failed with HTTP ${response.status}. The server returned an HTML error page instead of JSON, which usually means the production request crashed or timed out. Check Live Thread Status below for partial progress.`;
  }

  if (!trimmed) {
    return `Team run failed with HTTP ${response.status}. The server returned an empty response.`;
  }

  return `Team run failed with HTTP ${response.status}. The server returned an unexpected response body.`;
};

export function TeamConsole({ disabled, initialPrompt, repositories, workerCount }: TeamConsoleProps) {
  const [prompt, setPrompt] = useState(initialPrompt);
  const [threadId, setThreadId] = useState("");
  const [repositoryId, setRepositoryId] = useState("");
  const [reset, setReset] = useState(false);
  const [runState, setRunState] = useState<RunState>(initialRunState);
  const [notice, setNotice] = useState<string | null>(null);

  const isRunning = runState.status === "running";
  const hasRepositories = repositories.length > 0;

  const handleSubmit = async (formData: FormData) => {
    const nextPrompt = String(formData.get("prompt") ?? "").trim();
    const nextThreadId = String(formData.get("threadId") ?? "").trim();
    const nextRepositoryId = String(formData.get("repositoryId") ?? "").trim();
    const shouldReset = formData.get("reset") === "on";

    if (!nextPrompt) {
      setRunState({
        status: "error",
        error: "Enter a request before running the team.",
        result: runState.result,
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
      result: runState.result,
    });
    setNotice(null);

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

      const rawPayload = await response.text();
      const payload = tryParseJson(rawPayload);

      if (!response.ok) {
        throw new Error(readErrorMessage(payload) ?? buildUnexpectedResponseMessage(response, rawPayload));
      }

      if (isAcceptedResponse(payload)) {
        setThreadId(payload.threadId);
        setRunState({
          status: "idle",
          error: null,
          result: runState.result,
        });
        setNotice(
          `Planner proposal generation started on thread ${payload.threadId}. Follow the live status board below, approve the proposals you want, and the coding-review queue will pick them up from there.`,
        );
        return;
      }

      if (!isTeamRunSummary(payload)) {
        throw new Error(buildUnexpectedResponseMessage(response, rawPayload));
      }

      setThreadId(payload.threadId ?? "");
      setRunState({
        status: "success",
        error: null,
        result: payload,
      });
      setNotice(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Team run failed.";
      setRunState({
        status: "error",
        error: message,
        result: runState.result,
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
