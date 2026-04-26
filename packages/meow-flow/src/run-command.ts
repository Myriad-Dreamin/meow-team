import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { Command } from "commander";
import {
  formatWorktreePath,
  getLinkedWorktrees,
  resolveGitWorktreeContext,
  type GitWorktree,
  type GitWorktreeContext,
} from "./git-worktrees.js";
import { resolvePaseoCommandInvocation } from "./paseo-command.js";
import {
  deriveLatestStage,
  ensureThread,
  getActiveOccupationForThread,
  getActiveOccupationForWorkspace,
  getNextHandoffSequence,
  getThread,
  isThreadArchived,
  parseStage,
  readMeowFlowState,
  recordOccupation,
  removeActiveOccupation,
  stageToSkill,
  type MeowFlowStage,
  type ThreadRecord,
  updateMeowFlowState,
  upsertAgentRecord,
} from "./thread-state.js";

type RunCommandOptions = {
  readonly id?: string;
  readonly stage?: string;
};

type PaseoRunResult =
  | {
      readonly ok: true;
      readonly agentId: string;
      readonly title: string | null;
    }
  | {
      readonly ok: false;
      readonly message: string;
      readonly malformedOutput?: boolean;
    };

type ResolvedRunTarget = {
  readonly threadId: string;
  readonly workspacePath: string;
  readonly stage: MeowFlowStage;
  readonly requestBody: string;
  readonly freshAllocation: boolean;
};

export function createRunCommand(): Command {
  return new Command("run")
    .description("Launch a staged MeowFlow Paseo agent in a git workspace")
    .option("--id <id>", "use an explicit MeowFlow thread id instead of generating a UUID")
    .option("--stage <stage>", "stage to launch: plan, code, review, execute, or validate")
    .argument("[request-body]", "request body or stage-specific continuation text")
    .action((requestBody: string | undefined, options: RunCommandOptions, command: Command) => {
      try {
        const context = resolveGitWorktreeContext({
          cwd: process.cwd(),
          commandName: "mfl run",
        });
        const target = resolveRunTarget({
          context,
          explicitThreadId: options.id,
          explicitStage: options.stage,
          requestBody: requestBody ?? "",
        });
        const paseoRunResult = invokePaseoRun({
          threadId: target.threadId,
          stage: target.stage,
          requestBody: target.requestBody,
          cwd: target.workspacePath,
        });

        if (!paseoRunResult.ok) {
          if (target.freshAllocation) {
            rollbackFreshAllocation(context.repositoryRoot, target);
          }

          throw new Error(paseoRunResult.message);
        }

        const now = new Date().toISOString();
        const state = updateMeowFlowState(context.repositoryRoot, (mutableState) => {
          upsertAgentRecord(mutableState, {
            threadId: target.threadId,
            agentId: paseoRunResult.agentId,
            title: paseoRunResult.title,
            skill: stageToSkill(target.stage),
            now,
          });
        });
        const thread = getThread(state, target.threadId);
        const nextSeq = thread ? getNextHandoffSequence(thread) : 1;

        process.stdout.write(
          [
            `Thread: ${target.threadId}`,
            `Workspace: ${formatWorktreePath(context.repositoryRoot, target.workspacePath)}`,
            `stage: ${target.stage}`,
            `agent-id: ${paseoRunResult.agentId}`,
            `next-seq: ${nextSeq}`,
            "",
          ].join("\n"),
        );
      } catch (error) {
        command.error(error instanceof Error ? error.message : String(error));
      }
    });
}

function resolveThreadId(explicitThreadId: string | undefined): string {
  if (explicitThreadId === undefined) {
    return randomUUID();
  }

  const trimmedThreadId = explicitThreadId.trim();

  if (trimmedThreadId.length === 0) {
    throw new Error("Thread id must not be empty.");
  }

  return trimmedThreadId;
}

