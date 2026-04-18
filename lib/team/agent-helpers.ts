import type { TeamRoleDefinition } from "@/lib/team/roles/metadata";
import type { TeamRoleDecision, TeamRoleHandoff } from "@/lib/team/types";

export type TeamRoleState = {
  workflow: string[];
  handoffs: Partial<Record<string, TeamRoleHandoff>>;
  handoffCounter: number;
  assignmentNumber: number;
};

export const summarizeHandoffs = (state: Pick<TeamRoleState, "workflow" | "handoffs">): string => {
  const orderedHandoffs = state.workflow
    .map((roleId) => state.handoffs[roleId])
    .filter((handoff): handoff is TeamRoleHandoff => Boolean(handoff));

  if (orderedHandoffs.length === 0) {
    return "No previous role handoffs exist for this assignment yet.";
  }

  return orderedHandoffs
    .map((handoff) => {
      return [
        `${handoff.roleName} (${handoff.roleId})`,
        `Decision: ${handoff.decision}`,
        `Summary: ${handoff.summary}`,
        `Deliverable: ${handoff.deliverable}`,
      ].join("\n");
    })
    .join("\n\n");
};

export const normalizeDecision = (
  roleId: string,
  proposedDecision: TeamRoleDecision,
): TeamRoleDecision => {
  if (roleId === "reviewer" || roleId === "execution-reviewer") {
    return proposedDecision === "continue" ? "approved" : proposedDecision;
  }

  return "continue";
};

export const applyHandoff = <TState extends TeamRoleState>({
  state,
  role,
  summary,
  deliverable,
  decision,
}: {
  state: TState;
  role: TeamRoleDefinition;
  summary: string;
  deliverable: string;
  decision: TeamRoleDecision;
}): TeamRoleHandoff => {
  const sequence = state.handoffCounter + 1;
  const normalizedDecision = normalizeDecision(role.id, decision);

  const handoff: TeamRoleHandoff = {
    roleId: role.id,
    roleName: role.name,
    summary,
    deliverable,
    decision: normalizedDecision,
    sequence,
    assignmentNumber: state.assignmentNumber,
    updatedAt: new Date().toISOString(),
  };

  state.handoffCounter = sequence;
  state.handoffs = {
    ...state.handoffs,
    [role.id]: handoff,
  };

  return handoff;
};

export const resolveNextRoleId = (state: TeamRoleState): string | undefined => {
  for (let index = 0; index < state.workflow.length; index += 1) {
    const roleId = state.workflow[index];
    const current = state.handoffs[roleId];

    if (index === 0) {
      if (!current) {
        return roleId;
      }
      continue;
    }

    const previousRoleId = state.workflow[index - 1];
    const previous = state.handoffs[previousRoleId];

    if (!previous) {
      return previousRoleId;
    }

    if (!current || current.sequence < previous.sequence) {
      return roleId;
    }
  }

  const finalRoleId = state.workflow.at(-1);
  if (!finalRoleId) {
    return undefined;
  }

  const finalHandoff = state.handoffs[finalRoleId];
  if (!finalHandoff) {
    return undefined;
  }

  if (finalHandoff.decision === "needs_revision" && state.workflow.length > 1) {
    const revisionRoleId = state.workflow[state.workflow.length - 2];
    const revisionHandoff = state.handoffs[revisionRoleId];

    if (!revisionHandoff || revisionHandoff.sequence <= finalHandoff.sequence) {
      return revisionRoleId;
    }
  }

  return undefined;
};
