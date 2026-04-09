import { promises as fs } from "node:fs";
import path from "node:path";
import { AgentResult, type HistoryConfig, type Message, type ToolResultMessage } from "@inngest/agent-kit";
import type { TeamRepositoryOption } from "@/lib/team/repository-types";
import type { TeamRoleDecision, TeamRoleHandoff, TeamRunState } from "@/lib/team/network";

export type TeamThreadStatus = "running" | "completed" | "approved" | "needs_revision" | "failed";

type StoredRun = {
  status: TeamThreadStatus;
  startedAt: string | null;
  finishedAt: string | null;
  lastError: string | null;
};

type StoredAgentResult = {
  agentName: string;
  output: Message[];
  toolCalls: ToolResultMessage[];
  createdAt: string;
  prompt?: Message[];
  history?: Message[];
  raw?: string;
  id?: string;
};

type StoredUserMessage = {
  id: string;
  role: "user";
  content: string;
  timestamp: string;
};

type StoredThread = {
  threadId: string;
  data: TeamRunState;
  results: StoredAgentResult[];
  userMessages: StoredUserMessage[];
  run?: StoredRun;
  createdAt: string;
  updatedAt: string;
};

type ThreadStore = {
  threads: Record<string, StoredThread>;
};

export type TeamThreadSummary = {
  threadId: string;
  assignmentNumber: number;
  status: TeamThreadStatus;
  latestInput: string | null;
  repository: TeamRepositoryOption | null;
  workflow: string[];
  latestRoleId: string | null;
  latestRoleName: string | null;
  nextRoleId: string | null;
  latestDecision: TeamRoleDecision | null;
  handoffCount: number;
  stepCount: number;
  userMessageCount: number;
  startedAt: string | null;
  finishedAt: string | null;
  updatedAt: string;
  lastError: string | null;
};

const emptyStore = (): ThreadStore => ({ threads: {} });

const resolveStorePath = (threadFile: string): string => {
  return path.isAbsolute(threadFile) ? threadFile : path.join(process.cwd(), threadFile);
};

const ensureStoreDirectory = async (storePath: string): Promise<void> => {
  await fs.mkdir(path.dirname(storePath), { recursive: true });
};

const readThreadStore = async (storePath: string): Promise<ThreadStore> => {
  try {
    const raw = await fs.readFile(storePath, "utf8");
    const parsed = JSON.parse(raw) as ThreadStore;
    return parsed.threads ? parsed : emptyStore();
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === "ENOENT") {
      return emptyStore();
    }
    throw error;
  }
};

const writeThreadStore = async (storePath: string, store: ThreadStore): Promise<void> => {
  await ensureStoreDirectory(storePath);
  await fs.writeFile(storePath, JSON.stringify(store, null, 2), "utf8");
};

const serializeResult = (result: AgentResult): StoredAgentResult => {
  return {
    agentName: result.agentName,
    output: result.output,
    toolCalls: result.toolCalls,
    createdAt: result.createdAt.toISOString(),
    prompt: result.prompt,
    history: result.history,
    raw: result.raw,
    id: result.id,
  };
};

const deserializeResult = (result: StoredAgentResult): AgentResult => {
  return new AgentResult(
    result.agentName,
    result.output,
    result.toolCalls,
    new Date(result.createdAt),
    result.prompt,
    result.history,
    result.raw,
    result.id,
  );
};

const filterHandoffsForWorkflow = (state: TeamRunState): TeamRunState["handoffs"] => {
  return Object.fromEntries(
    Object.entries(state.handoffs).filter(([roleId]) => state.workflow.includes(roleId)),
  );
};

const getOrderedHandoffs = (state: TeamRunState): TeamRoleHandoff[] => {
  return Object.values(filterHandoffsForWorkflow(state))
    .filter((handoff): handoff is TeamRoleHandoff => Boolean(handoff))
    .sort((left, right) => left.sequence - right.sequence);
};

const deriveCompletedStatus = (state: TeamRunState): TeamThreadStatus => {
  const orderedHandoffs = getOrderedHandoffs(state);
  const latestHandoff = orderedHandoffs.at(-1);

  if (latestHandoff?.decision === "approved") {
    return "approved";
  }

  if (latestHandoff?.decision === "needs_revision") {
    return "needs_revision";
  }

  return "completed";
};

const deriveLegacyThreadStatus = (thread: StoredThread): TeamThreadStatus => {
  if (thread.results.length === 0 && thread.userMessages.length > 0) {
    return "running";
  }

  return deriveCompletedStatus(thread.data);
};

const deriveThreadStatus = (thread: StoredThread): TeamThreadStatus => {
  return thread.run?.status ?? deriveLegacyThreadStatus(thread);
};

const deriveNextRoleId = (state: TeamRunState, status: TeamThreadStatus): string | null => {
  if (status !== "running") {
    return null;
  }

  const orderedHandoffs = getOrderedHandoffs(state);
  const latestHandoff = orderedHandoffs.at(-1);
  if (!latestHandoff) {
    return state.workflow[0] ?? null;
  }

  if (latestHandoff.decision === "needs_revision" && state.workflow.length > 1) {
    return state.workflow[state.workflow.length - 2] ?? null;
  }

  const currentIndex = state.workflow.indexOf(latestHandoff.roleId);
  if (currentIndex < 0) {
    return null;
  }

  return state.workflow[currentIndex + 1] ?? null;
};

