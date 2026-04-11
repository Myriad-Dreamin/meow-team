"use client";

import { startTransition, useEffect, useRef, useState } from "react";
import { TeamConsole } from "@/components/team-console";
import { TeamStatusBar } from "@/components/team-status-bar";
import {
  collectThreadAttentionNotifications,
  mergeStoredAttentionFingerprints,
  selectUndeliveredAttentionNotifications,
} from "@/components/thread-attention-utils";
import { ThreadDetailPanel } from "@/components/thread-detail-panel";
import {
  formatThreadId,
  formatTimestamp,
  threadStatusLabels,
} from "@/components/thread-view-utils";
import type { TeamThreadSummary } from "@/lib/team/history";
import type { TeamRepositoryOption } from "@/lib/git/repository";

type TeamWorkspaceProps = {
  disabled: boolean;
  initialPrompt: string;
  initialLogThreadId: string | null;
  initialThreads: TeamThreadSummary[];
  repositories: TeamRepositoryOption[];
  workerCount: number;
};

type WorkspaceIconProps = {
  className?: string;
};

type SelectedTab =
  | {
      type: "run";
    }
  | {
      type: "settings";
    }
  | {
      type: "thread";
      threadId: string;
    };

type TeamThreadsResponse = {
  threads: TeamThreadSummary[];
};

type ThreadRepositoryGroup = {
  key: string;
  title: string;
  description: string;
  threads: TeamThreadSummary[];
};

const POLL_INTERVAL_MS = 5000;
const SELECTED_TAB_STORAGE_KEY = "team-workspace.selected-tab";
const DESKTOP_NOTIFICATIONS_ENABLED_STORAGE_KEY = "team-workspace.desktop-attention.enabled";
const DELIVERED_ATTENTION_FINGERPRINTS_STORAGE_KEY = "team-workspace.desktop-attention.delivered";
const LEGACY_SEEN_ATTENTION_FINGERPRINTS_STORAGE_KEY = "team-workspace.desktop-attention.seen";
const NO_REPOSITORY_GROUP_KEY = "__no_repository__";

type NotificationPermissionState = NotificationPermission | "unsupported";

const PlusIcon = ({ className }: WorkspaceIconProps) => (
  <svg
    aria-hidden="true"
    className={className}
    fill="none"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth="1.8"
    viewBox="0 0 16 16"
  >
    <path d="M8 3.25v9.5" />
    <path d="M3.25 8h9.5" />
  </svg>
);

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

const isNotificationSupported = (): boolean =>
  typeof window !== "undefined" && "Notification" in window;

const getNotificationPermissionState = (): NotificationPermissionState =>
  isNotificationSupported() ? window.Notification.permission : "unsupported";

const readStoredNotificationPreference = (): boolean =>
  typeof window !== "undefined" &&
  window.localStorage.getItem(DESKTOP_NOTIFICATIONS_ENABLED_STORAGE_KEY) === "true";

const parseStoredAttentionFingerprints = (value: string | null): string[] => {
  const payload = tryParseJson(value ?? "");
  if (!Array.isArray(payload)) {
    return [];
  }

  return payload.filter((entry): entry is string => typeof entry === "string");
};

const readStoredDeliveredAttentionFingerprints = (): Set<string> => {
  if (typeof window === "undefined") {
    return new Set();
  }

  return new Set(
    parseStoredAttentionFingerprints(
      window.localStorage.getItem(DELIVERED_ATTENTION_FINGERPRINTS_STORAGE_KEY),
    ),
  );
};

const persistDeliveredAttentionFingerprints = (fingerprints: Iterable<string>) => {
  window.localStorage.setItem(
    DELIVERED_ATTENTION_FINGERPRINTS_STORAGE_KEY,
    JSON.stringify(Array.from(fingerprints)),
  );
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
  return tab.type === "thread" ? `thread:${tab.threadId}` : tab.type;
};

