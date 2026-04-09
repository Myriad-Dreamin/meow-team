import { promises as fs } from "node:fs";
import path from "node:path";
import type { TeamConfig } from "@/lib/team/config";

const rolePromptsDirectory = path.join(process.cwd(), "prompts", "roles");

export type RolePrompt = {
  id: string;
  name: string;
  summary: string;
  prompt: string;
  filePath: string;
};

const titleizeRoleId = (roleId: string): string => {
  return roleId
    .split("-")
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
};

const extractHeading = (markdown: string): string | null => {
  const match = markdown.match(/^#\s+(.+)$/m);
  return match?.[1]?.trim() || null;
};

const extractSummary = (markdown: string): string => {
  const lines = markdown
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith("#"));

  return lines[0] ?? "No summary provided.";
};

const resolveRolePromptPath = (roleId: string): string => {
  const filePath = path.resolve(rolePromptsDirectory, `${roleId}.md`);
  if (!filePath.startsWith(rolePromptsDirectory)) {
    throw new Error(`Role ID "${roleId}" resolves outside prompts/roles.`);
  }
  return filePath;
};

export const loadRolePrompt = async (roleId: string): Promise<RolePrompt> => {
  const filePath = resolveRolePromptPath(roleId);
  const prompt = await fs.readFile(filePath, "utf8");

  return {
    id: roleId,
    name: extractHeading(prompt) ?? titleizeRoleId(roleId),
    summary: extractSummary(prompt),
    prompt,
    filePath,
  };
};

export const loadWorkflowRolePrompts = async (config: TeamConfig): Promise<RolePrompt[]> => {
  return Promise.all(config.workflow.map((roleId) => loadRolePrompt(roleId)));
};

export const listAvailableRolePrompts = async (): Promise<RolePrompt[]> => {
  const entries = await fs.readdir(rolePromptsDirectory, { withFileTypes: true });
  const roleIds = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md") && entry.name !== "README.md")
    .map((entry) => entry.name.replace(/\.md$/, ""))
    .sort();

  return Promise.all(roleIds.map((roleId) => loadRolePrompt(roleId)));
};
