import { createTool, type Message } from "@inngest/agent-kit";
import { z } from "zod";
import type { RolePrompt } from "@/lib/team/prompts";
import type { TeamRoleDecision, TeamRoleHandoff } from "@/lib/team/types";

export type TeamRoleState = {
  workflow: string[];
  handoffs: Partial<Record<string, TeamRoleHandoff>>;
  handoffCounter: number;
  assignmentNumber: number;
};

export const formatTextMessage = (message: Message): string => {
  if (message.type !== "text") {
    return "";
  }

  if (typeof message.content === "string") {
    return message.content;
  }

  return message.content
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n");
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
  if (roleId === "reviewer") {
    return proposedDecision === "continue" ? "approved" : proposedDecision;
  }

  return "continue";
};

export const createSaveHandoffTool = <TState extends TeamRoleState>(role: RolePrompt) => {
  return createTool({
    name: "save_handoff",
    description: "Persist this role's handoff for the next step in the engineering workflow.",
    parameters: z.object({
      summary: z.string().trim().min(1),
      deliverable: z.string().trim().min(1),
      decision: z.enum(["continue", "approved", "needs_revision"]).default("continue"),
    }),
    handler: async ({ summary, deliverable, decision }, { network }) => {
      const state = network.state.data as TState;
      const sequence = state.handoffCounter + 1;
      const normalizedDecision = normalizeDecision(role.id, decision);

      state.handoffCounter = sequence;
      state.handoffs = {
        ...state.handoffs,
        [role.id]: {
          roleId: role.id,
          roleName: role.name,
          summary,
          deliverable,
          decision: normalizedDecision,
          sequence,
          assignmentNumber: state.assignmentNumber,
          updatedAt: new Date().toISOString(),
        },
      };

      return {
        ok: true,
        roleId: role.id,
        decision: normalizedDecision,
        sequence,
      };
    },
  });
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
