import type { PendingDispatchAssignment } from "@/lib/team/history";
import type { TeamDispatchAssignment, TeamWorkerLaneRecord } from "@/lib/team/types";
import { createManagedWorktree, createWorktree } from "@/lib/team/coding/worktree";

type PendingDispatchLaneAllocation = {
  pending: PendingDispatchAssignment;
  lane: TeamWorkerLaneRecord;
  worktreeRoot: string;
};

type PendingDispatchAssignmentAllocation = {
  pending: PendingDispatchAssignment;
  worktreeRoot: string;
};

export type AssignmentThreadSchedulingState = Pick<
  TeamDispatchAssignment,
  "status" | "threadSlot" | "plannerWorktreePath"
>;

export type LanePoolSchedulingState = Pick<
  TeamWorkerLaneRecord,
  "status" | "workerSlot" | "worktreePath"
>;

export type PlannedAssignmentThreadState = {
  expected: AssignmentThreadSchedulingState;
  planned: Pick<TeamDispatchAssignment, "threadSlot" | "plannerWorktreePath">;
};

export type PlannedLanePoolState = {
  expected: LanePoolSchedulingState;
  planned: Pick<TeamWorkerLaneRecord, "workerSlot" | "worktreePath">;
};

const isPoolOccupyingLaneStatus = (status: TeamWorkerLaneRecord["status"]): boolean => {
  return status === "queued" || status === "coding" || status === "reviewing";
};

export const buildAssignmentThreadPoolStateKey = ({
  threadId,
  assignmentNumber,
}: {
  threadId: string;
  assignmentNumber: number;
}): string => {
  return `${threadId}:${assignmentNumber}`;
};

export const buildLanePoolStateKey = ({
  threadId,
  assignmentNumber,
  laneId,
}: {
  threadId: string;
  assignmentNumber: number;
  laneId: string;
}): string => {
  return `${threadId}:${assignmentNumber}:${laneId}`;
};

export const captureAssignmentThreadSchedulingState = (
  assignment: TeamDispatchAssignment,
): AssignmentThreadSchedulingState => {
  return {
    status: assignment.status,
    threadSlot: assignment.threadSlot ?? null,
    plannerWorktreePath: assignment.plannerWorktreePath ?? null,
  };
};

export const captureLanePoolSchedulingState = (
  lane: TeamWorkerLaneRecord,
): LanePoolSchedulingState => {
  return {
    status: lane.status,
    workerSlot: lane.workerSlot,
    worktreePath: lane.worktreePath,
  };
};

export const assignmentThreadSchedulingStateMatches = (
  assignment: TeamDispatchAssignment,
  expected: AssignmentThreadSchedulingState,
): boolean => {
  return (
    assignment.status === expected.status &&
    (assignment.threadSlot ?? null) === expected.threadSlot &&
    (assignment.plannerWorktreePath ?? null) === expected.plannerWorktreePath
  );
};

export const lanePoolSchedulingStateMatches = (
  lane: TeamWorkerLaneRecord,
  expected: LanePoolSchedulingState,
): boolean => {
  return (
    lane.status === expected.status &&
    lane.workerSlot === expected.workerSlot &&
    lane.worktreePath === expected.worktreePath
  );
};

const comparePendingDispatchAssignmentAllocation = (
  left: PendingDispatchAssignmentAllocation,
  right: PendingDispatchAssignmentAllocation,
): number => {
  const leftRequestedAt =
    left.pending.assignment.startedAt ??
    left.pending.assignment.requestedAt ??
    left.pending.assignment.updatedAt;
  const rightRequestedAt =
    right.pending.assignment.startedAt ??
    right.pending.assignment.requestedAt ??
    right.pending.assignment.updatedAt;

  return (
    leftRequestedAt.localeCompare(rightRequestedAt) ||
    left.pending.threadId.localeCompare(right.pending.threadId) ||
    left.pending.assignment.assignmentNumber - right.pending.assignment.assignmentNumber
  );
};

const comparePendingDispatchLaneAllocation = (
  left: PendingDispatchLaneAllocation,
  right: PendingDispatchLaneAllocation,
): number => {
  const leftQueuedAt = left.lane.queuedAt ?? left.lane.updatedAt;
  const rightQueuedAt = right.lane.queuedAt ?? right.lane.updatedAt;

  return (
    leftQueuedAt.localeCompare(rightQueuedAt) ||
    left.pending.threadId.localeCompare(right.pending.threadId) ||
    left.pending.assignment.assignmentNumber - right.pending.assignment.assignmentNumber ||
    left.lane.laneIndex - right.lane.laneIndex
  );
};

const applyAssignmentThreadSlot = ({
  assignment,
  worktreeRoot,
  threadSlot,
}: {
  assignment: TeamDispatchAssignment;
  worktreeRoot: string;
  threadSlot: number | null;
}): void => {
  assignment.threadSlot = threadSlot;
  assignment.plannerWorktreePath = threadSlot
    ? createManagedWorktree({
        rootPath: worktreeRoot,
        slot: threadSlot,
      }).path
    : null;
};

