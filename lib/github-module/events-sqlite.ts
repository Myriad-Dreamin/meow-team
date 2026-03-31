import { mkdir } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { GitHubUserEvent } from "./events-source";
import type { GitHubEvent } from "./types";

const dataDirectory = path.join(process.cwd(), "data");
const databasePath = path.join(dataDirectory, "github-events.sqlite");
const syncKeyPrefix = "user-events-public:";

const DEFAULT_SYNC_INTERVAL_MS = 15 * 60 * 1000;
const DEFAULT_SYNC_PER_PAGE = 100;
const DEFAULT_SYNC_MAX_PAGES = 10;
const DEFAULT_EVENT_READ_LIMIT = 240;
const MAX_EVENT_READ_LIMIT = 1000;
const MAX_EVENT_READ_OFFSET = 1_000_000;

type EventsSourceModule = typeof import("./events-source");
type GitHubEventsDbGlobal = typeof globalThis & {
  __githubEventsDatabase?: DatabaseSync;
};

type SyncState = {
  etag: string | null;
  lastCheckedAt: string | null;
  lastSuccessfulSyncAt: string | null;
  totalRequests: number;
};

export type SyncGitHubEventsToSqliteInput = {
  username: string;
  token: string;
  minIntervalMs?: number;
  perPage?: number;
  maxPages?: number;
  force?: boolean;
};

export type SyncGitHubEventsToSqliteResult = {
  skipped: boolean;
  reason: "throttled" | "not-modified" | "synchronized";
  requestsUsed: number;
  insertedCount: number;
  updatedCount: number;
  totalStored: number;
  checkedAt: string;
  lastSuccessfulSyncAt: string | null;
};

export type ReadGitHubEventsFromSqliteInput = {
  username: string;
  limit?: number;
  offset?: number;
};

let cachedEventsSourceModule: EventsSourceModule | null = null;

const getEventsSourceModule = async (): Promise<EventsSourceModule> => {
  if (cachedEventsSourceModule) {
    return cachedEventsSourceModule;
  }

  cachedEventsSourceModule = (await import(
    new URL("./events-source.ts", import.meta.url).href
  )) as EventsSourceModule;
  return cachedEventsSourceModule;
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null;
};

const toInteger = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  if (typeof value === "bigint") {
    return Number(value);
  }

  return 0;
};

const toChangesCount = (value: unknown): number => {
  if (!isRecord(value)) {
    return 0;
  }

  return Math.max(toInteger(value.changes), 0);
};

