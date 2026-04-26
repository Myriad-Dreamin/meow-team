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
import { resolveRunProvider } from "./run-config.js";
import {
  deriveLatestStage,
  ensureThread,
  getActiveOccupationForThread,
  getActiveOccupationForWorktree,
  getNextHandoffSequence,
  getThread,
  isThreadArchived,
  parseStage,
  readMeowFlowState,
  recordOccupation,
  releaseActiveOccupation,
  stageToSkill,
  type MeowFlowStateDatabase,
  type MeowFlowStage,
  type ThreadRecord,
  updateMeowFlowState,
  upsertAgentRecord,
  withMeowFlowStateDatabase,
} from "./thread-state.js";

type RunCommandOptions = {
  readonly id?: string;
  readonly provider?: string;
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
  readonly worktreePath: string;
  readonly stage: MeowFlowStage;
  readonly requestBody: string;
  readonly title: string;
  readonly freshAllocation: boolean;
};

const WORD_TITLE_TOKEN_LIMIT = 5;
const HAN_TITLE_TOKEN_LIMIT = 10;
const HAN_PATTERN = /\p{Script=Han}/u;

export function createRunCommand(): Command {
  return new Command("run")
    .description("Launch a staged MeowFlow Paseo agent in a git worktree")
    .option("--id <id>", "use an explicit MeowFlow thread id instead of generating a UUID")
    .option("--provider <provider>", "Paseo provider to use for this staged launch")
    .option("--stage <stage>", "stage to launch: plan, code, review, execute, or validate")
    .argument("[request-body]", "request body or stage-specific continuation text")
    .action((requestBody: string | undefined, options: RunCommandOptions, command: Command) => {
      try {
        const context = resolveGitWorktreeContext({
          cwd: process.cwd(),
          commandName: "mfl run",
        });
        const runProvider = resolveRunProvider(options.provider);
        withMeowFlowStateDatabase((database) => {
          const target = resolveRunTarget({
            context,
            database,
            explicitThreadId: options.id,
            explicitStage: options.stage,
            requestBody: requestBody ?? "",
          });
          const paseoRunResult = invokePaseoRun({
            threadId: target.threadId,
            stage: target.stage,
            requestBody: target.requestBody,
            title: target.title,
            cwd: target.worktreePath,
            provider: runProvider.provider,
          });

          if (!paseoRunResult.ok) {
            if (target.freshAllocation) {
              rollbackFreshAllocation(context.repositoryRoot, target, database);
            }

            throw new Error(paseoRunResult.message);
          }

          const now = new Date().toISOString();
          const state = updateMeowFlowState(
            context.repositoryRoot,
            (mutableState) => {
              upsertAgentRecord(mutableState, {
                threadId: target.threadId,
                agentId: paseoRunResult.agentId,
                title: paseoRunResult.title,
                skill: stageToSkill(target.stage),
                now,
              });
            },
            {
              database,
              threadIds: [target.threadId],
              includeOccupationThreads: false,
            },
          );
          const thread = getThread(state, target.threadId);
          const nextSeq = thread ? getNextHandoffSequence(thread) : 1;

          process.stdout.write(
            [
              `thread-id: ${target.threadId}`,
              `worktree: ${formatWorktreePath(context.repositoryRoot, target.worktreePath)}`,
              `stage: ${target.stage}`,
              `provider: ${runProvider.provider}`,
              `agent-id: ${paseoRunResult.agentId}`,
              `next-seq: ${nextSeq}`,
              "",
            ].join("\n"),
          );
        });
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
  readonly database: MeowFlowStateDatabase;
  readonly explicitThreadId: string | undefined;
  readonly explicitStage: string | undefined;
  readonly requestBody: string;
}): ResolvedRunTarget {
  const requestedStage = parseStage(input.explicitStage);
  const threadId = resolveThreadId(input.explicitThreadId);
  const state = readMeowFlowState(input.context.repositoryRoot, {
    database: input.database,
    threadIds: [threadId],
  });
  const currentOccupation = getActiveOccupationForWorktree(
    state,
    input.context.currentWorktreeRoot,
  );
  const trimmedRequestBody = input.requestBody.trim();

  if (currentOccupation) {
    if (
      input.explicitThreadId !== undefined &&
      input.explicitThreadId.trim() !== currentOccupation.threadId
    ) {
      throw new Error(
        `Current worktree is occupied by thread ${currentOccupation.threadId}; cannot launch thread ${input.explicitThreadId.trim()}.`,
      );
    }

    const thread = getThread(state, currentOccupation.threadId);
    if (thread && isThreadArchived(thread)) {
      throw new Error(
        `Archived threads cannot launch new stage agents: ${currentOccupation.threadId}`,
      );
    }

    const existingAgentCount = thread?.agents.length ?? 0;
    if (existingAgentCount > 0 && requestedStage === null) {
      throw new Error("--stage is required after a thread already has agents.");
    }

    const stage = requestedStage ?? "plan";

    return {
      threadId: currentOccupation.threadId,
      worktreePath: currentOccupation.worktreePath,
      stage,
      requestBody: input.requestBody,
      title: formatStageAgentTitle({
        stage,
        threadName: thread?.name ?? null,
        threadRequestBody: thread?.requestBody ?? null,
        requestBody: input.requestBody,
        threadId: currentOccupation.threadId,
        agentSequence: existingAgentCount + 1,
      }),
      freshAllocation: false,
    };
  }

  const activeForThread = getActiveOccupationForThread(state, threadId);
  if (activeForThread) {
    throw new Error(
      `Thread ${threadId} is already running in worktree ${formatWorktreePath(
        input.context.repositoryRoot,
        activeForThread.worktreePath,
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

  const worktree = selectWorktreeForNewThread(input.context, state);
  const stage = requestedStage ?? deriveDefaultStage(existingThread);
  const agentSequence = (existingThread?.agents.length ?? 0) + 1;
  const now = new Date().toISOString();

  updateMeowFlowState(
    input.context.repositoryRoot,
    (mutableState) => {
      ensureThread(mutableState, {
        threadId,
        requestBody: existingThread?.requestBody ?? input.requestBody,
      });
      recordOccupation(mutableState, {
        threadId,
        worktreePath: worktree.path,
        now,
      });
    },
    {
      database: input.database,
      threadIds: [threadId],
      includeOccupationThreads: false,
    },
  );

  return {
    threadId,
    worktreePath: worktree.path,
    stage,
    requestBody: input.requestBody,
    title: formatStageAgentTitle({
      stage,
      threadName: existingThread?.name ?? null,
      threadRequestBody: existingThread?.requestBody ?? null,
      requestBody: input.requestBody,
      threadId,
      agentSequence,
    }),
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

function formatStageAgentTitle(input: {
  readonly stage: MeowFlowStage;
  readonly threadName: string | null;
  readonly threadRequestBody: string | null;
  readonly requestBody: string;
  readonly threadId: string;
  readonly agentSequence: number;
}): string {
  const stageLabel = formatStageLabel(input.stage);
  if (input.threadName !== null) {
    return `${stageLabel}: ${input.threadName} (${input.agentSequence})`;
  }

  return `${stageLabel}: ${summarizeUntitledThreadSubject(
    firstNonBlank(input.requestBody, input.threadRequestBody, input.threadId),
  )}`;
}

function formatStageLabel(stage: MeowFlowStage): string {
  return `${stage.charAt(0).toUpperCase()}${stage.slice(1)}`;
}

function summarizeUntitledThreadSubject(value: string): string {
  const normalized = value.trim().split(/\s+/u).filter(Boolean).join(" ");
  if (normalized.length === 0) {
    return "untitled";
  }

  if (HAN_PATTERN.test(normalized)) {
    return summarizeHanAwareSubject(normalized);
  }

  const words = normalized.split(" ");
  if (words.length <= WORD_TITLE_TOKEN_LIMIT) {
    return normalized;
  }

  return `${words.slice(0, WORD_TITLE_TOKEN_LIMIT).join(" ")} ...`;
}

function firstNonBlank(...values: readonly (string | null)[]): string {
  return values.find((value): value is string => Boolean(value?.trim())) ?? "";
}

function summarizeHanAwareSubject(value: string): string {
  const tokens = tokenizeHanAwareSubject(value);
  if (tokens.length <= HAN_TITLE_TOKEN_LIMIT) {
    return tokens.join("");
  }

  return `${tokens.slice(0, HAN_TITLE_TOKEN_LIMIT).join("")}...`;
}

function tokenizeHanAwareSubject(value: string): readonly string[] {
  const tokens: string[] = [];
  let asciiRun = "";

  const flushAsciiRun = () => {
    if (asciiRun.length > 0) {
      tokens.push(asciiRun);
      asciiRun = "";
    }
  };

  for (const character of value) {
    if (/\s/u.test(character)) {
      flushAsciiRun();
      continue;
    }

    if (isAsciiCharacter(character)) {
      asciiRun += character;
      continue;
    }

    flushAsciiRun();
    tokens.push(character);
  }

  flushAsciiRun();
  return tokens;
}

function isAsciiCharacter(value: string): boolean {
  return value.charCodeAt(0) <= 0x7f;
}

function selectWorktreeForNewThread(
  context: GitWorktreeContext,
  state: ReturnType<typeof readMeowFlowState>,
): GitWorktree {
  const linkedWorktrees = getLinkedWorktrees(context);
  const currentLinkedWorktree = linkedWorktrees.find(
    (worktree) => worktree.path === context.currentWorktreeRoot,
  );
  const candidates = currentLinkedWorktree
    ? [
        currentLinkedWorktree,
        ...linkedWorktrees.filter((worktree) => worktree !== currentLinkedWorktree),
      ]
    : linkedWorktrees;
  const availableWorktree = candidates.find(
    (worktree) => !getActiveOccupationForWorktree(state, worktree.path),
  );

  if (availableWorktree) {
    return availableWorktree;
  }

  if (linkedWorktrees.length === 0) {
    throw new Error("No idle thread worktree is available. Create one with: mfl worktree new");
  }

  const occupied = linkedWorktrees
    .map((worktree) => {
      const occupation = getActiveOccupationForWorktree(state, worktree.path);
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
    `No idle thread worktree is available. Occupied worktrees: ${occupied.join(", ")}. Create one with: mfl worktree new`,
  );
}

function rollbackFreshAllocation(
  repositoryRoot: string,
  target: ResolvedRunTarget,
  database: MeowFlowStateDatabase,
): void {
  updateMeowFlowState(
    repositoryRoot,
    (state) => {
      releaseActiveOccupation(state, {
        threadId: target.threadId,
        worktreePath: target.worktreePath,
        now: new Date().toISOString(),
      });
    },
    {
      database,
      threadIds: [target.threadId],
      includeOccupationThreads: false,
    },
  );
}

function invokePaseoRun(input: {
  readonly threadId: string;
  readonly stage: MeowFlowStage;
  readonly requestBody: string;
  readonly title: string;
  readonly cwd: string;
  readonly provider: string;
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
      "--provider",
      input.provider,
      "--label",
      `x-meow-flow-id=${input.threadId}`,
      "--label",
      `x-meow-flow-stage=${input.stage}`,
      "--title",
      input.title,
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
  const skill = stageToSkill(stage);
  const lines = [
    command,
    "",
    `MeowFlow stage: ${stage}`,
    `Related skill: ${skill}`,
    "Load and follow the related skill before acting. If the slash-command prefix is stripped from model-visible context, this related-skill hint still applies.",
    "Run `mfl agent update-self` before doing stage work.",
  ];

  if (requestBody.length > 0) {
    lines.push("", "Request:", requestBody);
  }

  return lines.join("\n");
}

function parsePaseoRunOutput(
  stdout: string,
): { readonly agentId: string; readonly title: string | null } | null {
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
