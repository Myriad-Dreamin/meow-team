import "server-only";

import { createHash } from "node:crypto";
import { promises as fs, type Dirent } from "node:fs";
import path from "node:path";
import { runOpenSpec } from "@/lib/cli-tools/openspec";
import {
  commitContainsPath,
  commitWorktreeChanges,
  ensureBranchRef,
  getBranchHead,
  hasWorktreeChanges,
  listCommittedPathsBetweenRevisions,
  listExistingBranches,
  listWorktreeChanges,
} from "@/lib/git/ops";
import { formatHarnessCommitMessage } from "@/lib/team/commit-message";
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
  | "laneIndex"
  | "taskTitle"
  | "taskObjective"
  | "proposalChangeName"
  | "proposalPath"
  | "proposalCommitHash"
  | "branchName"
>;

type ActiveProposalLane = ProposalLane & {
  proposalChangeName: string;
  proposalPath: string;
  branchName: string;
  taskTitle: string;
  taskObjective: string;
};

type MaterializedProposalSnapshot = {
  proposalPath: string;
  fileFingerprints: Record<string, string>;
};

type MaterializationGitState = {
  plannerHeadCommit: string;
  managedBranchHeads: Record<string, string | null>;
};

const toPosixPath = (value: string): string => {
  return value.split(path.sep).join("/");
};

