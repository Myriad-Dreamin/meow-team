import "server-only";

import BetterSqlite3 from "better-sqlite3";
import { promises as fs } from "node:fs";
import path from "node:path";

export type DatabaseSync = BetterSqlite3.Database;

export type SqliteStorageLocation = {
  inputPath: string;
  sqlitePath: string;
  legacyJsonPath: string | null;
};

export type SqliteStorageMigration = {
  version: number;
  name: string;
  up: (database: DatabaseSync) => void;
};

export type SqliteStorageMetadata = {
  migrations: Array<{
    version: number;
    name: string;
    appliedAt: string;
  }>;
  metadata: Record<string, string>;
};

export type SqliteStorageState = {
  location: SqliteStorageLocation;
  database: DatabaseSync;
};

export type SqliteStorageTarget = string | SqliteStorageState;

type SchemaMigrationRow = {
  version: number;
  name: string;
  applied_at: string;
};

type StorageMetadataRow = {
  key: string;
  value: string;
};

type SqliteStorageStateCache = Map<string, Promise<SqliteStorageState>>;

const mutationQueues = new Map<string, Promise<unknown>>();
const SQLITE_BUSY_TIMEOUT_MS = 5_000;
const STORAGE_ENGINE = "better-sqlite3";

const bootstrapSchemaSql = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL
  );
