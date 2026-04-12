import "server-only";

import { promises as fs } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export type TeamThreadStorageLocation = {
  inputPath: string;
  sqlitePath: string;
  legacyJsonPath: string | null;
};

export type TeamThreadStorageRecord = {
  threadId: string;
  payloadJson: string;
  createdAt: string;
  updatedAt: string;
};

export type TeamThreadStorageMigration = {
  version: number;
  name: string;
  up: (database: DatabaseSync) => void;
};

export type TeamThreadStorageMetadata = {
  migrations: Array<{
    version: number;
    name: string;
    appliedAt: string;
  }>;
  metadata: Record<string, string>;
};

export type TeamThreadStorageState = {
  location: TeamThreadStorageLocation;
  database: DatabaseSync;
};

export type TeamThreadStorageTarget = string | TeamThreadStorageState;

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

type SchemaMigrationRow = {
  version: number;
  name: string;
  applied_at: string;
};

type StorageMetadataRow = {
  key: string;
  value: string;
};

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

type TeamThreadStorageStateCache = Map<string, Promise<TeamThreadStorageState>>;

const mutationQueues = new Map<string, Promise<unknown>>();
const LEGACY_JSON_READ_RETRY_COUNT = 3;
const LEGACY_JSON_READ_RETRY_DELAY_MS = 25;
const SQLITE_BUSY_TIMEOUT_MS = 5_000;

const bootstrapSchemaSql = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL
  );
