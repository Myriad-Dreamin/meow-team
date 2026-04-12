import "server-only";

import type { TeamRepositoryOption } from "@/lib/git/repository";
import type { TeamRunState } from "@/lib/team/network";
import {
  normalizeConventionalTitleMetadata,
  parseConventionalTitle,
  resolveDisplayRequestTitle,
} from "@/lib/team/request-title";
import {
  getTeamThreadStorageRecord,
  listTeamThreadStorageRecords,
  type TeamThreadStorageTarget,
  type TeamThreadStorageRecord,
  updateTeamThreadStorageRecord,
} from "@/lib/team/storage";
import {
  createEmptyWorkerLaneCounts,
  mergeWorkerLaneCounts,
  type TeamWorkspaceStatusSnapshot,
} from "@/lib/team/status";
import type {
  TeamDispatchAssignment,
  TeamDispatchAssignmentStatus,
  TeamExecutionStep,
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

type StoredLegacyMessagePart = {
  type?: string;
  text?: string;
};

type StoredLegacyMessage = {
  type?: string;
  content?: string | StoredLegacyMessagePart[];
};

type StoredLegacyResult = {
  agentName: string;
  output?: StoredLegacyMessage[];
  createdAt: string;
  text?: string;
};

type StoredUserMessage = {
  id: string;
  role: "user";
  content: string;
  timestamp: string;
};

export type TeamThreadUserMessage = StoredUserMessage;

type StoredThread = {
  threadId: string;
  data: TeamRunState;
  results: Array<TeamExecutionStep | StoredLegacyResult>;
  userMessages: StoredUserMessage[];
  dispatchAssignments?: TeamDispatchAssignment[];
  run?: StoredRun;
  createdAt: string;
  updatedAt: string;
};

export type TeamThreadRecord = {
  threadId: string;
  data: TeamRunState;
  results: TeamExecutionStep[];
  userMessages: StoredUserMessage[];
  dispatchAssignments: TeamDispatchAssignment[];
  run?: StoredRun;
  createdAt: string;
  updatedAt: string;
};

export type TeamThreadSummary = {
  threadId: string;
  assignmentNumber: number;
  status: TeamThreadStatus;
  requestTitle: string;
  requestText: string | null;
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

export type TeamThreadDetail = {
  summary: TeamThreadSummary;
  userMessages: TeamThreadUserMessage[];
  steps: TeamExecutionStep[];
  handoffs: TeamRoleHandoff[];
  dispatchAssignments: TeamDispatchAssignment[];
};

export type PendingDispatchAssignment = {
  threadId: string;
  assignment: TeamDispatchAssignment;
};

const describeThreadStorageTarget = (target: TeamThreadStorageTarget): string => {
  return typeof target === "string" ? target : target.location.inputPath;
};

const readStoredThreadFromRecord = (record: TeamThreadStorageRecord): StoredThread => {
  try {
    const parsed = JSON.parse(record.payloadJson) as StoredThread | null;
    if (!parsed || typeof parsed !== "object") {
      throw new Error("Stored thread payload must be a JSON object.");
    }

    return {
      ...parsed,
      threadId: parsed.threadId ?? record.threadId,
      createdAt: parsed.createdAt ?? record.createdAt,
      updatedAt: parsed.updatedAt ?? record.updatedAt,
    };
  } catch (error) {
    throw new Error(`Thread ${record.threadId} could not be parsed from SQLite storage.`, {
      cause: error,
    });
  }
};

const serializeStoredThreadRecord = (thread: StoredThread): TeamThreadStorageRecord => {
  return {
    threadId: thread.threadId,
    payloadJson: JSON.stringify(thread),
    createdAt: thread.createdAt,
    updatedAt: thread.updatedAt,
  };
};

const extractLegacyMessageText = (message: StoredLegacyMessage): string => {
  if (message.type !== "text") {
    return "";
  }

  if (typeof message.content === "string") {
    return message.content;
  }

  if (!Array.isArray(message.content)) {
    return "";
  }

  return message.content
    .filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => part.text as string)
    .join("\n");
};

const normalizeExecutionStep = (
  result: TeamExecutionStep | StoredLegacyResult,
): TeamExecutionStep => {
  if ("text" in result && typeof result.text === "string") {
    return {
      agentName: result.agentName,
      createdAt: result.createdAt,
      text: result.text,
    };
  }

  const legacyResult = result as StoredLegacyResult;
  return {
    agentName: legacyResult.agentName,
    createdAt: legacyResult.createdAt,
    text: (legacyResult.output ?? []).map(extractLegacyMessageText).filter(Boolean).join("\n\n"),
  };
};

const normalizePushedCommit = (
  pushedCommit: TeamWorkerLaneRecord["pushedCommit"] | undefined,
): TeamWorkerLaneRecord["pushedCommit"] => {
  if (!pushedCommit) {
    return null;
  }

  return {
    remoteName: pushedCommit.remoteName,
    repositoryUrl: pushedCommit.repositoryUrl,
    branchUrl: pushedCommit.branchUrl,
    commitUrl: pushedCommit.commitUrl,
    commitHash: pushedCommit.commitHash,
    pushedAt: pushedCommit.pushedAt,
  };
};

const normalizeWorkerLane = (lane: TeamWorkerLaneRecord): TeamWorkerLaneRecord => {
  const defaultExecutionPhase =
    lane.status === "queued" || lane.status === "coding" || lane.status === "reviewing"
      ? "implementation"
      : null;

  return {
    ...lane,
    executionPhase: lane.executionPhase ?? defaultExecutionPhase,
    proposalChangeName: lane.proposalChangeName ?? null,
    proposalPath: lane.proposalPath ?? null,
    workerSlot: lane.workerSlot ?? null,
    latestImplementationCommit: lane.latestImplementationCommit ?? null,
    pushedCommit: normalizePushedCommit(lane.pushedCommit),
    latestCoderHandoff: lane.latestCoderHandoff ?? null,
    latestReviewerHandoff: lane.latestReviewerHandoff ?? null,
    approvalRequestedAt: lane.approvalRequestedAt ?? null,
    approvalGrantedAt: lane.approvalGrantedAt ?? null,
    queuedAt: lane.queuedAt ?? null,
    pullRequest: lane.pullRequest
      ? {
          ...lane.pullRequest,
          provider: lane.pullRequest.provider === "github" ? "github" : "local-ci",
          summary: lane.pullRequest.summary ?? null,
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
    requestTitle: assignment.requestTitle ?? null,
    conventionalTitle:
      normalizeConventionalTitleMetadata(assignment.conventionalTitle) ??
      parseConventionalTitle(assignment.requestTitle)?.metadata ??
      null,
    requestText: assignment.requestText ?? null,
    canonicalBranchName: assignment.canonicalBranchName ?? null,
    threadSlot: assignment.threadSlot ?? null,
    plannerWorktreePath: assignment.plannerWorktreePath ?? null,
    lanes: assignment.lanes.map(normalizeWorkerLane),
    plannerNotes: assignment.plannerNotes ?? [],
    humanFeedback: assignment.humanFeedback ?? [],
    supersededAt: assignment.supersededAt ?? null,
    supersededReason: assignment.supersededReason ?? null,
  };
};

const normalizeRunState = (state: TeamRunState): TeamRunState => {
  return {
    ...state,
    requestTitle: state.requestTitle ?? null,
    conventionalTitle:
      normalizeConventionalTitleMetadata(state.conventionalTitle) ??
      parseConventionalTitle(state.requestTitle)?.metadata ??
      null,
    requestText: state.requestText ?? null,
    latestInput: state.latestInput ?? null,
  };
};

const normalizeStoredThread = (thread: StoredThread): TeamThreadRecord => {
  return {
    ...thread,
    data: normalizeRunState(thread.data),
    results: (thread.results ?? []).map(normalizeExecutionStep),
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
  return lanes.reduce<TeamWorkerLaneCounts>((counts, lane) => {
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
  }, createEmptyWorkerLaneCounts());
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

  if (
    assignedLanes.every(
      (lane) => lane.status === "approved" && lane.pullRequest?.status === "approved",
    )
  ) {
    return "completed";
  }

  if (assignedLanes.some((lane) => lane.pullRequest?.status === "failed")) {
    return "failed";
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
  return (
    status === "completed" ||
    status === "approved" ||
    status === "needs_revision" ||
    status === "failed"
  );
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

  return (
    [...thread.dispatchAssignments]
      .sort((left, right) => left.assignmentNumber - right.assignmentNumber)
      .at(-1) ?? null
  );
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

  return (
    deriveDispatchThreadStatus(thread) ?? thread.run?.status ?? deriveLegacyThreadStatus(thread)
  );
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

const summarizeThreadRecord = (thread: TeamThreadRecord): TeamThreadSummary => {
  const orderedHandoffs = getOrderedHandoffs(thread.data);
  const latestHandoff = orderedHandoffs.at(-1);
  const status = deriveThreadStatus(thread);
  const latestAssignment = getLatestDispatchAssignment(thread);
  const workerLanes = latestAssignment?.lanes ?? [];
  const latestInput =
    thread.data.latestInput ??
    thread.userMessages.at(-1)?.content ??
    thread.userMessages[0]?.content ??
    null;
  const requestText = latestAssignment?.requestText ?? thread.data.requestText ?? latestInput;

  return {
    threadId: thread.threadId,
    assignmentNumber: thread.data.assignmentNumber,
    status,
    requestTitle: resolveDisplayRequestTitle({
      requestTitle: latestAssignment?.requestTitle ?? thread.data.requestTitle,
      requestText,
    }),
    requestText,
    latestInput,
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

const summarizeThread = (storedThread: StoredThread): TeamThreadSummary => {
  const thread = synchronizeTeamThreadRun(
    normalizeStoredThread(storedThread),
    storedThread.updatedAt,
  );

  return summarizeThreadRecord(thread);
};

export const listTeamThreadSummaries = async (
  threadFile: TeamThreadStorageTarget,
  limit = 24,
): Promise<TeamThreadSummary[]> => {
  const storedThreads = await listTeamThreadStorageRecords(threadFile, limit);
  return storedThreads.map((record) => summarizeThread(readStoredThreadFromRecord(record)));
};

export const getTeamWorkspaceStatusSnapshot = async (
  threadFile: TeamThreadStorageTarget,
): Promise<TeamWorkspaceStatusSnapshot> => {
  const storedThreads = await listTeamThreadStorageRecords(threadFile);

  return storedThreads.reduce<TeamWorkspaceStatusSnapshot>(
    (snapshot, storedRecord) => {
      const summary = summarizeThread(readStoredThreadFromRecord(storedRecord));

      snapshot.livingThreadCount += 1;

      if (isTerminalThreadStatus(summary.status)) {
        return snapshot;
      }

      snapshot.activeThreadCount += 1;
      snapshot.laneCounts = mergeWorkerLaneCounts(snapshot.laneCounts, summary.workerCounts);

      return snapshot;
    },
    {
      activeThreadCount: 0,
      livingThreadCount: 0,
      laneCounts: createEmptyWorkerLaneCounts(),
    },
  );
};

export const getTeamThreadRecord = async (
  threadFile: TeamThreadStorageTarget,
  threadId: string,
): Promise<TeamThreadRecord | null> => {
  const storedRecord = await getTeamThreadStorageRecord(threadFile, threadId);
  const thread = storedRecord ? readStoredThreadFromRecord(storedRecord) : null;

  return thread ? synchronizeTeamThreadRun(normalizeStoredThread(thread), thread.updatedAt) : null;
};

export const getTeamThreadDetail = async (
  threadFile: TeamThreadStorageTarget,
  threadId: string,
): Promise<TeamThreadDetail | null> => {
  const thread = await getTeamThreadRecord(threadFile, threadId);
  if (!thread) {
    return null;
  }

  const handoffs = getOrderedHandoffs(thread.data);

  return {
    summary: summarizeThreadRecord(thread),
    userMessages: thread.userMessages,
    steps: thread.results,
    handoffs,
    dispatchAssignments: [...thread.dispatchAssignments].sort(
      (left, right) => right.assignmentNumber - left.assignmentNumber,
    ),
  };
};

export const updateTeamThreadRecord = async <T>({
  threadFile,
  threadId,
  updater,
}: {
  threadFile: TeamThreadStorageTarget;
  threadId: string;
  updater: (thread: TeamThreadRecord, now: string) => Promise<T> | T;
}): Promise<T> => {
  return updateTeamThreadStorageRecord({
    threadFile,
    threadId,
    updater: async (storedRecord) => {
      if (!storedRecord) {
        throw new Error(
          `Thread ${threadId} was not found in ${describeThreadStorageTarget(threadFile)}.`,
        );
      }

      const now = new Date().toISOString();
      const thread = normalizeStoredThread(readStoredThreadFromRecord(storedRecord));
      const value = await updater(thread, now);
      thread.updatedAt = now;
      synchronizeTeamThreadRun(thread, now);

      return {
        value,
        nextRecord: serializeStoredThreadRecord(thread),
      };
    },
  });
};

export const listPendingDispatchAssignments = async (
  threadFile: TeamThreadStorageTarget,
  threadId?: string,
): Promise<PendingDispatchAssignment[]> => {
  const storedThreads = threadId
    ? [await getTeamThreadStorageRecord(threadFile, threadId)].filter(
        (record): record is TeamThreadStorageRecord => Boolean(record),
      )
    : await listTeamThreadStorageRecords(threadFile);

  return storedThreads
    .flatMap((storedRecord) => {
      const storedThread = readStoredThreadFromRecord(storedRecord);
      const thread = synchronizeTeamThreadRun(
        normalizeStoredThread(storedThread),
        storedThread.updatedAt,
      );
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
  threadFile: TeamThreadStorageTarget,
  threadId: string,
): Promise<boolean> => {
  const thread = await getTeamThreadRecord(threadFile, threadId);
  if (!thread) {
    return false;
  }

  return thread.dispatchAssignments.some(
    (assignment) => !isTerminalDispatchAssignmentStatus(assignment.status),
  );
};

export const countActiveDispatchThreads = async (
  threadFile: TeamThreadStorageTarget,
): Promise<number> => {
  const pendingAssignments = await listPendingDispatchAssignments(threadFile);
  return new Set(pendingAssignments.map((pending) => pending.threadId)).size;
};

export const markTeamThreadFailed = async ({
  threadFile,
  threadId,
  error,
}: {
  threadFile: TeamThreadStorageTarget;
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

export const upsertTeamThreadRun = async ({
  threadFile,
  threadId,
  state,
  input,
}: {
  threadFile: TeamThreadStorageTarget;
  threadId: string;
  state: TeamRunState;
  input: string;
}): Promise<void> => {
  await updateTeamThreadStorageRecord({
    threadFile,
    threadId,
    updater: (storedRecord) => {
      const now = new Date().toISOString();
      const existingThread = storedRecord
        ? normalizeStoredThread(readStoredThreadFromRecord(storedRecord))
        : null;

      const thread: TeamThreadRecord = {
        threadId,
        data: {
          ...state,
          latestInput: input,
          handoffs: filterHandoffsForWorkflow(state),
        },
        results: existingThread?.results ?? [],
        userMessages: [
          ...(existingThread?.userMessages ?? []),
          {
            id: crypto.randomUUID(),
            role: "user",
            content: input,
            timestamp: now,
          },
        ],
        dispatchAssignments: existingThread?.dispatchAssignments ?? [],
        run: {
          status: "running",
          startedAt: existingThread?.run?.startedAt ?? now,
          finishedAt: null,
          lastError: null,
        },
        createdAt: existingThread?.createdAt ?? now,
        updatedAt: now,
      };

      synchronizeTeamThreadRun(thread, now);

      return {
        value: undefined,
        nextRecord: serializeStoredThreadRecord(thread),
      };
    },
  });
};

export const appendTeamExecutionStep = async ({
  threadFile,
  threadId,
  state,
  step,
}: {
  threadFile: TeamThreadStorageTarget;
  threadId: string;
  state: TeamRunState;
  step: TeamExecutionStep;
}): Promise<void> => {
  await updateTeamThreadRecord({
    threadFile,
    threadId,
    updater: (thread) => {
      thread.data = {
        ...state,
        handoffs: filterHandoffsForWorkflow(state),
      };
      thread.results = [...thread.results, step];
    },
  });
};
