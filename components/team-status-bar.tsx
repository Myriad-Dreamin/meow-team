"use client";

import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  buildTeamStatusLaneThreadBuckets,
  describeTeamStatusLanePopover,
  getNextTeamStatusLanePopoverState,
  teamStatusLaneItems,
  type TeamStatusLaneCountKey,
  type TeamStatusLaneThreadBuckets,
  type TeamStatusLanePopoverTrigger,
  type TeamStatusLanePopoverState,
} from "@/components/team-status-bar-lane-utils";
import {
  getTeamWorkspaceSidebarToggleState,
  TEAM_WORKSPACE_SIDEBAR_ID,
} from "@/components/team-workspace-sidebar-visibility";
import type { TeamThreadSummary } from "@/lib/team/history";
import type { TeamStatusSnapshotResponse } from "@/lib/team/status";
import styles from "./team-status-bar.module.css";

type RefreshState = "loading" | "live" | "stale" | "error";

type TeamStatusBarProps = {
  isSidebarVisible: boolean;
  livingThreads: TeamThreadSummary[];
  isArchivedThreadsRevealed: boolean;
  isSettingsSelected: boolean;
  onSelectThreadTab: (threadId: string) => void;
  onToggleSidebar: () => void;
  onToggleArchivedThreads: () => void;
  onSelectSettings: () => void;
};

type TeamStatusBarLaneTotal = (typeof teamStatusLaneItems)[number] & {
  value: number;
};

type TeamStatusBarLaneListProps = {
  laneTotals: TeamStatusBarLaneTotal[];
  laneThreadsByStatus: TeamStatusLaneThreadBuckets;
  openLaneKey: TeamStatusLaneCountKey | null;
  setLanePopoverRef: (
    laneKey: TeamStatusLaneCountKey,
    element: HTMLDivElement | null,
  ) => void;
  onLaneBlur: (laneKey: TeamStatusLaneCountKey, event: FocusEvent<HTMLDivElement>) => void;
  onLaneFocusCapture: (laneKey: TeamStatusLaneCountKey) => void;
  onLaneKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  onLaneMouseEnter: (laneKey: TeamStatusLaneCountKey) => void;
  onLaneMouseLeave: (
    laneKey: TeamStatusLaneCountKey,
    event: MouseEvent<HTMLDivElement>,
  ) => void;
  onLaneClick: (laneKey: TeamStatusLaneCountKey) => void;
  onSelectLaneThread: (threadId: string) => void;
};

const POLL_INTERVAL_MS = 1000;

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

const isFiniteNumber = (value: unknown): value is number => {
  return typeof value === "number" && Number.isFinite(value);
};

const isStatusResponse = (value: unknown): value is TeamStatusSnapshotResponse => {
  if (!isRecord(value)) {
    return false;
  }

  if (typeof value.sampledAt !== "string") {
    return false;
  }

  if (
    !isRecord(value.workspace) ||
    !isRecord(value.host) ||
    !isRecord(value.workspace.laneCounts)
  ) {
    return false;
  }

  const laneCounts = value.workspace.laneCounts;

  return (
    isFiniteNumber(value.workspace.activeThreadCount) &&
    isFiniteNumber(value.workspace.livingThreadCount) &&
    isFiniteNumber(value.workspace.archivedThreadCount) &&
    isFiniteNumber(laneCounts.idle) &&
    isFiniteNumber(laneCounts.queued) &&
    isFiniteNumber(laneCounts.coding) &&
    isFiniteNumber(laneCounts.reviewing) &&
    isFiniteNumber(laneCounts.awaitingHumanApproval) &&
    isFiniteNumber(laneCounts.approved) &&
    isFiniteNumber(laneCounts.failed) &&
    (value.host.cpuPercent === null || isFiniteNumber(value.host.cpuPercent)) &&
    isFiniteNumber(value.host.memoryPercent) &&
    isFiniteNumber(value.host.usedMemoryBytes) &&
    isFiniteNumber(value.host.freeMemoryBytes) &&
    isFiniteNumber(value.host.totalMemoryBytes)
  );
};

const fetchWorkspaceStatus = async (): Promise<TeamStatusSnapshotResponse> => {
  const response = await fetch("/api/team/status", {
    cache: "no-store",
  });
  const rawPayload = await response.text();
  const payload = tryParseJson(rawPayload);

  if (!response.ok || !isStatusResponse(payload)) {
    throw new Error("Unable to refresh workspace status.");
  }

  return payload;
};

