import "server-only";

import { promises as fs } from "node:fs";
import path from "node:path";
import { runOpenSpec } from "@/lib/cli-tools/openspec";
import {
  commitWorktreeChanges,
  ensureBranchRef,
  hasWorktreeChanges,
  listWorktreeChanges,
} from "@/lib/git/ops";
import { createWorktree } from "@/lib/team/coding/worktree";
import { ensureLaneWorktree, sanitizeBranchSegment } from "@/lib/team/git";
import type { ConventionalTitleMetadata } from "@/lib/team/request-title";
import {
  buildExpectedOpenSpecArtifactPaths,
  type OpenSpecMaterializerAgent,
} from "@/lib/team/roles/openspec-materializer";
import type { TeamCodexEvent, TeamWorkerLaneRecord } from "@/lib/team/types";

type ProposalLane = Pick<
  TeamWorkerLaneRecord,
  "laneIndex" | "taskTitle" | "taskObjective" | "proposalChangeName" | "proposalPath" | "branchName"
>;

const toPosixPath = (value: string): string => {
  return value.split(path.sep).join("/");
};

const normalizeChangedPath = (value: string): string => {
  return toPosixPath(value).replace(/^\.\//, "").replace(/\/+$/, "");
};

const ensureOpenSpecChange = async ({
  worktreePath,
  proposalChangeName,
}: {
  worktreePath: string;
  proposalChangeName: string;
}): Promise<void> => {
  const changeConfigPath = path.join(
    worktreePath,
    "openspec",
    "changes",
    proposalChangeName,
    ".openspec.yaml",
  );

  try {
    await fs.access(changeConfigPath);
    return;
  } catch {
    await runOpenSpec(worktreePath, ["new", "change", proposalChangeName]);
  }
};

const assertMaterializedOpenSpecArtifacts = async ({
  worktreePath,
  proposalChangeName,
  proposalPath,
  reportedArtifacts,
}: {
  worktreePath: string;
  proposalChangeName: string;
  proposalPath: string;
  reportedArtifacts: string[];
}): Promise<void> => {
  const expectedArtifacts = buildExpectedOpenSpecArtifactPaths({
    proposalChangeName,
    proposalPath,
  });

  const missingArtifacts = (
    await Promise.all(
      expectedArtifacts.map(async (artifactPath) => {
        try {
          await fs.access(path.join(worktreePath, artifactPath));
          return null;
        } catch {
          return artifactPath;
        }
      }),
    )
  ).filter((artifactPath): artifactPath is string => Boolean(artifactPath));

  if (missingArtifacts.length === 0) {
    return;
  }

  const reportedArtifactNote = reportedArtifacts.length
    ? ` Reported artifacts: ${reportedArtifacts.join(", ")}.`
    : "";

  throw new Error(
    `OpenSpec materializer did not produce the expected artifacts for ${proposalChangeName}: ${missingArtifacts.join(
      ", ",
    )}.${reportedArtifactNote}`,
  );
};

const assertOnlyExpectedProposalChangesRemain = async ({
  worktreePath,
  proposalChangeName,
  allowedProposalPaths,
}: {
  worktreePath: string;
  proposalChangeName: string;
  allowedProposalPaths: string[];
}): Promise<void> => {
  const allowedRoots = allowedProposalPaths.map(
    (proposalPath) => `${normalizeChangedPath(proposalPath)}/`,
  );
  const unexpectedPaths = (await listWorktreeChanges(worktreePath))
    .map(normalizeChangedPath)
    .filter(
      (changedPath) =>
        !allowedRoots.some(
          (allowedRoot) =>
            changedPath === allowedRoot.slice(0, -1) || changedPath.startsWith(allowedRoot),
        ),
    );

  if (unexpectedPaths.length === 0) {
    return;
  }

  throw new Error(
    `OpenSpec materializer left unexpected planner worktree changes for ${proposalChangeName}: ${unexpectedPaths.join(
      ", ",
    )}.`,
  );
};

export const buildProposalChangeName = ({
  branchPrefix,
  assignmentNumber,
  laneIndex,
  taskTitle,
}: {
  branchPrefix: string;
  assignmentNumber: number;
  laneIndex: number;
  taskTitle: string;
}): string => {
  const titleSegment = sanitizeBranchSegment(taskTitle).replace(/\//g, "-");
  const suffix = titleSegment ? `-${titleSegment}` : "";
  return sanitizeBranchSegment(`${branchPrefix}-a${assignmentNumber}-p${laneIndex}${suffix}`).slice(
    0,
    72,
  );
};

export const buildProposalPath = (proposalChangeName: string): string => {
  return path.join("openspec", "changes", proposalChangeName);
};

export const materializeAssignmentProposals = async ({
  repositoryPath,
  baseBranch,
  canonicalBranchName,
  requestTitle,
  conventionalTitle,
  plannerSummary,
  plannerDeliverable,
  requestInput,
  worktreeRoot,
  plannerWorktreePath,
  lanes,
  openSpecMaterializerAgent,
  onEvent,
}: {
  repositoryPath: string;
  baseBranch: string;
  canonicalBranchName: string;
  requestTitle: string;
  conventionalTitle: ConventionalTitleMetadata | null;
  plannerSummary: string | null;
  plannerDeliverable: string | null;
  requestInput: string | null;
  worktreeRoot: string;
  plannerWorktreePath: string;
  lanes: ProposalLane[];
  openSpecMaterializerAgent: Pick<OpenSpecMaterializerAgent, "run">;
  onEvent?: (event: TeamCodexEvent) => Promise<void> | void;
}): Promise<void> => {
  const activeLanes = lanes.filter(
    (
      lane,
    ): lane is ProposalLane & {
      proposalChangeName: string;
      proposalPath: string;
      branchName: string;
      taskTitle: string;
      taskObjective: string;
    } =>
      Boolean(
        lane.taskTitle &&
        lane.taskObjective &&
        lane.proposalChangeName &&
        lane.proposalPath &&
        lane.branchName,
      ),
  );

  if (activeLanes.length === 0) {
    return;
  }

  await ensureLaneWorktree({
    repositoryPath,
    worktreeRoot,
    worktreePath: plannerWorktreePath,
    branchName: canonicalBranchName,
    startPoint: baseBranch,
  });
  const plannerWorktree = createWorktree({
    path: plannerWorktreePath,
    rootPath: worktreeRoot,
  });
  const allowedProposalPaths: string[] = [];

  for (const lane of activeLanes) {
    await ensureOpenSpecChange({
      worktreePath: plannerWorktreePath,
      proposalChangeName: lane.proposalChangeName,
    });
    const materializerResult = await openSpecMaterializerAgent.run({
      worktree: plannerWorktree,
      state: {
        repositoryPath,
        canonicalBranchName,
        proposalBranchName: lane.branchName,
        proposalChangeName: lane.proposalChangeName,
        proposalPath: lane.proposalPath,
        requestTitle,
        conventionalTitle,
        taskTitle: lane.taskTitle,
        taskObjective: lane.taskObjective,
        plannerSummary,
        plannerDeliverable,
        requestInput,
        worktreeRoot,
      },
      onEvent,
    });
    await assertMaterializedOpenSpecArtifacts({
      worktreePath: plannerWorktreePath,
      proposalChangeName: lane.proposalChangeName,
      proposalPath: lane.proposalPath,
      reportedArtifacts: materializerResult.artifactsCreated,
    });
    allowedProposalPaths.push(lane.proposalPath);
    await assertOnlyExpectedProposalChangesRemain({
      worktreePath: plannerWorktreePath,
      proposalChangeName: lane.proposalChangeName,
      allowedProposalPaths,
    });
  }

  if (await hasWorktreeChanges(plannerWorktreePath)) {
    await commitWorktreeChanges({
      worktreePath: plannerWorktreePath,
      message: `planner: add openspec proposals for ${canonicalBranchName}`,
      pathspecs: activeLanes.map((lane) => lane.proposalPath),
    });
  }

  for (const lane of activeLanes) {
    await ensureBranchRef({
      repositoryPath,
      branchName: lane.branchName,
      startPoint: canonicalBranchName,
      forceUpdate: true,
    });
  }
};

export const describeLocalOpenSpecSkills = (): string => {
  return [
    "Local OpenSpec skills are installed under `.codex/skills`.",
    "- `openspec-propose`: create a change with proposal, design, specs, and tasks.",
    "- `openspec-explore`: think through requirements before implementation.",
    "- `openspec-apply-change`: implement tasks from an existing OpenSpec change.",
    "Planner output should align with `openspec-propose`, so each proposal can be materialized as a real OpenSpec change.",
  ].join("\n");
};

export const buildOpenSpecSkillReference = (): string => {
  return [
    "Relevant local skill files:",
    "- `.codex/skills/openspec-propose/SKILL.md`",
    "- `.codex/skills/openspec-explore/SKILL.md`",
    "- `.codex/skills/openspec-apply-change/SKILL.md`",
  ].join("\n");
};
