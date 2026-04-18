import { z } from "zod";
import type { TeamStructuredExecutor } from "@/lib/agent/executor";
import type { TeamRepositoryContext } from "@/lib/git/repository";
import { summarizeHandoffs } from "@/lib/team/agent-helpers";
import { buildExecutionReviewerExecutionRules } from "@/lib/team/executing/guidance";
import {
  describeConventionalTitleMetadata,
  type ConventionalTitleMetadata,
} from "@/lib/team/request-title";
import { teamRoleDecisionSchema } from "@/lib/team/roles/schemas";
import type { TeamCodexEvent, TeamRoleHandoff } from "@/lib/team/types";
import type { TeamExecutionMode } from "@/lib/team/execution-mode";
import {
  frontmatter as executionReviewerFrontmatter,
  prompt as renderExecutionReviewerPrompt,
  type Args as ExecutionReviewerPromptArgs,
} from "./execution-reviewer.prompt.md";
import { createTeamRoleDefinition } from "./metadata";

const executionReviewerOutputSchema = z.object({
  summary: z.string().trim().min(1),
  deliverable: z.string().trim().min(1),
  decision: teamRoleDecisionSchema,
  pullRequestTitle: z.string().trim().min(1).nullable(),
  pullRequestSummary: z.string().trim().min(1).nullable(),
});

export type ExecutionReviewerRoleState = TeamRepositoryContext & {
  teamName: string;
  ownerName: string;
  objective: string;
  laneId: string;
  laneIndex: number;
  executionMode: TeamExecutionMode;
  executionModeLabel: string;
  taskTitle: string;
  taskObjective: string;
  requestTitle: string;
  conventionalTitle: ConventionalTitleMetadata | null;
  planSummary: string;
  planDeliverable: string;
  conflictNote: string | null;
  guideInstructions: string;
  artifactContract: string;
  workflow: string[];
  handoffs: Partial<Record<string, TeamRoleHandoff>>;
  handoffCounter: number;
  assignmentNumber: number;
};

export type ExecutionReviewerRoleInput = {
  input: string;
  state: ExecutionReviewerRoleState;
  onEvent?: (event: TeamCodexEvent) => Promise<void> | void;
};

export type ExecutionReviewerRoleOutput = z.infer<typeof executionReviewerOutputSchema>;
type ExecutionReviewerPromptInput = Omit<ExecutionReviewerRoleInput, "onEvent">;

export const executionReviewerRole = createTeamRoleDefinition({
  roleId: "execution-reviewer",
  filePath: "lib/team/roles/execution-reviewer.prompt.md",
  frontmatter: executionReviewerFrontmatter,
});

const laneSkillReference = [
  "- `.codex/skills/team-harness-workflow/SKILL.md`",
  "- `.codex/skills/team-harness-workflow/references/lanes.md`",
  "- `.codex/skills/openspec-apply-change/SKILL.md`",
].join("\n");

const buildExecutionReviewerPrompt = ({ state, input }: ExecutionReviewerPromptInput): string => {
  const templateArgs: ExecutionReviewerPromptArgs = {
    assignmentInput: input,
    artifactContract: state.artifactContract,
    baseBranch: state.baseBranch,
    branchName: state.branchName,
    codexSkillContext: laneSkillReference,
    conventionalTitle: describeConventionalTitleMetadata(state.conventionalTitle),
    executionModeLabel: state.executionModeLabel,
    guideInstructions: state.guideInstructions,
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
    reviewerExecutionRules: buildExecutionReviewerExecutionRules()
      .map((rule) => `- ${rule}`)
      .join("\n"),
    roleName: executionReviewerRole.name,
    taskObjective: state.taskObjective,
    taskTitle: state.taskTitle,
    teamName: state.teamName,
    workflow: state.workflow.join(" -> "),
    worktreePath: state.worktree.path,
  };

  return renderExecutionReviewerPrompt(templateArgs);
};

export class ExecutionReviewerAgent {
  constructor(private readonly executor: TeamStructuredExecutor) {}

  async run(input: ExecutionReviewerRoleInput): Promise<ExecutionReviewerRoleOutput> {
    const { onEvent, ...roleInput } = input;

    return this.executor({
      worktree: roleInput.state.worktree,
      prompt: buildExecutionReviewerPrompt(roleInput),
      responseSchema: executionReviewerOutputSchema,
      codexHomePrefix: "lane",
      onEvent,
    });
  }
}