`;

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

const sleep = async (delayMs: number): Promise<void> => {
  await new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
};

const isUnexpectedEndOfJsonError = (error: unknown): boolean => {
  return error instanceof SyntaxError && /Unexpected end of JSON input/u.test(error.message);
};

const queueStorageMutation = async <T>(sqlitePath: string, task: () => Promise<T>): Promise<T> => {
  const previous = mutationQueues.get(sqlitePath) ?? Promise.resolve();
  const mutation = previous.catch(() => undefined).then(task);
  const tracked = mutation.finally(() => {
    if (mutationQueues.get(sqlitePath) === tracked) {
      mutationQueues.delete(sqlitePath);
    }
  });

  mutationQueues.set(sqlitePath, tracked);
  return mutation;
};

const resolveInputPath = (threadFile: string): string => {
  if (threadFile === ":memory:") {
    return threadFile;
  }

  return path.isAbsolute(threadFile) ? threadFile : path.join(process.cwd(), threadFile);
};

export const resolveTeamThreadStorageLocation = (threadFile: string): TeamThreadStorageLocation => {
  const inputPath = resolveInputPath(threadFile);
  if (inputPath === ":memory:") {
    return {
      inputPath,
      sqlitePath: inputPath,
      legacyJsonPath: null,
    };
  }

  if (inputPath.endsWith(".sqlite")) {
    return {
      inputPath,
      sqlitePath: inputPath,
      legacyJsonPath: `${inputPath.slice(0, -".sqlite".length)}.json`,
    };
  }

  if (inputPath.endsWith(".json")) {
    return {
      inputPath,
      sqlitePath: `${inputPath.slice(0, -".json".length)}.sqlite`,
      legacyJsonPath: inputPath,
    };
  }

  return {
    inputPath,
    sqlitePath: `${inputPath}.sqlite`,
    legacyJsonPath: `${inputPath}.json`,
  };
};

const getTeamThreadStorageStateCache = (): TeamThreadStorageStateCache => {
  const globalCache = globalThis as typeof globalThis & {
    __teamThreadStorageStateCache?: TeamThreadStorageStateCache;
  };

  globalCache.__teamThreadStorageStateCache ??= new Map();
  return globalCache.__teamThreadStorageStateCache;
};

const describeTeamThreadStorageTarget = (target: TeamThreadStorageTarget): string => {
  return typeof target === "string" ? target : target.location.inputPath;
};

const resolveTeamThreadStorageLocationFromTarget = (
  target: TeamThreadStorageTarget,
): TeamThreadStorageLocation => {
  return typeof target === "string" ? resolveTeamThreadStorageLocation(target) : target.location;
};

const ensureDatabaseDirectory = async (sqlitePath: string): Promise<void> => {
  if (sqlitePath === ":memory:") {
    return;
  }

  await fs.mkdir(path.dirname(sqlitePath), { recursive: true });
};

const configureDatabase = (database: DatabaseSync, location: TeamThreadStorageLocation): void => {
  database.exec(`PRAGMA busy_timeout = ${SQLITE_BUSY_TIMEOUT_MS}`);
  database.exec("PRAGMA foreign_keys = ON");

  if (location.sqlitePath !== ":memory:") {
    database.exec("PRAGMA journal_mode = WAL");
  }
};

export const getTeamThreadStorageState = async (
  threadFile: string,
): Promise<TeamThreadStorageState> => {
  const location = resolveTeamThreadStorageLocation(threadFile);
  const cache = getTeamThreadStorageStateCache();
  let statePromise = cache.get(location.sqlitePath);

  if (!statePromise) {
    statePromise = (async () => {
      await ensureDatabaseDirectory(location.sqlitePath);

      const database = new DatabaseSync(location.sqlitePath);
      try {
        configureDatabase(database, location);
        return {
          location,
          database,
        };
      } catch (error) {
        database.close();
        throw error;
      }
    })();

    cache.set(location.sqlitePath, statePromise);
  }

  try {
    return await statePromise;
  } catch (error) {
    if (cache.get(location.sqlitePath) === statePromise) {
      cache.delete(location.sqlitePath);
    }

    throw error;
  }
};

export const resetTeamThreadStorageStateCacheForTests = async (): Promise<void> => {
  const cache = getTeamThreadStorageStateCache();
  const states = await Promise.allSettled(cache.values());
  cache.clear();

  for (const state of states) {
    if (state.status === "fulfilled") {
      state.value.database.close();
    }
  }
};

const hasTable = (database: DatabaseSync, tableName: string): boolean => {
  const row = database
    .prepare(
      `
        SELECT name
        FROM sqlite_master
        WHERE type = 'table'
          AND name = ?
      `,
    )
    .get(tableName) as { name: string } | undefined;

  return Boolean(row?.name);
};

const runInTransaction = (database: DatabaseSync, action: () => void): void => {
  database.exec("BEGIN IMMEDIATE");

  try {
    action();
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
};

const readSchemaMigrations = (database: DatabaseSync): SchemaMigrationRow[] => {
  if (!hasTable(database, "schema_migrations")) {
    return [];
  }

  return database
    .prepare("SELECT version, name, applied_at FROM schema_migrations ORDER BY version ASC")
    .all() as SchemaMigrationRow[];
};

const readStorageMetadataRows = (database: DatabaseSync): StorageMetadataRow[] => {
  if (!hasTable(database, "storage_metadata")) {
    return [];
  }

  return database
    .prepare("SELECT key, value FROM storage_metadata ORDER BY key ASC")
    .all() as StorageMetadataRow[];
};

const getStorageMetadataValue = (database: DatabaseSync, key: string): string | null => {
  if (!hasTable(database, "storage_metadata")) {
    return null;
  }

  const row = database.prepare("SELECT value FROM storage_metadata WHERE key = ?").get(key) as
    | { value: string }
    | undefined;

  return row?.value ?? null;
};

const upsertStorageMetadataValue = (
  database: DatabaseSync,
  key: string,
  value: string,
  now: string,
): void => {
  database
    .prepare(
      `
        INSERT INTO storage_metadata (key, value, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET
          value = excluded.value,
          updated_at = excluded.updated_at
      `,
    )
    .run(key, value, now);
};

const ensureStorageMetadataValue = (
  database: DatabaseSync,
  key: string,
  value: string,
  now: string,
): void => {
  if (getStorageMetadataValue(database, key) === null) {
    upsertStorageMetadataValue(database, key, value, now);
  }
};

const synchronizeStorageMetadata = (database: DatabaseSync, now: string): void => {
  if (!hasTable(database, "storage_metadata")) {
    return;
  }

  ensureStorageMetadataValue(database, "storage_engine", "node:sqlite", now);
  ensureStorageMetadataValue(database, "created_at", now, now);

  const schemaVersion = String(readSchemaMigrations(database).at(-1)?.version ?? 0);
  if (getStorageMetadataValue(database, "schema_version") !== schemaVersion) {
    upsertStorageMetadataValue(database, "schema_version", schemaVersion, now);
  }
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
  database.exec(bootstrapSchemaSql);

  const appliedVersions = new Set(
    readSchemaMigrations(database).map((migration) => migration.version),
  );

  for (const migration of TEAM_THREAD_STORAGE_MIGRATIONS) {
    if (migration.version > targetVersion || appliedVersions.has(migration.version)) {
      continue;
    }

    runInTransaction(database, () => {
      migration.up(database);
      database
        .prepare(
          `
            INSERT OR IGNORE INTO schema_migrations (version, name, applied_at)
            VALUES (?, ?, ?)
          `,
        )
        .run(migration.version, migration.name, now);
      synchronizeStorageMetadata(database, now);
    });
  }

  synchronizeStorageMetadata(database, now);
};

export const readTeamThreadStorageMetadata = (
  database: DatabaseSync,
): TeamThreadStorageMetadata => {
  return {
    migrations: readSchemaMigrations(database).map((migration) => ({
      version: migration.version,
      name: migration.name,
      appliedAt: migration.applied_at,
    })),
    metadata: Object.fromEntries(
      readStorageMetadataRows(database).map((row) => [row.key, row.value]),
    ),
  };
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
  if (!legacyJsonPath || !hasTable(database, "team_threads")) {
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
  runInTransaction(database, () => {
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

    upsertStorageMetadataValue(database, "legacy_import_source", legacyJsonPath, now);
    upsertStorageMetadataValue(database, "legacy_imported_at", now, now);
  });
};

const withTeamThreadDatabase = async <T>(
  target: TeamThreadStorageTarget,
  task: (database: DatabaseSync, location: TeamThreadStorageLocation) => Promise<T> | T,
): Promise<T> => {
  const state = typeof target === "string" ? await getTeamThreadStorageState(target) : target;

  applyTeamThreadStorageMigrations({ database: state.database });
  await importLegacyThreadStoreIfNeeded(state.database, state.location);

  return await task(state.database, state.location);
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
  const location = resolveTeamThreadStorageLocationFromTarget(target);

  return queueStorageMutation(location.sqlitePath, () =>
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
