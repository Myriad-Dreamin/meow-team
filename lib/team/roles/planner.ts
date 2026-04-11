import { z } from "zod";
import { teamConfig } from "@/team.config";
import type { TeamStructuredExecutor } from "@/lib/agent/executor";
import type { TeamRepositoryOption } from "@/lib/git/repository";
import { summarizeHandoffs } from "@/lib/team/agent-helpers";
import { buildOpenSpecSkillReference, describeLocalOpenSpecSkills } from "@/lib/team/openspec";
import type { RolePrompt } from "@/lib/team/prompts";
import {
  describeConventionalTitleMetadata,
  type ConventionalTitleMetadata,
} from "@/lib/team/request-title";
import { teamRoleDecisionSchema } from "@/lib/team/roles/schemas";
import type { TeamCodexEvent, TeamRoleHandoff } from "@/lib/team/types";

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
  requestText: string | null;
  latestInput: string | null;
};

export type PlannerRoleInput = {
  role: RolePrompt;
  worktreePath: string;
  state: PlannerRoleState;
  onEvent?: (event: TeamCodexEvent) => Promise<void> | void;
};

export type PlannerRoleOutput = z.infer<typeof plannerOutputSchema>;
type PlannerPromptInput = Omit<PlannerRoleInput, "onEvent">;

const buildLocalSkillReference = (): string => {
  return [
    "Local repo skills:",
    "- `.codex/skills/team-harness-workflow/SKILL.md`",
    "- `.codex/skills/team-harness-workflow/references/planner.md`",
    "- `.codex/skills/team-harness-workflow/references/lanes.md`",
    "- `skills/roadmap-maintainer/SKILL.md`",
    "- `docs/roadmap/index.md`",
  ].join("\n");
};

const buildPlannerRequestContext = (input: PlannerRoleState): string => {
  const sections: string[] = [];
  const latestInput = input.latestInput?.trim();
  const requestTitle = input.requestTitle?.trim();
  const requestText = input.requestText?.trim();
  const conventionalTitle = describeConventionalTitleMetadata(input.conventionalTitle);

  if (requestTitle) {
    sections.push(`Current request title: ${requestTitle}`);
  }

  if (conventionalTitle !== "none") {
    sections.push(`Current conventional title metadata: ${conventionalTitle}`);
  }

  if (requestText) {
    sections.push(`Raw request text:\n${requestText}`);
  }

  if (!latestInput) {
    sections.push(
      "Current assignment input: none recorded. Ask for clarification instead of inventing product requirements.",
    );
    return sections.join("\n\n");
  }

  sections.push(
    requestText && latestInput !== requestText
      ? `Current planning input:\n${latestInput}`
      : `Current assignment input:\n${latestInput}`,
  );

  return sections.join("\n\n");
};

const buildPlannerPrompt = ({ role, state }: PlannerPromptInput): string => {
  const repositoryContext = state.selectedRepository
    ? `Selected repository: ${state.selectedRepository.name} at ${state.selectedRepository.path}.`
    : "Selected repository: none. Proposal dispatch is blocked until a repository is selected.";

  return [
    `You are Planner, the dispatch coordinator inside the ${state.teamName} engineering harness.`,
    `Owner: ${state.ownerName}.`,
    `Shared objective: ${state.objective}`,
    repositoryContext,
    `Configured workflow: ${state.workflow.join(" -> ")}`,
    `Current assignment number: ${state.assignmentNumber}.`,
    `Configured coding-review pool size: ${teamConfig.dispatch.workerCount}.`,
    "Planner proposals are separate from the coding-review pool. The planner can create one or more proposals, then approved proposals are scheduled onto the shared coder/reviewer pool.",
    "Codex skill context:",
    buildLocalSkillReference(),
    "OpenSpec context:",
    describeLocalOpenSpecSkills(),
    buildOpenSpecSkillReference(),
    buildPlannerRequestContext(state),
    "Your role prompt is below:",
    role.prompt.trim(),
    "Current handoffs for this assignment:",
    summarizeHandoffs(state),
    "Rules:",
    `- Create a practical engineering plan and split it into between 1 and ${teamConfig.dispatch.maxProposalCount} concrete proposals for the request group when a repository is selected.`,
    "- Keep proposals logical and implementation-focused. Do not describe them as tied to a specific branch or worker slot.",
    "- Align each proposal with the local OpenSpec flow so the backend can materialize a real OpenSpec change for it.",
    "- Use branchPrefix as a short, git-friendly theme for the request group.",
    "- If no repository is selected, explain that dispatch is blocked and set dispatch to null.",
    "Final response requirements:",
    "- Return JSON that matches the provided schema exactly.",
    "- Put the planner handoff in handoff.summary and handoff.deliverable.",
    '- Set handoff.decision to "continue".',
    "- If dispatch is possible, fill dispatch.planSummary, dispatch.plannerDeliverable, dispatch.branchPrefix, and dispatch.tasks.",
  ].join("\n\n");
};

export class PlannerAgent {
  constructor(private readonly executor: TeamStructuredExecutor) {}

  async run(input: PlannerRoleInput): Promise<PlannerRoleOutput> {
    const { onEvent, ...roleInput } = input;

    return this.executor({
      worktreePath: roleInput.worktreePath,
      prompt: buildPlannerPrompt(roleInput),
      responseSchema: plannerOutputSchema,
      codexHomePrefix: "planner",
      onEvent,
    });
  }
}
