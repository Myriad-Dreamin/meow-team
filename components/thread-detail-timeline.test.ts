import { describe, expect, it } from "vitest";
import {
  buildCompactLaneEventLabels,
  buildTimelineAnchors,
  buildTimelineTaskOutputBundles,
  formatCompactTimelineHandoffLabel,
  formatCompactTimelinePlannerNoteLabel,
  formatCompactTimelineStepLabel,
  mergeTimelineLogGroupPair,
  mergeTimelineLogGroups,
  pickActiveTimelineAnchorId,
  type TimelineLogGroup,
} from "@/components/thread-detail-timeline";
import type { ThreadLogGroup } from "@/components/thread-view-utils";

const createThreadLogGroup = ({
  endCursor,
  message,
  preview,
  startCursor,
}: {
  endCursor: number;
  message: string;
  preview: string;
  startCursor: number;
}): ThreadLogGroup => {
  const createdAt = `2026-04-11T08:00:${String(startCursor).padStart(2, "0")}.000Z`;

  return {
    contextEntry: {
      assignmentNumber: 1,
      createdAt,
      endCursor,
      id: `entry-${startCursor}`,
      laneId: "lane-1",
      message,
      roleId: "coder",
      source: "stderr",
      startCursor,
      threadId: "thread-1",
    },
    endCursor,
    endedAt: createdAt,
    id: `group-${startCursor}`,
    lineCount: message.split("\n").length,
    message,
    preview,
    source: "stderr",
    startCursor,
    startedAt: createdAt,
  };
};

const createTimelineLogGroup = ({
  expandedMode,
  fullMessage,
  group,
}: {
  expandedMode: TimelineLogGroup["expandedMode"];
  fullMessage: string | null;
  group: ThreadLogGroup;
}): TimelineLogGroup => {
  return {
    expandedMode,
    fullMessage,
    group,
    isLoading: false,
  };
};

describe("mergeTimelineLogGroupPair", () => {
  it.each([
    ["live" as const, "newer stderr 3\nnewer stderr 4"],
    ["manual" as const, "newer stderr 3\nnewer stderr 4"],
  ])(
    "preserves %s stderr text when older history is prepended into the same block",
    (expandedMode, fullMessage) => {
      const olderGroup = createTimelineLogGroup({
        expandedMode: "collapsed",
        fullMessage: null,
        group: createThreadLogGroup({
          endCursor: 21,
          message: "older stderr 1\nolder stderr 2",
          preview: "older stderr 1",
          startCursor: 10,
        }),
      });
      const newerGroup = createTimelineLogGroup({
        expandedMode,
        fullMessage,
        group: createThreadLogGroup({
          endCursor: 43,
          message: fullMessage,
          preview: "newer stderr 3",
          startCursor: 32,
        }),
      });

      expect(mergeTimelineLogGroupPair(olderGroup, newerGroup)).toMatchObject({
        expandedMode,
        fullMessage: "older stderr 1\nolder stderr 2\nnewer stderr 3\nnewer stderr 4",
        group: {
          message: "older stderr 1\nolder stderr 2\nnewer stderr 3\nnewer stderr 4",
        },
      });
    },
  );

  it("keeps merged stderr folded when neither half has loaded block text", () => {
    const olderGroup = createTimelineLogGroup({
      expandedMode: "collapsed",
      fullMessage: null,
      group: createThreadLogGroup({
        endCursor: 21,
        message: "older stderr 1\nolder stderr 2",
        preview: "older stderr 1",
        startCursor: 10,
      }),
    });
    const newerGroup = createTimelineLogGroup({
      expandedMode: "collapsed",
      fullMessage: null,
      group: createThreadLogGroup({
        endCursor: 43,
        message: "newer stderr 3\nnewer stderr 4",
        preview: "newer stderr 3",
        startCursor: 32,
      }),
    });

    expect(mergeTimelineLogGroupPair(olderGroup, newerGroup)).toMatchObject({
      expandedMode: "collapsed",
      fullMessage: null,
      group: {
        message: "older stderr 1",
      },
    });
  });
});

