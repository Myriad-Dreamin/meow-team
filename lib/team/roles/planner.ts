import { z } from "zod";
import { teamConfig } from "@/team.config";
import type { TeamStructuredExecutor } from "@/lib/agent/executor";
import type { TeamRepositoryOption } from "@/lib/git/repository";
import { summarizeHandoffs } from "@/lib/team/agent-helpers";
import type { Worktree } from "@/lib/team/coding/worktree";
import { buildOpenSpecSkillReference, describeLocalOpenSpecSkills } from "@/lib/team/openspec";
import {
  formatTeamExecutionModeLabel,
  parseExecutionModeInput,
  type TeamExecutionMode,
} from "@/lib/team/execution-mode";
import {
  describeConventionalTitleMetadata,
  type ConventionalTitleMetadata,
} from "@/lib/team/request-title";
import { teamRoleDecisionSchema } from "@/lib/team/roles/schemas";
import type { TeamCodexEvent, TeamRoleHandoff } from "@/lib/team/types";
import {
  frontmatter as plannerFrontmatter,
  prompt as renderPlannerPrompt,
  type Args as PlannerPromptArgs,
} from "./planner.prompt.md";
import { createTeamRoleDefinition } from "./metadata";

const plannerTaskSchema = z.object({
  title: z.string().trim().min(1),
  objective: z.string().trim().min(1),
});

const plannerDispatchSchema = z
  .object({
    planSummary: z.string().trim().min(1),
    plannerDeliverable: z.string().trim().min(1),
    branchPrefix: z.string().trim().min(1),
    tasks: z.array(plannerTaskSchema).min(1).max(teamConfig.dispatch.maxProposalCount),
  })
  .nullable();

const plannerOutputSchema = z.object({
  handoff: z.object({
    summary: z.string().trim().min(1),
    deliverable: z.string().trim().min(1),
    decision: teamRoleDecisionSchema,
  }),
  dispatch: plannerDispatchSchema,
});

export type PlannerRoleState = {
  teamName: string;
  ownerName: string;
  objective: string;
  selectedRepository: TeamRepositoryOption | null;
  workflow: string[];
  handoffs: Partial<Record<string, TeamRoleHandoff>>;
  handoffCounter: number;
  assignmentNumber: number;
  requestTitle: string | null;
  conventionalTitle: ConventionalTitleMetadata | null;
  executionMode?: TeamExecutionMode | null;
  requestText: string | null;
  latestInput: string | null;
};

export type PlannerRoleInput = {
  worktree: Worktree;
  state: PlannerRoleState;
  onEvent?: (event: TeamCodexEvent) => Promise<void> | void;
};

export type PlannerRoleOutput = z.infer<typeof plannerOutputSchema>;
type PlannerPromptInput = Omit<PlannerRoleInput, "onEvent">;

export const plannerRole = createTeamRoleDefinition({
  roleId: "planner",
  filePath: "lib/team/roles/planner.prompt.md",
  frontmatter: plannerFrontmatter,
});

const buildLocalSkillReference = (): string => {
  return [
    "Local repo skills:",
    "- `.codex/skills/team-harness-workflow/SKILL.md`",
    "- `.codex/skills/team-harness-workflow/references/planner.md`",
    "- `.codex/skills/team-harness-workflow/references/lanes.md`",
  ].join("\n");
};

const buildPlannerRequestContext = (input: PlannerRoleState): string => {
  const sections: string[] = [];
  const latestInput = input.latestInput?.trim();
  const requestTitle = input.requestTitle?.trim();
  const requestText = input.requestText?.trim();
  const conventionalTitle = describeConventionalTitleMetadata(input.conventionalTitle);
  const parsedLatestInput = parseExecutionModeInput(latestInput);
  const latestInputOnlyDiffersByPrefix = Boolean(
    input.executionMode &&
    requestText &&
    parsedLatestInput.executionMode === input.executionMode &&
    parsedLatestInput.requestText === requestText,
  );

  if (requestTitle) {
    sections.push(`Current request title: ${requestTitle}`);
  }

  if (conventionalTitle !== "none") {
    sections.push(`Current conventional title metadata: ${conventionalTitle}`);
  }

  if (input.executionMode) {
    sections.push(
      `Execute mode: ${formatTeamExecutionModeLabel(input.executionMode)} (strip the prefix from canonical titles, proposal titles, and branch-planning metadata).`,
    );
  }

  if (requestText) {
    sections.push(`Normalized request text:\n${requestText}`);
  }

  if (!latestInput) {
    sections.push(
      "Current assignment input: none recorded. Ask for clarification instead of inventing product requirements.",
    );
    return sections.join("\n\n");
  }

  if (!latestInputOnlyDiffersByPrefix) {
    sections.push(
      requestText && latestInput !== requestText
        ? `Current planning input:\n${latestInput}`
        : `Current assignment input:\n${latestInput}`,
    );
  }

  return sections.join("\n\n");
};

const buildPlannerPrompt = ({ state }: PlannerPromptInput): string => {
  const repositoryContext = state.selectedRepository
    ? `Selected repository: ${state.selectedRepository.name} at ${state.selectedRepository.path}.`
    : "Selected repository: none. Proposal dispatch is blocked until a repository is selected.";

  const templateArgs: PlannerPromptArgs = {
    assignmentNumber: state.assignmentNumber,
    handoffs: summarizeHandoffs(state),
    localSkillReference: buildLocalSkillReference(),
    maxProposalCount: teamConfig.dispatch.maxProposalCount,
    objective: state.objective,
    openSpecSkillReference: buildOpenSpecSkillReference(),
    openSpecSkills: describeLocalOpenSpecSkills(),
    ownerName: state.ownerName,
    repositoryContext,
    requestContext: buildPlannerRequestContext(state),
    teamName: state.teamName,
    workerCount: teamConfig.dispatch.workerCount,
    workflow: state.workflow.join(" -> "),
  };

  return renderPlannerPrompt(templateArgs);
};

export class PlannerAgent {
  constructor(private readonly executor: TeamStructuredExecutor) {}

  async run(input: PlannerRoleInput): Promise<PlannerRoleOutput> {
    const { onEvent, ...roleInput } = input;

    return this.executor({
      worktree: roleInput.worktree,
      prompt: buildPlannerPrompt(roleInput),
      responseSchema: plannerOutputSchema,
      codexHomePrefix: "planner",
      onEvent,
    });
  }
}
