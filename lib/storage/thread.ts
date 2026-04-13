import "server-only";

import { promises as fs } from "node:fs";
import {
  applySqliteStorageMigrations,
  getSqliteStorageState,
  hasSqliteTable,
  queueSqliteStorageMutation,
  readSqliteStorageMetadata,
  resetSqliteStorageStateCacheForTests,
  resolveSqliteStorageLocation,
  runSqliteTransaction,
  upsertSqliteStorageMetadataValue,
  withSqliteStorage,
  type DatabaseSync,
  type SqliteStorageLocation,
  type SqliteStorageMetadata,
  type SqliteStorageMigration,
  type SqliteStorageState,
  type SqliteStorageTarget,
} from "./sqlite";

export type TeamThreadStorageLocation = SqliteStorageLocation;
export type TeamThreadStorageMigration = SqliteStorageMigration;
export type TeamThreadStorageMetadata = SqliteStorageMetadata;
export type TeamThreadStorageState = SqliteStorageState;
export type TeamThreadStorageTarget = SqliteStorageTarget;

export type TeamThreadStorageRecord = {
  threadId: string;
  payloadJson: string;
  createdAt: string;
  updatedAt: string;
};

type LegacyThreadStore = {
  threads?: Record<
    string,
    {
      threadId?: string;
      createdAt?: string;
      updatedAt?: string;
      [key: string]: unknown;
    }
  >;
};

type LegacyThreadRecord = NonNullable<LegacyThreadStore["threads"]>[string];

type ThreadStorageRow = {
  thread_id: string;
  payload_json: string;
  created_at: string;
  updated_at: string;
};

type TeamThreadStorageUpdateResult<T> = {
  nextRecord: TeamThreadStorageRecord;
  value: T;
};

type TeamThreadStorageMutationContext = {
  getRecord: (threadId: string) => TeamThreadStorageRecord | null;
  listRecords: (limit?: number) => TeamThreadStorageRecord[];
  upsertRecord: (record: TeamThreadStorageRecord) => void;
};

const LEGACY_JSON_READ_RETRY_COUNT = 3;
const LEGACY_JSON_READ_RETRY_DELAY_MS = 25;

const TEAM_THREAD_UPSERT_SQL = `
  INSERT INTO team_threads (thread_id, payload_json, created_at, updated_at)
  VALUES (?, ?, ?, ?)
  ON CONFLICT(thread_id) DO UPDATE SET
    payload_json = excluded.payload_json,
    created_at = excluded.created_at,
    updated_at = excluded.updated_at
`;

export const TEAM_THREAD_STORAGE_MIGRATIONS: TeamThreadStorageMigration[] = [
  {
    version: 1,
    name: "create-storage-metadata",
    up: (database) => {
      database.exec(`
        CREATE TABLE IF NOT EXISTS storage_metadata (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `);
    },
  },
  {
    version: 2,
    name: "create-team-threads",
    up: (database) => {
      database.exec(`
        CREATE TABLE IF NOT EXISTS team_threads (
          thread_id TEXT PRIMARY KEY,
          payload_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        ) WITHOUT ROWID;
      `);
    },
  },
  {
    version: 3,
    name: "index-team-threads-updated-at",
    up: (database) => {
      database.exec(`
        CREATE INDEX IF NOT EXISTS idx_team_threads_updated_at
        ON team_threads (updated_at DESC, thread_id ASC);
      `);
    },
  },
];

export const TEAM_THREAD_STORAGE_LATEST_SCHEMA_VERSION =
  TEAM_THREAD_STORAGE_MIGRATIONS.at(-1)?.version ?? 0;

export const resolveTeamThreadStorageLocation = resolveSqliteStorageLocation;
export const getTeamThreadStorageState = getSqliteStorageState;
export const resetTeamThreadStorageStateCacheForTests = resetSqliteStorageStateCacheForTests;
export const readTeamThreadStorageMetadata = readSqliteStorageMetadata;

const sleep = async (delayMs: number): Promise<void> => {
  await new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
};

const isUnexpectedEndOfJsonError = (error: unknown): boolean => {
  return error instanceof SyntaxError && /Unexpected end of JSON input/u.test(error.message);
};

