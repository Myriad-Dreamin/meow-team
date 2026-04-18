"use client";

import {
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
  type RefCallback,
} from "react";
import { LaneMarkdownText } from "@/components/lane-markdown";
import type { LaneApprovalAction, ThreadLogGroup } from "@/components/thread-view-utils";
import {
  buildFeedbackKey,
  canRestartPlanning,
  describeLane,
  describeLogEntryContext,
  formatAssignmentStatusLabel,
  formatThreadId,
  formatFeedbackLabel,
  formatPoolSlot,
  formatTimestamp,
  getLaneApprovalActions,
  getLaneBranchDisplay,
  getLaneCommitDisplay,
  getLaneStatusClassName,
  getLaneStatusLabel,
  groupThreadLogEntries,
  pullRequestStatusLabels,
  selectPrimaryLane,
  threadStatusLabels,
} from "@/components/thread-view-utils";
import type { TeamThreadDetail, TeamThreadSummary } from "@/lib/team/history";
import type {
  TeamCodexLogCursorEntry,
  TeamHumanFeedbackScope,
  TeamHumanFeedbackRecord,
  TeamCodexLogPageInfo,
  TeamWorkerEvent,
} from "@/lib/team/types";

type ThreadDetailTimelineProps = {
  thread: TeamThreadSummary;
  detail: TeamThreadDetail | null;
  isLoadingDetail: boolean;
  approvalKey: string | null;
  feedbackKey: string | null;
  feedbackDrafts: Record<string, string>;
  onApprove: (assignmentNumber: number, laneId: string, approvalAction: LaneApprovalAction) => void;
  onFeedbackChange: (key: string, value: string) => void;
  onFeedback: (options: {
    assignmentNumber: number;
    scope: TeamHumanFeedbackScope;
    laneId?: string;
  }) => void;
};

type WindowResponse = {
  entries: TeamCodexLogCursorEntry[];
  pageInfo: TeamCodexLogPageInfo;
};

type StderrBlockResponse = {
  entries: TeamCodexLogCursorEntry[];
  block: {
    startCursor: number;
    endCursor: number;
  };
};

export type TimelineAnchor = {
  id: string;
  label: string;
  level: "primary" | "secondary" | "tertiary";
};

export type TimelineLogGroup = {
  group: ThreadLogGroup;
  fullMessage: string | null;
  expandedMode: "collapsed" | "live" | "manual";
  isLoading: boolean;
};

export type TimelineTaskOutputBundle = {
  contextEntry: TeamCodexLogCursorEntry;
  endedAt: string;
  id: string;
  lineCount: number;
  groups: TimelineLogGroup[];
  startedAt: string;
};

type ThreadTimelineAnchorFields = {
  anchorId?: string;
  anchorLabel?: string;
  anchorLevel?: TimelineAnchor["level"];
};

export type ThreadTimelineItem =
  | (ThreadTimelineAnchorFields & {
      id: string;
      occurredAt: string;
      kind: "message";
      title: string;
      text: string;
      variant: "human" | "agent";
    })
  | (ThreadTimelineAnchorFields & {
      id: string;
      occurredAt: string;
      kind: "planner-note";
      note: string;
    })
  | (ThreadTimelineAnchorFields & {
      id: string;
      occurredAt: string;
      kind: "human-feedback";
      feedback: TeamHumanFeedbackRecord;
    })
  | (ThreadTimelineAnchorFields & {
      id: string;
      occurredAt: string;
      kind: "handoff";
      handoff: TeamThreadDetail["handoffs"][number];
    })
  | (ThreadTimelineAnchorFields & {
      assignmentNumber: number;
      id: string;
      kind: "lane-event";
      lane: TeamThreadDetail["dispatchAssignments"][number]["lanes"][number];
      event: TeamWorkerEvent;
      occurredAt: string;
      proposalAnchorId: string;
    })
  | (ThreadTimelineAnchorFields & {
      id: string;
      occurredAt: string;
      kind: "assignment";
      assignment: TeamThreadDetail["dispatchAssignments"][number];
      childAnchors: TimelineAnchor[];
    })
  | (ThreadTimelineAnchorFields & {
      id: string;
      occurredAt: string;
      kind: "task-output";
      taskOutput: TimelineTaskOutputBundle;
    });

const LOG_POLL_INTERVAL_MS = 3000;
const LOG_WINDOW_LIMIT = 140;
const SCROLL_THRESHOLD_PX = 56;
const ACTIVE_ANCHOR_OFFSET_PX = 96;

const buildAssignmentAnchorId = (assignmentNumber: number): string =>
  `thread-anchor-assignment-${assignmentNumber}`;

const buildLaneAnchorId = (assignmentNumber: number, laneId: string): string =>
  `thread-anchor-assignment-${assignmentNumber}-${laneId}`;

const buildLaneEventAnchorId = (
  assignmentNumber: number,
  laneId: string,
  eventId: string,
): string => `thread-anchor-assignment-${assignmentNumber}-${laneId}-event-${eventId}`;

const EMPTY_PAGE_INFO: TeamCodexLogPageInfo = {
  beforeCursor: null,
  afterCursor: null,
  hasOlder: false,
  hasNewer: false,
};

const tryParseJson = (value: string): unknown => {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null;
};

const isCursorEntry = (value: unknown): value is TeamCodexLogCursorEntry => {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.threadId === "string" &&
    typeof value.source === "string" &&
    typeof value.message === "string" &&
    typeof value.createdAt === "string" &&
    typeof value.startCursor === "number" &&
    typeof value.endCursor === "number"
  );
};

const isPageInfo = (value: unknown): value is TeamCodexLogPageInfo => {
  return (
    isRecord(value) &&
    (typeof value.beforeCursor === "number" || value.beforeCursor === null) &&
    (typeof value.afterCursor === "number" || value.afterCursor === null) &&
    typeof value.hasOlder === "boolean" &&
    typeof value.hasNewer === "boolean"
  );
};

const isWindowResponse = (value: unknown): value is WindowResponse => {
  return (
    isRecord(value) &&
    Array.isArray(value.entries) &&
    value.entries.every(isCursorEntry) &&
    isPageInfo(value.pageInfo)
  );
};

const isStderrBlockResponse = (value: unknown): value is StderrBlockResponse => {
  return (
    isRecord(value) &&
    Array.isArray(value.entries) &&
    value.entries.every(isCursorEntry) &&
    isRecord(value.block) &&
    typeof value.block.startCursor === "number" &&
    typeof value.block.endCursor === "number"
  );
};

const readErrorMessage = (value: unknown): string | null => {
  if (!isRecord(value) || typeof value.error !== "string" || !value.error.trim()) {
    return null;
  }

  return value.error;
};

const buildUnexpectedLogsResponseMessage = (response: Response): string => {
  return `Unable to refresh thread activity (HTTP ${response.status}).`;
};

const titleizeIdentifier = (value: string): string => {
  return value
    .split(/[-_]/gu)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
};

const formatEventActorLabel = (actor: TeamWorkerEvent["actor"]): string => {
  return titleizeIdentifier(actor);
};

const normalizeAnchorMessage = (value: string): string => {
  return value.replace(/\s+/gu, " ").trim().toLowerCase();
};

export const formatCompactTimelineStepLabel = (agentName: string, text: string): string => {
  const normalizedAgent = agentName.trim() || "Agent";
  const normalizedText = normalizeAnchorMessage(text);

  if (
    normalizedAgent.toLowerCase() === "planner" &&
    (/preferred .*change/u.test(normalizedText) || normalizedText.includes("proposal"))
  ) {
    return "Planner proposed";
  }

  if (normalizedText.includes("approved")) {
    return `${normalizedAgent} approved`;
  }

  if (
    normalizedText.includes("requested changes") ||
    normalizedText.includes("needs revision") ||
    normalizedText.includes("revision")
  ) {
    return `${normalizedAgent} revision`;
  }

  return normalizedAgent;
};