const resolvePreservedAssignmentThreadSlot = ({
  assignment,
  worktreeRoot,
}: {
  assignment: TeamDispatchAssignment;
  worktreeRoot: string;
}): number | null => {
  if (assignment.threadSlot) {
    return assignment.threadSlot;
  }

  if (assignment.plannerWorktreePath) {
    const plannerWorktree = createWorktree({
      path: assignment.plannerWorktreePath,
      rootPath: worktreeRoot,
    });
    if (plannerWorktree.slot) {
      return plannerWorktree.slot;
    }
  }

  for (const lane of assignment.lanes) {
    if (!isPoolOccupyingLaneStatus(lane.status)) {
      continue;
    }

    if (lane.workerSlot) {
      return lane.workerSlot;
    }

    if (!lane.worktreePath) {
      continue;
    }

    const laneWorktree = createWorktree({
      path: lane.worktreePath,
      rootPath: worktreeRoot,
    });
    if (laneWorktree.slot) {
      return laneWorktree.slot;
    }
  }

  return null;
};

export const assignPendingDispatchThreadSlots = ({
  pendingAssignments,
  workerCount,
  resolveAssignmentWorktreeRoot,
}: {
  pendingAssignments: PendingDispatchAssignment[];
  workerCount: number;
  resolveAssignmentWorktreeRoot: (pending: PendingDispatchAssignment) => string;
}): void => {
  const occupiedSlots = new Set<number>();
  let preservedAssignmentCount = 0;
  const unassignedAssignments: PendingDispatchAssignmentAllocation[] = [];

  for (const pending of pendingAssignments) {
    if (!pending.assignment.repository) {
      continue;
    }

    const worktreeRoot = resolveAssignmentWorktreeRoot(pending);
    const preservedThreadSlot = resolvePreservedAssignmentThreadSlot({
      assignment: pending.assignment,
      worktreeRoot,
    });

    if (!preservedThreadSlot) {
      applyAssignmentThreadSlot({
        assignment: pending.assignment,
        worktreeRoot,
        threadSlot: null,
      });
      unassignedAssignments.push({
        pending,
        worktreeRoot,
      });
      continue;
    }

    preservedAssignmentCount += 1;
    if (preservedThreadSlot >= 1 && preservedThreadSlot <= workerCount) {
      occupiedSlots.add(preservedThreadSlot);
    }
    applyAssignmentThreadSlot({
      assignment: pending.assignment,
      worktreeRoot,
      threadSlot: preservedThreadSlot,
    });
  }

  const remainingCapacity = Math.max(0, workerCount - preservedAssignmentCount);
  const availableSlots = Array.from({ length: workerCount }, (_, index) => index + 1)
    .filter((slot) => !occupiedSlots.has(slot))
    .slice(0, remainingCapacity);

  for (const { pending, worktreeRoot } of unassignedAssignments.sort(
    comparePendingDispatchAssignmentAllocation,
  )) {
    const threadSlot = availableSlots.shift();
    if (!threadSlot) {
      break;
    }

    applyAssignmentThreadSlot({
      assignment: pending.assignment,
      worktreeRoot,
      threadSlot,
    });
  }
};

export const assignPendingDispatchWorkerSlots = ({
  pendingAssignments,
  resolveAssignmentWorktreeRoot,
}: {
  pendingAssignments: PendingDispatchAssignment[];
  resolveAssignmentWorktreeRoot: (pending: PendingDispatchAssignment) => string;
}): void => {
  for (const pending of pendingAssignments) {
    if (!pending.assignment.repository) {
      continue;
    }

    const worktreeRoot = resolveAssignmentWorktreeRoot(pending);
    let hasAssignedLane = false;
    const slotlessQueuedLanes: PendingDispatchLaneAllocation[] = [];

    for (const lane of pending.assignment.lanes) {
      if (!isPoolOccupyingLaneStatus(lane.status)) {
        continue;
      }

      const preservedLaneSlot =
        lane.workerSlot ??
        (lane.worktreePath
          ? createWorktree({
              path: lane.worktreePath,
              rootPath: worktreeRoot,
            }).slot
          : null);

      if (preservedLaneSlot) {
        lane.workerSlot = preservedLaneSlot;
        lane.worktreePath ??= createManagedWorktree({
          rootPath: worktreeRoot,
          slot: preservedLaneSlot,
        }).path;
        hasAssignedLane = true;
        continue;
      }

      if (lane.status === "queued") {
        lane.workerSlot = null;
        lane.worktreePath = null;
        slotlessQueuedLanes.push({
          pending,
          lane,
          worktreeRoot,
        });
      }
    }

    if (hasAssignedLane) {
      continue;
    }

    const threadSlot = pending.assignment.threadSlot ?? null;
    if (!threadSlot || threadSlot < 1) {
      continue;
    }

    const nextQueuedLane = slotlessQueuedLanes.sort(comparePendingDispatchLaneAllocation)[0];
    if (!nextQueuedLane) {
      continue;
    }

    nextQueuedLane.lane.workerSlot = threadSlot;
    nextQueuedLane.lane.worktreePath =
      pending.assignment.plannerWorktreePath ??
      createManagedWorktree({
        rootPath: worktreeRoot,
        slot: threadSlot,
      }).path;
  }
};
