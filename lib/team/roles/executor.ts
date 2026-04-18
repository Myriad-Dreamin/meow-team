import { z } from "zod";
import type { TeamStructuredExecutor } from "@/lib/agent/executor";
import type { TeamRepositoryContext } from "@/lib/git/repository";
import { summarizeHandoffs } from "@/lib/team/agent-helpers";
import {
  describeConventionalTitleMetadata,
  type ConventionalTitleMetadata,
} from "@/lib/team/request-title";
import { teamRoleDecisionSchema } from "@/lib/team/roles/schemas";
import type {
  TeamCodexEvent,
  TeamRoleHandoff,
  TeamWorkerLaneExecutionPhase,
} from "@/lib/team/types";
import type { TeamExecutionMode } from "@/lib/team/execution-mode";
import {
  frontmatter as executorFrontmatter,
  prompt as renderExecutorPrompt,
  type Args as ExecutorPromptArgs,
} from "./executor.prompt.md";
import { createTeamRoleDefinition } from "./metadata";

const executorOutputSchema = z.object({
  summary: z.string().trim().min(1),
  deliverable: z.string().trim().min(1),
  decision: teamRoleDecisionSchema,
  pullRequestTitle: z.string().trim().min(1).nullable(),
  pullRequestSummary: z.string().trim().min(1).nullable(),
});

export type ExecutorRoleState = TeamRepositoryContext & {
  teamName: string;
  ownerName: string;
  objective: string;
  laneId: string;
  laneIndex: number;
  executionPhase: TeamWorkerLaneExecutionPhase | null;
  executionMode: TeamExecutionMode;
  executionModeLabel: string;
  taskTitle: string;
  taskObjective: string;
  requestTitle: string;
  conventionalTitle: ConventionalTitleMetadata | null;
  planSummary: string;
  planDeliverable: string;
  conflictNote: string | null;
  archiveCommand: string | null;
  archivePathContext: string | null;
  guideInstructions: string;
  artifactContract: string;
  workflow: string[];
  handoffs: Partial<Record<string, TeamRoleHandoff>>;
  handoffCounter: number;
  assignmentNumber: number;
};

export type ExecutorRoleInput = {
  input: string;
  state: ExecutorRoleState;
  onEvent?: (event: TeamCodexEvent) => Promise<void> | void;
};

export type ExecutorRoleOutput = z.infer<typeof executorOutputSchema>;
type ExecutorPromptInput = Omit<ExecutorRoleInput, "onEvent">;

export const executorRole = createTeamRoleDefinition({
  roleId: "executor",
  filePath: "lib/team/roles/executor.prompt.md",
  frontmatter: executorFrontmatter,
});

const laneSkillReference = [
  "- `.codex/skills/team-harness-workflow/SKILL.md`",
  "- `.codex/skills/team-harness-workflow/references/lanes.md`",
  "- `.codex/skills/openspec-apply-change/SKILL.md`",
].join("\n");

const buildExecutorPrompt = ({ state, input }: ExecutorPromptInput): string => {
  const isFinalArchive = state.executionPhase === "final_archive";
  const finalArchiveSection = isFinalArchive
    ? [
        state.archiveCommand ? `Archive command: ${state.archiveCommand}.` : null,
        state.archivePathContext ? `Archive path context: ${state.archivePathContext}.` : null,
        "If you author a direct archive commit, use a lowercase `docs:` subject.",
        "Archive continuation: this is the final executor-only archive pass. Do not route back to execution-reviewer.",
      ]
        .filter(Boolean)
        .join("\n\n")
    : "";

  const templateArgs: ExecutorPromptArgs = {
    assignmentInput: input,
    artifactContract: state.artifactContract,
    baseBranch: state.baseBranch,
    branchName: state.branchName,
    codexSkillContext: laneSkillReference,
    conventionalTitle: describeConventionalTitleMetadata(state.conventionalTitle),
    executionModeLabel: state.executionModeLabel,
    executionPhase: state.executionPhase ?? "implementation",
    finalArchiveSection,
    guideInstructions: state.guideInstructions,
    handoffs: summarizeHandoffs(state),
    implementationCommitSection: state.implementationCommit
      ? `Implementation commit ready for review: ${state.implementationCommit}.`
      : "",
    laneIndex: state.laneIndex,
    objective: state.objective,
    ownerName: state.ownerName,
    planDeliverable: state.planDeliverable,
    planSummary: state.planSummary,
    plannerNoteSection: state.conflictNote ? `Planner note: ${state.conflictNote}` : "",
    repositoryName: state.repository.name,
    repositoryPath: state.repository.path,
    requestTitle: state.requestTitle,
    roleName: executorRole.name,
    taskObjective: state.taskObjective,
    taskTitle: state.taskTitle,
    teamName: state.teamName,
    workflow: state.workflow.join(" -> "),
    worktreePath: state.worktree.path,
  };

  return renderExecutorPrompt(templateArgs);
};

export class ExecutorAgent {
  constructor(private readonly executor: TeamStructuredExecutor) {}

  async run(input: ExecutorRoleInput): Promise<ExecutorRoleOutput> {
    const { onEvent, ...roleInput } = input;

    return this.executor({
      worktree: roleInput.state.worktree,
      prompt: buildExecutorPrompt(roleInput),
      responseSchema: executorOutputSchema,
      codexHomePrefix: "lane",
      onEvent,
    });
  }
}