const summarizeThread = (thread: StoredThread): TeamThreadSummary => {
  const orderedHandoffs = getOrderedHandoffs(thread.data);
  const latestHandoff = orderedHandoffs.at(-1);
  const status = deriveThreadStatus(thread);

  return {
    threadId: thread.threadId,
    assignmentNumber: thread.data.assignmentNumber,
    status,
    latestInput:
      thread.data.latestInput ?? thread.userMessages.at(-1)?.content ?? thread.userMessages[0]?.content ?? null,
    repository: thread.data.selectedRepository,
    workflow: thread.data.workflow,
    latestRoleId: latestHandoff?.roleId ?? null,
    latestRoleName: latestHandoff?.roleName ?? null,
    nextRoleId: deriveNextRoleId(thread.data, status),
    latestDecision: latestHandoff?.decision ?? null,
    handoffCount: orderedHandoffs.length,
    stepCount: thread.results.length,
    userMessageCount: thread.userMessages.length,
    startedAt: thread.run?.startedAt ?? thread.createdAt,
    finishedAt: thread.run?.finishedAt ?? null,
    updatedAt: thread.updatedAt,
    lastError: thread.run?.lastError ?? null,
  };
};

export const listTeamThreadSummaries = async (
  threadFile: string,
  limit = 24,
): Promise<TeamThreadSummary[]> => {
  const storePath = resolveStorePath(threadFile);
  const store = await readThreadStore(storePath);

  return Object.values(store.threads)
    .map(summarizeThread)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, limit);
};

export const markTeamThreadFailed = async ({
  threadFile,
  threadId,
  error,
}: {
  threadFile: string;
  threadId: string;
  error: string;
}): Promise<void> => {
  const storePath = resolveStorePath(threadFile);
  const store = await readThreadStore(storePath);
  const currentThread = store.threads[threadId];
  if (!currentThread) {
    return;
  }

  const now = new Date().toISOString();
  store.threads[threadId] = {
    ...currentThread,
    run: {
      status: "failed",
      startedAt: currentThread.run?.startedAt ?? currentThread.createdAt,
      finishedAt: now,
      lastError: error,
    },
    updatedAt: now,
  };

  await writeThreadStore(storePath, store);
};

export const createTeamHistory = (threadFile: string): HistoryConfig<TeamRunState> => {
  const storePath = resolveStorePath(threadFile);

  return {
    createThread: async () => {
      return {
        threadId: crypto.randomUUID(),
      };
    },
    get: async ({ input, state, threadId }) => {
      if (!threadId) {
        return [];
      }

      const store = await readThreadStore(storePath);
      const thread = store.threads[threadId];
      if (!thread) {
        state.data = {
          ...state.data,
          assignmentNumber: 1,
          latestInput: input,
          handoffCounter: 0,
          handoffs: {},
          forceReset: false,
        };
        return [];
      }

      const storedData = thread.data;
      const shouldResetAssignment =
        state.data.forceReset ||
        storedData.latestInput !== input ||
        (storedData.selectedRepository?.id ?? null) !== (state.data.selectedRepository?.id ?? null);
      const assignmentNumber = shouldResetAssignment
        ? (storedData.assignmentNumber ?? 0) + 1
        : storedData.assignmentNumber;

      state.data = {
        ...state.data,
        assignmentNumber,
        latestInput: input,
        handoffCounter: shouldResetAssignment ? 0 : storedData.handoffCounter,
        handoffs: shouldResetAssignment ? {} : filterHandoffsForWorkflow(storedData),
        forceReset: false,
      };

      return thread.results.map(deserializeResult);
    },
    appendUserMessage: async ({ threadId, state, userMessage }) => {
      if (!threadId) {
        return;
      }

      const store = await readThreadStore(storePath);
      const currentThread = store.threads[threadId];
      const now = new Date().toISOString();
      const userMessages = currentThread?.userMessages ?? [];

      store.threads[threadId] = {
        threadId,
        data: {
          ...state.data,
          latestInput: userMessage.content,
        },
        results: currentThread?.results ?? [],
        userMessages: [
          ...userMessages,
          {
            id: userMessage.id,
            role: "user",
            content: userMessage.content,
            timestamp: userMessage.timestamp.toISOString(),
          },
        ],
        run: {
          status: "running",
          startedAt: now,
          finishedAt: null,
          lastError: null,
        },
        createdAt: currentThread?.createdAt ?? now,
        updatedAt: now,
      };

      await writeThreadStore(storePath, store);
    },
    appendResults: async ({ threadId, state, newResults }) => {
      if (!threadId) {
        return;
      }

      const store = await readThreadStore(storePath);
      const currentThread = store.threads[threadId];
      const now = new Date().toISOString();
      const serializedNewResults = newResults.map(serializeResult);

      store.threads[threadId] = {
        threadId,
        data: {
          ...state.data,
          handoffs: filterHandoffsForWorkflow(state.data),
        },
        results: [...(currentThread?.results ?? []), ...serializedNewResults],
        userMessages: currentThread?.userMessages ?? [],
        run: {
          status: deriveCompletedStatus(state.data),
          startedAt: currentThread?.run?.startedAt ?? currentThread?.createdAt ?? now,
          finishedAt: now,
          lastError: null,
        },
        createdAt: currentThread?.createdAt ?? now,
        updatedAt: now,
      };

      await writeThreadStore(storePath, store);
    },
  };
};
