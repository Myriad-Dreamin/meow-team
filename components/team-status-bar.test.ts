import { Children, createElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TeamStatusBarLaneList } from "@/components/team-status-bar";
import {
  buildTeamStatusLaneThreadBuckets,
  getNextTeamStatusLanePopoverState,
  teamStatusLaneItems,
  type TeamStatusLaneCountKey,
  type TeamStatusLanePopoverState,
} from "@/components/team-status-bar-lane-utils";
import type { TeamThreadSummary } from "@/lib/team/history";
import type { TeamWorkerLaneRecord } from "@/lib/team/types";

type TestReactElement = ReactElement<
  Record<string, unknown> & {
    children?: ReactNode;
  },
  string | ((props: unknown) => ReactNode)
>;

const createLane = (overrides: Partial<TeamWorkerLaneRecord> = {}): TeamWorkerLaneRecord => ({
  laneId: "lane-1",
  laneIndex: 1,
  status: "queued",
  executionPhase: null,
  taskTitle: "Audit status-lane tooltip thread jump",
  taskObjective: "Restore lane popover thread jumps.",
  proposalChangeName: "status-lane-jump-a1-p1-audit-status-lane-tooltip-thread-jump",
  proposalPath: "openspec/changes/status-lane-jump-a1-p1-audit-status-lane-tooltip-thread-jump",
  workerSlot: 1,
  branchName: "requests/status-lane-jump/thread-1",
  baseBranch: "main",
  worktreePath: "/tmp/meow-1",
  latestImplementationCommit: null,
  pushedCommit: null,
  latestCoderHandoff: null,
  latestReviewerHandoff: null,
  latestDecision: null,
  latestCoderSummary: null,
  latestReviewerSummary: null,
  latestActivity: null,
  approvalRequestedAt: null,
  approvalGrantedAt: null,
  queuedAt: "2026-04-18T10:00:00.000Z",
  runCount: 1,
  revisionCount: 0,
  requeueReason: null,
  lastError: null,
  pullRequest: null,
  events: [],
  startedAt: "2026-04-18T10:00:00.000Z",
  finishedAt: null,
  updatedAt: "2026-04-18T10:05:00.000Z",
  ...overrides,
});

const createThread = (overrides: Partial<TeamThreadSummary> = {}): TeamThreadSummary => ({
  threadId: "queued1234alpha5678",
  assignmentNumber: 1,
  status: "running",
  archivedAt: null,
  requestTitle: "Queued tooltip thread",
  requestText: "Restore thread jumps from status lanes.",
  latestInput: "Restore thread jumps from status lanes.",
  repository: null,
  workflow: ["planner", "coder", "reviewer"],
  latestRoleId: "coder",
  latestRoleName: "Coder",
  nextRoleId: "reviewer",
  latestDecision: "continue",
  handoffCount: 1,
  stepCount: 0,
  userMessageCount: 1,
  startedAt: "2026-04-18T09:55:00.000Z",
  finishedAt: null,
  updatedAt: "2026-04-18T10:05:00.000Z",
  lastError: null,
  plannerRetryAwaitingConfirmation: false,
  latestAssignmentStatus: "running",
  latestPlanSummary: "Audit the lane popover thread links.",
  latestBranchPrefix: "requests/status-lane-jump",
  latestCanonicalBranchName: "requests/status-lane-jump/thread-1",
  dispatchWorkerCount: 1,
  workerCounts: {
    idle: 0,
    queued: 1,
    coding: 0,
    reviewing: 0,
    awaitingHumanApproval: 0,
    approved: 0,
    failed: 0,
  },
  workerLanes: [createLane()],
  plannerNotes: [],
  humanFeedback: [],
  ...overrides,
});

