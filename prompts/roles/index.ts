import { frontmatter as coderFrontmatter, prompt as renderCoderPrompt } from "./coder.prompt.md";
import {
  frontmatter as plannerFrontmatter,
  prompt as renderPlannerPrompt,
} from "./planner.prompt.md";
import {
  frontmatter as reviewerFrontmatter,
  prompt as renderReviewerPrompt,
} from "./reviewer.prompt.md";

export type StaticRolePrompt = {
  filePath: string;
  id: string;
  name: string;
  prompt: string;
  summary: string;
};

type StaticRolePromptModule = {
  frontmatter: object;
  prompt: () => string;
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

const readFrontmatterString = (frontmatter: object, key: string): string | null => {
  const value = Reflect.get(frontmatter, key);
  return typeof value === "string" && value.trim() ? value.trim() : null;
};

const createRolePrompt = (
  roleId: string,
  filePath: string,
  promptModule: StaticRolePromptModule,
): StaticRolePrompt => {
  const prompt = promptModule.prompt();

  return {
    filePath,
    id: roleId,
    name:
      readFrontmatterString(promptModule.frontmatter, "title") ??
      extractHeading(prompt) ??
      titleizeRoleId(roleId),
    prompt,
    summary: readFrontmatterString(promptModule.frontmatter, "summary") ?? extractSummary(prompt),
  };
};

// Keep this registry explicit so role prompts stay statically bundled.
export const rolePromptRegistry = {
  coder: createRolePrompt("coder", "prompts/roles/coder.prompt.md", {
    frontmatter: coderFrontmatter,
    prompt: renderCoderPrompt,
  }),
  planner: createRolePrompt("planner", "prompts/roles/planner.prompt.md", {
    frontmatter: plannerFrontmatter,
    prompt: renderPlannerPrompt,
  }),
  reviewer: createRolePrompt("reviewer", "prompts/roles/reviewer.prompt.md", {
    frontmatter: reviewerFrontmatter,
    prompt: renderReviewerPrompt,
  }),
} as const satisfies Record<string, StaticRolePrompt>;

export type RolePromptId = keyof typeof rolePromptRegistry;

export const rolePromptIds = Object.keys(rolePromptRegistry).sort() as RolePromptId[];

export const rolePromptList = rolePromptIds.map((roleId) => rolePromptRegistry[roleId]);
