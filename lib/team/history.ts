import { promises as fs } from "node:fs";
import path from "node:path";
import { AgentResult, type HistoryConfig, type Message, type ToolResultMessage } from "@inngest/agent-kit";
import type { TeamRepositoryOption } from "@/lib/team/repository-types";
import type { TeamRunState } from "@/lib/team/network";
import type {
  TeamDispatchAssignment,
  TeamDispatchAssignmentStatus,
  TeamHumanFeedbackRecord,
  TeamPlannerNote,
  TeamRoleDecision,
  TeamRoleHandoff,
  TeamThreadStatus,
  TeamWorkerLaneCounts,
  TeamWorkerLaneRecord,
} from "@/lib/team/types";

export type { TeamThreadStatus } from "@/lib/team/types";

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
  dispatchAssignments?: TeamDispatchAssignment[];
  run?: StoredRun;
  createdAt: string;
  updatedAt: string;
};

export type TeamThreadRecord = {
  threadId: string;
  data: TeamRunState;
  results: StoredAgentResult[];
  userMessages: StoredUserMessage[];
  dispatchAssignments: TeamDispatchAssignment[];
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
  latestAssignmentStatus: TeamDispatchAssignmentStatus | null;
  latestPlanSummary: string | null;
  latestBranchPrefix: string | null;
  latestCanonicalBranchName: string | null;
  dispatchWorkerCount: number;
  workerCounts: TeamWorkerLaneCounts;
  workerLanes: TeamWorkerLaneRecord[];
  plannerNotes: TeamPlannerNote[];
  humanFeedback: TeamHumanFeedbackRecord[];
};

export type PendingDispatchAssignment = {
  threadId: string;
  assignment: TeamDispatchAssignment;
};

const mutationQueues = new Map<string, Promise<unknown>>();

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

