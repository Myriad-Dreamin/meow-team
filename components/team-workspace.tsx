"use client";

import { startTransition, useEffect, useState } from "react";
import { TeamConsole } from "@/components/team-console";
import { ThreadDetailPanel } from "@/components/thread-detail-panel";
import {
  describeThreadProgress,
  formatThreadId,
  formatTimestamp,
  threadStatusLabels,
} from "@/components/thread-view-utils";
import type { TeamThreadSummary } from "@/lib/team/history";
import type { TeamRepositoryOption } from "@/lib/team/repository-types";

type TeamWorkspaceProps = {
  disabled: boolean;
  initialPrompt: string;
  initialLogThreadId: string | null;
  initialThreads: TeamThreadSummary[];
  repositories: TeamRepositoryOption[];
  workerCount: number;
};

type SelectedTab =
  | {
      type: "run";
    }
  | {
      type: "thread";
      threadId: string;
    };

type TeamThreadsResponse = {
  threads: TeamThreadSummary[];
};

const POLL_INTERVAL_MS = 5000;
const SELECTED_TAB_STORAGE_KEY = "team-workspace.selected-tab";

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
    throw new Error("Unable to refresh living threads.");
  }

  return payload.threads;
};

const serializeSelectedTab = (tab: SelectedTab): string => {
  return tab.type === "run" ? "run" : `thread:${tab.threadId}`;
};

const parseStoredSelectedTab = (value: string | null): SelectedTab | null => {
  if (!value || value === "run") {
    return value ? { type: "run" } : null;
  }

  if (value.startsWith("thread:")) {
    const threadId = value.slice("thread:".length).trim();
    if (threadId) {
      return {
        type: "thread",
        threadId,
      };
    }
  }

  return null;
};

export function TeamWorkspace({
  disabled,
  initialPrompt,
  initialLogThreadId,
  initialThreads,
  repositories,
  workerCount,
}: TeamWorkspaceProps) {
  const [threads, setThreads] = useState(initialThreads);
  const [selectedTab, setSelectedTab] = useState<SelectedTab>(() => {
    if (typeof window === "undefined") {
      return { type: "run" };
    }

    return (
      parseStoredSelectedTab(window.localStorage.getItem(SELECTED_TAB_STORAGE_KEY)) ?? {
        type: "run",
      }
    );
  });
  const [refreshError, setRefreshError] = useState<string | null>(null);

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
            error instanceof Error ? error.message : "Unable to refresh living threads.",
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

  const resolvedSelectedTab =
    selectedTab.type === "thread" &&
    !threads.some((thread) => thread.threadId === selectedTab.threadId)
      ? ({ type: "run" } as const)
      : selectedTab;
  const persistedSelectedTab = serializeSelectedTab(resolvedSelectedTab);

  useEffect(() => {
    window.localStorage.setItem(SELECTED_TAB_STORAGE_KEY, persistedSelectedTab);
  }, [persistedSelectedTab]);

  const activeThread =
    resolvedSelectedTab.type === "thread"
      ? (threads.find((thread) => thread.threadId === resolvedSelectedTab.threadId) ?? null)
      : null;

  const handleSelectRunTab = () => {
    startTransition(() => {
      setSelectedTab({ type: "run" });
    });
  };

  const handleSelectThreadTab = (threadId: string) => {
    startTransition(() => {
      setSelectedTab({
        type: "thread",
        threadId,
      });
    });
  };

  const handleRefreshThreads = async () => {
    const nextThreads = await fetchThreads();
    setThreads(nextThreads);
    setRefreshError(null);
  };

  return (
    <section className="workspace-shell">
      <aside className="workspace-sidebar">
        <div className="workspace-sidebar-header">
          <h2>Harness Workspace</h2>
        </div>

        <div className="workspace-nav">
          <button
            className={`workspace-tab-button ${resolvedSelectedTab.type === "run" ? "workspace-tab-button-active" : ""}`}
            type="button"
            onClick={handleSelectRunTab}
          >
            <span className="workspace-tab-label">Run Team</span>
            <span className="workspace-tab-meta">Create a new request</span>
          </button>

          <div className="workspace-tab-group">
            <div className="workspace-tab-group-head">
              <p className="workspace-tab-group-label">Living Threads</p>
              <span className="workspace-tab-group-count">{threads.length}</span>
            </div>

            {threads.length > 0 ? (
              <div className="workspace-thread-tab-list">
                {threads.map((thread) => (
                  <button
                    className={`workspace-tab-button ${resolvedSelectedTab.type === "thread" && resolvedSelectedTab.threadId === thread.threadId ? "workspace-tab-button-active" : ""}`}
                    key={thread.threadId}
                    type="button"
                    onClick={() => handleSelectThreadTab(thread.threadId)}
                  >
                    <div className="workspace-thread-tab-head">
                      <span className="workspace-tab-label">{thread.requestTitle}</span>
                      <span className={`status-pill status-${thread.status}`}>
                        {threadStatusLabels[thread.status]}
                      </span>
                    </div>
                    <span className="workspace-tab-meta">
                      Thread {formatThreadId(thread.threadId)}
                    </span>
                    <span className="workspace-tab-summary">{describeThreadProgress(thread)}</span>
                    <span className="workspace-tab-meta">
                      Updated {formatTimestamp(thread.updatedAt)}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="workspace-empty-state">
                No living threads yet. Start with the Run Team tab to create the first request.
              </p>
            )}
          </div>
        </div>
      </aside>

      <div className="workspace-editor">
        <div className="workspace-editor-header">
          {resolvedSelectedTab.type === "run" ? (
            <>
              <div>
                <p className="workspace-editor-label">Run Team</p>
                <h3>New Request</h3>
              </div>
              <p className="workspace-editor-copy">
                Create a new request group, reuse a thread for continuity, and watch the planner
                stream live Codex output.
              </p>
            </>
          ) : activeThread ? (
            <>
              <div>
                <p className="workspace-editor-label">Living Thread</p>
                <h3>{activeThread.requestTitle}</h3>
              </div>
              <div className="workspace-editor-meta">
                <span className={`status-pill status-${activeThread.status}`}>
                  {threadStatusLabels[activeThread.status]}
                </span>
                <span>Thread {formatThreadId(activeThread.threadId)}</span>
                <span>{activeThread.repository?.name ?? "No repository selected"}</span>
              </div>
            </>
          ) : (
            <>
              <div>
                <p className="workspace-editor-label">Living Thread</p>
                <h3>Thread Not Available</h3>
              </div>
              <p className="workspace-editor-copy">
                This thread is no longer present in local storage. Choose another tab from the left
                or return to Run Team.
              </p>
            </>
          )}
        </div>

        <div className="workspace-editor-body">
          {refreshError ? <p className="error-callout">{refreshError}</p> : null}

          {resolvedSelectedTab.type === "run" ? (
            <TeamConsole
              disabled={disabled}
              initialPrompt={initialPrompt}
              initialLogThreadId={initialLogThreadId}
              onThreadActivity={() => {
                void handleRefreshThreads();
              }}
              repositories={repositories}
              workerCount={workerCount}
            />
          ) : activeThread ? (
            <ThreadDetailPanel
              initialSummary={activeThread}
              onThreadMutation={handleRefreshThreads}
              threadId={activeThread.threadId}
            />
          ) : (
            <section className="thread-detail-panel">
              <div className="section-header compact">
                <p className="eyebrow">Living Thread</p>
                <h2>Thread Not Available</h2>
                <p className="section-copy">
                  The selected thread could not be found in the latest thread summary list.
                </p>
              </div>
            </section>
          )}
        </div>
      </div>
    </section>
  );
}
