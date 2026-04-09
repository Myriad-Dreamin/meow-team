import "server-only";

import { promises as fs } from "node:fs";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import {
  buildPlannerWorktreePath,
  commitWorktreeChanges,
  ensureBranchRef,
  ensureLaneWorktree,
  hasWorktreeChanges,
  sanitizeBranchSegment,
} from "@/lib/team/git";
import type { TeamWorkerLaneRecord } from "@/lib/team/types";

const execFileAsync = promisify(execFile);

const runOpenSpec = async (
  workingDirectory: string,
  args: string[],
): Promise<{
  stdout: string;
  stderr: string;
}> => {
  try {
    const result = await execFileAsync("openspec", args, {
      cwd: workingDirectory,
      maxBuffer: 1024 * 1024 * 4,
    });

    return {
      stdout: result.stdout.trim(),
      stderr: result.stderr.trim(),
    };
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException & {
      stdout?: string;
      stderr?: string;
    };
    const output = [nodeError.stderr, nodeError.stdout].filter(Boolean).join("\n").trim();
    throw new Error(output || `OpenSpec command failed in ${workingDirectory}.`);
  }
};

type ProposalLane = Pick<
  TeamWorkerLaneRecord,
  "laneIndex" | "taskTitle" | "taskObjective" | "proposalChangeName" | "proposalPath" | "branchName"
>;

const describeWorktreePool = (worktreeRoot: string): string => {
  return `${worktreeRoot}/meow-N`;
};

const normalizeSentence = (value: string): string => {
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (!trimmed) {
    return "";
  }

  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
};

