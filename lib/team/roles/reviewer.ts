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
import type { TeamCodexEvent, TeamRoleHandoff } from "@/lib/team/types";
import {
  frontmatter as reviewerFrontmatter,
  prompt as renderReviewerPrompt,
  type Args as ReviewerPromptArgs,
} from "./reviewer.prompt.md";
import { createTeamRoleDefinition } from "./metadata";

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
  input: string;
  state: ReviewerRoleState;
  onEvent?: (event: TeamCodexEvent) => Promise<void> | void;
};

export type ReviewerRoleOutput = z.infer<typeof reviewerOutputSchema>;
type ReviewerPromptInput = Omit<ReviewerRoleInput, "onEvent">;

export const reviewerRole = createTeamRoleDefinition({
  roleId: "reviewer",
  filePath: "lib/team/roles/reviewer.prompt.md",
  frontmatter: reviewerFrontmatter,
});

const laneSkillReference = [
  "- `.codex/skills/team-harness-workflow/SKILL.md`",
  "- `.codex/skills/team-harness-workflow/references/lanes.md`",
  "- `.codex/skills/openspec-apply-change/SKILL.md`",
].join("\n");

const buildReviewerPrompt = ({ state, input }: ReviewerPromptInput): string => {
  const templateArgs: ReviewerPromptArgs = {
    assignmentInput: input,
    baseBranch: state.baseBranch,
    branchName: state.branchName,
    codexSkillContext: laneSkillReference,
    conventionalTitle: describeConventionalTitleMetadata(state.conventionalTitle),
    handoffs: summarizeHandoffs(state),
    implementationCommitSection: state.implementationCommit
      ? `Implementation commit ready for review: ${state.implementationCommit}.`
      : "Implementation commit ready for review: none.",
    laneIndex: state.laneIndex,
    objective: state.objective,
    ownerName: state.ownerName,
    planDeliverable: state.planDeliverable,
    planSummary: state.planSummary,
    plannerNoteSection: state.conflictNote ? `Planner note: ${state.conflictNote}` : "",
    repositoryName: state.repository.name,
    repositoryPath: state.repository.path,
    requestTitle: state.requestTitle,
    reviewerExecutionRules: buildReviewerExecutionRules()
      .map((rule) => `- ${rule}`)
      .join("\n"),
    roleName: reviewerRole.name,
    taskObjective: state.taskObjective,
    taskTitle: state.taskTitle,
    teamName: state.teamName,
    workflow: state.workflow.join(" -> "),
    worktreePath: state.worktreePath,
  };

  return renderReviewerPrompt(templateArgs);
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