function resolveRunTarget(input: {
  readonly context: GitWorktreeContext;
  readonly explicitThreadId: string | undefined;
  readonly explicitStage: string | undefined;
  readonly requestBody: string;
}): ResolvedRunTarget {
  const requestedStage = parseStage(input.explicitStage);
  const state = readMeowFlowState(input.context.repositoryRoot);
  const currentOccupation = getActiveOccupationForWorkspace(state, input.context.currentWorktreeRoot);
  const trimmedRequestBody = input.requestBody.trim();

  if (currentOccupation) {
    if (input.explicitThreadId !== undefined && input.explicitThreadId.trim() !== currentOccupation.threadId) {
      throw new Error(
        `Current workspace is occupied by thread ${currentOccupation.threadId}; cannot launch thread ${input.explicitThreadId.trim()}.`,
      );
    }

    const thread = getThread(state, currentOccupation.threadId);
    if (thread && isThreadArchived(thread)) {
      throw new Error(`Archived threads cannot launch new stage agents: ${currentOccupation.threadId}`);
    }

    const existingAgentCount = thread?.agents.length ?? 0;
    if (existingAgentCount > 0 && requestedStage === null) {
      throw new Error("--stage is required after a thread already has agents.");
    }

    return {
      threadId: currentOccupation.threadId,
      workspacePath: currentOccupation.workspacePath,
      stage: requestedStage ?? "plan",
      requestBody: input.requestBody,
      freshAllocation: false,
    };
  }

  const threadId = resolveThreadId(input.explicitThreadId);
  const activeForThread = getActiveOccupationForThread(state, threadId);
  if (activeForThread) {
    throw new Error(
      `Thread ${threadId} is already running in workspace ${formatWorktreePath(
        input.context.repositoryRoot,
        activeForThread.workspacePath,
      )}.`,
    );
  }

  const existingThread = getThread(state, threadId);
  if (existingThread && isThreadArchived(existingThread)) {
    throw new Error(`Archived threads cannot launch new stage agents: ${threadId}`);
  }
  if (existingThread && existingThread.agents.length > 0 && requestedStage === null) {
    throw new Error("--stage is required after a thread already has agents.");
  }

  if (!existingThread && trimmedRequestBody.length === 0) {
    throw new Error("Request body is required for a new MeowFlow thread.");
  }

  const workspace = selectWorkspaceForNewThread(input.context, state);
  const stage = requestedStage ?? deriveDefaultStage(existingThread);
  const now = new Date().toISOString();

  updateMeowFlowState(input.context.repositoryRoot, (mutableState) => {
    ensureThread(mutableState, {
      threadId,
      requestBody: existingThread?.requestBody ?? input.requestBody,
    });
    recordOccupation(mutableState, {
      threadId,
      workspacePath: workspace.path,
      now,
    });
  });

  return {
    threadId,
    workspacePath: workspace.path,
    stage,
    requestBody: input.requestBody,
    freshAllocation: true,
  };
}

function deriveDefaultStage(thread: ThreadRecord | null): MeowFlowStage {
  if (!thread || thread.agents.length === 0) {
    return "plan";
  }

  const latestStage = deriveLatestStage(thread);
  if (latestStage === "archived") {
    throw new Error(`Archived threads cannot launch new stage agents: ${thread.id}`);
  }

  return latestStage;
}