const buildCapabilityName = (changeName: string): string => {
  return sanitizeBranchSegment(changeName).replace(/\//g, "-");
};

const buildProposalWhy = ({
  taskObjective,
  requestInput,
  plannerSummary,
}: {
  taskObjective: string;
  requestInput: string | null;
  plannerSummary: string | null;
}): string => {
  return [
    normalizeSentence(taskObjective),
    plannerSummary ? normalizeSentence(plannerSummary) : null,
    requestInput
      ? `This proposal is one candidate implementation for the request: ${normalizeSentence(requestInput)}`
      : null,
  ]
    .filter(Boolean)
    .join(" ");
};

const buildProposalMarkdown = ({
  repositoryPath,
  proposalChangeName,
  taskTitle,
  taskObjective,
  plannerSummary,
  plannerDeliverable,
  requestInput,
  worktreeRoot,
}: {
  repositoryPath: string;
  proposalChangeName: string;
  taskTitle: string;
  taskObjective: string;
  plannerSummary: string | null;
  plannerDeliverable: string | null;
  requestInput: string | null;
  worktreeRoot: string;
}): string => {
  const capabilityName = buildCapabilityName(proposalChangeName);

  return `## Why

${buildProposalWhy({
  taskObjective,
  requestInput,
  plannerSummary,
})}

## What Changes

- Introduce the \`${proposalChangeName}\` OpenSpec change for proposal "${taskTitle}".
- ${normalizeSentence(taskObjective)}
- Keep the proposal logically scoped so any approved coding-review worker can claim it without replanning.

## Capabilities

### New Capabilities
- \`${capabilityName}\`: ${normalizeSentence(taskObjective)}

### Modified Capabilities
- None.

## Impact

- Affected repository: \`${path.basename(repositoryPath)}\`
- Coding-review execution: pooled workers with reusable worktrees from \`${describeWorktreePool(worktreeRoot)}\`
- Planner deliverable: ${normalizeSentence(plannerDeliverable ?? plannerSummary ?? taskTitle)}
`;
};

const buildDesignMarkdown = ({
  proposalChangeName,
  taskTitle,
  taskObjective,
  plannerDeliverable,
  worktreeRoot,
}: {
  proposalChangeName: string;
  taskTitle: string;
  taskObjective: string;
  plannerDeliverable: string | null;
  worktreeRoot: string;
}): string => {
  return `## Context

This change captures proposal "${taskTitle}" as OpenSpec change \`${proposalChangeName}\`.
Implementation starts only after human approval and is claimed by the next
available coding-review worker from the shared pool.

## Goals / Non-Goals

**Goals:**
- ${normalizeSentence(taskObjective)}
- Preserve a reviewable OpenSpec contract before coding starts.
- Keep the proposal logical enough that any pooled worker can execute it.
- Reuse a managed worktree from \`${describeWorktreePool(worktreeRoot)}\` for cache-friendly execution.

**Non-Goals:**
- Bind this proposal to a specific branch or worker slot before approval.
- Expand scope beyond the approved proposal without human feedback.
- Merge sibling proposals into a single coding pass without replanning.

## Decisions

- Store the proposal as a dedicated OpenSpec change before coding begins.
- Let the pooled coding-review runtime allocate execution branches and worktrees after approval.
- Use planner output as the starting point for reviewer validation and follow-up tasks.
- Prefer incremental implementation that can be requeued after machine review feedback.

## Risks / Trade-offs

- [Proposal drift] -> Compare implementation against the approved OpenSpec artifacts before coding.
- [Sibling proposal overlap] -> Send cross-proposal changes back to request-group replanning.
- [Reusable worktree residue] -> Reset the managed worktree before each proposal run.
- [Validation gaps] -> Require reviewer findings and task completion before treating work as complete.

${plannerDeliverable ? `Planner deliverable reference: ${normalizeSentence(plannerDeliverable)}` : ""}
`;
};

const buildSpecMarkdown = ({
  proposalChangeName,
  taskTitle,
  taskObjective,
  worktreeRoot,
}: {
  proposalChangeName: string;
  taskTitle: string;
  taskObjective: string;
  worktreeRoot: string;
}): string => {
  return `## ADDED Requirements

### Requirement: ${taskTitle}
The system SHALL implement the approved proposal recorded in OpenSpec change \`${proposalChangeName}\`
and keep the work aligned with this proposal's objective: ${normalizeSentence(taskObjective)}

#### Scenario: Approved proposal enters execution
- **WHEN** a human approves the "${taskTitle}" proposal
- **THEN** the system SHALL queue the proposal into the pooled coding and machine-review workflow

### Requirement: Proposal execution stays isolated
The system SHALL keep proposal execution isolated to the claimed implementation
branch and reusable worktree until human feedback explicitly requests
request-group replanning.

#### Scenario: Dedicated execution workspace
- **WHEN** the coder starts work on this proposal
- **THEN** the system SHALL provide a dedicated implementation branch and a reusable worktree from \`${describeWorktreePool(worktreeRoot)}\`
`;
};

const buildTasksMarkdown = ({
  taskTitle,
  taskObjective,
  worktreeRoot,
}: {
  taskTitle: string;
  taskObjective: string;
  worktreeRoot: string;
}): string => {
  return `## 1. Proposal Alignment

- [ ] 1.1 Review the approved OpenSpec artifacts for "${taskTitle}"
- [ ] 1.2 Confirm the proposal is ready for pooled execution and a reusable worktree from \`${describeWorktreePool(worktreeRoot)}\` can be claimed

## 2. Implementation

- [ ] 2.1 Implement the approved objective: ${normalizeSentence(taskObjective)}
- [ ] 2.2 Run validation and capture reviewer findings for "${taskTitle}"
`;
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

const writeProposalArtifacts = async ({
  repositoryPath,
  proposalChangeName,
  proposalPath,
  taskTitle,
  taskObjective,
  plannerSummary,
  plannerDeliverable,
  requestInput,
  workspacePath,
  worktreeRoot,
}: {
  repositoryPath: string;
  proposalChangeName: string;
  proposalPath: string;
  taskTitle: string;
  taskObjective: string;
  plannerSummary: string | null;
  plannerDeliverable: string | null;
  requestInput: string | null;
  workspacePath: string;
  worktreeRoot: string;
}): Promise<void> => {
  const proposalRoot = path.join(workspacePath, proposalPath);
  const capabilityName = buildCapabilityName(proposalChangeName);
  const specDirectory = path.join(proposalRoot, "specs", capabilityName);

  await fs.mkdir(specDirectory, { recursive: true });

  await fs.writeFile(
    path.join(proposalRoot, "proposal.md"),
    buildProposalMarkdown({
      repositoryPath,
      proposalChangeName,
      taskTitle,
      taskObjective,
      plannerSummary,
      plannerDeliverable,
      requestInput,
      worktreeRoot,
    }),
    "utf8",
  );
  await fs.writeFile(
    path.join(proposalRoot, "design.md"),
    buildDesignMarkdown({
      proposalChangeName,
      taskTitle,
      taskObjective,
      plannerDeliverable,
      worktreeRoot,
    }),
    "utf8",
  );
  await fs.writeFile(
    path.join(specDirectory, "spec.md"),
    buildSpecMarkdown({
      proposalChangeName,
      taskTitle,
      taskObjective,
      worktreeRoot,
    }),
    "utf8",
  );
  await fs.writeFile(
    path.join(proposalRoot, "tasks.md"),
    buildTasksMarkdown({
      taskTitle,
      taskObjective,
      worktreeRoot,
    }),
    "utf8",
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
  plannerSummary,
  plannerDeliverable,
  requestInput,
  worktreeRoot,
  lanes,
}: {
  repositoryPath: string;
  baseBranch: string;
  canonicalBranchName: string;
  plannerSummary: string | null;
  plannerDeliverable: string | null;
  requestInput: string | null;
  worktreeRoot: string;
  lanes: ProposalLane[];
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

  const stagingWorktreePath = buildPlannerWorktreePath({
    worktreeRoot,
  });
  await ensureLaneWorktree({
    repositoryPath,
    worktreeRoot,
    worktreePath: stagingWorktreePath,
    branchName: canonicalBranchName,
    startPoint: baseBranch,
  });

  for (const lane of activeLanes) {
    await ensureOpenSpecChange({
      worktreePath: stagingWorktreePath,
      proposalChangeName: lane.proposalChangeName,
    });
    await writeProposalArtifacts({
      repositoryPath,
      proposalChangeName: lane.proposalChangeName,
      proposalPath: lane.proposalPath,
      taskTitle: lane.taskTitle,
      taskObjective: lane.taskObjective,
      plannerSummary,
      plannerDeliverable,
      requestInput,
      workspacePath: stagingWorktreePath,
      worktreeRoot,
    });
  }

  if (await hasWorktreeChanges(stagingWorktreePath)) {
    await commitWorktreeChanges({
      worktreePath: stagingWorktreePath,
      message: `planner: add openspec proposals for ${canonicalBranchName}`,
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