const parseStoredSelectedTab = (value: string | null): SelectedTab | null => {
  if (!value) {
    return null;
  }

  if (value === "run" || value === "settings") {
    return { type: value };
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

const formatRepositoryGroupDescription = (repository: TeamRepositoryOption): string => {
  const repositoryLabel =
    repository.relativePath === "." ? repository.name : repository.relativePath;
  return `${repository.rootLabel} / ${repositoryLabel}`;
};

const groupThreadsByRepository = (threads: TeamThreadSummary[]): ThreadRepositoryGroup[] => {
  const groups = new Map<string, ThreadRepositoryGroup>();

  for (const thread of threads) {
    const repository = thread.repository;
    const groupKey = repository?.id ?? NO_REPOSITORY_GROUP_KEY;
    const existingGroup = groups.get(groupKey);

    if (existingGroup) {
      existingGroup.threads.push(thread);
      continue;
    }

    groups.set(groupKey, {
      key: groupKey,
      title: repository?.name ?? "No Repository",
      description: repository
        ? formatRepositoryGroupDescription(repository)
        : "Threads without a selected repository",
      threads: [thread],
    });
  }

  return Array.from(groups.values());
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
  const [desktopNotificationsEnabled, setDesktopNotificationsEnabled] = useState(() =>
    readStoredNotificationPreference(),
  );
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermissionState>(
    () => getNotificationPermissionState(),
  );
  const [notificationPermissionPending, setNotificationPermissionPending] = useState(false);
  const deliveredAttentionFingerprintsRef = useRef<Set<string>>(
    readStoredDeliveredAttentionFingerprints(),
  );

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

  useEffect(() => {
    window.localStorage.setItem(
      DESKTOP_NOTIFICATIONS_ENABLED_STORAGE_KEY,
      desktopNotificationsEnabled ? "true" : "false",
    );
  }, [desktopNotificationsEnabled]);

  useEffect(() => {
    window.localStorage.removeItem(LEGACY_SEEN_ATTENTION_FINGERPRINTS_STORAGE_KEY);
  }, []);

  useEffect(() => {
    if (!isNotificationSupported()) {
      return;
    }

    const syncNotificationPermission = () => {
      setNotificationPermission(window.Notification.permission);
    };

    syncNotificationPermission();
    window.addEventListener("focus", syncNotificationPermission);
    document.addEventListener("visibilitychange", syncNotificationPermission);

    return () => {
      window.removeEventListener("focus", syncNotificationPermission);
      document.removeEventListener("visibilitychange", syncNotificationPermission);
    };
  }, []);

  useEffect(() => {
    const activeAttentionNotifications = collectThreadAttentionNotifications(threads);
    const deliveryAvailable =
      desktopNotificationsEnabled &&
      notificationPermission === "granted" &&
      isNotificationSupported();
    const deliveredFingerprints = deliveredAttentionFingerprintsRef.current;
    const attentionNotificationsToDeliver = selectUndeliveredAttentionNotifications({
      nextNotifications: activeAttentionNotifications,
      deliveredFingerprints,
      deliveryAvailable,
    });

    if (attentionNotificationsToDeliver.length === 0) {
      return;
    }

    const deliveredFingerprintsThisPass: string[] = [];

    for (const notification of attentionNotificationsToDeliver) {
      try {
        new window.Notification(notification.title, {
          body: notification.body,
          tag: notification.tag,
        });
        deliveredFingerprintsThisPass.push(notification.fingerprint);
      } catch {
        break;
      }
    }

    if (deliveredFingerprintsThisPass.length === 0) {
      return;
    }

    const nextDeliveredFingerprints = new Set(
      mergeStoredAttentionFingerprints(deliveredFingerprints, deliveredFingerprintsThisPass),
    );
    deliveredAttentionFingerprintsRef.current = nextDeliveredFingerprints;
    persistDeliveredAttentionFingerprints(nextDeliveredFingerprints);
  }, [desktopNotificationsEnabled, notificationPermission, threads]);

  const activeThread =
    resolvedSelectedTab.type === "thread"
      ? (threads.find((thread) => thread.threadId === resolvedSelectedTab.threadId) ?? null)
      : null;
  const threadGroups = groupThreadsByRepository(threads);

  const handleEnableDesktopNotifications = () => {
    if (!isNotificationSupported()) {
      setNotificationPermission("unsupported");
      return;
    }

    const currentPermission = window.Notification.permission;
    setNotificationPermission(currentPermission);

    if (currentPermission === "granted") {
      setDesktopNotificationsEnabled(true);
      return;
    }

    if (currentPermission === "denied") {
      return;
    }

    setNotificationPermissionPending(true);
    void window.Notification.requestPermission()
      .then((nextPermission) => {
        setNotificationPermission(nextPermission);
        if (nextPermission === "granted") {
          setDesktopNotificationsEnabled(true);
        }
      })
      .finally(() => {
        setNotificationPermissionPending(false);
      });
  };

  const handleDisableDesktopNotifications = () => {
    setDesktopNotificationsEnabled(false);
  };

  const desktopNotificationPanelState = (() => {
    if (notificationPermission === "unsupported") {
      return {
        action: null,
        badge: "Unsupported",
        badgeClassName: "status-idle",
        copy: "This browser does not expose the Notification API for approval and failure alerts.",
        heading: "Desktop alerts unavailable",
        tone: "unsupported",
      } as const;
    }

    if (notificationPermission === "denied") {
      return {
        action: null,
        badge: "Blocked",
        badgeClassName: "status-failed",
        copy: "Allow notifications in browser settings to receive current and new proposal approval and failure alerts.",
        heading: "Desktop alerts blocked",
        tone: "blocked",
      } as const;
    }

    if (desktopNotificationsEnabled && notificationPermission === "granted") {
      return {
        action: {
          disabled: false,
          label: "Turn off",
          onClick: handleDisableDesktopNotifications,
        },
        badge: "On",
        badgeClassName: "status-approved",
        copy: "Current and new proposal approvals and failures notify once per active state.",
        heading: "Desktop alerts on",
        tone: "enabled",
      } as const;
    }

    if (notificationPermissionPending) {
      return {
        action: {
          disabled: true,
          label: "Requesting...",
          onClick: handleEnableDesktopNotifications,
        },
        badge: "Pending",
        badgeClassName: "status-awaiting_human_approval",
        copy: "Approve the browser prompt to turn on desktop alerts for current and new proposal approvals and failures.",
        heading: "Requesting permission",
        tone: "pending",
      } as const;
    }

    return {
      action: {
        disabled: false,
        label: notificationPermission === "granted" ? "Turn on" : "Enable alerts",
        onClick: handleEnableDesktopNotifications,
      },
      badge: "Off",
      badgeClassName: "status-idle",
      copy: "Opt in to browser notifications for current and new proposal approval waits and failures.",
      heading: "Desktop alerts off",
      tone: "idle",
    } as const;
  })();

  const handleSelectRunTab = () => {
    startTransition(() => {
      setSelectedTab({ type: "run" });
    });
  };

  const handleSelectSettingsTab = () => {
    startTransition(() => {
      setSelectedTab({ type: "settings" });
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
          <div>
            <h2>Harness Workspace</h2>
            <p className="workspace-sidebar-copy">
              Track living threads, launch requests, and adjust workspace settings.
            </p>
          </div>
        </div>

        <div className="workspace-nav">
          <div className="workspace-tab-group">
            <div className="workspace-tab-group-head">
              <div className="workspace-tab-group-heading">
                <p className="workspace-tab-group-label">Living Threads</p>
                <button
                  aria-pressed={resolvedSelectedTab.type === "run"}
                  className={`workspace-icon-button ${resolvedSelectedTab.type === "run" ? "workspace-icon-button-active" : ""}`}
                  title="Run Team"
                  type="button"
                  onClick={handleSelectRunTab}
                >
                  <PlusIcon className="workspace-icon" />
                  <span className="sr-only">Run Team</span>
                </button>
              </div>
              <span className="workspace-tab-group-count">{threads.length}</span>
            </div>

            {threads.length > 0 ? (
              <div className="workspace-thread-group-list">
                {threadGroups.map((group) => (
                  <section className="workspace-repository-group" key={group.key}>
                    <div className="workspace-repository-group-head">
                      <div>
                        <p className="workspace-repository-group-title">{group.title}</p>
                        <p className="workspace-repository-group-path">{group.description}</p>
                      </div>
                      <span className="workspace-tab-group-count">{group.threads.length}</span>
                    </div>

                    <div className="workspace-thread-tab-list">
                      {group.threads.map((thread) => (
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
                          <div className="workspace-thread-tab-meta-row">
                            <span className="workspace-tab-meta">
                              Thread {formatThreadId(thread.threadId)}
                            </span>
                            <span className="workspace-tab-meta">
                              Updated {formatTimestamp(thread.updatedAt)}
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            ) : (
              <p className="workspace-empty-state">
                No living threads yet. Use the + action to create the first request.
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
                <h3>New Request</h3>
              </div>
              <p className="workspace-editor-copy">
                Create a new request group, reuse a thread for continuity, and watch the planner
                stream live Codex output.
              </p>
            </>
          ) : resolvedSelectedTab.type === "settings" ? (
            <>
              <div>
                <h3>Settings</h3>
              </div>
              <p className="workspace-editor-copy">
                Adjust workspace-level controls without interrupting the current thread state.
              </p>
            </>
          ) : activeThread ? (
            <>
              <div>
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
                <h3>Thread Not Available</h3>
              </div>
              <p className="workspace-editor-copy">
                This thread is no longer present in local storage. Choose another tab from the left
                or use the + action to start a new request.
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
          ) : resolvedSelectedTab.type === "settings" ? (
            <section className="workspace-settings-grid">
              <section
                aria-live="polite"
                className={`workspace-notification-panel workspace-settings-card workspace-notification-panel-${desktopNotificationPanelState.tone}`}
              >
                <div className="workspace-notification-head">
                  <div>
                    <p className="workspace-notification-label">Desktop Alerts</p>
                    <p className="workspace-notification-title">
                      {desktopNotificationPanelState.heading}
                    </p>
                  </div>
                  <span className={`status-pill ${desktopNotificationPanelState.badgeClassName}`}>
                    {desktopNotificationPanelState.badge}
                  </span>
                </div>

                <p className="workspace-notification-copy">{desktopNotificationPanelState.copy}</p>

                {desktopNotificationPanelState.action ? (
                  <button
                    className="workspace-notification-action"
                    disabled={desktopNotificationPanelState.action.disabled}
                    type="button"
                    onClick={desktopNotificationPanelState.action.onClick}
                  >
                    {desktopNotificationPanelState.action.label}
                  </button>
                ) : null}
              </section>
            </section>
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

      <TeamStatusBar
        isSettingsSelected={resolvedSelectedTab.type === "settings"}
        onSelectSettings={handleSelectSettingsTab}
      />
    </section>
  );
}
