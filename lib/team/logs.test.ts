import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  appendTeamCodexLogEntry,
  expandTeamCodexStderrBlock,
  listTeamCodexLogWindow,
} from "@/lib/team/logs";
import type { TeamCodexLogEntry, TeamCodexLogSource } from "@/lib/team/types";

const TEMPORARY_DIRECTORIES = new Set<string>();

const createStorePath = async (): Promise<string> => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "team-log-window-"));
  TEMPORARY_DIRECTORIES.add(directory);
  return path.join(directory, "threads.sqlite");
};

const createLogEntry = ({
  index,
  source,
  message,
  assignmentNumber = 1,
  laneId = "lane-1",
  roleId = "coder",
}: {
  index: number;
  source: TeamCodexLogSource;
  message: string;
  assignmentNumber?: number | null;
  laneId?: string | null;
  roleId?: string | null;
}): TeamCodexLogEntry => {
  return {
    id: `entry-${index}`,
    threadId: "thread-1",
    assignmentNumber,
    roleId,
    laneId,
    source,
    message,
    createdAt: `2026-04-11T08:00:0${index}.000Z`,
  };
};

afterEach(async () => {
  await Promise.all(
    [...TEMPORARY_DIRECTORIES].map((directory) =>
      rm(directory, {
        force: true,
        recursive: true,
      }),
    ),
  );
  TEMPORARY_DIRECTORIES.clear();
});

describe("appendTeamCodexLogEntry", () => {
  it("stores logs in a codex-logs sibling beside the resolved thread store", async () => {
    const threadFile = await createStorePath();
    const entry = createLogEntry({
      index: 1,
      message: "coder boot",
      source: "stdout",
    });

    await appendTeamCodexLogEntry({
      entry,
      threadFile,
    });

    await expect(
      readFile(path.join(path.dirname(threadFile), "codex-logs", "thread-1.jsonl"), "utf8"),
    ).resolves.toBe(`${JSON.stringify(entry)}\n`);
  });
});

