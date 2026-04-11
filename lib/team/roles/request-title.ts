import { z } from "zod";
import type { TeamStructuredExecutor } from "@/lib/agent/executor";
import {
  CONVENTIONAL_TITLE_SCOPE_PATTERN,
  CONVENTIONAL_TITLE_TYPES,
} from "@/lib/team/request-title";

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
  worktreePath: string;
  tasks?: RequestTitleTask[] | null;
};

export type RequestTitleRoleOutput = z.infer<typeof requestTitleOutputSchema>;

const buildRequestTitlePrompt = ({ input, requestText, tasks }: RequestTitleRoleInput): string => {
  const taskList = tasks?.length
    ? tasks
        .map((task, index) => `${index + 1}. Title: ${task.title}\nObjective: ${task.objective}`)
        .join("\n\n")
    : null;

  return [
    "Create a concise subject for an engineering request.",
    "Rules:",
    "- Keep it plain English and specific.",
    "- Prefer 2 to 8 words when possible.",
    "- Put only the plain subject text in title. Do not add a Conventional Commit type or scope prefix there.",
    "- Do not include quotes, markdown, IDs, or trailing punctuation.",
    `- When tasks are provided, infer conventional title metadata from them. Use one of: ${CONVENTIONAL_TITLE_TYPES.join(", ")}.`,
    "- When tasks are provided, set conventionalTitle.scope to a short slash-delimited roadmap/topic scope only when it materially clarifies the work. Otherwise set it to null.",
    "- When tasks are not provided, set conventionalTitle to null.",
    `Raw request text:\n${requestText}`,
    input !== requestText ? `Current planning input:\n${input}` : null,
    taskList ? `Planner tasks:\n${taskList}` : null,
    "Final response requirements:",
    "- Return JSON that matches the provided schema exactly.",
    "- Put the title in title.",
    "- Put the conventional metadata in conventionalTitle.",
  ]
    .filter(Boolean)
    .join("\n\n");
};

export class RequestTitleAgent {
  constructor(private readonly executor: TeamStructuredExecutor) {}

  async run(input: RequestTitleRoleInput): Promise<RequestTitleRoleOutput> {
    return this.executor({
      worktreePath: input.worktreePath,
      prompt: buildRequestTitlePrompt(input),
      responseSchema: requestTitleOutputSchema,
      codexHomePrefix: "request-title",
    });
  }
}