function selectWorkspaceForNewThread(
  context: GitWorktreeContext,
  state: ReturnType<typeof readMeowFlowState>,
): GitWorktree {
  const linkedWorktrees = getLinkedWorktrees(context);
  const currentLinkedWorktree = linkedWorktrees.find(
    (worktree) => worktree.path === context.currentWorktreeRoot,
  );
  const candidates = currentLinkedWorktree
    ? [currentLinkedWorktree, ...linkedWorktrees.filter((worktree) => worktree !== currentLinkedWorktree)]
    : linkedWorktrees;
  const availableWorktree = candidates.find(
    (worktree) => !getActiveOccupationForWorkspace(state, worktree.path),
  );

  if (availableWorktree) {
    return availableWorktree;
  }

  if (linkedWorktrees.length === 0) {
    throw new Error("No idle thread workspace is available. Create one with: mfl workspace new");
  }

  const occupied = linkedWorktrees
    .map((worktree) => {
      const occupation = getActiveOccupationForWorkspace(state, worktree.path);
      if (!occupation) {
        return null;
      }
      const thread = getThread(state, occupation.threadId);
      const latestAgentId = thread?.agents.at(-1)?.id;
      const agentSuffix = latestAgentId ? ` agent ${latestAgentId}` : "";
      return `${formatWorktreePath(context.repositoryRoot, worktree.path)} thread ${occupation.threadId}${agentSuffix}`;
    })
    .filter((entry): entry is string => entry !== null);

  throw new Error(
    `No idle thread workspace is available. Occupied workspaces: ${occupied.join(", ")}. Create one with: mfl workspace new`,
  );
}

function rollbackFreshAllocation(repositoryRoot: string, target: ResolvedRunTarget): void {
  updateMeowFlowState(repositoryRoot, (state) => {
    removeActiveOccupation(state, {
      threadId: target.threadId,
      workspacePath: target.workspacePath,
    });
  });
}

function invokePaseoRun(input: {
  readonly threadId: string;
  readonly stage: MeowFlowStage;
  readonly requestBody: string;
  readonly cwd: string;
}): PaseoRunResult {
  let paseoCommand: ReturnType<typeof resolvePaseoCommandInvocation>;

  try {
    paseoCommand = resolvePaseoCommandInvocation();
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }

  const prompt = composeStagePrompt(input.stage, input.requestBody);
  const result = spawnSync(
    paseoCommand.command,
    [
      ...paseoCommand.argsPrefix,
      "run",
      "--json",
      "--detach",
      "--cwd",
      input.cwd,
      "--label",
      `x-meow-flow-id=${input.threadId}`,
      "--label",
      `x-meow-flow-stage=${input.stage}`,
      "--title",
      `${input.threadId} ${input.stage}`,
      prompt,
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  if (result.stderr.length > 0) {
    process.stderr.write(result.stderr);
  }

  if (result.error) {
    return {
      ok: false,
      message: `paseo run failed to start: ${result.error.message}`,
    };
  }

  if (result.status !== 0) {
    const detail = result.stderr.trim();

    return {
      ok: false,
      message:
        detail.length === 0
          ? `paseo run failed with exit code ${result.status}.`
          : `paseo run failed with exit code ${result.status}: ${detail}`,
    };
  }

  const parsed = parsePaseoRunOutput(result.stdout);
  if (!parsed) {
    return {
      ok: false,
      malformedOutput: true,
      message: "paseo run succeeded, but the created agent id could not be determined.",
    };
  }

  return {
    ok: true,
    agentId: parsed.agentId,
    title: parsed.title,
  };
}

function composeStagePrompt(stage: MeowFlowStage, requestBody: string): string {
  const command = `/meow-${stage}`;

  if (requestBody.length === 0) {
    return command;
  }

  return `${command} ${requestBody}`;
}

function parsePaseoRunOutput(stdout: string): { readonly agentId: string; readonly title: string | null } | null {
  try {
    const parsed = JSON.parse(stdout) as unknown;

    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "agentId" in parsed &&
      typeof parsed.agentId === "string" &&
      parsed.agentId.trim().length > 0
    ) {
      return {
        agentId: parsed.agentId,
        title:
          "title" in parsed && typeof parsed.title === "string" && parsed.title.trim().length > 0
            ? parsed.title
            : null,
      };
    }
  } catch {
    const match = /\bagent(?:-id|Id)?\s*[:=]\s*([A-Za-z0-9_-]+)/.exec(stdout);
    if (match?.[1]) {
      return {
        agentId: match[1],
        title: null,
      };
    }
  }

  return null;
}
