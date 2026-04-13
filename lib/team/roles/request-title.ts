import { z } from "zod";
import type { TeamStructuredExecutor } from "@/lib/agent/executor";
import type { Worktree } from "@/lib/team/coding/worktree";
import {
  CONVENTIONAL_TITLE_SCOPE_PATTERN,
  CONVENTIONAL_TITLE_TYPES,
} from "@/lib/team/request-title";
import {
  prompt as renderRequestTitlePrompt,
  type Args as RequestTitlePromptArgs,
} from "./request-title.prompt.md";

const requestTitleOutputSchema = z.object({
  title: z.string().trim().min(1).max(80),
  conventionalTitle: z
    .object({
      type: z.enum(CONVENTIONAL_TITLE_TYPES),
      scope: z.string().trim().regex(CONVENTIONAL_TITLE_SCOPE_PATTERN).nullable(),
    })
    .nullable(),
});

export type RequestTitleTask = {
  title: string;
  objective: string;
};

export type RequestTitleRoleInput = {
  input: string;
  requestText: string;
  worktree: Worktree;
  tasks?: RequestTitleTask[] | null;
};

export type RequestTitleRoleOutput = z.infer<typeof requestTitleOutputSchema>;

const buildRequestTitlePrompt = ({ input, requestText, tasks }: RequestTitleRoleInput): string => {
  const taskList = tasks?.length
    ? tasks
        .map((task, index) => `${index + 1}. Title: ${task.title}\nObjective: ${task.objective}`)
        .join("\n\n")
    : null;

  const templateArgs: RequestTitlePromptArgs = {
    conventionalTitleTypes: CONVENTIONAL_TITLE_TYPES.join(", "),
    plannerTasksSection: taskList ? `Planner tasks:\n${taskList}` : "",
    planningInputSection: input !== requestText ? `Current planning input:\n${input}` : "",
    requestText,
  };

  return renderRequestTitlePrompt(templateArgs);
};

export class RequestTitleAgent {
  constructor(private readonly executor: TeamStructuredExecutor) {}

  async run(input: RequestTitleRoleInput): Promise<RequestTitleRoleOutput> {
    return this.executor({
      worktree: input.worktree,
      prompt: buildRequestTitlePrompt(input),
      responseSchema: requestTitleOutputSchema,
      codexHomePrefix: "request-title",
    });
  }
}