const formatBytes = (value: number): string => {
  if (value <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  const scaledValue = value / 1024 ** exponent;
  const fractionDigits = exponent === 0 ? 0 : 1;

  return `${scaledValue.toFixed(fractionDigits)} ${units[exponent]}`;
};

const formatTimestamp = (value: string): string => {
  const timestamp = new Date(value);

  if (Number.isNaN(timestamp.valueOf())) {
    return "Updated just now";
  }

  return `Updated ${timestamp.toLocaleTimeString()}`;
};

const SettingsIcon = ({ className }: { className?: string }) => (
  <svg
    aria-hidden="true"
    className={className}
    fill="none"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth="1.75"
    viewBox="0 0 20 20"
  >
    <circle cx="10" cy="10" r="3.25" />
    <path d="M10 1.75v2.5" />
    <path d="M10 15.75v2.5" />
    <path d="m4.17 4.17 1.77 1.77" />
    <path d="m14.06 14.06 1.77 1.77" />
    <path d="M1.75 10h2.5" />
    <path d="M15.75 10h2.5" />
    <path d="m4.17 15.83 1.77-1.77" />
    <path d="m14.06 5.94 1.77-1.77" />
  </svg>
);

const ArchiveIcon = ({ className }: { className?: string }) => (
  <svg
    aria-hidden="true"
    className={className}
    fill="none"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth="1.75"
    viewBox="0 0 20 20"
  >
    <path d="M3 6.5h14" />
    <path d="M4.5 6.5 5.6 16h8.8l1.1-9.5" />
    <path d="M6 4h8l1 2.5H5L6 4Z" />
    <path d="M7.5 10h5" />
  </svg>
);

const SidebarIcon = ({
  className,
  isSidebarVisible,
}: {
  className?: string;
  isSidebarVisible: boolean;
}) => (
  <svg
    aria-hidden="true"
    className={className}
    fill="none"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth="1.75"
    viewBox="0 0 20 20"
  >
    <path d="M2.75 3.5h14.5v13H2.75z" />
    <path d="M7.25 3.5v13" />
    {isSidebarVisible ? (
      <>
        <path d="m12.75 10-2-2" />
        <path d="m12.75 10-2 2" />
      </>
    ) : (
      <>
        <path d="m10.75 10 2-2" />
        <path d="m10.75 10 2 2" />
      </>
    )}
  </svg>
);

const handleTeamStatusLaneThreadPointerDown = (
  event: ReactPointerEvent<HTMLButtonElement>,
) => {
  // Keep focus anchored so blur-driven dismissal does not unmount the row before click runs.
  event.preventDefault();
};

export function TeamStatusBarLaneList({
  laneTotals,
  laneThreadsByStatus,
  openLaneKey,
  setLanePopoverRef,
  onLaneBlur,
  onLaneFocusCapture,
  onLaneKeyDown,
  onLaneMouseEnter,
  onLaneMouseLeave,
  onLaneClick,
  onSelectLaneThread,
}: TeamStatusBarLaneListProps) {
  if (laneTotals.length === 0) {
    return <span className={styles["workspace-status-note"]}>No active lanes.</span>;
  }

  return (
    <>
      {laneTotals.map((item) => {
        const isOpen = openLaneKey === item.key;
        const lanePopoverId = `workspace-status-lane-panel-${item.key}`;
        const matchingThreads = laneThreadsByStatus[item.key];
        const popoverCopy = describeTeamStatusLanePopover(matchingThreads, item.value);

        return (
          <div
            className={`${styles["workspace-status-lane-popover"]} ${isOpen ? styles["workspace-status-lane-popover-open"] : ""}`}
            data-status-lane-key={item.key}
            key={item.key}
            ref={(element) => {
              setLanePopoverRef(item.key, element);
            }}
            onBlur={(event) => onLaneBlur(item.key, event)}
            onFocusCapture={() => onLaneFocusCapture(item.key)}
            onKeyDown={onLaneKeyDown}
            onMouseEnter={() => onLaneMouseEnter(item.key)}
            onMouseLeave={(event) => onLaneMouseLeave(item.key, event)}
          >
            <button
              aria-controls={lanePopoverId}
              aria-expanded={isOpen}
              aria-haspopup="dialog"
              className={`status-pill ${styles["workspace-status-lane-trigger"]} ${item.className}`}
              data-status-lane-trigger={item.key}
              type="button"
              onClick={() => onLaneClick(item.key)}
            >
              <span>{item.label}</span>
              <span className={styles["workspace-status-lane-trigger-count"]}>{item.value}</span>
            </button>

            {isOpen ? (
              <div
                aria-label={`${item.label} living threads`}
                className={styles["workspace-status-lane-panel"]}
                id={lanePopoverId}
                role="dialog"
              >
                <div className={styles["workspace-status-lane-panel-head"]}>
                  <p className={styles["workspace-status-lane-panel-title"]}>{item.label}</p>
                  <p className={styles["workspace-status-lane-panel-summary"]}>{popoverCopy.summary}</p>
                  {popoverCopy.detail ? (
                    <p className={styles["workspace-status-lane-panel-detail"]}>{popoverCopy.detail}</p>
                  ) : null}
                </div>

                {matchingThreads.length > 0 ? (
                  <div className={styles["workspace-status-lane-thread-list"]}>
                    {matchingThreads.map((thread) => (
                      <button
                        aria-label={`Open thread ${thread.shortThreadId}: ${thread.title}`}
                        className={styles["workspace-status-lane-thread-button"]}
                        data-thread-id={thread.threadId}
                        key={thread.threadId}
                        type="button"
                        onClick={() => onSelectLaneThread(thread.threadId)}
                        onPointerDown={handleTeamStatusLaneThreadPointerDown}
                      >
                        <span className={styles["workspace-status-lane-thread-title"]}>{thread.title}</span>
                        <span className={styles["workspace-status-lane-thread-meta"]}>
                          <span>Thread {thread.shortThreadId}</span>
                          {thread.matchingLaneCount > 1 ? (
                            <span className={styles["workspace-status-lane-thread-multiplicity"]}>
                              {thread.matchingLaneCount} matching lanes
                            </span>
                          ) : null}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className={styles["workspace-status-lane-empty"]}>
                    Waiting for the latest living-thread refresh.
                  </p>
                )}
              </div>
            ) : null}
          </div>
        );
      })}
    </>
  );
}

export function TeamStatusBar({
  isSidebarVisible,
  livingThreads,
  isArchivedThreadsRevealed,
  isSettingsSelected,
  onSelectThreadTab,
  onToggleSidebar,
  onToggleArchivedThreads,
  onSelectSettings,
}: TeamStatusBarProps) {
  const [snapshot, setSnapshot] = useState<TeamStatusSnapshotResponse | null>(null);
  const [refreshState, setRefreshState] = useState<RefreshState>("loading");
  const [openLaneState, setOpenLaneState] = useState<TeamStatusLanePopoverState | null>(null);
  const lanePopoverRefs = useRef<Partial<Record<TeamStatusLaneCountKey, HTMLDivElement | null>>>(
    {},
  );
  const laneThreadsByStatus = buildTeamStatusLaneThreadBuckets(livingThreads);
  const openLaneKey = openLaneState?.key ?? null;

  useEffect(() => {
    let isCancelled = false;
    let timeoutId: number | null = null;

    const poll = async () => {
      try {
        const nextSnapshot = await fetchWorkspaceStatus();

        if (!isCancelled) {
          setSnapshot(nextSnapshot);
          setRefreshState("live");
        }
      } catch {
        if (!isCancelled) {
          setRefreshState((currentState) => {
            return currentState === "live" || currentState === "stale" ? "stale" : "error";
          });
        }
      } finally {
        if (!isCancelled) {
          timeoutId = window.setTimeout(() => {
            void poll();
          }, POLL_INTERVAL_MS);
        }
      }
    };

    void poll();

    return () => {
      isCancelled = true;

      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, []);

  const dismissOpenLaneOnPointerDown = useEffectEvent((event: PointerEvent) => {
    if (openLaneKey === null) {
      return;
    }

    const openPopover = lanePopoverRefs.current[openLaneKey];
    const eventTarget = event.target;
    if (!(eventTarget instanceof Node) || !openPopover?.contains(eventTarget)) {
      setOpenLaneState(null);
    }
  });

  const activeThreadCount = snapshot?.workspace.activeThreadCount ?? null;
  const archivedThreadCount = snapshot?.workspace.archivedThreadCount ?? null;
  const livingThreadCount = snapshot?.workspace.livingThreadCount ?? null;
  const laneTotals: TeamStatusBarLaneTotal[] =
    snapshot === null
      ? []
      : teamStatusLaneItems
          .map((item) => ({
            ...item,
            value: snapshot.workspace.laneCounts[item.key],
          }))
          .filter((item) => item.value > 0);

  useEffect(() => {
    if (openLaneKey === null) {
      return;
    }

    document.addEventListener("pointerdown", dismissOpenLaneOnPointerDown);
    return () => {
      document.removeEventListener("pointerdown", dismissOpenLaneOnPointerDown);
    };
  }, [openLaneKey]);

  useEffect(() => {
    if (openLaneKey === null || snapshot === null) {
      return;
    }

    if (snapshot.workspace.laneCounts[openLaneKey] <= 0) {
      setOpenLaneState(null);
    }
  }, [openLaneKey, snapshot]);

  const statusNote =
    refreshState === "stale"
      ? "Last update failed. Retrying."
      : refreshState === "error"
        ? "Status unavailable. Retrying."
        : snapshot
          ? formatTimestamp(snapshot.sampledAt)
          : "Waiting for first sample.";
  const cpuSummary =
    snapshot === null
      ? "--"
      : snapshot.host.cpuPercent === null
        ? "Sampling..."
        : `${snapshot.host.cpuPercent.toFixed(1)}%`;
  const memorySummary =
    snapshot === null
      ? "--"
      : `${snapshot.host.memoryPercent.toFixed(1)}% • ${formatBytes(snapshot.host.usedMemoryBytes)} / ${formatBytes(snapshot.host.totalMemoryBytes)}`;
  const archivedThreadButtonLabel =
    archivedThreadCount === null
      ? "Archived Threads"
      : archivedThreadCount === 1
        ? "1 Archived Thread"
        : `${archivedThreadCount} Archived Threads`;
  const sidebarToggleState = getTeamWorkspaceSidebarToggleState(isSidebarVisible);

  const handleOpenLane = (
    laneKey: TeamStatusLaneCountKey,
    trigger: TeamStatusLanePopoverTrigger,
  ) => {
    setOpenLaneState((currentState) => {
      return getNextTeamStatusLanePopoverState(currentState, laneKey, trigger);
    });
  };

  const handleCloseLane = (laneKey: TeamStatusLaneCountKey) => {
    setOpenLaneState((currentState) => (currentState?.key === laneKey ? null : currentState));
  };

  const handleLaneBlur = (laneKey: TeamStatusLaneCountKey, event: FocusEvent<HTMLDivElement>) => {
    const nextFocusedElement = event.relatedTarget;
    if (nextFocusedElement instanceof Node && event.currentTarget.contains(nextFocusedElement)) {
      return;
    }

    handleCloseLane(laneKey);
  };

  const handleLaneMouseLeave = (
    laneKey: TeamStatusLaneCountKey,
    event: MouseEvent<HTMLDivElement>,
  ) => {
    if (openLaneState?.key === laneKey && openLaneState.trigger === "click") {
      return;
    }

    const activeElement = document.activeElement;
    if (activeElement instanceof Node && event.currentTarget.contains(activeElement)) {
      return;
    }

    handleCloseLane(laneKey);
  };

  const handleLaneKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Escape") {
      return;
    }

    setOpenLaneState(null);
    if (event.target instanceof HTMLElement) {
      event.target.blur();
    }
  };

  const handleToggleLane = (laneKey: TeamStatusLaneCountKey) => {
    handleOpenLane(laneKey, "click");
  };

  const handleSelectLaneThread = (threadId: string) => {
    setOpenLaneState(null);
    onSelectThreadTab(threadId);
  };

  const setLanePopoverRef = (
    laneKey: TeamStatusLaneCountKey,
    element: HTMLDivElement | null,
  ) => {
    lanePopoverRefs.current[laneKey] = element;
  };

  return (
    <section aria-label="Workspace status" className={styles["workspace-status-bar"]}>
      <div className={styles["workspace-status-group"]}>
        <div className={styles["workspace-status-actions"]}>
          <button
            aria-controls={TEAM_WORKSPACE_SIDEBAR_ID}
            aria-expanded={isSidebarVisible}
            aria-label={sidebarToggleState.actionLabel}
            aria-pressed={sidebarToggleState.isPressed}
            className={`${styles["workspace-status-toggle"]} ${sidebarToggleState.isPressed ? styles["workspace-status-toggle-active"] : ""}`}
            title={sidebarToggleState.actionLabel}
            type="button"
            onClick={onToggleSidebar}
          >
            <SidebarIcon className={styles["workspace-icon"]} isSidebarVisible={isSidebarVisible} />
            <span aria-hidden="true">Sidebar</span>
          </button>
          <button
            aria-pressed={isSettingsSelected}
            className={`${styles["workspace-icon-button"]} ${styles["workspace-status-icon-button"]} ${isSettingsSelected ? styles["workspace-icon-button-active"] : ""}`}
            title="Settings"
            type="button"
            onClick={onSelectSettings}
          >
            <SettingsIcon className={styles["workspace-icon"]} />
            <span className="sr-only">Settings</span>
          </button>
          <button
            aria-pressed={isArchivedThreadsRevealed}
            className={`${styles["workspace-icon-button"]} ${styles["workspace-status-icon-button"]} ${isArchivedThreadsRevealed ? styles["workspace-icon-button-active"] : ""}`}
            title={
              isArchivedThreadsRevealed
                ? `Hide ${archivedThreadButtonLabel}`
                : `Show ${archivedThreadButtonLabel}`
            }
            type="button"
            onClick={onToggleArchivedThreads}
          >
            <ArchiveIcon className={styles["workspace-icon"]} />
            {archivedThreadCount && archivedThreadCount > 0 ? (
              <span className={styles["workspace-icon-button-badge"]}>
                {archivedThreadCount > 99 ? "99+" : archivedThreadCount}
              </span>
            ) : null}
            <span className="sr-only">
              {isArchivedThreadsRevealed
                ? `Hide ${archivedThreadButtonLabel}`
                : `Show ${archivedThreadButtonLabel}`}
            </span>
          </button>
        </div>
        <div className={styles["workspace-status-inline-metric"]}>
          <span className={styles["workspace-status-inline-value"]}>
            {activeThreadCount === null ? "--" : activeThreadCount}
          </span>
          <span>active</span>
        </div>
        <div className={styles["workspace-status-inline-metric"]}>
          <span className={styles["workspace-status-inline-value"]}>
            {livingThreadCount === null ? "--" : livingThreadCount}
          </span>
          <span>living</span>
        </div>
        <div className={styles["workspace-status-lane-list"]}>
          {laneTotals.length > 0 ? (
            <TeamStatusBarLaneList
              laneThreadsByStatus={laneThreadsByStatus}
              laneTotals={laneTotals}
              openLaneKey={openLaneKey}
              setLanePopoverRef={setLanePopoverRef}
              onLaneBlur={handleLaneBlur}
              onLaneClick={handleToggleLane}
              onLaneFocusCapture={(laneKey) => handleOpenLane(laneKey, "focus")}
              onLaneKeyDown={handleLaneKeyDown}
              onLaneMouseEnter={(laneKey) => handleOpenLane(laneKey, "hover")}
              onLaneMouseLeave={handleLaneMouseLeave}
              onSelectLaneThread={handleSelectLaneThread}
            />
          ) : (
            <span className={styles["workspace-status-note"]}>
              {activeThreadCount && activeThreadCount > 0 ? "Planning only." : "No active lanes."}
            </span>
          )}
        </div>
      </div>

      <div className={`${styles["workspace-status-group"]} ${styles["workspace-status-group-right"]}`}>
        <div className={styles["workspace-status-inline-metric"]}>
          <span className={styles["workspace-status-inline-key"]}>CPU</span>
          <span className={styles["workspace-status-inline-value"]}>{cpuSummary}</span>
        </div>
        <div className={styles["workspace-status-inline-metric"]}>
          <span className={styles["workspace-status-inline-key"]}>Memory</span>
          <span className={styles["workspace-status-inline-value"]}>{memorySummary}</span>
        </div>
        <p className={styles["workspace-status-note"]}>{statusNote}</p>
      </div>
    </section>
  );
}
