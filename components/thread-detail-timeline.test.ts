import { describe, expect, it } from "vitest";
import {
  mergeTimelineLogGroupPair,
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
