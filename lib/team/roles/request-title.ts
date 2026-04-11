import { z } from "zod";
import type { TeamStructuredExecutor } from "@/lib/agent/executor";

const requestTitleOutputSchema = z.object({
  title: z.string().trim().min(1).max(80),
});

export type RequestTitleRoleInput = {
  input: string;
  requestText: string;
  worktreePath: string;
};

export type RequestTitleRoleOutput = z.infer<typeof requestTitleOutputSchema>;

const buildRequestTitlePrompt = ({ input, requestText }: RequestTitleRoleInput): string => {
  return [
    "Create a concise title for an engineering request.",
    "Rules:",
    "- Keep it plain English and specific.",
    "- Prefer 2 to 8 words when possible.",
    "- Do not include quotes, markdown, IDs, or trailing punctuation.",
    `Raw request text:\n${requestText}`,
    input !== requestText ? `Current planning input:\n${input}` : null,
    "Final response requirements:",
    "- Return JSON that matches the provided schema exactly.",
    "- Put the title in title.",
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