const createHarnessThreads = (): TeamThreadSummary[] => {
  return [
    createThread({
      workerLanes: [
        createLane({
          laneId: "lane-queued-1",
          status: "queued",
        }),
        createLane({
          laneId: "lane-queued-2",
          laneIndex: 2,
          status: "queued",
        }),
        createLane({
          laneId: "lane-coding-1",
          laneIndex: 3,
          status: "coding",
        }),
      ],
    }),
    createThread({
      threadId: "review9876beta5432",
      requestTitle: "Review tooltip thread",
      workerLanes: [
        createLane({
          laneId: "lane-review-1",
          status: "reviewing",
        }),
      ],
    }),
    createThread({
      threadId: "archived1111failed",
      archivedAt: "2026-04-18T10:10:00.000Z",
      requestTitle: "Archived failed thread",
      workerLanes: [
        createLane({
          laneId: "lane-failed-1",
          status: "failed",
        }),
      ],
    }),
    createThread({
      threadId: "approved1111terminal",
      status: "approved",
      requestTitle: "Approved terminal thread",
      workerLanes: [
        createLane({
          laneId: "lane-approved-1",
          status: "approved",
        }),
      ],
    }),
  ];
};

const isReactElement = (node: ReactNode): node is TestReactElement => {
  return isValidElement(node);
};

const visitElementTree = (node: ReactNode, visitor: (element: TestReactElement) => void): void => {
  if (!isReactElement(node)) {
    return;
  }

  visitor(node);
  for (const child of Children.toArray(node.props.children)) {
    visitElementTree(child, visitor);
  }
};

const findElement = (node: ReactNode, predicate: (element: TestReactElement) => boolean) => {
  let match: TestReactElement | null = null;

  visitElementTree(node, (element) => {
    if (match === null && predicate(element)) {
      match = element;
    }
  });

  return match;
};

const createBlurEvent = () => {
  return {
    currentTarget: {
      contains: () => false,
    },
    relatedTarget: null,
  };
};

const createPointerDownEvent = () => {
  return {
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
  };
};

const createLaneListHarness = (threads: TeamThreadSummary[] = createHarnessThreads()) => {
  const laneThreadsByStatus = buildTeamStatusLaneThreadBuckets(threads);
  const laneTotals = teamStatusLaneItems
    .map((item) => ({
      ...item,
      value: laneThreadsByStatus[item.key].reduce((total, thread) => {
        return total + thread.matchingLaneCount;
      }, 0),
    }))
    .filter((item) => item.value > 0);
  const selectedThreadIds: string[] = [];
  let openLaneState: TeamStatusLanePopoverState | null = null;

  const getProps = () => ({
    laneTotals,
    laneThreadsByStatus,
    openLaneKey: openLaneState?.key ?? null,
    setLanePopoverRef: () => {},
    onLaneBlur: (laneKey: TeamStatusLaneCountKey, event: ReturnType<typeof createBlurEvent>) => {
      const nextFocusedElement = event.relatedTarget;
      if (
        nextFocusedElement !== null &&
        typeof event.currentTarget.contains === "function" &&
        event.currentTarget.contains(nextFocusedElement)
      ) {
        return;
      }

      if (openLaneState?.key === laneKey) {
        openLaneState = null;
      }
    },
    onLaneFocusCapture: (laneKey: TeamStatusLaneCountKey) => {
      openLaneState = getNextTeamStatusLanePopoverState(openLaneState, laneKey, "focus");
    },
    onLaneKeyDown: (event: { key: string }) => {
      if (event.key === "Escape") {
        openLaneState = null;
      }
    },
    onLaneMouseEnter: (laneKey: TeamStatusLaneCountKey) => {
      openLaneState = getNextTeamStatusLanePopoverState(openLaneState, laneKey, "hover");
    },
    onLaneMouseLeave: (laneKey: TeamStatusLaneCountKey) => {
      if (openLaneState?.key === laneKey && openLaneState.trigger === "click") {
        return;
      }

      if (openLaneState?.key === laneKey) {
        openLaneState = null;
      }
    },
    onLaneClick: (laneKey: TeamStatusLaneCountKey) => {
      openLaneState = getNextTeamStatusLanePopoverState(openLaneState, laneKey, "click");
    },
    onSelectLaneThread: (threadId: string) => {
      openLaneState = null;
      selectedThreadIds.push(threadId);
    },
  });

  const renderTree = () => TeamStatusBarLaneList(getProps());
  const renderHtml = () => renderToStaticMarkup(createElement(TeamStatusBarLaneList, getProps()));

  const findRequiredElement = (predicate: (element: TestReactElement) => boolean) => {
    const match = findElement(renderTree(), predicate);
    if (match === null) {
      throw new Error("Expected lane-list element to exist.");
    }

    return match;
  };

  const findOptionalElement = (predicate: (element: TestReactElement) => boolean) => {
    return findElement(renderTree(), predicate);
  };

  return {
    clickLane(laneKey: TeamStatusLaneCountKey) {
      const trigger = findRequiredElement(
        (element) =>
          element.props["data-status-lane-trigger"] === laneKey && element.type === "button",
      );
      const onClick = trigger.props.onClick as (() => void) | undefined;
      onClick?.();
    },
    focusLane(laneKey: TeamStatusLaneCountKey) {
      const wrapper = findRequiredElement(
        (element) => element.props["data-status-lane-key"] === laneKey && element.type === "div",
      );
      const onFocusCapture = wrapper.props.onFocusCapture as (() => void) | undefined;
      onFocusCapture?.();
    },
    hoverLane(laneKey: TeamStatusLaneCountKey) {
      const wrapper = findRequiredElement(
        (element) => element.props["data-status-lane-key"] === laneKey && element.type === "div",
      );
      const onMouseEnter = wrapper.props.onMouseEnter as (() => void) | undefined;
      onMouseEnter?.();
    },
    activateLaneThreadWithPointer(laneKey: TeamStatusLaneCountKey, threadId: string) {
      const wrapper = findRequiredElement(
        (element) => element.props["data-status-lane-key"] === laneKey && element.type === "div",
      );
      const initialThreadButton = findRequiredElement(
        (element) => element.props["data-thread-id"] === threadId && element.type === "button",
      );
      const pointerDownEvent = createPointerDownEvent();

      const onPointerDown = initialThreadButton.props.onPointerDown as
        | ((event: ReturnType<typeof createPointerDownEvent>) => void)
        | undefined;
      onPointerDown?.(pointerDownEvent);
      if (!pointerDownEvent.defaultPrevented) {
        const onBlur = wrapper.props.onBlur as
          | ((event: ReturnType<typeof createBlurEvent>) => void)
          | undefined;
        onBlur?.(createBlurEvent());
      }

      const nextThreadButton = findOptionalElement(
        (element) => element.props["data-thread-id"] === threadId && element.type === "button",
      );
      const onClick = nextThreadButton?.props.onClick as (() => void) | undefined;
      onClick?.();
    },
    get html() {
      return renderHtml();
    },
    get selectedThreadIds() {
      return [...selectedThreadIds];
    },
  };
};

