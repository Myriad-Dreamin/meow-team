import { z } from "zod";
import type { TeamCodexEvent } from "@/lib/team/types";

export type TeamStructuredExecutorInput<TSchema extends z.ZodTypeAny> = {
  worktreePath: string;
  prompt: string;
  responseSchema: TSchema;
  codexHomePrefix: string;
  onEvent?: (event: TeamCodexEvent) => Promise<void> | void;
};

export type TeamStructuredExecutor = <TSchema extends z.ZodTypeAny>(
  input: TeamStructuredExecutorInput<TSchema>,
) => Promise<z.infer<TSchema>>;
