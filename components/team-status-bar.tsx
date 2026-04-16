"use client";

import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import {
  buildTeamStatusLaneThreadBuckets,
  describeTeamStatusLanePopover,
  teamStatusLaneItems,
  type TeamStatusLaneCountKey,
} from "@/components/team-status-bar-lane-utils";
import type { TeamThreadSummary } from "@/lib/team/history";
import type { TeamStatusSnapshotResponse } from "@/lib/team/status";

type RefreshState = "loading" | "live" | "stale" | "error";

type TeamStatusBarProps = {
  livingThreads: TeamThreadSummary[];
  isArchivedThreadsRevealed: boolean;
  isSettingsSelected: boolean;
  onSelectThreadTab: (threadId: string) => void;
  onToggleArchivedThreads: () => void;
  onSelectSettings: () => void;
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

export function TeamStatusBar({
  livingThreads,
  isArchivedThreadsRevealed,
  isSettingsSelected,
  onSelectThreadTab,
  onToggleArchivedThreads,
  onSelectSettings,
}: TeamStatusBarProps) {
  const [snapshot, setSnapshot] = useState<TeamStatusSnapshotResponse | null>(null);
  const [refreshState, setRefreshState] = useState<RefreshState>("loading");
  const [openLaneKey, setOpenLaneKey] = useState<TeamStatusLaneCountKey | null>(null);
  const lanePopoverRefs = useRef<Partial<Record<TeamStatusLaneCountKey, HTMLDivElement | null>>>(
    {},
  );
  const laneThreadsByStatus = buildTeamStatusLaneThreadBuckets(livingThreads);

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
      setOpenLaneKey(null);
    }
  });

  const activeThreadCount = snapshot?.workspace.activeThreadCount ?? null;
  const archivedThreadCount = snapshot?.workspace.archivedThreadCount ?? null;
  const livingThreadCount = snapshot?.workspace.livingThreadCount ?? null;
  const laneTotals =
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
      setOpenLaneKey(null);
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

  const handleOpenLane = (laneKey: TeamStatusLaneCountKey) => {
    setOpenLaneKey(laneKey);
  };

  const handleCloseLane = (laneKey: TeamStatusLaneCountKey) => {
    setOpenLaneKey((currentLaneKey) => (currentLaneKey === laneKey ? null : currentLaneKey));
  };

  const handleLaneBlur = (
    laneKey: TeamStatusLaneCountKey,
    event: FocusEvent<HTMLDivElement>,
  ) => {
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

    setOpenLaneKey(null);
    if (event.target instanceof HTMLElement) {
      event.target.blur();
    }
  };

  const handleToggleLane = (laneKey: TeamStatusLaneCountKey) => {
    setOpenLaneKey((currentLaneKey) => (currentLaneKey === laneKey ? null : laneKey));
  };

  const handleSelectLaneThread = (threadId: string) => {
    setOpenLaneKey(null);
    onSelectThreadTab(threadId);
  };

  return (
    <section aria-label="Workspace status" className="workspace-status-bar">
      <div className="workspace-status-group">
        <div className="workspace-status-actions">
          <button
            aria-pressed={isSettingsSelected}
            className={`workspace-icon-button workspace-status-icon-button ${isSettingsSelected ? "workspace-icon-button-active" : ""}`}
            title="Settings"
            type="button"
            onClick={onSelectSettings}
          >
            <SettingsIcon className="workspace-icon" />
            <span className="sr-only">Settings</span>
          </button>
          <button
            aria-pressed={isArchivedThreadsRevealed}
            className={`workspace-icon-button workspace-status-icon-button ${isArchivedThreadsRevealed ? "workspace-icon-button-active" : ""}`}
            title={
              isArchivedThreadsRevealed
                ? `Hide ${archivedThreadButtonLabel}`
                : `Show ${archivedThreadButtonLabel}`
            }
            type="button"
            onClick={onToggleArchivedThreads}
          >
            <ArchiveIcon className="workspace-icon" />
            {archivedThreadCount && archivedThreadCount > 0 ? (
              <span className="workspace-icon-button-badge">
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
        <div className="workspace-status-inline-metric">
          <span className="workspace-status-inline-value">
            {activeThreadCount === null ? "--" : activeThreadCount}
          </span>
          <span>active</span>
        </div>
        <div className="workspace-status-inline-metric">
          <span className="workspace-status-inline-value">
            {livingThreadCount === null ? "--" : livingThreadCount}
          </span>
          <span>living</span>
        </div>
        <div className="workspace-status-lane-list">
          {laneTotals.length > 0 ? (
            laneTotals.map((item) => {
              const isOpen = openLaneKey === item.key;
              const lanePopoverId = `workspace-status-lane-panel-${item.key}`;
              const matchingThreads = laneThreadsByStatus[item.key];
              const popoverCopy = describeTeamStatusLanePopover(matchingThreads, item.value);

              return (
                <div
                  className={`workspace-status-lane-popover ${isOpen ? "workspace-status-lane-popover-open" : ""}`}
                  key={item.key}
                  ref={(element) => {
                    lanePopoverRefs.current[item.key] = element;
                  }}
                  onBlur={(event) => handleLaneBlur(item.key, event)}
                  onFocusCapture={() => handleOpenLane(item.key)}
                  onKeyDown={handleLaneKeyDown}
                  onMouseEnter={() => handleOpenLane(item.key)}
                  onMouseLeave={(event) => handleLaneMouseLeave(item.key, event)}
                >
                  <button
                    aria-controls={lanePopoverId}
                    aria-expanded={isOpen}
                    aria-haspopup="dialog"
                    className={`status-pill workspace-status-lane-trigger ${item.className}`}
                    type="button"
                    onClick={() => handleToggleLane(item.key)}
                  >
                    <span>{item.label}</span>
                    <span className="workspace-status-lane-trigger-count">{item.value}</span>
                  </button>

                  {isOpen ? (
                    <div
                      aria-label={`${item.label} living threads`}
                      className="workspace-status-lane-panel"
                      id={lanePopoverId}
                      role="dialog"
                    >
                      <div className="workspace-status-lane-panel-head">
                        <p className="workspace-status-lane-panel-title">{item.label}</p>
                        <p className="workspace-status-lane-panel-summary">{popoverCopy.summary}</p>
                        {popoverCopy.detail ? (
                          <p className="workspace-status-lane-panel-detail">{popoverCopy.detail}</p>
                        ) : null}
                      </div>

                      {matchingThreads.length > 0 ? (
                        <div className="workspace-status-lane-thread-list">
                          {matchingThreads.map((thread) => (
                            <button
                              aria-label={`Open thread ${thread.shortThreadId}: ${thread.title}`}
                              className="workspace-status-lane-thread-button"
                              key={thread.threadId}
                              type="button"
                              onClick={() => handleSelectLaneThread(thread.threadId)}
                            >
                              <span className="workspace-status-lane-thread-title">
                                {thread.title}
                              </span>
                              <span className="workspace-status-lane-thread-meta">
                                <span>Thread {thread.shortThreadId}</span>
                                {thread.matchingLaneCount > 1 ? (
                                  <span className="workspace-status-lane-thread-multiplicity">
                                    {thread.matchingLaneCount} matching lanes
                                  </span>
                                ) : null}
                              </span>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <p className="workspace-status-lane-empty">
                          Waiting for the latest living-thread refresh.
                        </p>
                      )}
                    </div>
                  ) : null}
                </div>
              );
            })
          ) : (
            <span className="workspace-status-note">
              {activeThreadCount && activeThreadCount > 0 ? "Planning only." : "No active lanes."}
            </span>
          )}
        </div>
      </div>

      <div className="workspace-status-group workspace-status-group-right">
        <div className="workspace-status-inline-metric">
          <span className="workspace-status-inline-key">CPU</span>
          <span className="workspace-status-inline-value">{cpuSummary}</span>
        </div>
        <div className="workspace-status-inline-metric">
          <span className="workspace-status-inline-key">Memory</span>
          <span className="workspace-status-inline-value">{memorySummary}</span>
        </div>
        <p className="workspace-status-note">{statusNote}</p>
      </div>
    </section>
  );
}
