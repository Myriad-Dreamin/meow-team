import type { TeamWorkerLaneCounts } from "@/lib/team/types";

export type TeamWorkspaceStatusSnapshot = {
  activeThreadCount: number;
  livingThreadCount: number;
  laneCounts: TeamWorkerLaneCounts;
};

export type TeamHostStatusSnapshot = {
  cpuPercent: number | null;
  memoryPercent: number;
  usedMemoryBytes: number;
  freeMemoryBytes: number;
  totalMemoryBytes: number;
};

export type TeamStatusSnapshotResponse = {
  sampledAt: string;
  workspace: TeamWorkspaceStatusSnapshot;
  host: TeamHostStatusSnapshot;
};

export const createEmptyWorkerLaneCounts = (): TeamWorkerLaneCounts => {
  return {
    idle: 0,
    queued: 0,
    coding: 0,
    reviewing: 0,
    awaitingHumanApproval: 0,
    approved: 0,
    failed: 0,
  };
};

export const mergeWorkerLaneCounts = (
  current: TeamWorkerLaneCounts,
  next: TeamWorkerLaneCounts,
): TeamWorkerLaneCounts => {
  return {
    idle: current.idle + next.idle,
    queued: current.queued + next.queued,
    coding: current.coding + next.coding,
    reviewing: current.reviewing + next.reviewing,
    awaitingHumanApproval: current.awaitingHumanApproval + next.awaitingHumanApproval,
    approved: current.approved + next.approved,
    failed: current.failed + next.failed,
  };
};