describe("listTeamCodexLogWindow", () => {
  it("pages backward from the tail and forward from a known cursor without rereading the full file", async () => {
    const threadFile = await createStorePath();
    const entries = [
      createLogEntry({ index: 1, message: "planner queued", source: "system", roleId: "planner" }),
      createLogEntry({ index: 2, message: "coder boot", source: "stdout" }),
      createLogEntry({ index: 3, message: "stderr line 1", source: "stderr" }),
      createLogEntry({ index: 4, message: "stderr line 2", source: "stderr" }),
      createLogEntry({ index: 5, message: "review ready", source: "system", roleId: "reviewer" }),
    ];

    for (const entry of entries) {
      await appendTeamCodexLogEntry({ entry, threadFile });
    }

    const tail = await listTeamCodexLogWindow({
      limit: 3,
      threadFile,
      threadId: "thread-1",
    });

    expect(tail.entries.map((entry) => entry.message)).toEqual([
      "stderr line 1",
      "stderr line 2",
      "review ready",
    ]);
    expect(tail.pageInfo.hasOlder).toBe(true);
    expect(tail.pageInfo.hasNewer).toBe(false);

    const olderPage = await listTeamCodexLogWindow({
      beforeCursor: tail.pageInfo.beforeCursor,
      limit: 2,
      threadFile,
      threadId: "thread-1",
    });

    expect(olderPage.entries.map((entry) => entry.message)).toEqual([
      "planner queued",
      "coder boot",
    ]);
    expect(olderPage.pageInfo.hasOlder).toBe(false);
    expect(olderPage.pageInfo.hasNewer).toBe(true);

    const newerPage = await listTeamCodexLogWindow({
      afterCursor: olderPage.pageInfo.afterCursor,
      limit: 3,
      threadFile,
      threadId: "thread-1",
    });

    expect(newerPage.entries.map((entry) => entry.message)).toEqual([
      "stderr line 1",
      "stderr line 2",
      "review ready",
    ]);
  });

  it("filters stderr windows without losing cursor pagination metadata", async () => {
    const threadFile = await createStorePath();
    const entries = [
      createLogEntry({ index: 1, message: "planner queued", source: "system", roleId: "planner" }),
      createLogEntry({ index: 2, message: "stderr line 1", source: "stderr" }),
      createLogEntry({ index: 3, message: "stdout line 1", source: "stdout" }),
      createLogEntry({ index: 4, message: "stderr line 2", source: "stderr" }),
    ];

    for (const entry of entries) {
      await appendTeamCodexLogEntry({ entry, threadFile });
    }

    const stderrWindow = await listTeamCodexLogWindow({
      limit: 2,
      source: "stderr",
      threadFile,
      threadId: "thread-1",
    });

    expect(stderrWindow.entries.map((entry) => entry.message)).toEqual([
      "stderr line 1",
      "stderr line 2",
    ]);
    expect(stderrWindow.pageInfo.beforeCursor).toBe(stderrWindow.entries[0].startCursor);
    expect(stderrWindow.pageInfo.afterCursor).toBe(stderrWindow.entries[1].endCursor);
  });

  it("filters windows to a single assignment, lane, and role context", async () => {
    const threadFile = await createStorePath();
    const entries = [
      createLogEntry({
        assignmentNumber: 1,
        index: 1,
        laneId: null,
        message: "planner stdout",
        roleId: "planner",
        source: "stdout",
      }),
      createLogEntry({
        assignmentNumber: 1,
        index: 2,
        laneId: "lane-1",
        message: "lane 1 coder stdout",
        roleId: "coder",
        source: "stdout",
      }),
      createLogEntry({
        assignmentNumber: 1,
        index: 3,
        laneId: "lane-2",
        message: "lane 2 coder stdout",
        roleId: "coder",
        source: "stdout",
      }),
      createLogEntry({
        assignmentNumber: 1,
        index: 4,
        laneId: "lane-1",
        message: "lane 1 reviewer stdout",
        roleId: "reviewer",
        source: "stdout",
      }),
      createLogEntry({
        assignmentNumber: 2,
        index: 5,
        laneId: "lane-1",
        message: "assignment 2 coder stdout",
        roleId: "coder",
        source: "stdout",
      }),
    ];

    for (const entry of entries) {
      await appendTeamCodexLogEntry({ entry, threadFile });
    }

    const filteredWindow = await listTeamCodexLogWindow({
      assignmentNumber: 1,
      laneId: "lane-1",
      limit: 10,
      roleId: "coder",
      source: "stdout",
      threadFile,
      threadId: "thread-1",
    });

    expect(filteredWindow.entries.map((entry) => entry.message)).toEqual(["lane 1 coder stdout"]);
    expect(filteredWindow.pageInfo.beforeCursor).toBe(filteredWindow.entries[0].startCursor);
    expect(filteredWindow.pageInfo.afterCursor).toBe(filteredWindow.entries[0].endCursor);
  });
});

describe("expandTeamCodexStderrBlock", () => {
  it("expands a stderr block across older pages until the surrounding context changes", async () => {
    const threadFile = await createStorePath();
    const entries = [
      createLogEntry({ index: 1, message: "planner queued", source: "system", roleId: "planner" }),
      createLogEntry({ index: 2, message: "stderr line 1", source: "stderr" }),
      createLogEntry({ index: 3, message: "stderr line 2", source: "stderr" }),
      createLogEntry({ index: 4, message: "stderr line 3", source: "stderr" }),
      createLogEntry({ index: 5, message: "stderr line 4", source: "stderr" }),
      createLogEntry({ index: 6, message: "stdout line 1", source: "stdout" }),
    ];

    for (const entry of entries) {
      await appendTeamCodexLogEntry({ entry, threadFile });
    }

    const tailWindow = await listTeamCodexLogWindow({
      limit: 3,
      threadFile,
      threadId: "thread-1",
    });
    const partialBlock = tailWindow.entries.filter((entry) => entry.source === "stderr");

    const expandedBlock = await expandTeamCodexStderrBlock({
      endCursor: partialBlock.at(-1)!.endCursor,
      startCursor: partialBlock[0].startCursor,
      threadFile,
      threadId: "thread-1",
    });

    expect(expandedBlock.entries.map((entry) => entry.message)).toEqual([
      "stderr line 1",
      "stderr line 2",
      "stderr line 3",
      "stderr line 4",
    ]);
    expect(expandedBlock.block.startCursor).toBe(expandedBlock.entries[0].startCursor);
    expect(expandedBlock.block.endCursor).toBe(expandedBlock.entries.at(-1)?.endCursor);
  });
});