export const formatCompactTimelineHandoffLabel = (
  handoff: Pick<TeamThreadDetail["handoffs"][number], "decision" | "roleId" | "roleName">,
): string => {
  const roleLabelN = (handoff.roleId || handoff.roleName || "agent").trim();
  const roleLabel = titleizeIdentifier(roleLabelN);

  if (handoff.decision === "approved") {
    return `${roleLabel} approved`;
  }

  if (handoff.decision === "needs_revision") {
    return `${roleLabel} revision`;
  }

  return `${roleLabel} handoff`;
};

export const formatCompactTimelinePlannerNoteLabel = (message: string): string => {
  const normalizedMessage = normalizeAnchorMessage(message);

  if (normalizedMessage.includes("human approved proposal")) {
    return "Human approved planner";
  }

  if (normalizedMessage.includes("created") && normalizedMessage.includes("proposal")) {
    return "Planner proposed";
  }

  if (normalizedMessage.includes("waiting for human approval")) {
    return "Planner waiting";
  }

  if (normalizedMessage.includes("conflict")) {
    return "Planner conflict";
  }

  if (normalizedMessage.includes("failed")) {
    return "Planner failed";
  }

  return "Planner note";
};

export const formatCompactTimelineFeedbackLabel = (
  feedback: Pick<TeamHumanFeedbackRecord, "scope">,
): string => {
  return feedback.scope === "proposal" ? "proposal feedback" : "request feedback";
};