describe("mergeTimelineLogGroups", () => {
  it.each([
    ["live" as const, "newer stderr 3\nnewer stderr 4"],
    ["manual" as const, "newer stderr 3\nnewer stderr 4"],
  ])(
    "preserves %s stderr text when preview-only older history is prepended into the same block",
    (expandedMode, fullMessage) => {
      const currentGroups = [
        createTimelineLogGroup({
          expandedMode,
          fullMessage,
          group: createThreadLogGroup({
            endCursor: 43,
            message: fullMessage,
            preview: "newer stderr 3",
            startCursor: 32,
          }),
        }),
      ];
      const olderGroups = [
        createThreadLogGroup({
          endCursor: 21,
          message: "older stderr 1\nolder stderr 2",
          preview: "older stderr 1",
          startCursor: 10,
        }),
      ];

      expect(
        mergeTimelineLogGroups(currentGroups, olderGroups, "prepend", "history"),
      ).toMatchObject([
        {
          expandedMode,
          fullMessage: "older stderr 1\nolder stderr 2\nnewer stderr 3\nnewer stderr 4",
          group: {
            message: "older stderr 1\nolder stderr 2\nnewer stderr 3\nnewer stderr 4",
          },
        },
      ]);
    },
  );
});

describe("buildTimelineAnchors", () => {
  it("keeps parent proposal anchors grouped while preserving later message anchors in timeline order", () => {
    const timelineItems: Parameters<typeof buildTimelineAnchors>[0] = [
      {
        anchorId: "thread-anchor-request",
        anchorLabel: "Request",
        anchorLevel: "primary",
        id: "message-request",
        kind: "message",
        occurredAt: "2026-04-11T08:00:00.000Z",
        text: "Ship it.",
        title: "Human Request",
        variant: "human",
      },
      {
        anchorId: "thread-anchor-assignment-1",
        anchorLabel: "Assignment 1",
        anchorLevel: "primary",
        assignment: {} as never,
        childAnchors: [
          {
            id: "thread-anchor-assignment-1-lane-1",
            label: "Proposal 1",
            level: "secondary",
          },
          {
            id: "thread-anchor-assignment-1-lane-2",
            label: "Proposal 2",
            level: "secondary",
          },
        ],
        id: "assignment-1",
        kind: "assignment",
        occurredAt: "2026-04-11T08:01:00.000Z",
      },
      {
        anchorId: "thread-anchor-lane-event-1",
        anchorLabel: "Proposal 1 · Coder: Implement the change",
        anchorLevel: "tertiary",
        assignmentNumber: 1,
        event: {} as never,
        id: "lane-event-1",
        kind: "lane-event",
        lane: {
          laneId: "lane-1",
          laneIndex: 1,
        } as never,
        occurredAt: "2026-04-11T08:02:00.000Z",
        proposalAnchorId: "thread-anchor-assignment-1-lane-1",
      },
      {
        anchorId: "thread-anchor-feedback-1",
        anchorLabel: "Request-group feedback: Tighten the scope",
        anchorLevel: "primary",
        feedback: {} as never,
        id: "feedback-1",
        kind: "human-feedback",
        occurredAt: "2026-04-11T08:03:00.000Z",
      },
    ];

    expect(buildTimelineAnchors(timelineItems)).toEqual([
      {
        id: "thread-anchor-request",
        label: "Request",
        level: "primary",
      },
      {
        id: "thread-anchor-assignment-1",
        label: "Assignment 1",
        level: "primary",
      },
      {
        id: "thread-anchor-assignment-1-lane-1",
        label: "Proposal 1",
        level: "secondary",
      },
      {
        id: "thread-anchor-assignment-1-lane-2",
        label: "Proposal 2",
        level: "secondary",
      },
      {
        id: "thread-anchor-lane-event-1",
        label: "Proposal 1 · Coder: Implement the change",
        level: "tertiary",
      },
      {
        id: "thread-anchor-feedback-1",
        label: "Request-group feedback: Tighten the scope",
        level: "primary",
      },
    ]);
  });
});

