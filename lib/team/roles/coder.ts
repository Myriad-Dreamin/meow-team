import { z } from "zod";
import { summarizeHandoffs } from "@/lib/team/agent-helpers";
import type { TeamStructuredExecutor } from "@/lib/team/agent/executor";
import {
  rolePromptSchema,
  teamRepositoryOptionSchema,
  teamRoleDecisionSchema,
  teamRoleHandoffSchema,
} from "@/lib/team/roles/schemas";
import type { TeamCodexEvent } from "@/lib/team/types";

const coderOutputSchema = z.object({
  summary: z.string().trim().min(1),
  deliverable: z.string().trim().min(1),
  decision: teamRoleDecisionSchema,
  pullRequestTitle: z.string().trim().min(1).nullable(),
  pullRequestSummary: z.string().trim().min(1).nullable(),
});

const coderInputSchema = z.object({
  role: rolePromptSchema,
  input: z.string().trim().min(1),
  state: z.object({
    teamName: z.string().trim().min(1),
    ownerName: z.string().trim().min(1),
    objective: z.string().trim().min(1),
    repository: teamRepositoryOptionSchema,
    laneId: z.string().trim().min(1),
    laneIndex: z.number().int().positive(),
    taskTitle: z.string().trim().min(1),
    taskObjective: z.string().trim().min(1),
    planSummary: z.string().trim().min(1),
    planDeliverable: z.string().trim().min(1),
    branchName: z.string().trim().min(1),
    baseBranch: z.string().trim().min(1),
    worktreePath: z.string().trim().min(1),
    implementationCommit: z.string().trim().min(1).nullable(),
    conflictNote: z.string().trim().min(1).nullable(),
    workflow: z.array(z.string().trim().min(1)).min(1),
    handoffs: z.record(z.string(), teamRoleHandoffSchema.optional()),
    handoffCounter: z.number().int().nonnegative(),
    assignmentNumber: z.number().int().positive(),
  }),
});

export type CoderRoleInput = z.infer<typeof coderInputSchema> & {
  onEvent?: (event: TeamCodexEvent) => Promise<void> | void;
};

export type CoderRoleOutput = z.infer<typeof coderOutputSchema>;

const buildCoderPrompt = ({ role, state, input }: z.infer<typeof coderInputSchema>): string => {
  return [
    `You are ${role.name}, a background lane role inside the ${state.teamName} engineering harness.`,
    `Owner: ${state.ownerName}.`,
    `Shared objective: ${state.objective}`,
    `Repository: ${state.repository.name} at ${state.repository.path}.`,
    `Dedicated branch: ${state.branchName}.`,
    `Base branch: ${state.baseBranch}.`,
    `Dedicated worktree: ${state.worktreePath}.`,
    state.implementationCommit
      ? `Implementation commit ready for review: ${state.implementationCommit}.`
      : null,
    `Lane index: ${state.laneIndex}.`,
    `Task title: ${state.taskTitle}.`,
    `Task objective: ${state.taskObjective}`,
    `Planner summary: ${state.planSummary}`,
    `Planner deliverable: ${state.planDeliverable}`,
    state.conflictNote ? `Planner note: ${state.conflictNote}` : null,
    `Workflow context: ${state.workflow.join(" -> ")}`,
    "Current handoffs:",
    summarizeHandoffs(state),
    `Current assignment input: ${input}`,
    "Codex skill context:",
    [
      "- `.codex/skills/team-harness-workflow/SKILL.md`",
      "- `.codex/skills/team-harness-workflow/references/lanes.md`",
      "- `.codex/skills/openspec-apply-change/SKILL.md`",
    ].join("\n"),
    "Repository instructions: read INSTRUCTIONS.md and AGENTS.md before changing code, use pnpm for scripts, and keep project text in English.",
    "Your role prompt is below:",
    role.prompt.trim(),
    "Execution rules:",
    "- Operate only inside the dedicated worktree and branch for this lane.",
    "- Use Codex CLI native repository tools and shell access to inspect, edit, and validate work.",
    "- Produce concrete repository changes before finishing.",
    '- Finish with decision "continue" after implementation exists for review.',
    "Final response requirements:",
    '- Your final response must match the provided JSON schema exactly.',
    '- Put the concise handoff in "summary" and the detailed notes in "deliverable".',
    '- For coder, set decision to "continue" and set pullRequestTitle and pullRequestSummary to null.',
  ]
    .filter(Boolean)
    .join("\n\n");
};

export const runCoderRole = async (
  input: CoderRoleInput,
  executor: TeamStructuredExecutor,
): Promise<CoderRoleOutput> => {
  const { onEvent, ...roleInput } = input;
  const parsedInput = coderInputSchema.parse(roleInput);

  return executor({
    worktreePath: parsedInput.state.worktreePath,
    prompt: buildCoderPrompt(parsedInput),
    responseSchema: coderOutputSchema,
    codexHomePrefix: "lane",
    onEvent,
  });
};
