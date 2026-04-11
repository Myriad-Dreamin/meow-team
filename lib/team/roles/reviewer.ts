import { z } from "zod";
import type { TeamStructuredExecutor } from "@/lib/agent/executor";
import type { TeamRepositoryContext } from "@/lib/git/repository";
import { summarizeHandoffs } from "@/lib/team/agent-helpers";
import { buildReviewerExecutionRules } from "@/lib/team/reviewer-guidance";
import {
  describeConventionalTitleMetadata,
  type ConventionalTitleMetadata,
} from "@/lib/team/request-title";
import { teamRoleDecisionSchema } from "@/lib/team/roles/schemas";
import type { RolePrompt } from "@/lib/team/prompts";
import type { TeamCodexEvent, TeamRoleHandoff } from "@/lib/team/types";

const reviewerOutputSchema = z.object({
  summary: z.string().trim().min(1),
  deliverable: z.string().trim().min(1),
  decision: teamRoleDecisionSchema,
  pullRequestTitle: z.string().trim().min(1).nullable(),
  pullRequestSummary: z.string().trim().min(1).nullable(),
});

export type ReviewerRoleState = TeamRepositoryContext & {
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

export type ReviewerRoleInput = {
  role: RolePrompt;
  input: string;
  state: ReviewerRoleState;
  onEvent?: (event: TeamCodexEvent) => Promise<void> | void;
};

export type ReviewerRoleOutput = z.infer<typeof reviewerOutputSchema>;
type ReviewerPromptInput = Omit<ReviewerRoleInput, "onEvent">;

const buildReviewerPrompt = ({ role, state, input }: ReviewerPromptInput): string => {
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
      : "Implementation commit ready for review: none.",
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
    ].join("\n"),
    "Repository instructions: read INSTRUCTIONS.md and AGENTS.md before changing code, use pnpm for scripts, and keep project text in English.",
    "Your role prompt is below:",
    role.prompt.trim(),
    "Execution rules:",
    "- Operate only inside the dedicated worktree and branch for this lane.",
    "- Use Codex CLI native repository tools and shell access to inspect, edit, and validate work.",
    ...buildReviewerExecutionRules().map((rule) => `- ${rule}`),
    "Final response requirements:",
    "- Your final response must match the provided JSON schema exactly.",
    '- Put the concise handoff in "summary" and the detailed notes in "deliverable".',
    '- For reviewer, set decision to "approved" or "needs_revision". If approved, fill both pullRequestTitle and pullRequestSummary. The harness will normalize the final PR title to the shared conventional format. If not approved, set both pullRequestTitle and pullRequestSummary to null.',
  ]
    .filter(Boolean)
    .join("\n\n");
};

export class ReviewerAgent {
  constructor(private readonly executor: TeamStructuredExecutor) {}

  async run(input: ReviewerRoleInput): Promise<ReviewerRoleOutput> {
    const { onEvent, ...roleInput } = input;

    return this.executor({
      worktreePath: roleInput.state.worktreePath,
      prompt: buildReviewerPrompt(roleInput),
      responseSchema: reviewerOutputSchema,
      codexHomePrefix: "lane",
      onEvent,
    });
  }
}