describe("TeamStatusBarLaneList", () => {
  it("reveals the matching living threads from hover, focus, and click triggers", () => {
    const hoverHarness = createLaneListHarness();
    hoverHarness.hoverLane("queued");

    expect(hoverHarness.html).toContain('aria-label="Queued living threads"');
    expect(hoverHarness.html).toContain("Queued tooltip thread");
    expect(hoverHarness.html).toContain("2 matching lanes");
    expect(hoverHarness.html).not.toContain("Review tooltip thread");
    expect(hoverHarness.html).not.toContain("Archived failed thread");
    expect(hoverHarness.html).not.toContain("Approved terminal thread");

    const focusHarness = createLaneListHarness();
    focusHarness.focusLane("reviewing");

    expect(focusHarness.html).toContain('aria-label="Reviewing living threads"');
    expect(focusHarness.html).toContain("Review tooltip thread");
    expect(focusHarness.html).not.toContain("Queued tooltip thread");

    const clickHarness = createLaneListHarness();
    clickHarness.clickLane("coding");

    expect(clickHarness.html).toContain('aria-label="Coding living threads"');
    expect(clickHarness.html).toContain("Queued tooltip thread");

    clickHarness.clickLane("coding");

    expect(clickHarness.html).not.toContain('aria-label="Coding living threads"');
  });

  it("keeps pointer row activation on the existing thread-tab selection path and dismisses after selection", () => {
    const harness = createLaneListHarness();
    harness.focusLane("queued");

    harness.activateLaneThreadWithPointer("queued", "queued1234alpha5678");

    expect(harness.selectedThreadIds).toEqual(["queued1234alpha5678"]);
    expect(harness.html).not.toContain('aria-label="Queued living threads"');
  });
});