const describeTeamThreadStorageTarget = (target: TeamThreadStorageTarget): string => {
  return typeof target === "string" ? target : target.location.inputPath;
};

export const applyTeamThreadStorageMigrations = ({
  database,
  now = new Date().toISOString(),
  targetVersion = TEAM_THREAD_STORAGE_LATEST_SCHEMA_VERSION,
}: {
  database: DatabaseSync;
  now?: string;
  targetVersion?: number;
}): void => {
  applySqliteStorageMigrations({
    database,
    migrations: TEAM_THREAD_STORAGE_MIGRATIONS,
    now,
    targetVersion,
  });
};

const readLegacyThreadStore = async (legacyJsonPath: string): Promise<LegacyThreadStore> => {
  for (let attempt = 0; attempt <= LEGACY_JSON_READ_RETRY_COUNT; attempt += 1) {
    try {
      const raw = await fs.readFile(legacyJsonPath, "utf8");
      const parsed = JSON.parse(raw) as LegacyThreadStore;
      return parsed.threads ? parsed : { threads: {} };
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === "ENOENT") {
        return { threads: {} };
      }

      if (isUnexpectedEndOfJsonError(error) && attempt < LEGACY_JSON_READ_RETRY_COUNT) {
        await sleep(LEGACY_JSON_READ_RETRY_DELAY_MS);
        continue;
      }

      if (isUnexpectedEndOfJsonError(error)) {
        throw new Error(
          `Legacy thread store at ${legacyJsonPath} could not be parsed after ${LEGACY_JSON_READ_RETRY_COUNT + 1} read attempts.`,
        );
      }

      throw error;
    }
  }

  return { threads: {} };
};

const readThreadCount = (database: DatabaseSync): number => {
  const row = database.prepare("SELECT COUNT(*) AS count FROM team_threads").get() as
    | { count: number }
    | undefined;

  return row?.count ?? 0;
};

const normalizeLegacyThreadEntry = (
  threadKey: string,
  rawThread: LegacyThreadRecord,
  fallbackNow: string,
): TeamThreadStorageRecord | null => {
  if (!rawThread || typeof rawThread !== "object") {
    return null;
  }

  const threadId =
    typeof rawThread.threadId === "string" && rawThread.threadId.trim().length > 0
      ? rawThread.threadId
      : threadKey;
  const createdAt = typeof rawThread.createdAt === "string" ? rawThread.createdAt : fallbackNow;
  const updatedAt = typeof rawThread.updatedAt === "string" ? rawThread.updatedAt : createdAt;

  return {
    threadId,
    payloadJson: JSON.stringify({
      ...rawThread,
      threadId,
      createdAt,
      updatedAt,
    }),
    createdAt,
    updatedAt,
  };
};

const upsertThreadRow = (database: DatabaseSync, record: TeamThreadStorageRecord): void => {
  database
    .prepare(TEAM_THREAD_UPSERT_SQL)
    .run(record.threadId, record.payloadJson, record.createdAt, record.updatedAt);
};

const importLegacyThreadStoreIfNeeded = async (
  database: DatabaseSync,
  location: TeamThreadStorageLocation,
): Promise<void> => {
  const legacyJsonPath = location.legacyJsonPath;
  if (!legacyJsonPath || !hasSqliteTable(database, "team_threads")) {
    return;
  }

  if (readThreadCount(database) > 0) {
    return;
  }

  const legacyStore = await readLegacyThreadStore(legacyJsonPath);
  const entries = Object.entries(legacyStore.threads ?? {});
  if (entries.length === 0) {
    return;
  }

  const now = new Date().toISOString();
  runSqliteTransaction(database, () => {
    if (readThreadCount(database) > 0) {
      return;
    }

    for (const [threadKey, rawThread] of entries) {
      const record = normalizeLegacyThreadEntry(threadKey, rawThread, now);
      if (!record) {
        continue;
      }

      upsertThreadRow(database, record);
    }

    upsertSqliteStorageMetadataValue(database, "legacy_import_source", legacyJsonPath, now);
    upsertSqliteStorageMetadataValue(database, "legacy_imported_at", now, now);
  });
};