const normalizeChangedPath = (value: string): string => {
  return toPosixPath(value).replace(/^\.\//, "").replace(/\/+$/, "");
};

const isPathWithinProposalPath = (changedPath: string, proposalPath: string): boolean => {
  const normalizedProposalPath = normalizeChangedPath(proposalPath);
  return (
    changedPath === normalizedProposalPath || changedPath.startsWith(`${normalizedProposalPath}/`)
  );
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

const resetProposalMaterializationTarget = async ({
  worktreePath,
  proposalPath,
}: {
  worktreePath: string;
  proposalPath: string;
}): Promise<void> => {
  await fs.rm(path.join(worktreePath, proposalPath), {
    recursive: true,
    force: true,
  });
};

const hasFileAtPath = async (filePath: string): Promise<boolean> => {
  try {
    return (await fs.stat(filePath)).isFile();
  } catch (error) {
    const errorCode = (error as NodeJS.ErrnoException).code;

    if (errorCode === "ENOENT" || errorCode === "ENOTDIR") {
      return false;
    }

    throw error;
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
  const expectedArtifacts = [
    path.join(proposalPath, ".openspec.yaml"),
    ...buildExpectedOpenSpecArtifactPaths({
      proposalChangeName,
      proposalPath,
    }),
  ].map(toPosixPath);

  const missingArtifacts = (
    await Promise.all(
      expectedArtifacts.map(async (artifactPath) => {
        return (await hasFileAtPath(path.join(worktreePath, artifactPath))) ? null : artifactPath;
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

const listNormalizedWorktreeChanges = async (worktreePath: string): Promise<string[]> => {
  return (await listWorktreeChanges(worktreePath)).map(normalizeChangedPath);
};

const calculateChangedPathDelta = ({
  beforePaths,
  afterPaths,
}: {
  beforePaths: string[];
  afterPaths: string[];
}): string[] => {
  const beforePathSet = new Set(beforePaths);
  const afterPathSet = new Set(afterPaths);

  return Array.from(
    new Set([
      ...beforePaths.filter((changedPath) => !afterPathSet.has(changedPath)),
      ...afterPaths.filter((changedPath) => !beforePathSet.has(changedPath)),
    ]),
  ).sort((left, right) => {
    if (left === right) {
      return 0;
    }

    return left < right ? -1 : 1;
  });
};

const assertProposalChangeDeltaIsIsolated = ({
  changedPaths,
  proposalChangeName,
  proposalPath,
}: {
  changedPaths: string[];
  proposalChangeName: string;
  proposalPath: string;
}): void => {
  const unexpectedPaths = changedPaths.filter(
    (changedPath) => !isPathWithinProposalPath(changedPath, proposalPath),
  );

  if (unexpectedPaths.length === 0) {
    return;
  }

  throw new Error(
    `OpenSpec materializer changed planner worktree paths outside ${proposalChangeName}: ${unexpectedPaths.join(
      ", ",
    )}.`,
  );
};

const captureMaterializationGitState = async ({
  repositoryPath,
  plannerWorktreePath,
  managedBranchNames,
}: {
  repositoryPath: string;
  plannerWorktreePath: string;
  managedBranchNames: string[];
}): Promise<MaterializationGitState> => {
  const uniqueManagedBranchNames = Array.from(
    new Set(
      managedBranchNames
        .map((branchName) => branchName.trim())
        .filter((branchName): branchName is string => branchName.length > 0),
    ),
  ).sort((left, right) => {
    if (left === right) {
      return 0;
    }

    return left < right ? -1 : 1;
  });
  const plannerHeadCommit = await getBranchHead({
    repositoryPath: plannerWorktreePath,
    branchName: "HEAD",
  });

  if (uniqueManagedBranchNames.length === 0) {
    return {
      plannerHeadCommit,
      managedBranchHeads: {},
    };
  }

  const existingManagedBranches = new Set(
    await listExistingBranches({
      repositoryPath,
      branchNames: uniqueManagedBranchNames,
    }),
  );
  const managedBranchHeadEntries = await Promise.all(
    uniqueManagedBranchNames.map(async (branchName) => {
      if (!existingManagedBranches.has(branchName)) {
        return [branchName, null] as const;
      }

      return [
        branchName,
        await getBranchHead({
          repositoryPath,
          branchName,
        }),
      ] as const;
    }),
  );

  return {
    plannerHeadCommit,
    managedBranchHeads: Object.fromEntries(managedBranchHeadEntries),
  };
};

const formatGitHeadReference = (gitHead: string | null): string => {
  return gitHead ? gitHead.slice(0, 12) : "missing";
};

const assertMaterializationManagedBranchRefsRemainUnchanged = ({
  beforeState,
  afterState,
  proposalChangeName,
}: {
  beforeState: MaterializationGitState;
  afterState: MaterializationGitState;
  proposalChangeName: string;
}): void => {
  const mutatedManagedBranches = Object.keys(beforeState.managedBranchHeads).filter(
    (branchName) =>
      beforeState.managedBranchHeads[branchName] !== afterState.managedBranchHeads[branchName],
  );

  if (mutatedManagedBranches.length === 0) {
    return;
  }

  throw new Error(
    `OpenSpec materializer must not update planner-managed branch refs while materializing ${proposalChangeName}: ${mutatedManagedBranches
      .map((branchName) => {
        return `${branchName} (${formatGitHeadReference(
          beforeState.managedBranchHeads[branchName],
        )} -> ${formatGitHeadReference(afterState.managedBranchHeads[branchName])})`;
      })
      .join(", ")}.`,
  );
};

const mergeChangedPaths = (...pathGroups: string[][]): string[] => {
  return Array.from(new Set(pathGroups.flat().map(normalizeChangedPath))).sort((left, right) => {
    if (left === right) {
      return 0;
    }

    return left < right ? -1 : 1;
  });
};

const listMaterializationChangedPaths = async ({
  plannerWorktreePath,
  beforePlannerHeadCommit,
  afterPlannerHeadCommit,
  beforePaths,
  afterPaths,
}: {
  plannerWorktreePath: string;
  beforePlannerHeadCommit: string;
  afterPlannerHeadCommit: string;
  beforePaths: string[];
  afterPaths: string[];
}): Promise<string[]> => {
  const uncommittedChangedPaths = calculateChangedPathDelta({
    beforePaths,
    afterPaths,
  });
  const committedChangedPaths = await listCommittedPathsBetweenRevisions({
    repositoryPath: plannerWorktreePath,
    fromRevision: beforePlannerHeadCommit,
    toRevision: afterPlannerHeadCommit,
  });

  return mergeChangedPaths(uncommittedChangedPaths, committedChangedPaths);
};

const hashFileAtPath = async (filePath: string): Promise<string> => {
  const content = await fs.readFile(filePath);
  return createHash("sha256").update(content).digest("hex");
};

const listFilesRecursively = async (directoryPath: string): Promise<string[]> => {
  let entries: Dirent[];

  try {
    entries = await fs.readdir(directoryPath, {
      withFileTypes: true,
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }

    throw error;
  }

  const nestedPaths = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directoryPath, entry.name);

      if (entry.isDirectory()) {
        return listFilesRecursively(entryPath);
      }

      if (entry.isFile()) {
        return [entryPath];
      }

      return [];
    }),
  );

  return nestedPaths.flat();
};

const captureProposalSnapshot = async ({
  worktreePath,
  proposalPath,
}: {
  worktreePath: string;
  proposalPath: string;
}): Promise<MaterializedProposalSnapshot> => {
  const absoluteProposalPath = path.join(worktreePath, proposalPath);
  const filePaths = (await listFilesRecursively(absoluteProposalPath)).sort((left, right) => {
    if (left === right) {
      return 0;
    }

    return left < right ? -1 : 1;
  });
  const fileFingerprintEntries = await Promise.all(
    filePaths.map(async (absoluteFilePath) => {
      const relativeFilePath = toPosixPath(path.relative(worktreePath, absoluteFilePath));
      return [relativeFilePath, await hashFileAtPath(absoluteFilePath)] as const;
    }),
  );

  return {
    proposalPath,
    fileFingerprints: Object.fromEntries(fileFingerprintEntries),
  };
};

const assertPriorProposalSnapshotsRemainUnchanged = async ({
  worktreePath,
  proposalChangeName,
  priorSnapshots,
}: {
  worktreePath: string;
  proposalChangeName: string;
  priorSnapshots: MaterializedProposalSnapshot[];
}): Promise<void> => {
  const mutatedPaths: string[] = [];

  for (const priorSnapshot of priorSnapshots) {
    const currentSnapshot = await captureProposalSnapshot({
      worktreePath,
      proposalPath: priorSnapshot.proposalPath,
    });
    const trackedPaths = Array.from(
      new Set([
        ...Object.keys(priorSnapshot.fileFingerprints),
        ...Object.keys(currentSnapshot.fileFingerprints),
      ]),
    ).sort((left, right) => {
      if (left === right) {
        return 0;
      }

      return left < right ? -1 : 1;
    });

    for (const trackedPath of trackedPaths) {
      if (
        priorSnapshot.fileFingerprints[trackedPath] !==
        currentSnapshot.fileFingerprints[trackedPath]
      ) {
        mutatedPaths.push(trackedPath);
      }
    }
  }

  const uniqueMutatedPaths = Array.from(new Set(mutatedPaths));

  if (uniqueMutatedPaths.length === 0) {
    return;
  }

  throw new Error(
    `OpenSpec materializer modified previously materialized planner artifacts while processing ${proposalChangeName}: ${uniqueMutatedPaths.join(
      ", ",
    )}.`,
  );
};

const assertProposalCommitContainsExpectedArtifacts = async ({
  worktreePath,
  proposalCommitHash,
  lanes,
}: {
  worktreePath: string;
  proposalCommitHash: string;
  lanes: ActiveProposalLane[];
}): Promise<void> => {
  for (const lane of lanes) {
    const expectedArtifacts = [
      path.join(lane.proposalPath, ".openspec.yaml"),
      ...buildExpectedOpenSpecArtifactPaths({
        proposalChangeName: lane.proposalChangeName,
        proposalPath: lane.proposalPath,
      }),
    ].map(toPosixPath);

    const missingArtifacts = (
      await Promise.all(
        expectedArtifacts.map(async (artifactPath) => {
          return (await commitContainsPath({
            repositoryPath: worktreePath,
            revision: proposalCommitHash,
            relativePath: artifactPath,
          }))
            ? null
            : artifactPath;
        }),
      )
    ).filter((artifactPath): artifactPath is string => Boolean(artifactPath));

    if (missingArtifacts.length === 0) {
      continue;
    }

    throw new Error(
      `OpenSpec materialization must end with a proposal commit containing the expected artifacts for ${lane.proposalChangeName}: ${missingArtifacts.join(
        ", ",
      )}. Final commit: ${formatGitHeadReference(proposalCommitHash)}.`,
    );
  }
};

const finalizeProposalCommitHash = async ({
  plannerWorktreePath,
  canonicalBranchName,
  lanes,
}: {
  plannerWorktreePath: string;
  canonicalBranchName: string;
  lanes: ActiveProposalLane[];
}): Promise<string> => {
  if (await hasWorktreeChanges(plannerWorktreePath)) {
    await commitWorktreeChanges({
      worktreePath: plannerWorktreePath,
      message: formatHarnessCommitMessage({
        intent: "proposal",
        summary: `add openspec proposals for ${canonicalBranchName}`,
      }),
      pathspecs: lanes.map((lane) => lane.proposalPath),
    });
  }

  const proposalCommitHash = await getBranchHead({
    repositoryPath: plannerWorktreePath,
    branchName: "HEAD",
  });

  await assertProposalCommitContainsExpectedArtifacts({
    worktreePath: plannerWorktreePath,
    proposalCommitHash,
    lanes,
  });

  return proposalCommitHash;
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
  const activeLanes = lanes.filter((lane): lane is ActiveProposalLane =>
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
  const materializedProposalSnapshots: MaterializedProposalSnapshot[] = [];
  const managedBranchNames = activeLanes.map((lane) => lane.branchName);

  for (const lane of activeLanes) {
    const changedPathsBeforeMaterialization =
      await listNormalizedWorktreeChanges(plannerWorktreePath);

    await resetProposalMaterializationTarget({
      worktreePath: plannerWorktreePath,
      proposalPath: lane.proposalPath,
    });
    await ensureOpenSpecChange({
      worktreePath: plannerWorktreePath,
      proposalChangeName: lane.proposalChangeName,
    });
    const materializationGitStateBefore = await captureMaterializationGitState({
      repositoryPath,
      plannerWorktreePath,
      managedBranchNames,
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
    const materializationGitStateAfter = await captureMaterializationGitState({
      repositoryPath,
      plannerWorktreePath,
      managedBranchNames,
    });
    assertMaterializationManagedBranchRefsRemainUnchanged({
      beforeState: materializationGitStateBefore,
      afterState: materializationGitStateAfter,
      proposalChangeName: lane.proposalChangeName,
    });
    const changedPathsAfterMaterialization =
      await listNormalizedWorktreeChanges(plannerWorktreePath);
    const proposalChangeDelta = await listMaterializationChangedPaths({
      plannerWorktreePath,
      beforePlannerHeadCommit: materializationGitStateBefore.plannerHeadCommit,
      afterPlannerHeadCommit: materializationGitStateAfter.plannerHeadCommit,
      beforePaths: changedPathsBeforeMaterialization,
      afterPaths: changedPathsAfterMaterialization,
    });
    await assertProposalChangeDeltaIsIsolated({
      changedPaths: proposalChangeDelta,
      proposalChangeName: lane.proposalChangeName,
      proposalPath: lane.proposalPath,
    });
    await assertPriorProposalSnapshotsRemainUnchanged({
      worktreePath: plannerWorktreePath,
      proposalChangeName: lane.proposalChangeName,
      priorSnapshots: materializedProposalSnapshots,
    });
    materializedProposalSnapshots.push(
      await captureProposalSnapshot({
        worktreePath: plannerWorktreePath,
        proposalPath: lane.proposalPath,
      }),
    );
  }

  const proposalCommitHash = await finalizeProposalCommitHash({
    plannerWorktreePath,
    canonicalBranchName,
    lanes: activeLanes,
  });

  for (const lane of activeLanes) {
    lane.proposalCommitHash = proposalCommitHash;
    await ensureBranchRef({
      repositoryPath,
      branchName: lane.branchName,
      startPoint: proposalCommitHash,
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
