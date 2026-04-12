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
import type {
  TeamCodexEvent,
  TeamRoleHandoff,
  TeamWorkerLaneExecutionPhase,
} from "@/lib/team/types";
import { prompt as renderCoderPrompt, type Args as CoderPromptArgs } from "./coder.prompt.md";

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
  executionPhase: TeamWorkerLaneExecutionPhase | null;
  taskTitle: string;
  taskObjective: string;
  requestTitle: string;
  conventionalTitle: ConventionalTitleMetadata | null;
  planSummary: string;
  planDeliverable: string;
  conflictNote: string | null;
  archiveCommand: string | null;
  archivePathContext: string | null;
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

const laneSkillReference = [
  "- `.codex/skills/team-harness-workflow/SKILL.md`",
  "- `.codex/skills/team-harness-workflow/references/lanes.md`",
  "- `.codex/skills/openspec-apply-change/SKILL.md`",
].join("\n");

const buildCoderPrompt = ({ role, state, input }: CoderPromptInput): string => {
  const isFinalArchive = state.executionPhase === "final_archive";
  const finalArchiveSection = isFinalArchive
    ? [
        state.archiveCommand ? `Archive command: ${state.archiveCommand}.` : null,
        state.archivePathContext ? `Archive path context: ${state.archivePathContext}.` : null,
        "Archive continuation: this is the final coder-only archive pass. Do not route back to reviewer.",
      ]
        .filter(Boolean)
        .join("\n\n")
    : "";

  const templateArgs: CoderPromptArgs = {
    assignmentInput: input,
    baseBranch: state.baseBranch,
    branchName: state.branchName,
    codexSkillContext: laneSkillReference,
    conventionalTitle: describeConventionalTitleMetadata(state.conventionalTitle),
    executionPhase: state.executionPhase ?? "implementation",
    finalArchiveSection,
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
    roleName: role.name,
    rolePrompt: role.prompt.trim(),
    taskObjective: state.taskObjective,
    taskTitle: state.taskTitle,
    teamName: state.teamName,
    workflow: state.workflow.join(" -> "),
    worktreePath: state.worktreePath,
  };

  return renderCoderPrompt(templateArgs);
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