const withTeamThreadDatabase = async <T>(
  target: TeamThreadStorageTarget,
  task: (database: DatabaseSync, location: TeamThreadStorageLocation) => Promise<T> | T,
): Promise<T> => {
  return withSqliteStorage(target, async (database, location) => {
    applyTeamThreadStorageMigrations({ database });
    await importLegacyThreadStoreIfNeeded(database, location);

    return await task(database, location);
  });
};

const mapThreadStorageRow = (row: ThreadStorageRow): TeamThreadStorageRecord => {
  return {
    threadId: row.thread_id,
    payloadJson: row.payload_json,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

const listThreadRows = (database: DatabaseSync, limit?: number): TeamThreadStorageRecord[] => {
  const normalizedLimit =
    typeof limit === "number" && Number.isFinite(limit) ? Math.max(0, Math.trunc(limit)) : null;
  if (normalizedLimit === 0) {
    return [];
  }

  const rows =
    normalizedLimit === null
      ? (database
          .prepare(
            `
              SELECT thread_id, payload_json, created_at, updated_at
              FROM team_threads
              ORDER BY updated_at DESC, thread_id ASC
            `,
          )
          .all() as ThreadStorageRow[])
      : (database
          .prepare(
            `
              SELECT thread_id, payload_json, created_at, updated_at
              FROM team_threads
              ORDER BY updated_at DESC, thread_id ASC
              LIMIT ?
            `,
          )
          .all(normalizedLimit) as ThreadStorageRow[]);

  return rows.map(mapThreadStorageRow);
};

const getThreadRow = (database: DatabaseSync, threadId: string): TeamThreadStorageRecord | null => {
  const row = database
    .prepare(
      `
        SELECT thread_id, payload_json, created_at, updated_at
        FROM team_threads
        WHERE thread_id = ?
      `,
    )
    .get(threadId) as ThreadStorageRow | undefined;

  return row ? mapThreadStorageRow(row) : null;
};

export const listTeamThreadStorageRecords = async (
  target: TeamThreadStorageTarget,
  limit?: number,
): Promise<TeamThreadStorageRecord[]> => {
  return withTeamThreadDatabase(target, (database) => {
    return listThreadRows(database, limit);
  });
};

export const getTeamThreadStorageRecord = async (
  target: TeamThreadStorageTarget,
  threadId: string,
): Promise<TeamThreadStorageRecord | null> => {
  return withTeamThreadDatabase(target, (database) => {
    return getThreadRow(database, threadId);
  });
};

export const updateTeamThreadStorageRecord = async <T>({
  threadFile: target,
  threadId,
  updater,
}: {
  threadFile: TeamThreadStorageTarget;
  threadId: string;
  updater: (
    record: TeamThreadStorageRecord | null,
  ) => Promise<TeamThreadStorageUpdateResult<T>> | TeamThreadStorageUpdateResult<T>;
}): Promise<T> => {
  return queueSqliteStorageMutation(target, () =>
    withTeamThreadDatabase(target, async (database) => {
      const currentRecord = getThreadRow(database, threadId);
      const { nextRecord, value } = await updater(currentRecord);

      if (nextRecord.threadId !== threadId) {
        throw new Error(
          `Thread storage update for ${threadId} in ${describeTeamThreadStorageTarget(target)} attempted to write record ${nextRecord.threadId}.`,
        );
      }

      upsertThreadRow(database, nextRecord);
      return value;
    }),
  );
};

export const mutateTeamThreadStorage = async <T>({
  threadFile: target,
  task,
}: {
  threadFile: TeamThreadStorageTarget;
  task: (context: TeamThreadStorageMutationContext) => Promise<T> | T;
}): Promise<T> => {
  return queueSqliteStorageMutation(target, () =>
    withTeamThreadDatabase(target, async (database) => {
      return task({
        getRecord: (threadId) => getThreadRow(database, threadId),
        listRecords: (limit) => listThreadRows(database, limit),
        upsertRecord: (record) => {
          upsertThreadRow(database, record);
        },
      });
    }),
  );
};
