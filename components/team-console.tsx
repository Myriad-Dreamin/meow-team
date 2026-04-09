"use client";

import { startTransition, useState } from "react";
import type { TeamRunSummary } from "@/lib/team/network";
import type { TeamRepositoryOption } from "@/lib/team/repository-types";

type TeamConsoleProps = {
  disabled: boolean;
  initialPrompt: string;
  repositories: TeamRepositoryOption[];
};

type RunState =
  | {
      status: "idle";
      error: null;
      result: null;
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

export function TeamConsole({ disabled, initialPrompt, repositories }: TeamConsoleProps) {
  const [prompt, setPrompt] = useState(initialPrompt);
  const [threadId, setThreadId] = useState("");
  const [repositoryId, setRepositoryId] = useState("");
  const [reset, setReset] = useState(false);
  const [runState, setRunState] = useState<RunState>(initialRunState);

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

      const payload = (await response.json()) as TeamRunSummary | { error?: string };
      if (!response.ok || !("threadId" in payload)) {
        throw new Error("error" in payload ? payload.error || "Team run failed." : "Team run failed.");
      }

      setThreadId(payload.threadId ?? "");
      setRunState({
        status: "success",
        error: null,
        result: payload,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Team run failed.";
      setRunState({
        status: "error",
        error: message,
        result: runState.result,
      });
    }
  };

  return (
    <section className="console-panel">
      <div className="section-header">
        <p className="eyebrow">Run Team</p>
        <h2>Continuous Assignment Console</h2>
        <p className="section-copy">
          Reuse the same thread ID to keep the team continuous. Enable reset to start a fresh
          planner-to-reviewer cycle on the same thread.
        </p>
        {hasRepositories ? (
          <p className="field-hint">
            Only repositories discovered from directories configured in `team.config.ts` can be
            selected here.
          </p>
        ) : null}
      </div>

      <form
        className="console-form"
        action={(formData) => {
          startTransition(() => {
            void handleSubmit(formData);
          });
        }}
      >
        <label className="field">
          <span>Request</span>
          <textarea
            name="prompt"
            rows={8}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Ship a new onboarding flow, clean up the implementation, and have the reviewer call out risk."
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
          {isRunning ? "Running planner, coder, reviewer..." : "Run Team"}
        </button>
      </form>

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
