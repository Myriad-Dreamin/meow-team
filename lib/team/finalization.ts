import type {
  TeamLaneFinalizationCheckpoint,
  TeamLaneFinalizationMode,
  TeamLaneProposalDisposition,
  TeamWorkerLaneRecord,
} from "@/lib/team/types";

type LaneFinalizationFields = Pick<
  TeamWorkerLaneRecord,
  | "finalizationCheckpoint"
  | "finalizationMode"
  | "proposalDisposition"
  | "proposalPath"
  | "pullRequest"
  | "status"
>;

const FINALIZATION_CHECKPOINT_ORDER: Record<TeamLaneFinalizationCheckpoint, number> = {
  requested: 0,
  artifacts_applied: 1,
  branch_pushed: 2,
  completed: 3,
};

export const getLaneFinalizationMode = (
  lane: LaneFinalizationFields,
): TeamLaneFinalizationMode | null => {
  if (lane.finalizationMode === "archive" || lane.finalizationMode === "delete") {
    return lane.finalizationMode;
  }

  return lane.pullRequest?.humanApprovedAt ? "archive" : null;
};

export const getLaneFinalizationCheckpoint = (
  lane: LaneFinalizationFields,
): TeamLaneFinalizationCheckpoint | null => {
  if (
    lane.finalizationCheckpoint === "requested" ||
    lane.finalizationCheckpoint === "artifacts_applied" ||
    lane.finalizationCheckpoint === "branch_pushed" ||
    lane.finalizationCheckpoint === "completed"
  ) {
    return lane.finalizationCheckpoint;
  }

  if (lane.status === "approved" && lane.pullRequest?.status === "approved") {
    return getLaneFinalizationMode(lane) ? "completed" : null;
  }

  return lane.pullRequest?.humanApprovedAt ? "requested" : null;
};

export const hasReachedLaneFinalizationCheckpoint = (
  lane: LaneFinalizationFields,
  checkpoint: TeamLaneFinalizationCheckpoint,
): boolean => {
  const currentCheckpoint = getLaneFinalizationCheckpoint(lane);
  if (!currentCheckpoint) {
    return false;
  }

  return (
    FINALIZATION_CHECKPOINT_ORDER[currentCheckpoint] >= FINALIZATION_CHECKPOINT_ORDER[checkpoint]
  );
};

export const getLaneProposalDisposition = (
  lane: LaneFinalizationFields,
): TeamLaneProposalDisposition | null => {
  if (
    lane.proposalDisposition === "active" ||
    lane.proposalDisposition === "archived" ||
    lane.proposalDisposition === "deleted"
  ) {
    return lane.proposalDisposition;
  }

  if (lane.proposalPath?.startsWith("openspec/changes/archive/")) {
    return "archived";
  }

  if (
    getLaneFinalizationMode(lane) === "delete" &&
    hasReachedLaneFinalizationCheckpoint(lane, "artifacts_applied")
  ) {
    return "deleted";
  }

  return lane.proposalPath?.startsWith("openspec/changes/") ? "active" : null;
};

export const isLaneProposalArchived = (lane: LaneFinalizationFields): boolean => {
  return getLaneProposalDisposition(lane) === "archived";
};

export const isLaneProposalDeleted = (lane: LaneFinalizationFields): boolean => {
  return getLaneProposalDisposition(lane) === "deleted";
};