const assertNonEmpty = (value: string, field: string): string => {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${field} is required.`);
  }
  return trimmed;
};

const clampInteger = (value: number | undefined, fallback: number, min: number, max: number): number => {
  if (!Number.isInteger(value)) {
    return fallback;
  }

  const numericValue = value as number;
  if (numericValue < min) {
    return min;
  }

  if (numericValue > max) {
    return max;
  }

  return numericValue;
};

const readSyncState = (db: DatabaseSync, syncKey: string): SyncState => {
  const row = db
    .prepare(
      `SELECT etag, last_checked_at, last_successful_sync_at, total_requests
       FROM github_event_sync_state
       WHERE sync_key = ?`,
    )
    .get(syncKey) as Record<string, unknown> | undefined;

  if (!row) {
    return {
      etag: null,
      lastCheckedAt: null,
      lastSuccessfulSyncAt: null,
      totalRequests: 0,
    };
  }

  return {
    etag: typeof row.etag === "string" ? row.etag : null,
    lastCheckedAt: typeof row.last_checked_at === "string" ? row.last_checked_at : null,
    lastSuccessfulSyncAt:
      typeof row.last_successful_sync_at === "string" ? row.last_successful_sync_at : null,
    totalRequests: Math.max(toInteger(row.total_requests), 0),
  };
};

const upsertSyncState = (
  db: DatabaseSync,
  input: {
    syncKey: string;
    etag: string | null;
    lastCheckedAt: string;
    lastSuccessfulSyncAt: string | null;
    totalRequests: number;
    updatedAt: string;
  },
): void => {
  db.prepare(
    `INSERT INTO github_event_sync_state (
      sync_key,
      etag,
      last_checked_at,
      last_successful_sync_at,
      total_requests,
      updated_at
    ) VALUES (
      @syncKey,
      @etag,
      @lastCheckedAt,
      @lastSuccessfulSyncAt,
      @totalRequests,
      @updatedAt
    )
    ON CONFLICT(sync_key) DO UPDATE SET
      etag = excluded.etag,
      last_checked_at = excluded.last_checked_at,
      last_successful_sync_at = excluded.last_successful_sync_at,
      total_requests = excluded.total_requests,
      updated_at = excluded.updated_at`,
  ).run(input);
};

const writeEventsBatch = (
  db: DatabaseSync,
  events: GitHubUserEvent[],
  updatedAt: string,
  mapEvent: (event: GitHubUserEvent) => GitHubEvent,
) => {
  const insertStatement = db.prepare(
    `INSERT OR IGNORE INTO github_user_events (
      event_id,
      actor_login,
      event_type,
      repo_name,
      is_public,
      kind,
      message,
      created_at,
      payload_json,
      updated_at
    ) VALUES (
      @eventId,
      @actorLogin,
      @eventType,
      @repoName,
      @isPublic,
      @kind,
      @message,
      @createdAt,
      @payloadJson,
      @updatedAt
    )`,
  );

  const updateStatement = db.prepare(
    `UPDATE github_user_events
     SET
       actor_login = @actorLogin,
       event_type = @eventType,
       repo_name = @repoName,
       is_public = @isPublic,
       kind = @kind,
       message = @message,
       created_at = @createdAt,
       payload_json = @payloadJson,
       updated_at = @updatedAt
     WHERE event_id = @eventId`,
  );

  db.exec("BEGIN IMMEDIATE TRANSACTION");
  try {
    let insertedCount = 0;
    let updatedCount = 0;

    for (const event of events) {
      const mappedEvent = mapEvent(event);
      const payload = {
        eventId: mappedEvent.id,
        actorLogin: event.actorLogin,
        eventType: event.type,
        repoName: event.repoName,
        isPublic: event.isPublic ? 1 : 0,
        kind: mappedEvent.kind,
        message: mappedEvent.message,
        createdAt: event.createdAt,
        payloadJson: JSON.stringify(event),
        updatedAt,
      };

      const insertChanges = toChangesCount(insertStatement.run(payload));
      if (insertChanges > 0) {
        insertedCount += insertChanges;
        continue;
      }

      const updateChanges = toChangesCount(updateStatement.run(payload));
      updatedCount += updateChanges;
    }

    db.exec("COMMIT");
    return {
      insertedCount,
      updatedCount,
    };
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
};

const countStoredEvents = (db: DatabaseSync, username: string): number => {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS total
       FROM github_user_events
       WHERE actor_login = ?`,
    )
    .get(username) as Record<string, unknown> | undefined;

  if (!row) {
    return 0;
  }

  return Math.max(toInteger(row.total), 0);
};

