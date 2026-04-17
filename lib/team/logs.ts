import "server-only";

import { promises as fs } from "node:fs";
import type { FileHandle } from "node:fs/promises";
import path from "node:path";
import type {
  TeamCodexEvent,
  TeamCodexLogCursorEntry,
  TeamCodexLogEntry,
  TeamCodexLogPageInfo,
  TeamCodexLogSource,
} from "@/lib/team/types";

const LOG_READ_CHUNK_BYTES = 64 * 1024;
const LOG_WINDOW_DEFAULT_LIMIT = 200;
const logMutationQueues = new Map<string, Promise<unknown>>();

const resolveLogDirectory = (threadFile: string): string => {
  return path.join(path.dirname(threadFile), "codex-logs");
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

const normalizeCursor = ({
  cursor,
  fileSize,
  label,
}: {
  cursor: number;
  fileSize: number;
  label: string;
}): number => {
  if (!Number.isInteger(cursor) || cursor < 0 || cursor > fileSize) {
    throw new Error(`${label} must resolve to a byte offset within the log file.`);
  }

  return cursor;
};

const parseLogLine = ({
  buffer,
  threadId,
  startCursor,
  endCursor,
  descriptor,
}: {
  buffer: Uint8Array;
  threadId: string;
  startCursor: number;
  endCursor: number;
  descriptor: string;
}): TeamCodexLogCursorEntry | null => {
  const line = Buffer.from(buffer).toString("utf8").replace(/\r$/u, "");
  if (!line.trim()) {
    return null;
  }

  try {
    const entry = JSON.parse(line) as TeamCodexLogEntry;

    return {
      ...entry,
      endCursor,
      startCursor,
    };
  } catch (error) {
    console.warn(
      `[team-logs:${threadId}] Ignoring malformed log line at ${descriptor}: ${
        error instanceof Error ? error.message : "Unknown error."
      }`,
    );
    return null;
  }
};

const matchesSource = (
  entry: TeamCodexLogCursorEntry,
  source: TeamCodexLogSource | null,
): boolean => {
  return source === null || entry.source === source;
};

type TeamCodexLogContextFilters = {
  assignmentNumber?: number | null;
  laneId?: string | null;
  roleId?: string | null;
};

const matchesLogContext = (
  entry: TeamCodexLogCursorEntry,
  filters: TeamCodexLogContextFilters,
): boolean => {
  if (
    typeof filters.assignmentNumber === "number" &&
    entry.assignmentNumber !== filters.assignmentNumber
  ) {
    return false;
  }

  if (filters.laneId && entry.laneId !== filters.laneId) {
    return false;
  }

  if (filters.roleId && entry.roleId !== filters.roleId) {
    return false;
  }

  return true;
};

const buildPageInfo = ({
  entries,
  beforeCursor,
  afterCursor,
  hasOlder,
  hasNewer,
}: {
  entries: TeamCodexLogCursorEntry[];
  beforeCursor: number | null;
  afterCursor: number | null;
  hasOlder: boolean;
  hasNewer: boolean;
}): TeamCodexLogPageInfo => {
  return {
    beforeCursor: entries[0]?.startCursor ?? beforeCursor,
    afterCursor: entries.at(-1)?.endCursor ?? afterCursor,
    hasOlder,
    hasNewer,
  };
};

const readLogEntriesForward = async ({
  handle,
  threadId,
  startCursor,
  endCursor,
  limit,
  source,
  filters,
}: {
  handle: FileHandle;
  threadId: string;
  startCursor: number;
  endCursor: number;
  limit: number;
  source: TeamCodexLogSource | null;
  filters: TeamCodexLogContextFilters;
}): Promise<{
  entries: TeamCodexLogCursorEntry[];
  hasNewer: boolean;
}> => {
  if (startCursor >= endCursor) {
    return {
      entries: [],
      hasNewer: false,
    };
  }

  const entries: TeamCodexLogCursorEntry[] = [];
  let position = startCursor;
  let carry = Buffer.alloc(0);
  let carryStartCursor = startCursor;

  while (position < endCursor && entries.length < limit + 1) {
    const readLength = Math.min(LOG_READ_CHUNK_BYTES, endCursor - position);
    const chunk = Buffer.alloc(readLength);
    const { bytesRead } = await handle.read(chunk, 0, readLength, position);
    if (bytesRead === 0) {
      break;
    }

    const nextChunk = chunk.subarray(0, bytesRead);
    const combined = carry.length > 0 ? Buffer.concat([carry, nextChunk]) : nextChunk;
    const combinedStartCursor = carryStartCursor;
    let lineStartIndex = 0;
    let lastConsumedIndex = -1;

    for (let index = 0; index < combined.length; index += 1) {
      if (combined[index] !== 10) {
        continue;
      }

      const entry = parseLogLine({
        buffer: combined.subarray(lineStartIndex, index),
        descriptor: `byte ${combinedStartCursor + lineStartIndex}`,
        endCursor: combinedStartCursor + index + 1,
        startCursor: combinedStartCursor + lineStartIndex,
        threadId,
      });

      if (entry && matchesSource(entry, source) && matchesLogContext(entry, filters)) {
        entries.push(entry);
        if (entries.length >= limit + 1) {
          break;
        }
      }

      lineStartIndex = index + 1;
      lastConsumedIndex = index;
    }

    if (entries.length >= limit + 1) {
      break;
    }

    carry =
      lastConsumedIndex >= 0 ? combined.subarray(lastConsumedIndex + 1) : Buffer.from(combined);
    carryStartCursor =
      lastConsumedIndex >= 0 ? combinedStartCursor + lastConsumedIndex + 1 : combinedStartCursor;
    position += bytesRead;
  }

  if (position >= endCursor && carry.length > 0 && entries.length < limit + 1) {
    const entry = parseLogLine({
      buffer: carry,
      descriptor: `byte ${carryStartCursor}`,
      endCursor,
      startCursor: carryStartCursor,
      threadId,
    });

    if (entry && matchesSource(entry, source) && matchesLogContext(entry, filters)) {
      entries.push(entry);
    }
  }

  return {
    entries: entries.slice(0, limit),
    hasNewer: entries.length > limit,
  };
};

const readLogEntriesBackward = async ({
  handle,
  threadId,
  beforeCursor,
  limit,
  source,
  filters,
}: {
  handle: FileHandle;
  threadId: string;
  beforeCursor: number;
  limit: number;
  source: TeamCodexLogSource | null;
  filters: TeamCodexLogContextFilters;
}): Promise<{
  entries: TeamCodexLogCursorEntry[];
  hasOlder: boolean;
}> => {
  if (beforeCursor <= 0) {
    return {
      entries: [],
      hasOlder: false,
    };
  }

  const reversedEntries: TeamCodexLogCursorEntry[] = [];
  let position = beforeCursor;
  let carry = Buffer.alloc(0);

  while (position > 0 && reversedEntries.length < limit + 1) {
    const chunkStart = Math.max(0, position - LOG_READ_CHUNK_BYTES);
    const readLength = position - chunkStart;
    const chunk = Buffer.alloc(readLength);
    const { bytesRead } = await handle.read(chunk, 0, readLength, chunkStart);
    if (bytesRead === 0) {
      break;
    }

    const nextChunk = chunk.subarray(0, bytesRead);
    const combined = carry.length > 0 ? Buffer.concat([nextChunk, carry]) : nextChunk;
    const newlineIndexes: number[] = [];

    for (let index = 0; index < combined.length; index += 1) {
      if (combined[index] === 10) {
        newlineIndexes.push(index);
      }
    }

    if (newlineIndexes.length === 0) {
      carry = combined;
      position = chunkStart;
      continue;
    }

    const firstProcessIndex = chunkStart === 0 ? 0 : 1;
    carry = chunkStart === 0 ? Buffer.alloc(0) : combined.subarray(0, newlineIndexes[0] + 1);

    for (
      let lineIndex = newlineIndexes.length - 1;
      lineIndex >= firstProcessIndex && reversedEntries.length < limit + 1;
      lineIndex -= 1
    ) {
      const lineStartIndex = lineIndex === 0 ? 0 : newlineIndexes[lineIndex - 1] + 1;
      const lineEndIndex = newlineIndexes[lineIndex];
      const entry = parseLogLine({
        buffer: combined.subarray(lineStartIndex, lineEndIndex),
        descriptor: `byte ${chunkStart + lineStartIndex}`,
        endCursor: chunkStart + lineEndIndex + 1,
        startCursor: chunkStart + lineStartIndex,
        threadId,
      });

      if (entry && matchesSource(entry, source) && matchesLogContext(entry, filters)) {
        reversedEntries.push(entry);
      }
    }

    position = chunkStart;
  }

  if (position === 0 && carry.length > 0 && reversedEntries.length < limit + 1) {
    const entry = parseLogLine({
      buffer: carry,
      descriptor: "byte 0",
      endCursor: carry.length,
      startCursor: 0,
      threadId,
    });

    if (entry && matchesSource(entry, source) && matchesLogContext(entry, filters)) {
      reversedEntries.push(entry);
    }
  }

  const hasOlder = reversedEntries.length > limit;
  const entries = reversedEntries.reverse();

  return {
    entries: hasOlder ? entries.slice(1) : entries,
    hasOlder,
  };
};

const readLogEntriesInRange = async ({
  handle,
  threadId,
  startCursor,
  endCursor,
  source,
  filters,
}: {
  handle: FileHandle;
  threadId: string;
  startCursor: number;
  endCursor: number;
  source: TeamCodexLogSource | null;
  filters: TeamCodexLogContextFilters;
}): Promise<TeamCodexLogCursorEntry[]> => {
  const { entries } = await readLogEntriesForward({
    endCursor,
    filters,
    handle,
    limit: Number.MAX_SAFE_INTEGER,
    source,
    startCursor,
    threadId,
  });

  return entries;
};

const shareStderrContext = (
  reference: TeamCodexLogCursorEntry,
  candidate: TeamCodexLogCursorEntry,
): boolean => {
  return (
    reference.source === "stderr" &&
    candidate.source === "stderr" &&
    reference.assignmentNumber === candidate.assignmentNumber &&
    reference.roleId === candidate.roleId &&
    reference.laneId === candidate.laneId
  );
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

export const listTeamCodexLogWindow = async ({
  threadFile,
  threadId,
  limit = LOG_WINDOW_DEFAULT_LIMIT,
  beforeCursor = null,
  afterCursor = null,
  source = null,
  assignmentNumber,
  laneId,
  roleId,
}: {
  threadFile: string;
  threadId: string;
  limit?: number;
  beforeCursor?: number | null;
  afterCursor?: number | null;
  source?: TeamCodexLogSource | null;
  assignmentNumber?: number | null;
  laneId?: string | null;
  roleId?: string | null;
}): Promise<{
  entries: TeamCodexLogCursorEntry[];
  pageInfo: TeamCodexLogPageInfo;
}> => {
  if (beforeCursor !== null && afterCursor !== null) {
    throw new Error("Log windows can page backward or forward, but not both at once.");
  }

  const logFilePath = resolveLogFilePath({
    threadFile,
    threadId,
  });
  const filters: TeamCodexLogContextFilters = {
    assignmentNumber,
    laneId,
    roleId,
  };

  try {
    const handle = await fs.open(logFilePath, "r");

    try {
      const fileSize = (await handle.stat()).size;
      const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.trunc(limit)) : 1;

      if (fileSize === 0) {
        return {
          entries: [],
          pageInfo: buildPageInfo({
            afterCursor,
            beforeCursor,
            entries: [],
            hasNewer: false,
            hasOlder: false,
          }),
        };
      }

      if (afterCursor !== null) {
        const normalizedAfterCursor = normalizeCursor({
          cursor: afterCursor,
          fileSize,
          label: "afterCursor",
        });
        const { entries, hasNewer } = await readLogEntriesForward({
          endCursor: fileSize,
          filters,
          handle,
          limit: safeLimit,
          source,
          startCursor: normalizedAfterCursor,
          threadId,
        });

        return {
          entries,
          pageInfo: buildPageInfo({
            afterCursor: normalizedAfterCursor,
            beforeCursor,
            entries,
            hasNewer,
            hasOlder: normalizedAfterCursor > 0,
          }),
        };
      }

      const normalizedBeforeCursor = normalizeCursor({
        cursor: beforeCursor ?? fileSize,
        fileSize,
        label: "beforeCursor",
      });
      const { entries, hasOlder } = await readLogEntriesBackward({
        beforeCursor: normalizedBeforeCursor,
        filters,
        handle,
        limit: safeLimit,
        source,
        threadId,
      });

      return {
        entries,
        pageInfo: buildPageInfo({
          afterCursor,
          beforeCursor: normalizedBeforeCursor,
          entries,
          hasNewer: normalizedBeforeCursor < fileSize,
          hasOlder,
        }),
      };
    } finally {
      await handle.close();
    }
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === "ENOENT") {
      return {
        entries: [],
        pageInfo: {
          afterCursor,
          beforeCursor,
          hasNewer: false,
          hasOlder: false,
        },
      };
    }

    throw error;
  }
};

