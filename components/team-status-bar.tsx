"use client";

import { useEffect, useState } from "react";
import type { TeamStatusSnapshotResponse } from "@/lib/team/status";

type RefreshState = "loading" | "live" | "stale" | "error";

const POLL_INTERVAL_MS = 1000;

const laneStatusItems = [
  {
    key: "queued",
    label: "Queued",
    className: "status-queued",
  },
  {
    key: "coding",
    label: "Coding",
    className: "status-coding",
  },
  {
    key: "reviewing",
    label: "Reviewing",
    className: "status-reviewing",
  },
  {
    key: "awaitingHumanApproval",
    label: "Awaiting Approval",
    className: "status-awaiting_human_approval",
  },
  {
    key: "approved",
    label: "Approved",
    className: "status-approved",
  },
  {
    key: "failed",
    label: "Failed",
    className: "status-failed",
  },
] as const;

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

  if (!isRecord(value.workspace) || !isRecord(value.host) || !isRecord(value.workspace.laneCounts)) {
    return false;
  }

  const laneCounts = value.workspace.laneCounts;

  return (
    isFiniteNumber(value.workspace.activeThreadCount) &&
    isFiniteNumber(value.workspace.livingThreadCount) &&
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

export function TeamStatusBar() {
  const [snapshot, setSnapshot] = useState<TeamStatusSnapshotResponse | null>(null);
  const [refreshState, setRefreshState] = useState<RefreshState>("loading");

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

  const activeThreadCount = snapshot?.workspace.activeThreadCount ?? null;
  const livingThreadCount = snapshot?.workspace.livingThreadCount ?? null;
  const laneTotals =
    snapshot === null
      ? []
      : laneStatusItems
          .map((item) => ({
            ...item,
            value: snapshot.workspace.laneCounts[item.key],
          }))
          .filter((item) => item.value > 0);

  const statusNote =
    refreshState === "stale"
      ? "Last update failed. Retrying."
      : refreshState === "error"
        ? "Status unavailable. Retrying."
        : snapshot
          ? formatTimestamp(snapshot.sampledAt)
          : "Waiting for first sample.";

  return (
    <section className="workspace-status-bar">
      <div className="workspace-status-section">
        <p className="workspace-status-label">Workspace</p>
        <div className="workspace-status-row">
          <div className="workspace-status-total">
            <span className="workspace-status-total-value">
              {activeThreadCount === null ? "--" : activeThreadCount}
            </span>
            <div>
              <p className="workspace-status-total-label">Active Threads</p>
              <p className="workspace-status-note">
                {livingThreadCount === null
                  ? statusNote
                  : `${livingThreadCount} living thread${livingThreadCount === 1 ? "" : "s"} tracked`}
              </p>
            </div>
          </div>

          <div className="workspace-status-lane-list">
            {laneTotals.length > 0 ? (
              laneTotals.map((item) => (
                <span className={`status-pill ${item.className}`} key={item.key}>
                  {item.label} {item.value}
                </span>
              ))
            ) : (
              <span className="workspace-status-note">
                {activeThreadCount && activeThreadCount > 0 ? "Planning only." : "No active lanes."}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="workspace-status-section workspace-status-section-right">
        <p className="workspace-status-label">Host</p>
        <div className="workspace-status-row workspace-status-row-right">
          <div className="workspace-status-metric">
            <span className="workspace-status-metric-label">CPU</span>
            <span className="workspace-status-metric-value">
              {snapshot === null
                ? "--"
                : snapshot.host.cpuPercent === null
                  ? "Sampling..."
                  : `${snapshot.host.cpuPercent.toFixed(1)}%`}
            </span>
          </div>

          <div className="workspace-status-metric">
            <span className="workspace-status-metric-label">Memory</span>
            <span className="workspace-status-metric-value">
              {snapshot === null
                ? "--"
                : `${snapshot.host.memoryPercent.toFixed(1)}% • ${formatBytes(snapshot.host.usedMemoryBytes)} / ${formatBytes(snapshot.host.totalMemoryBytes)}`}
            </span>
          </div>

          <p className="workspace-status-note">{statusNote}</p>
        </div>
      </div>
    </section>
  );
}
