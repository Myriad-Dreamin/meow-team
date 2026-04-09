import { promises as fs } from "node:fs";
import path from "node:path";
import { AgentResult, type HistoryConfig, type Message, type ToolResultMessage } from "@inngest/agent-kit";
import type { TeamRunState } from "@/lib/team/network";

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
  createdAt: string;
  updatedAt: string;
};

type ThreadStore = {
  threads: Record<string, StoredThread>;
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
      const shouldResetAssignment = state.data.forceReset || storedData.latestInput !== input;
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
        data: state.data,
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
        createdAt: currentThread?.createdAt ?? now,
        updatedAt: now,
      };

      await writeThreadStore(storePath, store);
    },
  };
};
