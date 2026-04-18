import type { TeamThreadStatus } from "@/lib/team/types";

export const isTerminalTeamThreadStatus = (status: TeamThreadStatus): boolean => {
  return (
    status === "completed" ||
    status === "approved" ||
    status === "needs_revision" ||
    status === "failed"
  );
};
