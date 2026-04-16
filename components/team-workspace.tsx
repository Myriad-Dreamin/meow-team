"use client";

import { startTransition, useEffect, useRef, useState } from "react";
import { TeamConsole } from "@/components/team-console";
import { TeamStatusBar } from "@/components/team-status-bar";
import {
  DEFAULT_TEAM_WORKSPACE_SIDEBAR_VISIBILITY,
  getNextTeamWorkspaceSidebarVisibility,
  getTeamWorkspaceShellClassName,
  TEAM_WORKSPACE_SIDEBAR_ID,
} from "@/components/team-workspace-sidebar-visibility";
import {
  buildThreadRepositoryGroups,
  formatThreadSidebarMetadata,
  getThreadRepositoryGroupKey,
  type ThreadRepositoryGroup,
} from "@/components/team-workspace-sidebar";
import {
  mergeStoredAttentionFingerprints,
  selectUndeliveredAttentionNotifications,
} from "@/components/thread-attention-utils";
import { ThreadDetailPanel } from "@/components/thread-detail-panel";
import type { TeamThreadSummary } from "@/lib/team/history";
import type { TeamRepositoryOption } from "@/lib/git/repository";
import type {
  TeamAttentionNotification,
  TeamNotificationsResponse,
} from "@/lib/team/notifications";
import type { TeamRepositoryPickerModel } from "@/lib/team/repository-picker";