export const listTeamCodexLogEntriesInRange = async ({
  threadFile,
  threadId,
  startCursor,
  endCursor,
  source = null,
  assignmentNumber,
  laneId,
  roleId,
}: {
  threadFile: string;
  threadId: string;
  startCursor: number;
  endCursor: number;
  source?: TeamCodexLogSource | null;
  assignmentNumber?: number | null;
  laneId?: string | null;
  roleId?: string | null;
}): Promise<TeamCodexLogCursorEntry[]> => {
  const logFilePath = resolveLogFilePath({
    threadFile,
    threadId,
  });
  const filters: TeamCodexLogContextFilters = {
    assignmentNumber,
    laneId,
    roleId,
  };

  try {
    const handle = await fs.open(logFilePath, "r");

    try {
      const fileSize = (await handle.stat()).size;
      const normalizedStartCursor = normalizeCursor({
        cursor: startCursor,
        fileSize,
        label: "startCursor",
      });
      const normalizedEndCursor = normalizeCursor({
        cursor: endCursor,
        fileSize,
        label: "endCursor",
      });

      if (normalizedStartCursor > normalizedEndCursor) {
        throw new Error("startCursor must be less than or equal to endCursor.");
      }

      return readLogEntriesInRange({
        endCursor: normalizedEndCursor,
        filters,
        handle,
        source,
        startCursor: normalizedStartCursor,
        threadId,
      });
    } finally {
      await handle.close();
    }
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === "ENOENT") {
      return [];
    }

    throw error;
  }
};