`;

export const resolveSqliteStorageLocation = (storageFile: string): SqliteStorageLocation => {
  if (storageFile === ":memory:") {
    return {
      inputPath: storageFile,
      sqlitePath: storageFile,
      legacyJsonPath: null,
    };
  }

  if (storageFile.endsWith(".sqlite")) {
    return {
      inputPath: storageFile,
      sqlitePath: storageFile,
      legacyJsonPath: `${storageFile.slice(0, -".sqlite".length)}.json`,
    };
  }

  if (storageFile.endsWith(".json")) {
    return {
      inputPath: storageFile,
      sqlitePath: `${storageFile.slice(0, -".json".length)}.sqlite`,
      legacyJsonPath: storageFile,
    };
  }

  return {
    inputPath: storageFile,
    sqlitePath: `${storageFile}.sqlite`,
    legacyJsonPath: `${storageFile}.json`,
  };
};

const getSqliteStorageStateCache = (): SqliteStorageStateCache => {
  const globalCache = globalThis as typeof globalThis & {
    __sqliteStorageStateCache?: SqliteStorageStateCache;
  };

  globalCache.__sqliteStorageStateCache ??= new Map();
  return globalCache.__sqliteStorageStateCache;
};

export const resolveSqliteStorageLocationFromTarget = (
  target: SqliteStorageTarget,
): SqliteStorageLocation => {
  return typeof target === "string" ? resolveSqliteStorageLocation(target) : target.location;
};

const ensureDatabaseDirectory = async (sqlitePath: string): Promise<void> => {
  if (sqlitePath === ":memory:") {
    return;
  }

  await fs.mkdir(path.dirname(sqlitePath), { recursive: true });
};

const configureDatabase = (database: DatabaseSync, location: SqliteStorageLocation): void => {
  database.pragma(`busy_timeout = ${SQLITE_BUSY_TIMEOUT_MS}`);
  database.pragma("foreign_keys = ON");

  if (location.sqlitePath !== ":memory:") {
    database.pragma("journal_mode = WAL");
  }
};

export const getSqliteStorageState = async (storageFile: string): Promise<SqliteStorageState> => {
  const location = resolveSqliteStorageLocation(storageFile);
  const cache = getSqliteStorageStateCache();
  let statePromise = cache.get(location.sqlitePath);

  if (!statePromise) {
    statePromise = (async () => {
      await ensureDatabaseDirectory(location.sqlitePath);

      const database = new BetterSqlite3(location.sqlitePath, {
        timeout: SQLITE_BUSY_TIMEOUT_MS,
      });
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

export const resetSqliteStorageStateCacheForTests = async (): Promise<void> => {
  const cache = getSqliteStorageStateCache();
  const states = await Promise.allSettled(cache.values());
  cache.clear();

  for (const state of states) {
    if (state.status === "fulfilled") {
      state.value.database.close();
    }
  }
};

export const hasSqliteTable = (database: DatabaseSync, tableName: string): boolean => {
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

export const runSqliteTransaction = (database: DatabaseSync, action: () => void): void => {
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
  if (!hasSqliteTable(database, "schema_migrations")) {
    return [];
  }

  return database
    .prepare("SELECT version, name, applied_at FROM schema_migrations ORDER BY version ASC")
    .all() as SchemaMigrationRow[];
};

const readStorageMetadataRows = (database: DatabaseSync): StorageMetadataRow[] => {
  if (!hasSqliteTable(database, "storage_metadata")) {
    return [];
  }

  return database
    .prepare("SELECT key, value FROM storage_metadata ORDER BY key ASC")
    .all() as StorageMetadataRow[];
};

const getStorageMetadataValue = (database: DatabaseSync, key: string): string | null => {
  if (!hasSqliteTable(database, "storage_metadata")) {
    return null;
  }

  const row = database.prepare("SELECT value FROM storage_metadata WHERE key = ?").get(key) as
    | { value: string }
    | undefined;

  return row?.value ?? null;
};

export const upsertSqliteStorageMetadataValue = (
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
    upsertSqliteStorageMetadataValue(database, key, value, now);
  }
};

const synchronizeStorageMetadata = (database: DatabaseSync, now: string): void => {
  if (!hasSqliteTable(database, "storage_metadata")) {
    return;
  }

  if (getStorageMetadataValue(database, "storage_engine") !== STORAGE_ENGINE) {
    upsertSqliteStorageMetadataValue(database, "storage_engine", STORAGE_ENGINE, now);
  }

  ensureStorageMetadataValue(database, "created_at", now, now);

  const schemaVersion = String(readSchemaMigrations(database).at(-1)?.version ?? 0);
  if (getStorageMetadataValue(database, "schema_version") !== schemaVersion) {
    upsertSqliteStorageMetadataValue(database, "schema_version", schemaVersion, now);
  }
};

export const applySqliteStorageMigrations = ({
  database,
  migrations,
  now = new Date().toISOString(),
  targetVersion = migrations.at(-1)?.version ?? 0,
}: {
  database: DatabaseSync;
  migrations: SqliteStorageMigration[];
  now?: string;
  targetVersion?: number;
}): void => {
  database.exec(bootstrapSchemaSql);

  const appliedVersions = new Set(
    readSchemaMigrations(database).map((migration) => migration.version),
  );

  for (const migration of migrations) {
    if (migration.version > targetVersion || appliedVersions.has(migration.version)) {
      continue;
    }

    runSqliteTransaction(database, () => {
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

export const readSqliteStorageMetadata = (database: DatabaseSync): SqliteStorageMetadata => {
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

export const withSqliteStorage = async <T>(
  target: SqliteStorageTarget,
  task: (database: DatabaseSync, location: SqliteStorageLocation) => Promise<T> | T,
): Promise<T> => {
  const state = typeof target === "string" ? await getSqliteStorageState(target) : target;
  return await task(state.database, state.location);
};

const queueStorageMutation = async <T>(
  sqlitePath: string,
  task: () => Promise<T> | T,
): Promise<T> => {
  const previous = mutationQueues.get(sqlitePath) ?? Promise.resolve();
  const mutation = previous.catch(() => undefined).then(task);
  const tracked = mutation
    .catch(() => undefined)
    .finally(() => {
      if (mutationQueues.get(sqlitePath) === tracked) {
        mutationQueues.delete(sqlitePath);
      }
    });

  mutationQueues.set(sqlitePath, tracked);
  return mutation;
};

export const queueSqliteStorageMutation = async <T>(
  target: SqliteStorageTarget,
  task: () => Promise<T> | T,
): Promise<T> => {
  const location = resolveSqliteStorageLocationFromTarget(target);
  return queueStorageMutation(location.sqlitePath, task);
};
