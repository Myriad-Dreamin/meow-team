import type { TeamConfig } from "@/lib/config/team";
import {
  rolePromptIds,
  rolePromptList,
  rolePromptRegistry,
  type RolePromptId,
  type StaticRolePrompt,
} from "@/prompts/roles";

export type RolePrompt = StaticRolePrompt;

const hasRolePrompt = (roleId: string): roleId is RolePromptId => {
  return Object.prototype.hasOwnProperty.call(rolePromptRegistry, roleId);
};

const cloneRolePrompt = (rolePrompt: RolePrompt): RolePrompt => {
  return { ...rolePrompt };
};

export const loadRolePrompt = async (roleId: string): Promise<RolePrompt> => {
  if (!hasRolePrompt(roleId)) {
    throw new Error(
      `Unknown role prompt "${roleId}". Available role IDs: ${rolePromptIds.join(", ")}.`,
    );
  }

  return cloneRolePrompt(rolePromptRegistry[roleId]);
};

export const loadWorkflowRolePrompts = async (config: TeamConfig): Promise<RolePrompt[]> => {
  return Promise.all(config.workflow.map((roleId) => loadRolePrompt(roleId)));
};

export const listAvailableRolePrompts = async (): Promise<RolePrompt[]> => {
  return rolePromptList.map((rolePrompt) => cloneRolePrompt(rolePrompt));
};
