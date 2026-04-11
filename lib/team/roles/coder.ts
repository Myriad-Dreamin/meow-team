import { z } from "zod";
import type { TeamStructuredExecutor } from "@/lib/agent/executor";
import type { TeamRepositoryContext } from "@/lib/git/repository";
import { summarizeHandoffs } from "@/lib/team/agent-helpers";
import {
  describeConventionalTitleMetadata,
  type ConventionalTitleMetadata,
} from "@/lib/team/request-title";
import { teamRoleDecisionSchema } from "@/lib/team/roles/schemas";
import type { RolePrompt } from "@/lib/team/prompts";
import type { TeamCodexEvent, TeamRoleHandoff } from "@/lib/team/types";

const coderOutputSchema = z.object({
  summary: z.string().trim().min(1),
  deliverable: z.string().trim().min(1),
  decision: teamRoleDecisionSchema,
  pullRequestTitle: z.string().trim().min(1).nullable(),
  pullRequestSummary: z.string().trim().min(1).nullable(),
});

export type CoderRoleState = TeamRepositoryContext & {
  teamName: string;
  ownerName: string;
  objective: string;
  laneId: string;
  laneIndex: number;
  taskTitle: string;
  taskObjective: string;
  requestTitle: string;
  conventionalTitle: ConventionalTitleMetadata | null;
  planSummary: string;
  planDeliverable: string;
  conflictNote: string | null;
  workflow: string[];
  handoffs: Partial<Record<string, TeamRoleHandoff>>;
  handoffCounter: number;
  assignmentNumber: number;
};

export type CoderRoleInput = {
  role: RolePrompt;
  input: string;
  state: CoderRoleState;
  onEvent?: (event: TeamCodexEvent) => Promise<void> | void;
};

export type CoderRoleOutput = z.infer<typeof coderOutputSchema>;
type CoderPromptInput = Omit<CoderRoleInput, "onEvent">;

const buildCoderPrompt = ({ role, state, input }: CoderPromptInput): string => {
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
    `Canonical request title: ${state.requestTitle}.`,
    `Conventional title metadata: ${describeConventionalTitleMetadata(state.conventionalTitle)}.`,
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
      "- `skills/roadmap-maintainer/SKILL.md`",
      "- `docs/roadmap/index.md`",
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
    "- Your final response must match the provided JSON schema exactly.",
    '- Put the concise handoff in "summary" and the detailed notes in "deliverable".',
    '- For coder, set decision to "continue" and set pullRequestTitle and pullRequestSummary to null.',
  ]
    .filter(Boolean)
    .join("\n\n");
};

export class CoderAgent {
  constructor(private readonly executor: TeamStructuredExecutor) {}

  async run(input: CoderRoleInput): Promise<CoderRoleOutput> {
    const { onEvent, ...roleInput } = input;

    return this.executor({
      worktreePath: roleInput.state.worktreePath,
      prompt: buildCoderPrompt(roleInput),
      responseSchema: coderOutputSchema,
      codexHomePrefix: "lane",
      onEvent,
    });
  }
}
