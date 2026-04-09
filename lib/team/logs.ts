import "server-only";

import { promises as fs } from "node:fs";
import path from "node:path";
import type { TeamCodexEvent, TeamCodexLogEntry } from "@/lib/team/types";

const logMutationQueues = new Map<string, Promise<unknown>>();

const resolveStorePath = (threadFile: string): string => {
  return path.isAbsolute(threadFile) ? threadFile : path.join(process.cwd(), threadFile);
};

const resolveLogDirectory = (threadFile: string): string => {
  return path.join(path.dirname(resolveStorePath(threadFile)), "codex-logs");
};

const resolveLogFilePath = ({
  threadFile,
  threadId,
}: {
  threadFile: string;
  threadId: string;
}): string => {
  return path.join(resolveLogDirectory(threadFile), `${threadId}.jsonl`);
};

const queueLogMutation = async <T>(logFilePath: string, task: () => Promise<T>): Promise<T> => {
  const previous = logMutationQueues.get(logFilePath) ?? Promise.resolve();
  const mutation = previous.catch(() => undefined).then(task);
  const tracked = mutation.finally(() => {
    if (logMutationQueues.get(logFilePath) === tracked) {
      logMutationQueues.delete(logFilePath);
    }
  });

  logMutationQueues.set(logFilePath, tracked);
  return mutation;
};

export const createTeamCodexLogEntry = ({
  threadId,
  assignmentNumber,
  roleId,
  laneId,
  event,
}: {
  threadId: string;
  assignmentNumber: number | null;
  roleId: string | null;
  laneId: string | null;
  event: TeamCodexEvent;
}): TeamCodexLogEntry => {
  return {
    id: crypto.randomUUID(),
    threadId,
    assignmentNumber,
    roleId,
    laneId,
    source: event.source,
    message: event.message,
    createdAt: event.createdAt,
  };
};

export const appendTeamCodexLogEntry = async ({
  threadFile,
  entry,
}: {
  threadFile: string;
  entry: TeamCodexLogEntry;
}): Promise<void> => {
  const logFilePath = resolveLogFilePath({
    threadFile,
    threadId: entry.threadId,
  });

  await queueLogMutation(logFilePath, async () => {
    await fs.mkdir(path.dirname(logFilePath), { recursive: true });
    await fs.appendFile(logFilePath, `${JSON.stringify(entry)}\n`, "utf8");
  });
};

export const appendTeamCodexLogEvent = async ({
  threadFile,
  threadId,
  assignmentNumber,
  roleId,
  laneId,
  event,
}: {
  threadFile: string;
  threadId: string;
  assignmentNumber: number | null;
  roleId: string | null;
  laneId: string | null;
  event: TeamCodexEvent;
}): Promise<TeamCodexLogEntry> => {
  const entry = createTeamCodexLogEntry({
    threadId,
    assignmentNumber,
    roleId,
    laneId,
    event,
  });

  await appendTeamCodexLogEntry({
    threadFile,
    entry,
  });

  return entry;
};

export const listTeamCodexLogEntries = async ({
  threadFile,
  threadId,
  limit = 200,
}: {
  threadFile: string;
  threadId: string;
  limit?: number;
}): Promise<TeamCodexLogEntry[]> => {
  const logFilePath = resolveLogFilePath({
    threadFile,
    threadId,
  });

  try {
    const raw = await fs.readFile(logFilePath, "utf8");
    return raw
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as TeamCodexLogEntry)
      .slice(-limit);
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === "ENOENT") {
      return [];
    }

    throw error;
  }
};