describe("compact timeline labels", () => {
  it("shortens planner step copy into a single-line proposal label", () => {
    expect(
      formatCompactTimelineStepLabel(
        "Planner",
        "Preferred OpenSpec-aligned change for the approved request group.",
      ),
    ).toBe("Planner proposed");
  });

  it("shortens planner notes about approved proposals", () => {
    expect(
      formatCompactTimelinePlannerNoteLabel(
        "Human approved proposal 1; coding and machine review were queued.",
      ),
    ).toBe("Human approved planner");
  });

  it("compresses lane event anchors into short run and decision labels", () => {
    expect(
      buildCompactLaneEventLabels([
        {
          actor: "coder",
          createdAt: "2026-04-11T08:00:00.000Z",
          id: "event-1",
          message: "Coder is implementing the approved proposal in the dedicated worktree.",
        },
        {
          actor: "reviewer",
          createdAt: "2026-04-11T08:01:00.000Z",
          id: "event-2",
          message: "Reviewer requested changes: tighten the tests.",
        },
        {
          actor: "coder",
          createdAt: "2026-04-11T08:02:00.000Z",
          id: "event-3",
          message: "Coder is addressing reviewer-requested changes.",
        },
        {
          actor: "reviewer",
          createdAt: "2026-04-11T08:03:00.000Z",
          id: "event-4",
          message: "Reviewer completed machine review: approved.",
        },
      ]),
    ).toEqual(["Coder run 1", "Reviewer revision 1", "Coder run 2", "Reviewer approved"]);
  });

  it("keeps handoff anchors concise", () => {
    expect(
      formatCompactTimelineHandoffLabel({
        decision: "approved",
        roleId: "reviewer",
        roleName: "Reviewer",
      }),
    ).toBe("Reviewer approved");
  });
});

describe("pickActiveTimelineAnchorId", () => {
  it("tracks the last anchor above the current scroll marker", () => {
    expect(
      pickActiveTimelineAnchorId(
        [
          { id: "request", top: 0 },
          { id: "assignment", top: 140 },
          { id: "proposal", top: 240 },
        ],
        210,
      ),
    ).toBe("assignment");
  });

  it("falls back to the first anchor when the marker is above the list", () => {
    expect(
      pickActiveTimelineAnchorId(
        [
          { id: "request", top: 80 },
          { id: "assignment", top: 180 },
        ],
        20,
      ),
    ).toBe("request");
  });

  it("keeps dense anchor lists aligned with the last visible timeline section", () => {
    const anchorOffsets = Array.from({ length: 160 }, (_, index) => ({
      id: `anchor-${index + 1}`,
      top: index * 48,
    }));

    expect(pickActiveTimelineAnchorId(anchorOffsets, 48 * 137 + 12)).toBe("anchor-138");
  });
});

describe("buildTimelineTaskOutputBundles", () => {
  it("merges adjacent stdout and stderr groups from the same task context into one bundle", () => {
    const bundles = buildTimelineTaskOutputBundles([
      createTimelineLogGroup({
        expandedMode: "manual",
        fullMessage: "stdout 1",
        group: {
          ...createThreadLogGroup({
            endCursor: 11,
            message: "stdout 1",
            preview: "stdout 1",
            startCursor: 1,
          }),
          contextEntry: {
            ...createThreadLogGroup({
              endCursor: 11,
              message: "stdout 1",
              preview: "stdout 1",
              startCursor: 1,
            }).contextEntry,
            source: "stdout",
          },
          source: "stdout",
        },
      }),
      createTimelineLogGroup({
        expandedMode: "collapsed",
        fullMessage: null,
        group: createThreadLogGroup({
          endCursor: 21,
          message: "stderr 1",
          preview: "stderr 1",
          startCursor: 12,
        }),
      }),
    ]);

    expect(bundles).toHaveLength(1);
    expect(bundles[0]).toMatchObject({
      lineCount: 2,
    });
    expect(bundles[0]?.groups.map((group) => group.group.source)).toEqual(["stdout", "stderr"]);
  });
});