export const expandTeamCodexStderrBlock = async ({
  threadFile,
  threadId,
  startCursor,
  endCursor,
  scanLimit = LOG_WINDOW_DEFAULT_LIMIT,
}: {
  threadFile: string;
  threadId: string;
  startCursor: number;
  endCursor: number;
  scanLimit?: number;
}): Promise<{
  entries: TeamCodexLogCursorEntry[];
  block: {
    startCursor: number;
    endCursor: number;
  };
}> => {
  const seedEntries = await listTeamCodexLogEntriesInRange({
    endCursor,
    startCursor,
    threadFile,
    threadId,
    source: "stderr",
  });

  const referenceEntry = seedEntries[0];
  if (!referenceEntry) {
    return {
      entries: [],
      block: {
        endCursor,
        startCursor,
      },
    };
  }

  const collectedEntries = [...seedEntries];
  let currentStartCursor = referenceEntry.startCursor;
  let currentEndCursor = seedEntries.at(-1)?.endCursor ?? referenceEntry.endCursor;

  while (currentStartCursor > 0) {
    const page = await listTeamCodexLogWindow({
      beforeCursor: currentStartCursor,
      limit: scanLimit,
      threadFile,
      threadId,
    });
    const contiguousEntries: TeamCodexLogCursorEntry[] = [];

    for (let index = page.entries.length - 1; index >= 0; index -= 1) {
      const entry = page.entries[index];
      if (!shareStderrContext(referenceEntry, entry)) {
        break;
      }

      contiguousEntries.unshift(entry);
    }

    if (contiguousEntries.length === 0) {
      break;
    }

    collectedEntries.unshift(...contiguousEntries);
    currentStartCursor = contiguousEntries[0].startCursor;

    if (contiguousEntries.length !== page.entries.length || !page.pageInfo.hasOlder) {
      break;
    }
  }

  while (true) {
    const page = await listTeamCodexLogWindow({
      afterCursor: currentEndCursor,
      limit: scanLimit,
      threadFile,
      threadId,
    });
    const contiguousEntries: TeamCodexLogCursorEntry[] = [];

    for (const entry of page.entries) {
      if (!shareStderrContext(referenceEntry, entry)) {
        break;
      }

      contiguousEntries.push(entry);
    }

    if (contiguousEntries.length === 0) {
      break;
    }

    collectedEntries.push(...contiguousEntries);
    currentEndCursor = contiguousEntries.at(-1)?.endCursor ?? currentEndCursor;

    if (contiguousEntries.length !== page.entries.length || !page.pageInfo.hasNewer) {
      break;
    }
  }

  return {
    entries: collectedEntries,
    block: {
      endCursor: currentEndCursor,
      startCursor: currentStartCursor,
    },
  };
};

export const listTeamCodexLogEntries = async ({
  threadFile,
  threadId,
  limit = LOG_WINDOW_DEFAULT_LIMIT,
}: {
  threadFile: string;
  threadId: string;
  limit?: number;
}): Promise<TeamCodexLogEntry[]> => {
  const window = await listTeamCodexLogWindow({
    limit,
    threadFile,
    threadId,
  });

  return window.entries.map((windowEntry) => {
    return {
      assignmentNumber: windowEntry.assignmentNumber,
      createdAt: windowEntry.createdAt,
      id: windowEntry.id,
      laneId: windowEntry.laneId,
      message: windowEntry.message,
      roleId: windowEntry.roleId,
      source: windowEntry.source,
      threadId: windowEntry.threadId,
    };
  });
};
