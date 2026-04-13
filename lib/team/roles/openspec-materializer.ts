import path from "node:path";
import { z } from "zod";
import type { TeamStructuredExecutor } from "@/lib/agent/executor";
import type { Worktree } from "@/lib/team/coding/worktree";
import { sanitizeBranchSegment } from "@/lib/team/git";
import {
  describeConventionalTitleMetadata,
  type ConventionalTitleMetadata,
} from "@/lib/team/request-title";
import type { TeamCodexEvent } from "@/lib/team/types";
import {
  prompt as renderOpenSpecMaterializerPrompt,
  type Args as OpenSpecMaterializerPromptArgs,
} from "./openspec-materializer.prompt.md";

const openSpecMaterializerOutputSchema = z.object({
  summary: z.string().trim().min(1),
  deliverable: z.string().trim().min(1),
  artifactsCreated: z.array(z.string().trim().min(1)).min(1),
});

const openSpecMaterializerSkillReference = [
  "- `.codex/skills/team-harness-workflow/SKILL.md`",
  "- `.codex/skills/team-harness-workflow/references/planner.md`",
  "- `.codex/skills/openspec-propose/SKILL.md`",
].join("\n");

const toPosixPath = (value: string): string => {
  return value.split(path.sep).join("/");
};

const buildOptionalSection = (label: string, value: string | null | undefined): string => {
  const trimmed = value?.trim();
  return trimmed ? `${label}:\n${trimmed}` : "";
};

export type OpenSpecMaterializerState = {
  repositoryPath: string;
  canonicalBranchName: string;
  proposalBranchName: string;
  proposalChangeName: string;
  proposalPath: string;
  requestTitle: string;
  conventionalTitle: ConventionalTitleMetadata | null;
  taskTitle: string;
  taskObjective: string;
  plannerSummary: string | null;
  plannerDeliverable: string | null;
  requestInput: string | null;
  worktreeRoot: string;
};

export type OpenSpecMaterializerInput = {
  worktree: Worktree;
  state: OpenSpecMaterializerState;
  onEvent?: (event: TeamCodexEvent) => Promise<void> | void;
};

export type OpenSpecMaterializerOutput = z.infer<typeof openSpecMaterializerOutputSchema>;

export const buildProposalCapabilityName = (proposalChangeName: string): string => {
  return sanitizeBranchSegment(proposalChangeName).replace(/\//g, "-");
};

export const buildExpectedOpenSpecArtifactPaths = ({
  proposalChangeName,
  proposalPath,
}: {
  proposalChangeName: string;
  proposalPath: string;
}): string[] => {
  const capabilityName = buildProposalCapabilityName(proposalChangeName);

  return [
    path.join(proposalPath, "proposal.md"),
    path.join(proposalPath, "design.md"),
    path.join(proposalPath, "tasks.md"),
    path.join(proposalPath, "specs", capabilityName, "spec.md"),
  ].map(toPosixPath);
};

const buildOpenSpecMaterializerPrompt = ({
  worktree,
  state,
}: OpenSpecMaterializerInput): string => {
  const templateArgs: OpenSpecMaterializerPromptArgs = {
    repositoryPath: state.repositoryPath,
    worktreePath: worktree.path,
    canonicalBranchName: state.canonicalBranchName,
    proposalBranchName: state.proposalBranchName,
    proposalChangeName: state.proposalChangeName,
    proposalPath: state.proposalPath,
    expectedArtifacts: buildExpectedOpenSpecArtifactPaths({
      proposalChangeName: state.proposalChangeName,
      proposalPath: state.proposalPath,
    })
      .map((artifactPath) => `- \`${artifactPath}\``)
      .join("\n"),
    worktreeRoot: state.worktreeRoot,
    requestTitle: state.requestTitle,
    conventionalTitle: describeConventionalTitleMetadata(state.conventionalTitle),
    taskTitle: state.taskTitle,
    taskObjective: state.taskObjective,
    plannerSummarySection: buildOptionalSection("Planner summary", state.plannerSummary),
    plannerDeliverableSection: buildOptionalSection(
      "Planner deliverable",
      state.plannerDeliverable,
    ),
    requestInputSection: buildOptionalSection("Original request input", state.requestInput),
    codexSkillContext: openSpecMaterializerSkillReference,
  };

  return renderOpenSpecMaterializerPrompt(templateArgs);
};

export class OpenSpecMaterializerAgent {
  constructor(private readonly executor: TeamStructuredExecutor) {}

  async run(input: OpenSpecMaterializerInput): Promise<OpenSpecMaterializerOutput> {
    const { onEvent, ...materializerInput } = input;

    return this.executor({
      worktree: materializerInput.worktree,
      prompt: buildOpenSpecMaterializerPrompt(materializerInput),
      responseSchema: openSpecMaterializerOutputSchema,
      codexHomePrefix: "openspec-materializer",
      onEvent,
    });
  }
}