export const buildCompactLaneEventLabels = (events: TeamWorkerEvent[]): string[] => {
  let coderRunCount = 0;
  let reviewerRunCount = 0;
  let reviewerRevisionCount = 0;

  return events.map((event) => {
    const normalizedMessage = normalizeAnchorMessage(event.message);

    switch (event.actor) {
      case "planner":
        if (normalizedMessage.includes("rebase")) {
          return "Planner rebase";
        }

        if (normalizedMessage.includes("approved")) {
          return "Planner approved";
        }

        return "Planner proposed";

      case "human":
        if (normalizedMessage.includes("approved")) {
          return "Human approved";
        }

        return "Human update";

      case "coder":
        const verb = normalizedMessage.includes("implementing")
          ? "implementing"
          : normalizedMessage.includes("requested review")
            ? "requested review"
            : "updated";
        if (verb === "implementing") {
          coderRunCount += 1;
        }

        if (coderRunCount > 0) {
          return `Coder ${verb} ${coderRunCount}`;
        }

        return `Coder ${verb}`;

      case "executor":
        const executorVerb = normalizedMessage.includes("implementing")
          ? "implementing"
          : normalizedMessage.includes("requested review")
            ? "requested review"
            : "updated";
        if (executorVerb === "implementing") {
          coderRunCount += 1;
        }

        if (coderRunCount > 0) {
          return `Executor ${executorVerb} ${coderRunCount}`;
        }

        return `Executor ${executorVerb}`;

      case "reviewer":
        if (normalizedMessage.startsWith("reviewer is ")) {
          reviewerRunCount += 1;
          return `Reviewer run ${reviewerRunCount}`;
        }

        if (normalizedMessage.includes("requested changes")) {
          reviewerRevisionCount += 1;
          return `Reviewer revision ${reviewerRevisionCount}`;
        }

        if (
          normalizedMessage.includes("approved the proposal") ||
          normalizedMessage.includes("completed machine review")
        ) {
          reviewerRunCount = Math.max(reviewerRunCount, 1);
          return "Reviewer approved";
        }

        return "Reviewer update";

      case "execution-reviewer":
        if (normalizedMessage.startsWith("execution reviewer is ")) {
          reviewerRunCount += 1;
          return `Execution review ${reviewerRunCount}`;
        }

        if (normalizedMessage.includes("requested changes")) {
          reviewerRevisionCount += 1;
          return `Execution revision ${reviewerRevisionCount}`;
        }

        if (
          normalizedMessage.includes("approved the proposal") ||
          normalizedMessage.includes("completed machine review")
        ) {
          reviewerRunCount = Math.max(reviewerRunCount, 1);
          return "Execution review approved";
        }

        return "Execution review update";

      case "system":
        if (normalizedMessage.includes("published")) {
          const match = normalizedMessage.match(/published commit \[(\w{7,40})/iu);
          if (match) {
            return `Commit ${match[1]}`;
          }
        }
        if (normalizedMessage.includes("/opsx:archive")) {
          return "System archiving";
        }

        if (normalizedMessage.includes("github pr ready")) {
          return "System PR";
        }

        if (normalizedMessage.includes("archived openspec")) {
          return "System archived";
        }

        if (normalizedMessage.includes("deleted openspec")) {
          return "System deleted";
        }

        return "System update";

      default:
        return `${event.actor} update`;
    }
  });
};

const fetchLogWindow = async ({
  afterCursor,
  beforeCursor,
  threadId,
}: {
  afterCursor?: number | null;
  beforeCursor?: number | null;
  threadId: string;
}): Promise<WindowResponse> => {
  const searchParams = new URLSearchParams({
    limit: String(LOG_WINDOW_LIMIT),
    threadId,
  });

  if (typeof afterCursor === "number") {
    searchParams.set("afterCursor", String(afterCursor));
  }

  if (typeof beforeCursor === "number") {
    searchParams.set("beforeCursor", String(beforeCursor));
  }

  const response = await fetch(`/api/team/logs?${searchParams.toString()}`, {
    cache: "no-store",
  });
  const rawPayload = await response.text();
  const payload = tryParseJson(rawPayload);

  if (!response.ok || !isWindowResponse(payload)) {
    throw new Error(readErrorMessage(payload) ?? buildUnexpectedLogsResponseMessage(response));
  }

  return payload;
};

const fetchStderrBlock = async ({
  endCursor,
  startCursor,
  threadId,
}: {
  endCursor: number;
  startCursor: number;
  threadId: string;
}): Promise<StderrBlockResponse> => {
  const searchParams = new URLSearchParams({
    endCursor: String(endCursor),
    mode: "stderr-block",
    startCursor: String(startCursor),
    threadId,
  });

  const response = await fetch(`/api/team/logs?${searchParams.toString()}`, {
    cache: "no-store",
  });
  const rawPayload = await response.text();
  const payload = tryParseJson(rawPayload);

  if (!response.ok || !isStderrBlockResponse(payload)) {
    throw new Error(readErrorMessage(payload) ?? buildUnexpectedLogsResponseMessage(response));
  }

  return payload;
};

const buildLogGroupState = (
  group: ThreadLogGroup,
  mode: TimelineLogGroup["expandedMode"],
  options?: {
    preserveCollapsedMessage?: boolean;
  },
): TimelineLogGroup => {
  if (group.source !== "stderr") {
    return {
      expandedMode: "manual",
      fullMessage: group.message,
      group,
      isLoading: false,
    };
  }

  const fullMessage = mode === "collapsed" ? null : group.message;

  return {
    expandedMode: mode,
    fullMessage,
    group: {
      ...group,
      message: fullMessage ?? (options?.preserveCollapsedMessage ? group.message : group.preview),
    },
    isLoading: false,
  };
};

const getLogGroupExpandedMode = (
  group: ThreadLogGroup,
  latestTailStderrId: string | null,
  strategy: "history" | "tail",
): TimelineLogGroup["expandedMode"] => {
  if (group.source !== "stderr") {
    return "manual";
  }

  return strategy === "tail" && group.id === latestTailStderrId ? "live" : "collapsed";
};

const materializeLogGroups = (
  groups: ThreadLogGroup[],
  strategy: "history" | "tail",
): TimelineLogGroup[] => {
  const latestTailStderrId =
    strategy === "tail"
      ? (groups.filter((group) => group.source === "stderr").at(-1)?.id ?? null)
      : null;

  return groups.map((group) => {
    return buildLogGroupState(group, getLogGroupExpandedMode(group, latestTailStderrId, strategy));
  });
};

const canMergeLogGroupContext = (left: ThreadLogGroup, right: ThreadLogGroup): boolean => {
  return (
    left.source === right.source &&
    left.contextEntry.roleId === right.contextEntry.roleId &&
    left.contextEntry.laneId === right.contextEntry.laneId &&
    left.contextEntry.assignmentNumber === right.contextEntry.assignmentNumber
  );
};

export const mergeTimelineLogGroupPair = (
  left: TimelineLogGroup,
  right: TimelineLogGroup,
): TimelineLogGroup => {
  const mergedGroup: ThreadLogGroup = {
    ...left.group,
    endCursor: right.group.endCursor,
    endedAt: right.group.endedAt,
    lineCount: left.group.lineCount + right.group.lineCount,
    message: left.group.message,
    preview: left.group.preview,
  };

  if (mergedGroup.source !== "stderr") {
    const fullMessage = `${left.fullMessage ?? left.group.message}\n${right.fullMessage ?? right.group.message}`;
    return {
      expandedMode: "manual",
      fullMessage,
      group: {
        ...mergedGroup,
        message: fullMessage,
      },
      isLoading: false,
    };
  }

  const fullMessage =
    left.fullMessage !== null || right.fullMessage !== null
      ? `${left.fullMessage ?? left.group.message}\n${right.fullMessage ?? right.group.message}`
      : null;
  const expandedMode =
    fullMessage === null
      ? "collapsed"
      : left.expandedMode === "live" || right.expandedMode === "live"
        ? "live"
        : "manual";

  return {
    expandedMode,
    fullMessage,
    group: {
      ...mergedGroup,
      message: fullMessage ?? mergedGroup.preview,
    },
    isLoading: false,
  };
};

export const mergeTimelineLogGroups = (
  currentGroups: TimelineLogGroup[],
  nextSourceGroups: ThreadLogGroup[],
  position: "prepend" | "append",
  strategy: "history" | "tail",
): TimelineLogGroup[] => {
  const nextGroups = materializeLogGroups(nextSourceGroups, strategy);

  if (currentGroups.length === 0) {
    return nextGroups;
  }

  if (nextSourceGroups.length === 0) {
    return currentGroups;
  }

  const latestTailStderrId =
    strategy === "tail"
      ? (nextSourceGroups.filter((group) => group.source === "stderr").at(-1)?.id ?? null)
      : null;

  if (position === "append") {
    const lastCurrentGroup = currentGroups.at(-1);
    const firstNextGroup = nextSourceGroups[0];

    if (
      lastCurrentGroup &&
      firstNextGroup &&
      canMergeLogGroupContext(lastCurrentGroup.group, firstNextGroup)
    ) {
      return [
        ...currentGroups.slice(0, -1),
        mergeTimelineLogGroupPair(
          lastCurrentGroup,
          buildLogGroupState(
            firstNextGroup,
            getLogGroupExpandedMode(firstNextGroup, latestTailStderrId, strategy),
            { preserveCollapsedMessage: true },
          ),
        ),
        ...nextGroups.slice(1),
      ];
    }

    return [...currentGroups, ...nextGroups];
  }

  const lastNextGroup = nextSourceGroups.at(-1);
  const firstCurrentGroup = currentGroups[0];
  if (
    lastNextGroup &&
    firstCurrentGroup &&
    canMergeLogGroupContext(lastNextGroup, firstCurrentGroup.group)
  ) {
    return [
      ...nextGroups.slice(0, -1),
      mergeTimelineLogGroupPair(
        buildLogGroupState(
          lastNextGroup,
          getLogGroupExpandedMode(lastNextGroup, latestTailStderrId, strategy),
          { preserveCollapsedMessage: true },
        ),
        firstCurrentGroup,
      ),
      ...currentGroups.slice(1),
    ];
  }

  return [...nextGroups, ...currentGroups];
};

const collapseStderrGroup = (group: TimelineLogGroup): TimelineLogGroup => {
  if (group.group.source !== "stderr") {
    return group;
  }

  return {
    ...group,
    expandedMode: "collapsed",
    fullMessage: null,
    group: {
      ...group.group,
      message: group.group.preview,
    },
    isLoading: false,
  };
};

const applyLatestLiveStderr = (groups: TimelineLogGroup[]): TimelineLogGroup[] => {
  const latestLiveGroupId =
    groups.filter((group) => group.group.source === "stderr").at(-1)?.group.id ?? null;

  return groups.map((group) => {
    if (group.group.source !== "stderr") {
      return group;
    }

    if (group.group.id === latestLiveGroupId) {
      const fullMessage = group.fullMessage ?? group.group.message;

      return {
        ...group,
        expandedMode: "live",
        fullMessage,
        group: {
          ...group.group,
          message: fullMessage ?? group.group.preview,
        },
        isLoading: false,
      };
    }

    if (group.expandedMode === "live") {
      return collapseStderrGroup(group);
    }

    return group;
  });
};

const formatLogTimestampRange = (group: ThreadLogGroup): string => {
  if (group.startedAt === group.endedAt) {
    return formatTimestamp(group.startedAt);
  }

  return `${formatTimestamp(group.startedAt)} -> ${formatTimestamp(group.endedAt)}`;
};

const shareTaskOutputContext = (left: ThreadLogGroup, right: ThreadLogGroup): boolean => {
  if (left.source === "system" || right.source === "system") {
    return false;
  }

  return (
    left.contextEntry.roleId === right.contextEntry.roleId &&
    left.contextEntry.laneId === right.contextEntry.laneId &&
    left.contextEntry.assignmentNumber === right.contextEntry.assignmentNumber
  );
};

export const buildTimelineTaskOutputBundles = (
  logGroups: TimelineLogGroup[],
): TimelineTaskOutputBundle[] => {
  const bundles: TimelineTaskOutputBundle[] = [];

  for (const logGroup of logGroups) {
    const previousBundle = bundles.at(-1);
    if (
      previousBundle &&
      shareTaskOutputContext(previousBundle.groups.at(-1)!.group, logGroup.group)
    ) {
      previousBundle.groups.push(logGroup);
      previousBundle.endedAt = logGroup.group.endedAt;
      previousBundle.lineCount += logGroup.group.lineCount;
      continue;
    }

    bundles.push({
      contextEntry: logGroup.group.contextEntry,
      endedAt: logGroup.group.endedAt,
      id: `task-output-${logGroup.group.id}`,
      lineCount: logGroup.group.lineCount,
      groups: [logGroup],
      startedAt: logGroup.group.startedAt,
    });
  }

  return bundles;
};

const buildTimelineItems = ({
  detail,
  logGroups,
  thread,
}: {
  detail: TeamThreadDetail | null;
  logGroups: TimelineLogGroup[];
  thread: TeamThreadSummary;
}): ThreadTimelineItem[] => {
  const items: ThreadTimelineItem[] = [];

  if (detail) {
    detail.userMessages.forEach((message, index) => {
      items.push({
        anchorId: index === 0 ? "thread-anchor-request" : `thread-anchor-message-${message.id}`,
        anchorLabel: index === 0 ? "Request" : "Follow-up",
        anchorLevel: "primary",
        id: `message-${message.id}`,
        kind: "message",
        occurredAt: message.timestamp,
        text: message.content,
        title: index === 0 ? "Human Request" : "Human Follow-up",
        variant: "human",
      });
    });

    detail.steps.forEach((step, index) => {
      items.push({
        anchorId: `thread-anchor-step-${step.createdAt}-${index}`,
        anchorLabel: formatCompactTimelineStepLabel(
          step.agentName,
          step.text || "This step completed through tool calls and state updates.",
        ),
        anchorLevel: "primary",
        id: `step-${step.agentName}-${step.createdAt}-${index}`,
        kind: "message",
        occurredAt: step.createdAt,
        text: step.text || "This step completed through tool calls and state updates.",
        title: step.agentName,
        variant: "agent",
      });
    });

    detail.dispatchAssignments.forEach((assignment) => {
      items.push({
        anchorId: buildAssignmentAnchorId(assignment.assignmentNumber),
        anchorLabel: `Assignment ${assignment.assignmentNumber}`,
        anchorLevel: "primary",
        assignment,
        childAnchors: assignment.lanes.map((lane) => ({
          id: buildLaneAnchorId(assignment.assignmentNumber, lane.laneId),
          label: `Proposal ${lane.laneIndex}`,
          level: "secondary",
        })),
        id: `assignment-${assignment.assignmentNumber}`,
        kind: "assignment",
        occurredAt: assignment.requestedAt || assignment.updatedAt,
      });

      assignment.lanes.forEach((lane) => {
        const compactLaneEventLabels = buildCompactLaneEventLabels(lane.events);

        lane.events.forEach((event, index) => {
          items.push({
            anchorId: buildLaneEventAnchorId(assignment.assignmentNumber, lane.laneId, event.id),
            anchorLabel:
              compactLaneEventLabels[index] ??
              `${formatEventActorLabel(event.actor).toLowerCase()} update`,
            anchorLevel: "tertiary",
            assignmentNumber: assignment.assignmentNumber,
            event,
            id: `lane-event-${assignment.assignmentNumber}-${lane.laneId}-${event.id}`,
            kind: "lane-event",
            lane,
            occurredAt: event.createdAt,
            proposalAnchorId: buildLaneAnchorId(assignment.assignmentNumber, lane.laneId),
          });
        });
      });
    });

    detail.handoffs.forEach((handoff) => {
      items.push({
        anchorId: `thread-anchor-handoff-${handoff.roleId}-${handoff.sequence}`,
        anchorLabel: formatCompactTimelineHandoffLabel(handoff),
        anchorLevel: "primary",
        handoff,
        id: `handoff-${handoff.roleId}-${handoff.sequence}`,
        kind: "handoff",
        occurredAt: handoff.updatedAt,
      });
    });
  }

  thread.plannerNotes.forEach((note) => {
    items.push({
      anchorId: `thread-anchor-planner-note-${note.id}`,
      anchorLabel: formatCompactTimelinePlannerNoteLabel(note.message),
      anchorLevel: "primary",
      id: `planner-note-${note.id}`,
      kind: "planner-note",
      note: note.message,
      occurredAt: note.createdAt,
    });
  });

  thread.humanFeedback.forEach((feedback) => {
    items.push({
      anchorId: `thread-anchor-feedback-${feedback.id}`,
      anchorLabel: formatCompactTimelineFeedbackLabel(feedback),
      anchorLevel: feedback.laneId ? "secondary" : "primary",
      feedback,
      id: `human-feedback-${feedback.id}`,
      kind: "human-feedback",
      occurredAt: feedback.createdAt,
    });
  });

  const latestLiveStderrGroupId =
    logGroups.filter((group) => group.group.source === "stderr").at(-1)?.group.id ?? null;
  const taskOutputBundles = buildTimelineTaskOutputBundles(logGroups);
  const latestTaskOutputBundleId =
    taskOutputBundles.find((bundle) =>
      bundle.groups.some((group) => group.group.id === latestLiveStderrGroupId),
    )?.id ??
    taskOutputBundles.at(-1)?.id ??
    null;

  taskOutputBundles.forEach((taskOutput) => {
    items.push({
      anchorId:
        taskOutput.id === latestTaskOutputBundleId ? "thread-anchor-latest-task-output" : undefined,
      anchorLabel: taskOutput.id === latestTaskOutputBundleId ? "Latest task output" : undefined,
      anchorLevel: "primary",
      id: taskOutput.id,
      kind: "task-output",
      occurredAt: taskOutput.endedAt,
      taskOutput,
    });
  });

  const kindOrder: Record<ThreadTimelineItem["kind"], number> = {
    assignment: 4,
    handoff: 5,
    "human-feedback": 3,
    "lane-event": 5,
    message: 1,
    "planner-note": 2,
    "task-output": 6,
  };

  return items.sort((left, right) => {
    if (left.occurredAt !== right.occurredAt) {
      return left.occurredAt.localeCompare(right.occurredAt);
    }

    if (kindOrder[left.kind] !== kindOrder[right.kind]) {
      return kindOrder[left.kind] - kindOrder[right.kind];
    }

    return left.id.localeCompare(right.id);
  });
};

export const buildTimelineAnchors = (timelineItems: ThreadTimelineItem[]): TimelineAnchor[] => {
  return timelineItems.reduce<TimelineAnchor[]>((anchors, item) => {
    if ("anchorId" in item && item.anchorId && "anchorLabel" in item && item.anchorLabel) {
      anchors.push({
        id: item.anchorId,
        label: item.anchorLabel,
        level: item.anchorLevel ?? "primary",
      });
    }

    if (item.kind === "assignment") {
      anchors.push(...item.childAnchors);
    }

    return anchors;
  }, []);
};

export const pickActiveTimelineAnchorId = (
  anchorOffsets: Array<{ id: string; top: number }>,
  markerTop: number,
): string | null => {
  if (anchorOffsets.length === 0) {
    return null;
  }

  let activeAnchorId = anchorOffsets[0]?.id ?? null;
  for (const anchor of anchorOffsets) {
    if (anchor.top <= markerTop) {
      activeAnchorId = anchor.id;
      continue;
    }

    break;
  }

  return activeAnchorId;
};

const isNearBottom = (element: HTMLDivElement): boolean => {
  return element.scrollHeight - element.scrollTop - element.clientHeight <= SCROLL_THRESHOLD_PX;
};

const isAwayFromTop = (element: HTMLDivElement): boolean => {
  return element.scrollTop > SCROLL_THRESHOLD_PX;
};

const getPrNumber = (url: string): string => {
  const match = url.match(/pull\/(\d+)/);
  return match ? match[1] : url;
};

export function ThreadDetailTimeline({
  thread,
  detail,
  isLoadingDetail,
  approvalKey,
  feedbackKey,
  feedbackDrafts,
  onApprove,
  onFeedbackChange,
  onFeedback,
}: ThreadDetailTimelineProps) {
  const [logGroups, setLogGroups] = useState<TimelineLogGroup[]>([]);
  const [logPageInfo, setLogPageInfo] = useState<TeamCodexLogPageInfo>(EMPTY_PAGE_INFO);
  const [logError, setLogError] = useState<string | null>(null);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [isPinnedToTail, setIsPinnedToTail] = useState(true);
  const [isScrollable, setIsScrollable] = useState(false);
  const [showScrollToTop, setShowScrollToTop] = useState(false);
  const [activeAnchorId, setActiveAnchorId] = useState<string | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const latestPageInfoRef = useRef<TeamCodexLogPageInfo>(EMPTY_PAGE_INFO);
  const didInitialTailScrollRef = useRef(false);
  const pendingPrependSnapshotRef = useRef<{
    scrollHeight: number;
    scrollTop: number;
  } | null>(null);
  const anchorElementsRef = useRef(new Map<string, HTMLElement>());
  const railLinkElementsRef = useRef(new Map<string, HTMLAnchorElement>());
  const stderrElementsRef = useRef(new Map<string, HTMLElement>());
  const railLinksRef = useRef<HTMLDivElement | null>(null);

  const primaryLane = selectPrimaryLane(thread.workerLanes);
  const canRestart = canRestartPlanning(thread);
  const replanBlockedCopy = thread.archivedAt
    ? "Archived threads are read-only. Proposal and request-group replanning are unavailable."
    : "Request-group replanning unlocks after queued coding and review work finish.";
  const timelineItems = buildTimelineItems({
    detail,
    logGroups,
    thread,
  });
  const latestActivityKey = timelineItems.at(-1)?.id;
  const timelineAnchors = buildTimelineAnchors(timelineItems);

  useEffect(() => {
    latestPageInfoRef.current = logPageInfo;
  }, [logPageInfo]);

  const updateScrollState = useEffectEvent(() => {
    const element = scrollContainerRef.current;
    if (!element) {
      return;
    }

    const canScroll = element.scrollHeight > element.clientHeight + 4;
    setIsScrollable(canScroll);
    setIsPinnedToTail(!canScroll || isNearBottom(element));
    setShowScrollToTop(canScroll && isAwayFromTop(element));
  });

  const updateActiveAnchor = useEffectEvent(() => {
    const container = scrollContainerRef.current;
    if (!container) {
      return;
    }

    const containerRect = container.getBoundingClientRect();
    const anchorOffsets = timelineAnchors.flatMap((anchor) => {
      const element = anchorElementsRef.current.get(anchor.id);
      if (!element) {
        return [];
      }

      const elementRect = element.getBoundingClientRect();
      return [
        {
          id: anchor.id,
          top: container.scrollTop + (elementRect.top - containerRect.top),
        },
      ];
    });

    const nextActiveAnchorId = pickActiveTimelineAnchorId(
      anchorOffsets,
      container.scrollTop + ACTIVE_ANCHOR_OFFSET_PX,
    );
    setActiveAnchorId((current) => (current === nextActiveAnchorId ? current : nextActiveAnchorId));
  });

  const pruneInvisibleExpandedStderr = useEffectEvent(() => {
    const container = scrollContainerRef.current;
    if (!container) {
      return;
    }

    const viewportTop = container.scrollTop;
    const viewportBottom = viewportTop + container.clientHeight;

    setLogGroups((current) => {
      let didChange = false;
      const nextGroups = current.map((group) => {
        if (group.group.source !== "stderr" || group.expandedMode !== "manual") {
          return group;
        }

        const element = stderrElementsRef.current.get(group.group.id);
        if (!element) {
          return group;
        }

        const elementTop = element.offsetTop;
        const elementBottom = elementTop + element.offsetHeight;
        const isVisible = elementBottom > viewportTop && elementTop < viewportBottom;
        if (isVisible) {
          return group;
        }

        didChange = true;
        return collapseStderrGroup(group);
      });

      return didChange ? applyLatestLiveStderr(nextGroups) : current;
    });
  });

  useEffect(() => {
    const element = scrollContainerRef.current;
    if (!element) {
      return;
    }

    const handleScroll = () => {
      updateScrollState();
      updateActiveAnchor();
      pruneInvisibleExpandedStderr();
    };

    handleScroll();
    element.addEventListener("scroll", handleScroll);

    return () => {
      element.removeEventListener("scroll", handleScroll);
    };
  }, []);

  useLayoutEffect(() => {
    const pendingSnapshot = pendingPrependSnapshotRef.current;
    const element = scrollContainerRef.current;
    if (!pendingSnapshot || !element) {
      return;
    }

    element.scrollTop =
      pendingSnapshot.scrollTop + (element.scrollHeight - pendingSnapshot.scrollHeight);
    pendingPrependSnapshotRef.current = null;
    updateActiveAnchor();
  }, [logGroups]);

  useEffect(() => {
    const element = scrollContainerRef.current;
    if (!element || timelineItems.length === 0) {
      return;
    }

    if (!didInitialTailScrollRef.current) {
      element.scrollTop = element.scrollHeight;
      didInitialTailScrollRef.current = true;
      updateScrollState();
      updateActiveAnchor();
      return;
    }

    if (isPinnedToTail) {
      element.scrollTop = element.scrollHeight;
      updateScrollState();
      updateActiveAnchor();
    }
  }, [isPinnedToTail, latestActivityKey, timelineItems.length]);

  useLayoutEffect(() => {
    updateActiveAnchor();
  }, [latestActivityKey, timelineAnchors.length, timelineItems.length]);

  useEffect(() => {
    const railLinksElement = railLinksRef.current;
    const activeLink = activeAnchorId
      ? (railLinkElementsRef.current.get(activeAnchorId) ?? null)
      : null;
    if (!railLinksElement || !activeLink) {
      return;
    }

    const railLinksRect = railLinksElement.getBoundingClientRect();
    const activeLinkRect = activeLink.getBoundingClientRect();
    if (activeLinkRect.top < railLinksRect.top || activeLinkRect.bottom > railLinksRect.bottom) {
      activeLink.scrollIntoView({
        block: "nearest",
      });
    }
  }, [activeAnchorId]);

  useEffect(() => {
    let isCancelled = false;

    didInitialTailScrollRef.current = false;
    pendingPrependSnapshotRef.current = null;
    latestPageInfoRef.current = EMPTY_PAGE_INFO;
    setLogGroups([]);
    setLogPageInfo(EMPTY_PAGE_INFO);
    setLogError(null);
    setIsLoadingOlder(false);
    setIsPinnedToTail(true);

    const applyInitialWindow = (response: WindowResponse) => {
      setLogGroups(
        applyLatestLiveStderr(
          materializeLogGroups(groupThreadLogEntries(response.entries), "tail"),
        ),
      );
      setLogPageInfo({
        afterCursor: response.pageInfo.afterCursor,
        beforeCursor: response.pageInfo.beforeCursor,
        hasNewer: false,
        hasOlder: response.pageInfo.hasOlder,
      });
      setLogError(null);
    };

    const pollForNewLogs = async () => {
      try {
        const currentPageInfo = latestPageInfoRef.current;
        const response = await fetchLogWindow({
          afterCursor: currentPageInfo.afterCursor,
          threadId: thread.threadId,
        });
        if (isCancelled) {
          return;
        }

        if (currentPageInfo.afterCursor === null) {
          applyInitialWindow(response);
          return;
        }

        if (response.entries.length > 0) {
          const nextSourceGroups = groupThreadLogEntries(response.entries);
          setLogGroups((current) => {
            const nextGroups = mergeTimelineLogGroups(current, nextSourceGroups, "append", "tail");
            return applyLatestLiveStderr(nextGroups);
          });
        }

        setLogPageInfo((current) => ({
          ...current,
          afterCursor: response.pageInfo.afterCursor ?? current.afterCursor,
        }));
        setLogError(null);
      } catch (error) {
        if (!isCancelled) {
          setLogError(
            error instanceof Error ? error.message : "Unable to refresh thread activity.",
          );
        }
      }
    };

    void (async () => {
      try {
        const response = await fetchLogWindow({
          threadId: thread.threadId,
        });
        if (!isCancelled) {
          applyInitialWindow(response);
        }
      } catch (error) {
        if (!isCancelled) {
          setLogError(
            error instanceof Error ? error.message : "Unable to refresh thread activity.",
          );
        }
      }
    })();

    const intervalId = window.setInterval(() => {
      if (!isCancelled) {
        void pollForNewLogs();
      }
    }, LOG_POLL_INTERVAL_MS);

    return () => {
      isCancelled = true;
      window.clearInterval(intervalId);
    };
  }, [thread.threadId]);

  const loadOlderActivity = async () => {
    if (isLoadingOlder || logPageInfo.beforeCursor === null) {
      return;
    }

    const element = scrollContainerRef.current;
    if (element) {
      pendingPrependSnapshotRef.current = {
        scrollHeight: element.scrollHeight,
        scrollTop: element.scrollTop,
      };
    }

    setIsLoadingOlder(true);

    try {
      const response = await fetchLogWindow({
        beforeCursor: logPageInfo.beforeCursor,
        threadId: thread.threadId,
      });
      const nextSourceGroups = groupThreadLogEntries(response.entries);

      setLogGroups((current) => {
        const nextGroups = mergeTimelineLogGroups(current, nextSourceGroups, "prepend", "history");
        return applyLatestLiveStderr(nextGroups);
      });
      setLogPageInfo((current) => ({
        ...current,
        beforeCursor: response.pageInfo.beforeCursor ?? current.beforeCursor,
        hasOlder: response.pageInfo.hasOlder,
      }));
      setLogError(null);
    } catch (error) {
      setLogError(error instanceof Error ? error.message : "Unable to load older activity.");
    } finally {
      setIsLoadingOlder(false);
    }
  };

  const registerAnchorElement = (anchorId: string): RefCallback<HTMLElement> => {
    return (element) => {
      if (element) {
        anchorElementsRef.current.set(anchorId, element);
      } else {
        anchorElementsRef.current.delete(anchorId);
      }
    };
  };

  const registerStderrElement = (groupId: string): RefCallback<HTMLElement> => {
    return (element) => {
      if (element) {
        stderrElementsRef.current.set(groupId, element);
      } else {
        stderrElementsRef.current.delete(groupId);
      }
    };
  };

  const registerRailLinkElement = (anchorId: string): RefCallback<HTMLAnchorElement> => {
    return (element) => {
      if (element) {
        railLinkElementsRef.current.set(anchorId, element);
      } else {
        railLinkElementsRef.current.delete(anchorId);
      }
    };
  };

  const scrollToAnchor = (anchorId: string) => {
    const container = scrollContainerRef.current;
    const element =
      anchorElementsRef.current.get(anchorId) ??
      (typeof document !== "undefined" ? document.getElementById(anchorId) : null);
    if (!container || !element) {
      return;
    }

    const containerRect = container.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect();
    setActiveAnchorId(anchorId);

    container.scrollTo({
      behavior: "instant",
      top: Math.max(container.scrollTop + (elementRect.top - containerRect.top) - 24, 0),
    });
  };

  const openTaskOutputWindow = (entry: TeamCodexLogCursorEntry) => {
    const url = new URL("/agent-task-output", window.location.origin);
    url.searchParams.set("threadId", thread.threadId);

    if (typeof entry.assignmentNumber === "number") {
      url.searchParams.set("assignmentNumber", String(entry.assignmentNumber));
    }

    if (entry.laneId) {
      url.searchParams.set("laneId", entry.laneId);
    }

    if (entry.roleId) {
      url.searchParams.set("roleId", entry.roleId);
    }

    window.open(url.toString(), "_blank");
  };

  const toggleStderrGroup = async (groupId: string) => {
    const targetGroup = logGroups.find((group) => group.group.id === groupId);
    if (
      !targetGroup ||
      targetGroup.group.source !== "stderr" ||
      targetGroup.expandedMode === "live"
    ) {
      return;
    }

    if (targetGroup.expandedMode === "manual") {
      setLogGroups((current) =>
        applyLatestLiveStderr(
          current.map((group) => (group.group.id === groupId ? collapseStderrGroup(group) : group)),
        ),
      );
      return;
    }

    setLogGroups((current) =>
      current.map((group) =>
        group.group.id === groupId
          ? {
              ...group,
              isLoading: true,
            }
          : group,
      ),
    );

    try {
      const response = await fetchStderrBlock({
        endCursor: targetGroup.group.endCursor,
        startCursor: targetGroup.group.startCursor,
        threadId: thread.threadId,
      });
      const expandedGroup = groupThreadLogEntries(response.entries)[0];
      if (!expandedGroup) {
        throw new Error("Unable to recover stderr details for this block.");
      }

      setLogGroups((current) =>
        applyLatestLiveStderr(
          current.map((group) => {
            if (group.group.id !== groupId) {
              return group;
            }

            return {
              expandedMode: "manual",
              fullMessage: expandedGroup.message,
              group: {
                ...expandedGroup,
                message: expandedGroup.message,
              },
              isLoading: false,
            };
          }),
        ),
      );
      setLogPageInfo((current) => ({
        ...current,
        afterCursor:
          current.afterCursor === targetGroup.group.endCursor
            ? Math.max(current.afterCursor ?? 0, response.block.endCursor)
            : current.afterCursor,
        beforeCursor:
          current.beforeCursor === targetGroup.group.startCursor
            ? Math.min(
                current.beforeCursor ?? response.block.startCursor,
                response.block.startCursor,
              )
            : current.beforeCursor,
      }));
      setLogError(null);
    } catch (error) {
      setLogGroups((current) =>
        current.map((group) =>
          group.group.id === groupId
            ? {
                ...group,
                isLoading: false,
              }
            : group,
        ),
      );
      setLogError(error instanceof Error ? error.message : "Unable to recover stderr details.");
    }
  };

  return (
    <div className="thread-chat-shell">
      <header className="thread-chat-header">
        <div className="thread-chat-header-copy">
          <p>
            {primaryLane?.latestActivity ??
              thread.latestPlanSummary ??
              "Timeline view stays pinned to the latest activity until you scroll away."}
          </p>
        </div>
        <div className="thread-chat-link-strip">
          <span className={`status-pill status-${thread.status}`}>
            {threadStatusLabels[thread.status]}
          </span>
          {thread.archivedAt ? (
            <span className="status-pill status-completed">Archived</span>
          ) : null}
          <span className="thread-chat-meta-chip" title={`Thread ${thread.threadId}`}>
            Thread {formatThreadId(thread.threadId)}
          </span>
          <span className="thread-chat-meta-chip">Assignment #{thread.assignmentNumber}</span>
          <span className="thread-chat-meta-chip">
            {thread.repository?.name ?? "No repository selected"}
          </span>
          <span className="thread-chat-meta-chip">Updated {formatTimestamp(thread.updatedAt)}</span>
          <span className="thread-chat-meta-chip">
            Pool slot: {formatPoolSlot(primaryLane?.workerSlot ?? null)}
          </span>
          <span className="thread-chat-meta-chip">Runs: {primaryLane?.runCount ?? 0}</span>
          <span className="thread-chat-meta-chip">
            Revisions: {primaryLane?.revisionCount ?? 0}
          </span>
          {primaryLane?.pullRequest ? (
            primaryLane.pullRequest.url ? (
              <a
                className="thread-chat-link"
                href={primaryLane.pullRequest.url}
                rel="noreferrer"
                target="_blank"
                title={primaryLane.pullRequest.title}
              >
                PR #{getPrNumber(primaryLane.pullRequest.url)}
              </a>
            ) : (
              <span className="thread-chat-meta-chip">{primaryLane.pullRequest.title}</span>
            )
          ) : null}
        </div>
      </header>

      <div className="thread-chat-body">
        <div className="thread-chat-main" ref={scrollContainerRef}>
          <div className="thread-chat-main-inner" id="thread-chat-top">
            {logPageInfo.hasOlder ? (
              <button
                className="thread-chat-history-button"
                disabled={isLoadingOlder}
                type="button"
                onClick={() => {
                  void loadOlderActivity();
                }}
              >
                {isLoadingOlder ? "Loading older activity..." : "Load earlier console activity"}
              </button>
            ) : null}

            {logError ? <p className="error-callout">{logError}</p> : null}

            {timelineItems.length === 0 ? (
              <article className="thread-chat-card thread-chat-card-empty">
                <p className="thread-chat-meta">Timeline</p>
                <p className="thread-chat-copy">
                  {isLoadingDetail
                    ? "Recovering the selected thread timeline..."
                    : "No persisted thread activity has been recorded yet."}
                </p>
              </article>
            ) : null}

            {timelineItems.map((item) => {
              const anchorRef =
                "anchorId" in item && item.anchorId
                  ? registerAnchorElement(item.anchorId)
                  : undefined;

              if (item.kind === "message") {
                return (
                  <article
                    className={`thread-chat-bubble thread-chat-bubble-${item.variant}`}
                    id={item.anchorId}
                    key={item.id}
                    ref={anchorRef}
                  >
                    <div className="thread-chat-meta">
                      <span>{item.title}</span>
                      <span>{formatTimestamp(item.occurredAt)}</span>
                    </div>
                    <pre className="thread-chat-pre">{item.text}</pre>
                  </article>
                );
              }

              if (item.kind === "planner-note") {
                return (
                  <article
                    className="thread-chat-card"
                    id={item.anchorId}
                    key={item.id}
                    ref={anchorRef}
                  >
                    <div className="thread-chat-meta">
                      <span>Planner note</span>
                      <span>{formatTimestamp(item.occurredAt)}</span>
                    </div>
                    <p className="thread-chat-copy">{item.note}</p>
                  </article>
                );
              }

              if (item.kind === "human-feedback") {
                return (
                  <article
                    className="thread-chat-card"
                    id={item.anchorId}
                    key={item.id}
                    ref={anchorRef}
                  >
                    <div className="thread-chat-meta">
                      <span>{formatFeedbackLabel(thread, item.feedback.laneId)}</span>
                      <span>{formatTimestamp(item.occurredAt)}</span>
                    </div>
                    <p className="thread-chat-copy">{item.feedback.message}</p>
                  </article>
                );
              }

              if (item.kind === "handoff") {
                return (
                  <article
                    className="thread-chat-card"
                    id={item.anchorId}
                    key={item.id}
                    ref={anchorRef}
                  >
                    <div className="thread-chat-meta thread-chat-meta-split">
                      <span>{item.handoff.roleName}</span>
                      <span className={`decision-pill decision-${item.handoff.decision}`}>
                        {item.handoff.decision.replace("_", " ")}
                      </span>
                    </div>
                    <p className="thread-chat-copy">{item.handoff.summary}</p>
                    <pre className="thread-chat-pre">{item.handoff.deliverable}</pre>
                  </article>
                );
              }

              if (item.kind === "lane-event") {
                return (
                  <article
                    className="thread-chat-card thread-chat-card-lane-event"
                    id={item.anchorId}
                    key={item.id}
                    ref={anchorRef}
                  >
                    <div className="thread-chat-meta thread-chat-meta-split">
                      <span>
                        {formatEventActorLabel(item.event.actor)}
                        {" - "}
                        <a
                          className="thread-chat-link"
                          href={`#${item.proposalAnchorId}`}
                          onClick={(event) => {
                            event.preventDefault();
                            scrollToAnchor(item.proposalAnchorId);
                          }}
                        >
                          Proposal {item.lane.laneIndex}
                        </a>
                      </span>

                      <span>{formatTimestamp(item.occurredAt)}</span>
                    </div>
                    <LaneMarkdownText className="thread-chat-copy" text={item.event.message} />
                  </article>
                );
              }

              if (item.kind === "assignment") {
                const assignment = item.assignment;
                const isCurrentAssignment = assignment.assignmentNumber === thread.assignmentNumber;

                return (
                  <article
                    className="thread-chat-card thread-chat-card-assignment"
                    id={item.anchorId}
                    key={item.id}
                    ref={anchorRef}
                  >
                    <div className="thread-chat-card-head">
                      <div>
                        <p className="eyebrow">Assignment {assignment.assignmentNumber}</p>
                        <h3>{assignment.requestTitle ?? thread.requestTitle}</h3>
                      </div>
                      <span className={`status-pill status-${assignment.status}`}>
                        {formatAssignmentStatusLabel(assignment.status)}
                      </span>
                    </div>

                    <p className="thread-chat-copy">
                      {assignment.plannerSummary ??
                        "No planner summary recorded for this assignment yet."}
                    </p>

                    <div className="thread-chat-assignment-meta">
                      <span className="thread-chat-meta-chip">
                        Workers: {assignment.workerCount}
                      </span>
                      {assignment.repository ? (
                        <span className="thread-chat-meta-chip">{assignment.repository.name}</span>
                      ) : null}
                      <span className="thread-chat-meta-chip">
                        Updated {formatTimestamp(assignment.updatedAt)}
                      </span>
                      {assignment.canonicalBranchName ? (
                        <span
                          className="thread-chat-meta-chip"
                          title={assignment.canonicalBranchName}
                        >
                          Branch: {assignment.canonicalBranchName}
                        </span>
                      ) : null}
                    </div>

                    {assignment.lanes.length > 0 ? (
                      <div className="thread-chat-lane-list">
                        {assignment.lanes.map((lane) => {
                          const currentApprovalKey = `${thread.threadId}:${thread.assignmentNumber}:${lane.laneId}`;
                          const laneFeedbackKey = buildFeedbackKey(
                            thread.threadId,
                            thread.assignmentNumber,
                            "proposal",
                            lane.laneId,
                          );
                          const isApproving = approvalKey?.startsWith(`${currentApprovalKey}:`) ?? false;
                          const isSendingFeedback = feedbackKey === laneFeedbackKey;
                          const approvalActions = isCurrentAssignment
                            ? getLaneApprovalActions(lane)
                            : [];
                          const canSendLaneFeedback =
                            isCurrentAssignment &&
                            canRestart &&
                            lane.status !== "idle" &&
                            lane.status !== "failed" &&
                            lane.status !== "cancelled";
                          const laneBranchDisplay = getLaneBranchDisplay(lane);
                          const commitDisplay = getLaneCommitDisplay(lane);

                          return (
                            <section
                              className="thread-chat-lane-card"
                              id={buildLaneAnchorId(assignment.assignmentNumber, lane.laneId)}
                              key={lane.laneId}
                              ref={registerAnchorElement(
                                buildLaneAnchorId(assignment.assignmentNumber, lane.laneId),
                              )}
                            >
                              <div className="thread-chat-lane-head">
                                <div>
                                  <p className="timeline-title">Proposal {lane.laneIndex}</p>
                                  <p className="thread-chat-copy thread-chat-copy-tight">
                                    {lane.taskTitle ?? "Idle"}
                                  </p>
                                </div>
                                <span className={`status-pill ${getLaneStatusClassName(lane)}`}>
                                  {getLaneStatusLabel(lane)}
                                </span>
                              </div>

                              <LaneMarkdownText
                                className="thread-chat-copy"
                                text={describeLane(lane)}
                              />

                              <div className="thread-chat-lane-meta">
                                <span className="thread-chat-meta-chip">
                                  Pool slot: {formatPoolSlot(lane.workerSlot)}
                                </span>
                                <span className="thread-chat-meta-chip">Runs: {lane.runCount}</span>
                                <span className="thread-chat-meta-chip">
                                  Revisions: {lane.revisionCount}
                                </span>
                                <span className="thread-chat-meta-chip">
                                  Worktree: {lane.worktreePath ?? "Not allocated"}
                                </span>
                                <span className="thread-chat-meta-chip">
                                  Branch: {laneBranchDisplay.value}
                                </span>
                                <span className="thread-chat-meta-chip">
                                  {commitDisplay?.label ?? "Review Commit"}:{" "}
                                  {commitDisplay?.value ?? "Not requested"}
                                </span>
                              </div>

                              {lane.pullRequest ? (
                                <div className="thread-chat-pr-strip">
                                  <span className="thread-chat-meta-chip">
                                    {pullRequestStatusLabels[lane.pullRequest.status]}
                                  </span>
                                  {lane.pullRequest.url ? (
                                    <a
                                      className="thread-chat-link"
                                      href={lane.pullRequest.url}
                                      rel="noreferrer"
                                      target="_blank"
                                    >
                                      {lane.pullRequest.title}
                                    </a>
                                  ) : (
                                    <span className="thread-chat-meta-chip">
                                      {lane.pullRequest.title}
                                    </span>
                                  )}
                                  <span className="thread-chat-meta-chip">
                                    {formatTimestamp(lane.pullRequest.updatedAt)}
                                  </span>
                                </div>
                              ) : null}
                              {approvalActions.length > 0 ? (
                                <div className="approval-action-stack">
                                  {approvalActions.map((approvalAction) => {
                                    const isPendingAction =
                                      approvalKey ===
                                      `${thread.threadId}:${thread.assignmentNumber}:${lane.laneId}:${approvalAction.key}`;

                                    return (
                                      <button
                                        className="secondary-button"
                                        disabled={isApproving}
                                        key={approvalAction.key}
                                        type="button"
                                        onClick={() =>
                                          onApprove(
                                            thread.assignmentNumber,
                                            lane.laneId,
                                            approvalAction,
                                          )
                                        }
                                      >
                                        {isPendingAction
                                          ? approvalAction.pendingLabel
                                          : approvalAction.buttonLabel}
                                      </button>
                                    );
                                  })}
                                </div>
                              ) : null}

                              {canSendLaneFeedback ? (
                                <div className="feedback-stack">
                                  <label className="field feedback-field">
                                    <span>Proposal Feedback</span>
                                    <textarea
                                      disabled={isSendingFeedback}
                                      placeholder="Adjust this proposal and replan the request group."
                                      rows={3}
                                      value={feedbackDrafts[laneFeedbackKey] ?? ""}
                                      onChange={(event) =>
                                        onFeedbackChange(laneFeedbackKey, event.target.value)
                                      }
                                    />
                                  </label>
                                  <button
                                    className="secondary-button"
                                    disabled={isSendingFeedback}
                                    type="button"
                                    onClick={() =>
                                      onFeedback({
                                        assignmentNumber: thread.assignmentNumber,
                                        laneId: lane.laneId,
                                        scope: "proposal",
                                      })
                                    }
                                  >
                                    {isSendingFeedback
                                      ? "Restarting planning..."
                                      : "Replan Proposal"}
                                  </button>
                                </div>
                              ) : null}

                              {lane.lastError ? (
                                <p className="error-callout">{lane.lastError}</p>
                              ) : null}
                            </section>
                          );
                        })}
                      </div>
                    ) : null}

                    {isCurrentAssignment ? (
                      canRestart ? (
                        <div className="feedback-stack thread-feedback">
                          <label className="field feedback-field">
                            <span>Request-Group Feedback</span>
                            <textarea
                              disabled={
                                feedbackKey ===
                                buildFeedbackKey(
                                  thread.threadId,
                                  thread.assignmentNumber,
                                  "assignment",
                                )
                              }
                              placeholder="Shift the overall request direction and ask the planner for a fresh proposal set."
                              rows={3}
                              value={
                                feedbackDrafts[
                                  buildFeedbackKey(
                                    thread.threadId,
                                    thread.assignmentNumber,
                                    "assignment",
                                  )
                                ] ?? ""
                              }
                              onChange={(event) =>
                                onFeedbackChange(
                                  buildFeedbackKey(
                                    thread.threadId,
                                    thread.assignmentNumber,
                                    "assignment",
                                  ),
                                  event.target.value,
                                )
                              }
                            />
                          </label>
                          <button
                            className="secondary-button"
                            disabled={
                              feedbackKey ===
                              buildFeedbackKey(
                                thread.threadId,
                                thread.assignmentNumber,
                                "assignment",
                              )
                            }
                            type="button"
                            onClick={() =>
                              onFeedback({
                                assignmentNumber: thread.assignmentNumber,
                                scope: "assignment",
                              })
                            }
                          >
                            {feedbackKey ===
                            buildFeedbackKey(thread.threadId, thread.assignmentNumber, "assignment")
                              ? "Restarting planning..."
                              : "Replan Request Group"}
                          </button>
                        </div>
                      ) : (
                        <p className="thread-chat-copy">{replanBlockedCopy}</p>
                      )
                    ) : null}
                  </article>
                );
              }

              const taskOutput = item.taskOutput;
              const canOpenTaskOutput = taskOutput.groups.some(
                (group) => group.group.source !== "system",
              );

              return (
                <article
                  className="thread-chat-card thread-chat-card-log"
                  id={item.anchorId}
                  key={item.id}
                  ref={anchorRef}
                >
                  <div className="thread-chat-meta thread-chat-meta-split">
                    <span>Task output</span>
                    <span>{describeLogEntryContext(taskOutput.contextEntry)}</span>
                    <span>
                      {taskOutput.startedAt === taskOutput.endedAt
                        ? formatTimestamp(taskOutput.startedAt)
                        : `${formatTimestamp(taskOutput.startedAt)} -> ${formatTimestamp(
                            taskOutput.endedAt,
                          )}`}
                    </span>
                    {taskOutput.lineCount > 1 ? <span>{taskOutput.lineCount} lines</span> : null}
                  </div>

                  <div className="thread-chat-log-stack">
                    {taskOutput.groups.map((logGroup) => {
                      const isStderr = logGroup.group.source === "stderr";
                      const stderrRef = isStderr
                        ? registerStderrElement(logGroup.group.id)
                        : undefined;
                      const content = logGroup.fullMessage ?? logGroup.group.preview;

                      return (
                        <section
                          className={`thread-chat-log-block ${
                            isStderr ? "thread-chat-log-block-stderr" : ""
                          }`}
                          key={logGroup.group.id}
                          ref={stderrRef}
                        >
                          <div className="thread-chat-meta thread-chat-meta-split">
                            <span>{logGroup.group.source}</span>
                            <span>{formatLogTimestampRange(logGroup.group)}</span>
                            {logGroup.group.lineCount > 1 ? (
                              <span>{logGroup.group.lineCount} lines</span>
                            ) : null}
                          </div>

                          <pre className="thread-chat-pre thread-chat-log-pre">{content}</pre>

                          {isStderr ? (
                            <div className="thread-chat-log-actions">
                              {logGroup.expandedMode === "live" ? (
                                <span className="thread-chat-live-badge">Live stderr</span>
                              ) : (
                                <button
                                  className="secondary-button"
                                  disabled={logGroup.isLoading}
                                  type="button"
                                  onClick={() => {
                                    void toggleStderrGroup(logGroup.group.id);
                                  }}
                                >
                                  {logGroup.isLoading
                                    ? "Loading stderr..."
                                    : logGroup.expandedMode === "manual"
                                      ? "Fold stderr"
                                      : "Expand stderr"}
                                </button>
                              )}
                            </div>
                          ) : null}
                        </section>
                      );
                    })}
                  </div>

                  {canOpenTaskOutput ? (
                    <div className="thread-chat-log-actions">
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={() => openTaskOutputWindow(taskOutput.contextEntry)}
                      >
                        Open task output tab
                      </button>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        </div>

        <aside className="thread-chat-rail">
          <div className="thread-chat-rail-card">
            <div className="thread-chat-rail-links" ref={railLinksRef}>
              {timelineAnchors.map((anchor) => (
                <a
                  className={`thread-chat-rail-link ${
                    activeAnchorId === anchor.id ? "thread-chat-rail-link-active" : ""
                  } ${
                    anchor.level === "secondary"
                      ? "thread-chat-rail-link-secondary"
                      : anchor.level === "tertiary"
                        ? "thread-chat-rail-link-tertiary"
                        : ""
                  }`}
                  aria-current={activeAnchorId === anchor.id ? "location" : undefined}
                  href={`#${anchor.id}`}
                  key={anchor.id}
                  ref={registerRailLinkElement(anchor.id)}
                  title={anchor.label}
                  onClick={(event) => {
                    event.preventDefault();
                    scrollToAnchor(anchor.id);
                  }}
                >
                  {anchor.label}
                </a>
              ))}
            </div>

            {isScrollable && showScrollToTop ? (
              <a
                className="thread-chat-scroll-top"
                href="#thread-chat-top"
                onClick={(event) => {
                  event.preventDefault();
                  scrollContainerRef.current?.scrollTo({
                    behavior: "smooth",
                    top: 0,
                  });
                }}
              >
                Scroll to top
              </a>
            ) : null}
          </div>
        </aside>
      </div>
    </div>
  );
}
