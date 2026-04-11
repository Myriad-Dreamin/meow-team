import { z } from "zod";
import type { TeamStructuredExecutor } from "@/lib/team/agent/executor";

const requestTitleInputSchema = z.object({
  input: z.string().trim().min(1),
  requestText: z.string().trim().min(1),
  worktreePath: z.string().trim().min(1),
});

const requestTitleOutputSchema = z.object({
  title: z.string().trim().min(1).max(80),
});

export type RequestTitleRoleInput = z.infer<typeof requestTitleInputSchema>;
export type RequestTitleRoleOutput = z.infer<typeof requestTitleOutputSchema>;

const buildRequestTitlePrompt = ({
  input,
  requestText,
}: Pick<RequestTitleRoleInput, "input" | "requestText">): string => {
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

export const runRequestTitleRole = async (
  input: RequestTitleRoleInput,
  executor: TeamStructuredExecutor,
): Promise<RequestTitleRoleOutput> => {
  const parsedInput = requestTitleInputSchema.parse(input);

  return executor({
    worktreePath: parsedInput.worktreePath,
    prompt: buildRequestTitlePrompt(parsedInput),
    responseSchema: requestTitleOutputSchema,
    codexHomePrefix: "request-title",
  });
};