type TeamWorkspaceProps = {
  disabled: boolean;
  initialArchivedThreads: TeamThreadSummary[];
  initialPrompt: string;
  initialLogThreadId: string | null;
  initialNotifications: TeamNotificationsResponse;
  initialRepositoryPicker: TeamRepositoryPickerModel;
  initialThreads: TeamThreadSummary[];
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

type TeamWorkspaceResponse = {
  archivedThreads: TeamThreadSummary[];
  notifications: TeamNotificationsResponse;
  threads: TeamThreadSummary[];
  repositoryPicker: TeamRepositoryPickerModel;
};

const POLL_INTERVAL_MS = 5000;
const SELECTED_TAB_STORAGE_KEY = "team-workspace.selected-tab";
const DESKTOP_NOTIFICATIONS_ENABLED_STORAGE_KEY = "team-workspace.desktop-attention.enabled";
const DELIVERED_ATTENTION_FINGERPRINTS_STORAGE_KEY = "team-workspace.desktop-attention.delivered";
const LEGACY_SEEN_ATTENTION_FINGERPRINTS_STORAGE_KEY = "team-workspace.desktop-attention.seen";

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

const ChevronIcon = ({ className }: WorkspaceIconProps) => (
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
    <path d="m5.5 3.5 5 4.5-5 4.5" />
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

const isRepositoryOption = (value: unknown): value is TeamRepositoryOption => {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.rootId === "string" &&
    typeof value.rootLabel === "string" &&
    typeof value.path === "string" &&
    typeof value.relativePath === "string"
  );
};

const isRepositoryPickerModel = (value: unknown): value is TeamRepositoryPickerModel => {
  return (
    isRecord(value) &&
    Array.isArray(value.suggestedRepositories) &&
    value.suggestedRepositories.every(isRepositoryOption) &&
    Array.isArray(value.remainingRepositories) &&
    value.remainingRepositories.every(isRepositoryOption) &&
    Array.isArray(value.orderedRepositories) &&
    value.orderedRepositories.every(isRepositoryOption)
  );
};

const isWorkspaceResponse = (value: unknown): value is TeamWorkspaceResponse => {
  return (
    isRecord(value) &&
    Array.isArray(value.archivedThreads) &&
    Array.isArray(value.threads) &&
    isNotificationsResponse(value.notifications) &&
    isRepositoryPickerModel(value.repositoryPicker)
  );
};

const isNotificationTarget = (value: unknown): value is TeamNotificationsResponse["target"] => {
  return value === "browser" || value === "vscode" || value === "android";
};

const isAttentionNotification = (value: unknown): value is TeamAttentionNotification => {
  return (
    isRecord(value) &&
    typeof value.body === "string" &&
    typeof value.fingerprint === "string" &&
    (value.laneId === null || typeof value.laneId === "string") &&
    typeof value.reason === "string" &&
    typeof value.tag === "string" &&
    typeof value.threadId === "string" &&
    typeof value.title === "string"
  );
};

const isNotificationsResponse = (value: unknown): value is TeamNotificationsResponse => {
  return (
    isRecord(value) &&
    typeof value.generatedAt === "string" &&
    isNotificationTarget(value.target) &&
    Array.isArray(value.notifications) &&
    value.notifications.every(isAttentionNotification)
  );
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

const fetchWorkspaceState = async (): Promise<TeamWorkspaceResponse> => {
  const response = await fetch("/api/team/threads", {
    cache: "no-store",
  });
  const rawPayload = await response.text();
  const payload = tryParseJson(rawPayload);

  if (!response.ok || !isWorkspaceResponse(payload)) {
    throw new Error("Unable to refresh workspace threads.");
  }

  return payload;
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

const getScopedThreadGroupKey = (
  scope: "living" | "archived",
  thread: Pick<TeamThreadSummary, "repository">,
): string => {
  return `${scope}:${getThreadRepositoryGroupKey(thread)}`;
};

export function TeamWorkspace({
  disabled,
  initialArchivedThreads,
  initialPrompt,
  initialLogThreadId,
  initialNotifications,
  initialRepositoryPicker,
  initialThreads,
  workerCount,
}: TeamWorkspaceProps) {
  const [threads, setThreads] = useState(initialThreads);
  const [archivedThreads, setArchivedThreads] = useState(initialArchivedThreads);
  const [notificationSnapshot, setNotificationSnapshot] = useState(initialNotifications);
  const [repositoryPicker, setRepositoryPicker] = useState(initialRepositoryPicker);
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
  const [showArchivedThreads, setShowArchivedThreads] = useState(false);
  const [desktopNotificationsEnabled, setDesktopNotificationsEnabled] = useState(() =>
    readStoredNotificationPreference(),
  );
  const [isSidebarVisible, setIsSidebarVisible] = useState(
    DEFAULT_TEAM_WORKSPACE_SIDEBAR_VISIBILITY,
  );
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermissionState>(
    () => getNotificationPermissionState(),
  );
  const [notificationPermissionPending, setNotificationPermissionPending] = useState(false);
  const [collapsedThreadGroupKeys, setCollapsedThreadGroupKeys] = useState<Set<string>>(
    () => new Set(),
  );
  const deliveredAttentionFingerprintsRef = useRef<Set<string>>(
    readStoredDeliveredAttentionFingerprints(),
  );

  useEffect(() => {
    let isCancelled = false;

    const load = async () => {
      try {
        const nextState = await fetchWorkspaceState();
        if (!isCancelled) {
          setArchivedThreads(nextState.archivedThreads);
          setNotificationSnapshot(nextState.notifications);
          setThreads(nextState.threads);
          setRepositoryPicker(nextState.repositoryPicker);
          setRefreshError(null);
        }
      } catch (error) {
        if (!isCancelled) {
          setRefreshError(
            error instanceof Error ? error.message : "Unable to refresh workspace threads.",
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

  const selectedThreadStillExists =
    selectedTab.type !== "thread" ||
    threads.some((thread) => thread.threadId === selectedTab.threadId) ||
    archivedThreads.some((thread) => thread.threadId === selectedTab.threadId);
  const resolvedSelectedTab =
    selectedTab.type === "thread" && !selectedThreadStillExists
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
    const deliveryAvailable =
      notificationSnapshot.target === "browser" &&
      desktopNotificationsEnabled &&
      notificationPermission === "granted" &&
      isNotificationSupported();
    const deliveredFingerprints = deliveredAttentionFingerprintsRef.current;
    const attentionNotificationsToDeliver = selectUndeliveredAttentionNotifications({
      nextNotifications: notificationSnapshot.notifications,
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
  }, [desktopNotificationsEnabled, notificationPermission, notificationSnapshot]);

  const selectedLivingThread =
    resolvedSelectedTab.type === "thread"
      ? (threads.find((thread) => thread.threadId === resolvedSelectedTab.threadId) ?? null)
      : null;
  const selectedArchivedThread =
    resolvedSelectedTab.type === "thread"
      ? (archivedThreads.find((thread) => thread.threadId === resolvedSelectedTab.threadId) ?? null)
      : null;
  const isArchivedThreadsRevealed = showArchivedThreads || Boolean(selectedArchivedThread);
  const activeThread = selectedLivingThread ?? selectedArchivedThread;
  const activeThreadGroupKey = activeThread
    ? getScopedThreadGroupKey(selectedArchivedThread ? "archived" : "living", activeThread)
    : null;
  const threadGroups = buildThreadRepositoryGroups(threads);
  const archivedThreadGroups = buildThreadRepositoryGroups(archivedThreads);

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
    if (notificationSnapshot.target === "vscode") {
      return {
        action: null,
        badge: "VS Code",
        badgeClassName: "status-approved",
        copy: "The backend routes approval and failure alerts to the VS Code extension. Browser desktop alerts stay silent for this workspace.",
        heading: "Alerts handled by VS Code",
        label: "Attention Alerts",
        tone: "idle",
      } as const;
    }

    if (notificationSnapshot.target === "android") {
      return {
        action: null,
        badge: "Android",
        badgeClassName: "status-approved",
        copy: "The backend routes approval and failure alerts to the Android app. Browser desktop alerts stay silent for this workspace.",
        heading: "Alerts handled by Android",
        label: "Attention Alerts",
        tone: "idle",
      } as const;
    }

    if (notificationPermission === "unsupported") {
      return {
        action: null,
        badge: "Unsupported",
        badgeClassName: "status-idle",
        copy: "This browser does not expose the Notification API for approval and failure alerts.",
        heading: "Desktop alerts unavailable",
        label: "Desktop Alerts",
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
        label: "Desktop Alerts",
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
        label: "Desktop Alerts",
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
        label: "Desktop Alerts",
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
      label: "Desktop Alerts",
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

  const handleToggleArchivedThreads = () => {
    startTransition(() => {
      setShowArchivedThreads((current) => !current);
    });
  };

  const handleToggleSidebar = () => {
    startTransition(() => {
      setIsSidebarVisible((current) => getNextTeamWorkspaceSidebarVisibility(current));
    });
  };

  const handleToggleThreadGroup = (groupKey: string) => {
    setCollapsedThreadGroupKeys((current) => {
      const next = new Set(current);
      if (next.has(groupKey)) {
        next.delete(groupKey);
      } else {
        next.add(groupKey);
      }

      return next;
    });
  };

  const handleRefreshThreads = async () => {
    const nextState = await fetchWorkspaceState();
    setArchivedThreads(nextState.archivedThreads);
    setNotificationSnapshot(nextState.notifications);
    setThreads(nextState.threads);
    setRepositoryPicker(nextState.repositoryPicker);
    setRefreshError(null);
  };

  const renderThreadGroupList = ({
    emptyState,
    groups,
    scope,
  }: {
    emptyState: string;
    groups: ThreadRepositoryGroup[];
    scope: "living" | "archived";
  }) => {
    if (groups.length === 0) {
      return <p className="workspace-empty-state">{emptyState}</p>;
    }

    return (
      <div className="workspace-thread-group-list">
        {groups.map((group) => {
          const scopedGroupKey = `${scope}:${group.key}`;
          const groupPanelId = `workspace-thread-group-${scope}-${encodeURIComponent(group.key)}`;
          const isGroupCollapsed =
            collapsedThreadGroupKeys.has(scopedGroupKey) && scopedGroupKey !== activeThreadGroupKey;

          return (
            <section className="workspace-repository-group" key={scopedGroupKey}>
              <div className="workspace-repository-group-head">
                <button
                  aria-controls={groupPanelId}
                  aria-expanded={!isGroupCollapsed}
                  className="workspace-repository-group-toggle"
                  type="button"
                  onClick={() => handleToggleThreadGroup(scopedGroupKey)}
                >
                  <ChevronIcon
                    className={`workspace-repository-group-chevron ${isGroupCollapsed ? "workspace-repository-group-chevron-collapsed" : ""}`}
                  />
                  <div className="workspace-repository-group-copy">
                    <p className="workspace-repository-group-title">{group.title}</p>
                    <p className="workspace-repository-group-path">{group.description}</p>
                  </div>
                </button>
                <span className="workspace-tab-group-count">{group.threads.length}</span>
              </div>

              {!isGroupCollapsed ? (
                <div className="workspace-thread-tab-list" id={groupPanelId}>
                  {group.threads.map((thread) => {
                    const sidebarMetadata = formatThreadSidebarMetadata(thread);

                    return (
                      <button
                        className={`workspace-tab-button ${resolvedSelectedTab.type === "thread" && resolvedSelectedTab.threadId === thread.threadId ? "workspace-tab-button-active" : ""}`}
                        key={thread.threadId}
                        type="button"
                        onClick={() => handleSelectThreadTab(thread.threadId)}
                      >
                        <div className="workspace-thread-tab-body">
                          <span className="workspace-tab-label">{thread.requestTitle}</span>
                          <span className="workspace-thread-tab-meta-row">
                            <span className="workspace-thread-tab-meta">
                              {sidebarMetadata.threadLine}
                            </span>
                            <span
                              className={`workspace-thread-tab-status ${sidebarMetadata.statusClassName}`}
                            >
                              {sidebarMetadata.statusLabel}
                            </span>
                          </span>
                          <span className="workspace-thread-tab-meta">
                            {sidebarMetadata.updatedLine}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </section>
          );
        })}
      </div>
    );
  };

  return (
    <section className={getTeamWorkspaceShellClassName(isSidebarVisible)}>
      <aside
        className="workspace-sidebar"
        hidden={!isSidebarVisible}
        id={TEAM_WORKSPACE_SIDEBAR_ID}
      >
        <div className="workspace-sidebar-header">
          <h2>Meow Team</h2>
        </div>

        <div className="workspace-nav">
          <div className="workspace-tab-group">
            <div className="workspace-tab-group-head">
              <div className="workspace-tab-group-heading">
                <p className="workspace-tab-group-label">Living Threads</p>
              </div>
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

            {renderThreadGroupList({
              emptyState: "No living threads yet. Use the + action to create the first request.",
              groups: threadGroups,
              scope: "living",
            })}
          </div>

          {isArchivedThreadsRevealed ? (
            <div className="workspace-tab-group">
              <div className="workspace-tab-group-head">
                <div className="workspace-tab-group-heading">
                  <p className="workspace-tab-group-label">Archived Threads</p>
                </div>
                <span className="workspace-tab-group-count">{archivedThreads.length}</span>
              </div>

              {renderThreadGroupList({
                emptyState: "No archived threads yet.",
                groups: archivedThreadGroups,
                scope: "archived",
              })}
            </div>
          ) : null}
        </div>
      </aside>

      <div className="workspace-editor">
        <div className="workspace-editor-header">
          {resolvedSelectedTab.type === "run" ? (
            <>
              <div>
                <h3>New Request</h3>
              </div>
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
            </>
          ) : (
            <>
              <div>
                <h3>Thread Not Available</h3>
              </div>
              <p className="workspace-editor-copy">
                This thread is no longer present in local storage. Open the sidebar or use the +
                action to start a new request.
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
              repositoryPicker={repositoryPicker}
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
                    <p className="workspace-notification-label">
                      {desktopNotificationPanelState.label}
                    </p>
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
                <p className="eyebrow">Thread</p>
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
        isSidebarVisible={isSidebarVisible}
        livingThreads={threads}
        isArchivedThreadsRevealed={isArchivedThreadsRevealed}
        isSettingsSelected={resolvedSelectedTab.type === "settings"}
        onSelectThreadTab={handleSelectThreadTab}
        onToggleSidebar={handleToggleSidebar}
        onToggleArchivedThreads={handleToggleArchivedThreads}
        onSelectSettings={handleSelectSettingsTab}
      />
    </section>
  );
}