const initializeSchema = (db: DatabaseSync): void => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS github_user_events (
      event_id TEXT PRIMARY KEY,
      actor_login TEXT NOT NULL,
      event_type TEXT NOT NULL,
      repo_name TEXT NOT NULL,
      is_public INTEGER NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('standard', 'notification')),
      message TEXT NOT NULL,
      created_at TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_github_user_events_actor_created_at
      ON github_user_events(actor_login, created_at DESC);

    CREATE TABLE IF NOT EXISTS github_event_sync_state (
      sync_key TEXT PRIMARY KEY,
      etag TEXT,
      last_checked_at TEXT,
      last_successful_sync_at TEXT,
      total_requests INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );
  `);
};

const getDatabase = async (): Promise<DatabaseSync> => {
  const globalState = globalThis as GitHubEventsDbGlobal;
  if (globalState.__githubEventsDatabase) {
    return globalState.__githubEventsDatabase;
  }

  await mkdir(dataDirectory, { recursive: true });
  const database = new DatabaseSync(databasePath);
  initializeSchema(database);
  globalState.__githubEventsDatabase = database;
  return database;
};

export const syncGitHubEventsToSqlite = async (
  input: SyncGitHubEventsToSqliteInput,
): Promise<SyncGitHubEventsToSqliteResult> => {
  const username = assertNonEmpty(input.username, "GitHub username");
  const token = assertNonEmpty(input.token, "GitHub token");
  const minIntervalMs = clampInteger(
    input.minIntervalMs,
    DEFAULT_SYNC_INTERVAL_MS,
    0,
    24 * 60 * 60 * 1000,
  );
  const perPage = clampInteger(input.perPage, DEFAULT_SYNC_PER_PAGE, 1, 100);
  const maxPages = clampInteger(input.maxPages, DEFAULT_SYNC_MAX_PAGES, 1, 20);
  const checkedAt = new Date().toISOString();
  const syncKey = `${syncKeyPrefix}${username.toLowerCase()}`;

  const database = await getDatabase();
  const eventsSourceModule = await getEventsSourceModule();
  const syncState = readSyncState(database, syncKey);

  const lastCheckedAtMs = syncState.lastCheckedAt ? Date.parse(syncState.lastCheckedAt) : Number.NaN;
  if (
    !input.force &&
    Number.isFinite(lastCheckedAtMs) &&
    Date.now() - lastCheckedAtMs < minIntervalMs
  ) {
    return {
      skipped: true,
      reason: "throttled",
      requestsUsed: 0,
      insertedCount: 0,
      updatedCount: 0,
      totalStored: countStoredEvents(database, username),
      checkedAt: syncState.lastCheckedAt ?? checkedAt,
      lastSuccessfulSyncAt: syncState.lastSuccessfulSyncAt,
    };
  }

  let requestsUsed = 0;
  let insertedCount = 0;
  let updatedCount = 0;
  let reason: SyncGitHubEventsToSqliteResult["reason"] = "synchronized";
  let etag = syncState.etag;

  for (let page = 1; page <= maxPages; page += 1) {
    const pageResult = await eventsSourceModule.fetchGitHubUserEventsPage({
      username,
      token,
      page,
      perPage,
      ifNoneMatch: page === 1 ? syncState.etag ?? undefined : undefined,
    });
    requestsUsed += 1;

    if (pageResult.status === "not-modified") {
      reason = "not-modified";
      break;
    }

    if (page === 1 && pageResult.etag) {
      etag = pageResult.etag;
    }

    if (pageResult.events.length === 0) {
      break;
    }

    const batchWrite = writeEventsBatch(
      database,
      pageResult.events,
      checkedAt,
      eventsSourceModule.mapGitHubUserEventToMockEvent,
    );
    insertedCount += batchWrite.insertedCount;
    updatedCount += batchWrite.updatedCount;

    if (batchWrite.insertedCount === 0) {
      break;
    }

    if (pageResult.events.length < perPage) {
      break;
    }
  }

  const totalRequests = syncState.totalRequests + requestsUsed;
  const lastSuccessfulSyncAt = checkedAt;
  upsertSyncState(database, {
    syncKey,
    etag,
    lastCheckedAt: checkedAt,
    lastSuccessfulSyncAt,
    totalRequests,
    updatedAt: checkedAt,
  });

  return {
    skipped: reason !== "synchronized",
    reason,
    requestsUsed,
    insertedCount,
    updatedCount,
    totalStored: countStoredEvents(database, username),
    checkedAt,
    lastSuccessfulSyncAt,
  };
};

const parseSqliteEventRow = (value: unknown): GitHubEvent | null => {
  if (!isRecord(value)) {
    return null;
  }

  if (
    typeof value.id !== "string" ||
    typeof value.message !== "string" ||
    (value.kind !== "standard" && value.kind !== "notification") ||
    typeof value.createdAt !== "string"
  ) {
    return null;
  }

  const createdAtMs = Date.parse(value.createdAt);
  if (!Number.isFinite(createdAtMs)) {
    return null;
  }

  return {
    id: value.id,
    message: value.message,
    kind: value.kind,
    createdAt: new Date(createdAtMs).toISOString(),
  };
};

export const readGitHubEventsFromSqlite = async (
  input: ReadGitHubEventsFromSqliteInput,
): Promise<GitHubEvent[]> => {
  const username = assertNonEmpty(input.username, "GitHub username");
  const limit = clampInteger(input.limit, DEFAULT_EVENT_READ_LIMIT, 1, MAX_EVENT_READ_LIMIT);
  const offset = clampInteger(input.offset, 0, 0, MAX_EVENT_READ_OFFSET);
  const database = await getDatabase();

  const rows = database
    .prepare(
      `SELECT event_id AS id, message, kind, created_at AS createdAt
       FROM github_user_events
       WHERE actor_login = ?
       ORDER BY created_at DESC
       LIMIT ?
       OFFSET ?`,
    )
    .all(username, limit, offset) as unknown[];

  return rows.map(parseSqliteEventRow).filter((event): event is GitHubEvent => event !== null);
};