const queueStoreMutation = async <T>(storePath: string, task: () => Promise<T>): Promise<T> => {
  const previous = mutationQueues.get(storePath) ?? Promise.resolve();
  const mutation = previous.catch(() => undefined).then(task);
  const tracked = mutation.finally(() => {
    if (mutationQueues.get(storePath) === tracked) {
      mutationQueues.delete(storePath);
    }
  });

  mutationQueues.set(storePath, tracked);
  return mutation;
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

const normalizeWorkerLane = (lane: TeamWorkerLaneRecord): TeamWorkerLaneRecord => {
  return {
    ...lane,
    proposalChangeName: lane.proposalChangeName ?? null,
    proposalPath: lane.proposalPath ?? null,
    approvalRequestedAt: lane.approvalRequestedAt ?? null,
    approvalGrantedAt: lane.approvalGrantedAt ?? null,
    queuedAt: lane.queuedAt ?? null,
    pullRequest: lane.pullRequest
      ? {
          ...lane.pullRequest,
          machineReviewedAt: lane.pullRequest.machineReviewedAt ?? null,
        }
      : null,
    events: lane.events ?? [],
  };
};

const normalizeDispatchAssignment = (
  assignment: TeamDispatchAssignment,
): TeamDispatchAssignment => {
  return {
    ...assignment,
    canonicalBranchName: assignment.canonicalBranchName ?? null,
    lanes: assignment.lanes.map(normalizeWorkerLane),
    plannerNotes: assignment.plannerNotes ?? [],
    humanFeedback: assignment.humanFeedback ?? [],
    supersededAt: assignment.supersededAt ?? null,
    supersededReason: assignment.supersededReason ?? null,
  };
};

const normalizeStoredThread = (thread: StoredThread): TeamThreadRecord => {
  return {
    ...thread,
    dispatchAssignments: (thread.dispatchAssignments ?? []).map(normalizeDispatchAssignment),
  };
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

const deriveLegacyThreadStatus = (thread: TeamThreadRecord): TeamThreadStatus => {
  if (thread.results.length === 0 && thread.userMessages.length > 0) {
    return "running";
  }

  return deriveCompletedStatus(thread.data);
};

const countWorkerLanes = (lanes: TeamWorkerLaneRecord[]): TeamWorkerLaneCounts => {
  return lanes.reduce<TeamWorkerLaneCounts>(
    (counts, lane) => {
      switch (lane.status) {
        case "idle":
          counts.idle += 1;
          break;
        case "queued":
          counts.queued += 1;
          break;
        case "coding":
          counts.coding += 1;
          break;
        case "reviewing":
          counts.reviewing += 1;
          break;
        case "awaiting_human_approval":
          counts.awaitingHumanApproval += 1;
          break;
        case "approved":
          counts.approved += 1;
          break;
        case "failed":
          counts.failed += 1;
          break;
      }

      return counts;
    },
    {
      idle: 0,
      queued: 0,
      coding: 0,
      reviewing: 0,
      awaitingHumanApproval: 0,
      approved: 0,
      failed: 0,
    },
  );
};

const hasAssignedTask = (lane: TeamWorkerLaneRecord): boolean => {
  return Boolean(lane.taskTitle || lane.taskObjective);
};

const deriveDispatchAssignmentStatus = (
  assignment: TeamDispatchAssignment,
): TeamDispatchAssignmentStatus => {
  if (assignment.supersededAt) {
    return "superseded";
  }

  const assignedLanes = assignment.lanes.filter(hasAssignedTask);

  if (assignedLanes.some((lane) => lane.status === "failed")) {
    return "failed";
  }

  if (assignedLanes.length === 0) {
    return "completed";
  }

  if (assignedLanes.every((lane) => lane.status === "approved")) {
    return "approved";
  }

  if (
    assignedLanes.every(
      (lane) => lane.status === "approved" || lane.status === "awaiting_human_approval",
    ) &&
    assignedLanes.some((lane) => lane.status === "awaiting_human_approval")
  ) {
    return "awaiting_human_approval";
  }

  return "running";
};

const isTerminalDispatchAssignmentStatus = (status: TeamDispatchAssignmentStatus): boolean => {
  return (
    status === "approved" ||
    status === "completed" ||
    status === "superseded" ||
    status === "failed"
  );
};

export const isTerminalThreadStatus = (status: TeamThreadStatus): boolean => {
  return status === "completed" || status === "approved" || status === "needs_revision" || status === "failed";
};

export const synchronizeDispatchAssignment = (
  assignment: TeamDispatchAssignment,
  now = new Date().toISOString(),
): TeamDispatchAssignment => {
  const derivedStatus = deriveDispatchAssignmentStatus(assignment);
  assignment.status = derivedStatus;
  assignment.updatedAt = now;
  assignment.finishedAt = isTerminalDispatchAssignmentStatus(derivedStatus)
    ? (assignment.finishedAt ?? now)
    : null;

  return assignment;
};

const getLatestDispatchAssignment = (thread: TeamThreadRecord): TeamDispatchAssignment | null => {
  if (thread.dispatchAssignments.length === 0) {
    return null;
  }

  return [...thread.dispatchAssignments].sort((left, right) => left.assignmentNumber - right.assignmentNumber).at(-1) ?? null;
};

const deriveDispatchThreadStatus = (thread: TeamThreadRecord): TeamThreadStatus | null => {
  const latestAssignment = getLatestDispatchAssignment(thread);
  if (!latestAssignment) {
    return null;
  }

  const assignmentStatus = deriveDispatchAssignmentStatus(latestAssignment);

  switch (assignmentStatus) {
    case "planning":
      return "planning";
    case "running":
      return "running";
    case "awaiting_human_approval":
      return "awaiting_human_approval";
    case "approved":
      return "approved";
    case "completed":
      return "completed";
    case "superseded":
      return "needs_revision";
    case "failed":
      return "failed";
  }
};

const deriveThreadStatus = (thread: TeamThreadRecord): TeamThreadStatus => {
  if (thread.run?.status === "failed") {
    return "failed";
  }

  return deriveDispatchThreadStatus(thread) ?? thread.run?.status ?? deriveLegacyThreadStatus(thread);
};

const deriveThreadLastError = (thread: TeamThreadRecord): string | null => {
  const latestAssignment = getLatestDispatchAssignment(thread);
  const laneError =
    latestAssignment?.lanes.find((lane) => lane.lastError)?.lastError ??
    latestAssignment?.humanFeedback.at(-1)?.message ??
    latestAssignment?.plannerNotes.at(-1)?.message ??
    null;

  if (deriveDispatchThreadStatus(thread) === "failed" && laneError) {
    return laneError;
  }

  return thread.run?.lastError ?? null;
};

export const synchronizeTeamThreadRun = (
  thread: TeamThreadRecord,
  now = new Date().toISOString(),
): TeamThreadRecord => {
  thread.dispatchAssignments = thread.dispatchAssignments.map((assignment) =>
    synchronizeDispatchAssignment(assignment, assignment.updatedAt || now),
  );

  const status = deriveThreadStatus(thread);
  thread.run = {
    status,
    startedAt: thread.run?.startedAt ?? thread.createdAt,
    finishedAt: isTerminalThreadStatus(status) ? (thread.run?.finishedAt ?? now) : null,
    lastError: deriveThreadLastError(thread),
  };

  return thread;
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

const summarizeThread = (storedThread: StoredThread): TeamThreadSummary => {
  const thread = synchronizeTeamThreadRun(normalizeStoredThread(storedThread), storedThread.updatedAt);
  const orderedHandoffs = getOrderedHandoffs(thread.data);
  const latestHandoff = orderedHandoffs.at(-1);
  const status = deriveThreadStatus(thread);
  const latestAssignment = getLatestDispatchAssignment(thread);
  const workerLanes = latestAssignment?.lanes ?? [];

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
    latestAssignmentStatus: latestAssignment?.status ?? null,
    latestPlanSummary: latestAssignment?.plannerSummary ?? null,
    latestBranchPrefix: latestAssignment?.branchPrefix ?? null,
    latestCanonicalBranchName: latestAssignment?.canonicalBranchName ?? null,
    dispatchWorkerCount: latestAssignment?.workerCount ?? 0,
    workerCounts: countWorkerLanes(workerLanes),
    workerLanes,
    plannerNotes: latestAssignment?.plannerNotes ?? [],
    humanFeedback: latestAssignment?.humanFeedback ?? [],
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

export const getTeamThreadRecord = async (
  threadFile: string,
  threadId: string,
): Promise<TeamThreadRecord | null> => {
  const storePath = resolveStorePath(threadFile);
  const store = await readThreadStore(storePath);
  const thread = store.threads[threadId];

  return thread ? synchronizeTeamThreadRun(normalizeStoredThread(thread), thread.updatedAt) : null;
};

export const updateTeamThreadRecord = async <T>({
  threadFile,
  threadId,
  updater,
}: {
  threadFile: string;
  threadId: string;
  updater: (thread: TeamThreadRecord, now: string) => Promise<T> | T;
}): Promise<T> => {
  const storePath = resolveStorePath(threadFile);

  return queueStoreMutation(storePath, async () => {
    const store = await readThreadStore(storePath);
    const currentThread = store.threads[threadId];
    if (!currentThread) {
      throw new Error(`Thread ${threadId} was not found in ${threadFile}.`);
    }

    const now = new Date().toISOString();
    const thread = normalizeStoredThread(currentThread);
    const value = await updater(thread, now);
    thread.updatedAt = now;
    synchronizeTeamThreadRun(thread, now);
    store.threads[threadId] = thread;
    await writeThreadStore(storePath, store);

    return value;
  });
};

export const listPendingDispatchAssignments = async (
  threadFile: string,
  threadId?: string,
): Promise<PendingDispatchAssignment[]> => {
  const storePath = resolveStorePath(threadFile);
  const store = await readThreadStore(storePath);
  const threads = threadId
    ? Object.values(store.threads).filter((thread) => thread.threadId === threadId)
    : Object.values(store.threads);

  return threads
    .flatMap((storedThread) => {
      const thread = synchronizeTeamThreadRun(normalizeStoredThread(storedThread), storedThread.updatedAt);
      return thread.dispatchAssignments
        .filter((assignment) => !isTerminalDispatchAssignmentStatus(assignment.status))
        .map((assignment) => ({
          threadId: thread.threadId,
          assignment,
        }));
    })
    .sort((left, right) => {
      if (left.threadId !== right.threadId) {
        return left.threadId.localeCompare(right.threadId);
      }

      return left.assignment.assignmentNumber - right.assignment.assignmentNumber;
    });
};

export const threadHasActiveDispatchAssignment = async (
  threadFile: string,
  threadId: string,
): Promise<boolean> => {
  const thread = await getTeamThreadRecord(threadFile, threadId);
  if (!thread) {
    return false;
  }

  return thread.dispatchAssignments.some((assignment) => !isTerminalDispatchAssignmentStatus(assignment.status));
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
  await updateTeamThreadRecord({
    threadFile,
    threadId,
    updater: (thread, now) => {
      thread.run = {
        status: "failed",
        startedAt: thread.run?.startedAt ?? thread.createdAt,
        finishedAt: now,
        lastError: error,
      };
    },
  });
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

      const normalizedThread = normalizeStoredThread(thread);
      const storedData = normalizedThread.data;
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

      return normalizedThread.results.map(deserializeResult);
    },
    appendUserMessage: async ({ threadId, state, userMessage }) => {
      if (!threadId) {
        return;
      }

      await queueStoreMutation(storePath, async () => {
        const store = await readThreadStore(storePath);
        const currentThread = store.threads[threadId];
        const now = new Date().toISOString();
        const userMessages = currentThread?.userMessages ?? [];
        const existingDispatchAssignments = currentThread?.dispatchAssignments ?? [];

        const thread: TeamThreadRecord = {
          threadId,
          data: {
            ...state.data,
            latestInput: userMessage.content,
          },
          results: currentThread ? normalizeStoredThread(currentThread).results : [],
          userMessages: [
            ...userMessages,
            {
              id: userMessage.id,
              role: "user",
              content: userMessage.content,
              timestamp: userMessage.timestamp.toISOString(),
            },
          ],
          dispatchAssignments: existingDispatchAssignments,
          run: {
            status: "running",
            startedAt: currentThread?.run?.startedAt ?? now,
            finishedAt: null,
            lastError: null,
          },
          createdAt: currentThread?.createdAt ?? now,
          updatedAt: now,
        };

        synchronizeTeamThreadRun(thread, now);
        store.threads[threadId] = thread;
        await writeThreadStore(storePath, store);
      });
    },
    appendResults: async ({ threadId, state, newResults }) => {
      if (!threadId) {
        return;
      }

      await updateTeamThreadRecord({
        threadFile,
        threadId,
        updater: (thread) => {
          thread.data = {
            ...state.data,
            handoffs: filterHandoffsForWorkflow(state.data),
          };
          thread.results = [...thread.results, ...newResults.map(serializeResult)];
        },
      });
    },
  };
};
