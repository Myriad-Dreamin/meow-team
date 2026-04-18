import { promises as fs } from "node:fs";
import path from "node:path";
import {
  buildExecutionModeGuidePath,
  formatTeamExecutionModeLabel,
  type TeamExecutionMode,
} from "@/lib/team/execution-mode";
import { reviewerSuggestionFollowUpOptions } from "@/lib/team/reviewer-guidance";

export type ExecutionGuideContext = {
  executionMode: TeamExecutionMode;
  executionModeLabel: string;
  requestedGuidePath: string;
  selectedGuidePath: string;
  usedAgentsFallback: boolean;
};

const hasFileAtPath = async (candidatePath: string): Promise<boolean> => {
  try {
    return (await fs.stat(candidatePath)).isFile();
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;

    if (code === "ENOENT" || code === "ENOTDIR") {
      return false;
    }

    throw error;
  }
};

export const resolveExecutionGuideContext = async ({
  worktreePath,
  executionMode,
}: {
  worktreePath: string;
  executionMode: TeamExecutionMode;
}): Promise<ExecutionGuideContext> => {
  const requestedGuidePath = buildExecutionModeGuidePath(executionMode);

  if (await hasFileAtPath(path.join(worktreePath, requestedGuidePath))) {
    return {
      executionMode,
      executionModeLabel: formatTeamExecutionModeLabel(executionMode),
      requestedGuidePath,
      selectedGuidePath: requestedGuidePath,
      usedAgentsFallback: false,
    };
  }

  return {
    executionMode,
    executionModeLabel: formatTeamExecutionModeLabel(executionMode),
    requestedGuidePath,
    selectedGuidePath: "AGENTS.md",
    usedAgentsFallback: true,
  };
};

export const buildExecutionGuideInstructions = ({
  executionMode,
  requestedGuidePath,
  selectedGuidePath,
  usedAgentsFallback,
}: ExecutionGuideContext): string => {
  if (usedAgentsFallback) {
    return [
      `Subtype guide lookup: ${requestedGuidePath} was not found in this repository.`,
      `Inspect ${selectedGuidePath} for ${executionMode} guidance before making changes.`,
    ].join("\n");
  }

  return [
    `Subtype guide lookup: inspect ${selectedGuidePath} before making changes.`,
    `Use it as the primary ${executionMode} operating guide for this lane.`,
  ].join("\n");
};

export const buildExecutionArtifactContract = (executionMode: TeamExecutionMode): string => {
  return [
    `Execution artifact contract for ${formatTeamExecutionModeLabel(executionMode)} lanes:`,
    "- Commit the scripts or automation changes that perform the run.",
    "- Commit either a validator artifact or document a reproducible validation command in the branch.",
    "- Commit a summary artifact that records output paths, formats, or key results even when raw data is gitignored.",
  ].join("\n");
};

export const buildExecutionReviewerExecutionRules = (): string[] => {
  return [
    "Review with a script-and-data validation mindset instead of a code-style-only pass.",
    "Reject changes that lack committed execution scripts, a validator or reproducible validation command, or a committed summary artifact.",
    "Approve only when the execution artifacts are reproducible and review-ready.",
    "When you give any suggestion or request changes, include one concrete follow-up artifact with the feedback.",
    `Preferred follow-up artifact: ${reviewerSuggestionFollowUpOptions.proofOfConceptTest}`,
    `Fallback follow-up artifact: ${reviewerSuggestionFollowUpOptions.reviewerTodo}`,
  ];
};
