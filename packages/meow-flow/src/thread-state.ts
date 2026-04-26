import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import type { Database as DatabaseConnection } from "better-sqlite3";

export type MeowFlowStateDatabase = DatabaseConnection;

export const SUPPORTED_STAGES = ["plan", "code", "review", "execute", "validate"] as const;
export const SUPPORTED_MEOW_FLOW_SKILLS = [
  "meow-plan",
  "meow-code",
  "meow-review",
  "meow-execute",
  "meow-validate",
  "meow-archive",
] as const;

export type MeowFlowStage = (typeof SUPPORTED_STAGES)[number];
export type DerivedThreadStage = MeowFlowStage | "archived";
export type MeowFlowSkill = (typeof SUPPORTED_MEOW_FLOW_SKILLS)[number];

export type ThreadAgentRecord = {
  readonly id: string;
  readonly title: string | null;
  readonly skill: MeowFlowSkill;
  readonly createdAt: string;
};

export type ThreadHandoffRecord = {
  readonly seq: number;
  readonly stage: MeowFlowStage;
  readonly content: string;
  readonly createdAt: string;
};

export type ThreadRecord = {
  readonly id: string;
  readonly name: string | null;
  readonly requestBody: string | null;
  readonly archivedAt: string | null;
  readonly agents: readonly ThreadAgentRecord[];
  readonly handoffs: readonly ThreadHandoffRecord[];
};

export type ThreadOccupationRecord = {
  readonly threadId: string;
  readonly repositoryRoot?: string;
  readonly worktreePath: string;
  readonly createdAt: string;
  readonly releasedAt: string | null;
};

export type MeowFlowState = {
  readonly version: 1;
  readonly occupations: readonly ThreadOccupationRecord[];
  readonly threads: readonly ThreadRecord[];
};

export type MutableMeowFlowState = {
  version: 1;
  occupations: ThreadOccupationRecord[];
  threads: ThreadRecord[];
};

type UnknownRecord = Record<string, unknown>;

const STATE_DATABASE_ENV_NAME = "MFL_STATE_DB_PATH";
const STATE_DIRECTORY_PATH = [".local", "share", "meow-flow"] as const;
const STATE_DATABASE_FILE_NAME = "meow-flow.sqlite";
const DEFAULT_WORKTREE_DIRECTORY_NAME = ".paseo-workspaces";

export type MeowFlowStateOperationOptions = {
  readonly database?: MeowFlowStateDatabase;
  readonly threadIds?: readonly string[];
  readonly includeOccupationThreads?: boolean;
};

type StateReadScope = {
  readonly threadIds?: readonly string[];
  readonly includeOccupationThreads?: boolean;
};

type StateWriteScope = {
  readonly replaceRepositoryOccupations?: boolean;
};

type OccupationRow = {
  readonly thread_id: string;
  readonly repository_root: string;
  readonly slot_number: number;
  readonly workspace_relative_path: string;
  readonly request_body: string;
  readonly created_at: string;
};

type ThreadMetadataRow = {
  readonly thread_id: string;
  readonly name: string | null;
  readonly request_body: string | null;
  readonly archived_at: string | null;
};

type ThreadAgentRow = {
  readonly thread_id: string;
  readonly agent_id: string;
  readonly title: string | null;
  readonly skill: string;
  readonly created_at: string;
};

type ThreadHandoffRow = {
  readonly thread_id: string;
  readonly seq: number;
  readonly stage: string;
  readonly content: string;
  readonly created_at: string;
};

export function createEmptyState(): MutableMeowFlowState {
  return {
    version: 1,
    occupations: [],
    threads: [],
  };
}

export function getStateFilePath(_repositoryRoot?: string): string {
  return getStateDatabasePath();
}

export function readMeowFlowState(
  repositoryRoot: string,
  options: MeowFlowStateOperationOptions = {},
): MutableMeowFlowState {
  return useStateDatabase(options, (database) =>
    readStateFromDatabase(database, repositoryRoot, options),
  );
}

export function writeMeowFlowState(
  repositoryRoot: string,
  state: MeowFlowState,
  options: Pick<MeowFlowStateOperationOptions, "database"> = {},
): void {
  useStateDatabase(options, (database) => {
    const write = database.transaction((resolvedRepositoryRoot: string) => {
      writeStateToDatabase(database, resolvedRepositoryRoot, state, {
        replaceRepositoryOccupations: true,
      });
    });
    write.immediate(path.resolve(repositoryRoot));
  });
}

export function updateMeowFlowState(
  repositoryRoot: string,
  updater: (state: MutableMeowFlowState) => void,
  options: MeowFlowStateOperationOptions = {},
): MutableMeowFlowState {
  return useStateDatabase(options, (database) => {
    const scopedThreadIds = normalizeThreadIds(options.threadIds);
    const update = database.transaction((resolvedRepositoryRoot: string) => {
      const state = readStateFromDatabase(database, resolvedRepositoryRoot, {
        ...options,
        threadIds: scopedThreadIds,
      });
      updater(state);
      writeStateToDatabase(database, resolvedRepositoryRoot, state, {
        replaceRepositoryOccupations: scopedThreadIds.length === 0,
      });
      return state;
    });

    return update.immediate(path.resolve(repositoryRoot));
  });
}

export function getStateDatabasePath(): string {
  const override = process.env[STATE_DATABASE_ENV_NAME]?.trim();

  if (override) {
    return path.resolve(override);
  }

  return path.join(resolveHomeDirectory(), ...STATE_DIRECTORY_PATH, STATE_DATABASE_FILE_NAME);
}

export function withMeowFlowStateDatabase<T>(operation: (database: MeowFlowStateDatabase) => T): T {
  const database = openStateDatabase();
  try {
    return operation(database);
  } finally {
    database.close();
  }
}

function useStateDatabase<T>(
  options: Pick<MeowFlowStateOperationOptions, "database">,
  operation: (database: MeowFlowStateDatabase) => T,
): T {
  if (options.database) {
    return operation(options.database);
  }

  return withMeowFlowStateDatabase(operation);
}

function openStateDatabase(): DatabaseConnection {
  const databasePath = getStateDatabasePath();
  mkdirSync(path.dirname(databasePath), { recursive: true });

  const database = new Database(databasePath);
  database.pragma("foreign_keys = ON");
  migrateDatabase(database);
  return database;
}

function migrateDatabase(database: DatabaseConnection): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS thread_occupations (
      thread_id TEXT PRIMARY KEY,
      repository_root TEXT NOT NULL,
      slot_number INTEGER NOT NULL,
      workspace_relative_path TEXT NOT NULL,
      request_body TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(repository_root, slot_number)
    );

    CREATE TABLE IF NOT EXISTS thread_metadata (
      thread_id TEXT PRIMARY KEY,
      name TEXT,
      request_body TEXT,
      archived_at TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS thread_agents (
      thread_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      title TEXT,
      skill TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY(thread_id, agent_id)
    );

    CREATE TABLE IF NOT EXISTS thread_handoffs (
      thread_id TEXT NOT NULL,
      seq INTEGER NOT NULL,
      stage TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY(thread_id, seq)
    );
  `);
}

function readStateFromDatabase(
  database: DatabaseConnection,
  repositoryRoot: string,
  scope: StateReadScope = {},
): MutableMeowFlowState {
  const resolvedRepositoryRoot = path.resolve(repositoryRoot);
  const scopedThreadIds = normalizeThreadIds(scope.threadIds);
  const scopedThreadIdSet = new Set(scopedThreadIds);
  const occupationRows = readOccupationRows(database, resolvedRepositoryRoot, scopedThreadIds);
  const threadIdsToRead = new Set(scopedThreadIds);

  if (scope.includeOccupationThreads !== false) {
    for (const row of occupationRows) {
      threadIdsToRead.add(row.thread_id);
    }
  }

  const metadataRows = readThreadMetadataRows(database, [...threadIdsToRead]);
  const agentRows = readThreadAgentRows(database, [...threadIdsToRead]);
  const handoffRows = readThreadHandoffRows(database, [...threadIdsToRead]);

  const occupations = occupationRows.map((row): ThreadOccupationRecord => {
    const rowRepositoryRoot = path.resolve(row.repository_root);
    return {
      threadId: row.thread_id,
      repositoryRoot: rowRepositoryRoot,
      worktreePath: path.resolve(rowRepositoryRoot, row.workspace_relative_path),
      createdAt: row.created_at,
      releasedAt: null,
    };
  });
  const threadIds = new Set<string>();
  for (const row of occupationRows) {
    if (scope.includeOccupationThreads !== false || scopedThreadIdSet.has(row.thread_id)) {
      threadIds.add(row.thread_id);
    }
  }
  for (const row of metadataRows) {
    threadIds.add(row.thread_id);
  }
  for (const row of agentRows) {
    threadIds.add(row.thread_id);
  }
  for (const row of handoffRows) {
    threadIds.add(row.thread_id);
  }

  const metadataByThreadId = new Map(metadataRows.map((row) => [row.thread_id, row]));
  const occupationRequestBodies = new Map(
    occupationRows
      .filter((row) => path.resolve(row.repository_root) === resolvedRepositoryRoot)
      .map((row) => [row.thread_id, row.request_body]),
  );

  const threads = [...threadIds].sort().map((threadId): ThreadRecord => {
    const metadata = metadataByThreadId.get(threadId);
    const agents = agentRows
      .filter((row) => row.thread_id === threadId)
      .map(normalizeAgentRow)
      .filter(isNotNull);
    const handoffs = handoffRows
      .filter((row) => row.thread_id === threadId)
      .map(normalizeHandoffRow)
      .filter(isNotNull);

    return {
      id: threadId,
      name: metadata?.name ?? null,
      requestBody:
        metadata?.request_body ?? normalizeOptionalText(occupationRequestBodies.get(threadId)),
      archivedAt: metadata?.archived_at ?? null,
      agents,
      handoffs,
    };
  });

  return normalizeState({
    version: 1,
    occupations,
    threads,
  });
}

function readOccupationRows(
  database: DatabaseConnection,
  repositoryRoot: string,
  threadIds: readonly string[],
): readonly OccupationRow[] {
  const selectSql = `
    SELECT
      thread_id,
      repository_root,
      slot_number,
      workspace_relative_path,
      request_body,
      created_at
    FROM thread_occupations
  `;

  if (threadIds.length === 0) {
    return database
      .prepare<[string], OccupationRow>(
        `
          ${selectSql}
          WHERE repository_root = ?
          ORDER BY repository_root, slot_number, thread_id
        `,
      )
      .all(repositoryRoot);
  }

  return database
    .prepare<unknown[], OccupationRow>(
      `
        ${selectSql}
        WHERE repository_root = ? OR thread_id IN (${formatSqlPlaceholders(threadIds.length)})
        ORDER BY repository_root, slot_number, thread_id
      `,
    )
    .all(repositoryRoot, ...threadIds);
}

function readThreadMetadataRows(
  database: DatabaseConnection,
  threadIds: readonly string[],
): readonly ThreadMetadataRow[] {
  if (threadIds.length === 0) {
    return [];
  }

  return database
    .prepare<unknown[], ThreadMetadataRow>(
      `
        SELECT thread_id, name, request_body, archived_at
        FROM thread_metadata
        WHERE thread_id IN (${formatSqlPlaceholders(threadIds.length)})
        ORDER BY thread_id
      `,
    )
    .all(...threadIds);
}

function readThreadAgentRows(
  database: DatabaseConnection,
  threadIds: readonly string[],
): readonly ThreadAgentRow[] {
  if (threadIds.length === 0) {
    return [];
  }

  return database
    .prepare<unknown[], ThreadAgentRow>(
      `
        SELECT thread_id, agent_id, title, skill, created_at
        FROM thread_agents
        WHERE thread_id IN (${formatSqlPlaceholders(threadIds.length)})
        ORDER BY thread_id, created_at, agent_id
      `,
    )
    .all(...threadIds);
}

function readThreadHandoffRows(
  database: DatabaseConnection,
  threadIds: readonly string[],
): readonly ThreadHandoffRow[] {
  if (threadIds.length === 0) {
    return [];
  }

  return database
    .prepare<unknown[], ThreadHandoffRow>(
      `
        SELECT thread_id, seq, stage, content, created_at
        FROM thread_handoffs
        WHERE thread_id IN (${formatSqlPlaceholders(threadIds.length)})
        ORDER BY thread_id, seq
      `,
    )
    .all(...threadIds);
}

function normalizeThreadIds(threadIds: readonly string[] | undefined): readonly string[] {
  if (!threadIds) {
    return [];
  }

  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const threadId of threadIds) {
    if (seen.has(threadId)) {
      continue;
    }

    seen.add(threadId);
    normalized.push(threadId);
  }

  return normalized;
}

function formatSqlPlaceholders(count: number): string {
  return Array.from({ length: count }, () => "?").join(", ");
}

function writeStateToDatabase(
  database: DatabaseConnection,
  repositoryRoot: string,
  state: MeowFlowState,
  scope: StateWriteScope = {},
): void {
  const resolvedRepositoryRoot = path.resolve(repositoryRoot);
  const normalized = normalizeState(state);
  const now = new Date().toISOString();
  const replaceRepositoryOccupations = scope.replaceRepositoryOccupations ?? true;

  if (replaceRepositoryOccupations) {
    database
      .prepare<[string]>("DELETE FROM thread_occupations WHERE repository_root = ?")
      .run(resolvedRepositoryRoot);
  }

  const deleteOccupation = database.prepare<{
    readonly threadId: string;
    readonly repositoryRoot: string;
  }>(
    "DELETE FROM thread_occupations WHERE thread_id = @threadId AND repository_root = @repositoryRoot",
  );
  const upsertOccupation = database.prepare<{
    readonly threadId: string;
    readonly repositoryRoot: string;
    readonly slotNumber: number;
    readonly workspaceRelativePath: string;
    readonly requestBody: string;
    readonly createdAt: string;
    readonly updatedAt: string;
  }>(`
    INSERT INTO thread_occupations (
      thread_id,
      repository_root,
      slot_number,
      workspace_relative_path,
      request_body,
      created_at,
      updated_at
    ) VALUES (
      @threadId,
      @repositoryRoot,
      @slotNumber,
      @workspaceRelativePath,
      @requestBody,
      @createdAt,
      @updatedAt
    )
    ON CONFLICT(thread_id) DO UPDATE SET
      repository_root = excluded.repository_root,
      slot_number = excluded.slot_number,
      workspace_relative_path = excluded.workspace_relative_path,
      request_body = excluded.request_body,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at
  `);
  for (const occupation of normalized.occupations) {
    const occupationRepositoryRoot = path.resolve(
      occupation.repositoryRoot ?? resolvedRepositoryRoot,
    );
    if (occupationRepositoryRoot !== resolvedRepositoryRoot) {
      continue;
    }

    if (occupation.releasedAt !== null) {
      deleteOccupation.run({
        threadId: occupation.threadId,
        repositoryRoot: resolvedRepositoryRoot,
      });
      continue;
    }

    const thread = getThread(normalized, occupation.threadId);
    if (!replaceRepositoryOccupations && !thread) {
      continue;
    }

    upsertOccupation.run({
      threadId: occupation.threadId,
      repositoryRoot: resolvedRepositoryRoot,
      slotNumber: deriveSlotNumber(resolvedRepositoryRoot, occupation.worktreePath),
      workspaceRelativePath: toWorkspaceRelativePath(
        resolvedRepositoryRoot,
        occupation.worktreePath,
      ),
      requestBody: thread?.requestBody ?? "",
      createdAt: occupation.createdAt,
      updatedAt: now,
    });
  }

  const upsertThread = database.prepare<{
    readonly threadId: string;
    readonly name: string | null;
    readonly requestBody: string | null;
    readonly archivedAt: string | null;
    readonly updatedAt: string;
  }>(`
    INSERT INTO thread_metadata (
      thread_id,
      name,
      request_body,
      archived_at,
      updated_at
    ) VALUES (
      @threadId,
      @name,
      @requestBody,
      @archivedAt,
      @updatedAt
    )
    ON CONFLICT(thread_id) DO UPDATE SET
      name = excluded.name,
      request_body = excluded.request_body,
      archived_at = excluded.archived_at,
      updated_at = excluded.updated_at
  `);
  const deleteAgents = database.prepare<[string]>("DELETE FROM thread_agents WHERE thread_id = ?");
  const insertAgent = database.prepare<{
    readonly threadId: string;
    readonly agentId: string;
    readonly title: string | null;
    readonly skill: MeowFlowSkill;
    readonly createdAt: string;
  }>(`
    INSERT INTO thread_agents (
      thread_id,
      agent_id,
      title,
      skill,
      created_at
    ) VALUES (
      @threadId,
      @agentId,
      @title,
      @skill,
      @createdAt
    )
  `);
  const deleteHandoffs = database.prepare<[string]>(
    "DELETE FROM thread_handoffs WHERE thread_id = ?",
  );
  const insertHandoff = database.prepare<{
    readonly threadId: string;
    readonly seq: number;
    readonly stage: MeowFlowStage;
    readonly content: string;
    readonly createdAt: string;
  }>(`
    INSERT INTO thread_handoffs (
      thread_id,
      seq,
      stage,
      content,
      created_at
    ) VALUES (
      @threadId,
      @seq,
      @stage,
      @content,
      @createdAt
    )
  `);

  for (const thread of normalized.threads) {
    upsertThread.run({
      threadId: thread.id,
      name: thread.name,
      requestBody: thread.requestBody,
      archivedAt: thread.archivedAt,
      updatedAt: now,
    });

    deleteAgents.run(thread.id);
    for (const agent of thread.agents) {
      insertAgent.run({
        threadId: thread.id,
        agentId: agent.id,
        title: agent.title,
        skill: agent.skill,
        createdAt: agent.createdAt,
      });
    }

    deleteHandoffs.run(thread.id);
    for (const handoff of thread.handoffs) {
      insertHandoff.run({
        threadId: thread.id,
        seq: handoff.seq,
        stage: handoff.stage,
        content: handoff.content,
        createdAt: handoff.createdAt,
      });
    }
  }
}

function resolveHomeDirectory(): string {
  const envHome = process.env.HOME?.trim() || process.env.USERPROFILE?.trim();
  return envHome || homedir();
}

function normalizeAgentRow(row: ThreadAgentRow): ThreadAgentRecord | null {
  if (!isSupportedSkill(row.skill)) {
    return null;
  }

  return {
    id: row.agent_id,
    title: row.title,
    skill: row.skill,
    createdAt: row.created_at,
  };
}

function normalizeHandoffRow(row: ThreadHandoffRow): ThreadHandoffRecord | null {
  if (!isSupportedStage(row.stage)) {
    return null;
  }

  return {
    seq: row.seq,
    stage: row.stage,
    content: row.content,
    createdAt: row.created_at,
  };
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  return typeof value === "string" ? value : null;
}

function toWorkspaceRelativePath(repositoryRoot: string, worktreePath: string): string {
  const resolvedWorktreePath = path.resolve(worktreePath);
  const relativePath = path.relative(repositoryRoot, resolvedWorktreePath);

  if (relativePath.length > 0 && !relativePath.startsWith("..") && !path.isAbsolute(relativePath)) {
    return relativePath;
  }

  return resolvedWorktreePath;
}

function deriveSlotNumber(repositoryRoot: string, worktreePath: string): number {
  const relativePath = path.relative(repositoryRoot, path.resolve(worktreePath));
  const pathSegments = relativePath.split(path.sep);
  const match =
    pathSegments.length === 2 && pathSegments[0] === DEFAULT_WORKTREE_DIRECTORY_NAME
      ? /^paseo-(\d+)$/.exec(pathSegments[1] ?? "")
      : null;

  if (match?.[1]) {
    const parsed = Number.parseInt(match[1], 10);
    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return 1_000_000 + hashPath(relativePath || path.resolve(worktreePath));
}

function hashPath(value: string): number {
  let hash = 2_166_136_261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }

  return hash >>> 0;
}

export function isSupportedStage(value: string): value is MeowFlowStage {
  return SUPPORTED_STAGES.includes(value as MeowFlowStage);
}

export function parseStage(value: string | undefined): MeowFlowStage | null {
  if (value === undefined) {
    return null;
  }

  const stage = value.trim();
  if (isSupportedStage(stage)) {
    return stage;
  }

  throw new Error(`Stage must be one of ${SUPPORTED_STAGES.join(", ")}.`);
}

export function stageToSkill(stage: MeowFlowStage): MeowFlowSkill {
  switch (stage) {
    case "plan":
      return "meow-plan";
    case "code":
      return "meow-code";
    case "review":
      return "meow-review";
    case "execute":
      return "meow-execute";
    case "validate":
      return "meow-validate";
  }
}

export function skillToStage(skill: string | null | undefined): DerivedThreadStage | null {
  switch (skill) {
    case "meow-plan":
      return "plan";
    case "meow-code":
      return "code";
    case "meow-review":
      return "review";
    case "meow-execute":
      return "execute";
    case "meow-validate":
      return "validate";
    case "meow-archive":
      return "archived";
    default:
      return null;
  }
}

export function isSupportedSkill(skill: string): skill is MeowFlowSkill {
  return SUPPORTED_MEOW_FLOW_SKILLS.includes(skill as MeowFlowSkill);
}

export function deriveLatestStage(thread: ThreadRecord): DerivedThreadStage {
  if (isThreadArchived(thread)) {
    return "archived";
  }

  const latestAgent = [...thread.agents]
    .filter((agent) => skillToStage(agent.skill) !== null)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .at(-1);

  if (!latestAgent) {
    return "plan";
  }

  return skillToStage(latestAgent.skill) ?? "plan";
}

export function isThreadArchived(thread: ThreadRecord): boolean {
  if (thread.archivedAt !== null) {
    return true;
  }

  return thread.agents.some((agent) => skillToStage(agent.skill) === "archived");
}

export function getNextHandoffSequence(thread: ThreadRecord): number {
  return thread.handoffs.reduce((max, handoff) => Math.max(max, handoff.seq), 0) + 1;
}

export function getThread(state: MeowFlowState, threadId: string): ThreadRecord | null {
  return state.threads.find((thread) => thread.id === threadId) ?? null;
}

export function ensureThread(
  state: MutableMeowFlowState,
  input: {
    readonly threadId: string;
    readonly requestBody?: string | null;
    readonly now?: string;
  },
): ThreadRecord {
  const existing = state.threads.find((thread) => thread.id === input.threadId);

  if (existing) {
    if (input.requestBody !== undefined && existing.requestBody === null) {
      const nextThread: ThreadRecord = {
        ...existing,
        requestBody: input.requestBody,
      };
      replaceThread(state, nextThread);
      return nextThread;
    }

    return existing;
  }

  const created: ThreadRecord = {
    id: input.threadId,
    name: null,
    requestBody: input.requestBody ?? null,
    archivedAt: null,
    agents: [],
    handoffs: [],
  };

  state.threads.push(created);
  return created;
}

export function replaceThread(state: MutableMeowFlowState, thread: ThreadRecord): void {
  const index = state.threads.findIndex((entry) => entry.id === thread.id);

  if (index === -1) {
    state.threads.push(thread);
    return;
  }

  state.threads.splice(index, 1, thread);
}

export function getActiveOccupationForWorktree(
  state: MeowFlowState,
  worktreePath: string,
): ThreadOccupationRecord | null {
  const resolvedWorktreePath = path.resolve(worktreePath);

  return (
    state.occupations.find(
      (occupation) =>
        occupation.releasedAt === null &&
        path.resolve(occupation.worktreePath) === resolvedWorktreePath,
    ) ?? null
  );
}

export function getActiveOccupationForThread(
  state: MeowFlowState,
  threadId: string,
): ThreadOccupationRecord | null {
  return (
    state.occupations.find(
      (occupation) => occupation.releasedAt === null && occupation.threadId === threadId,
    ) ?? null
  );
}

export function recordOccupation(
  state: MutableMeowFlowState,
  input: {
    readonly threadId: string;
    readonly worktreePath: string;
    readonly now: string;
  },
): ThreadOccupationRecord {
  const activeForWorktree = getActiveOccupationForWorktree(state, input.worktreePath);
  if (activeForWorktree) {
    throw new Error(
      `Worktree is already occupied by thread ${activeForWorktree.threadId}: ${input.worktreePath}`,
    );
  }

  const activeForThread = getActiveOccupationForThread(state, input.threadId);
  if (activeForThread) {
    throw new Error(
      `Thread ${input.threadId} is already running in worktree ${activeForThread.worktreePath}.`,
    );
  }

  const occupation: ThreadOccupationRecord = {
    threadId: input.threadId,
    worktreePath: path.resolve(input.worktreePath),
    createdAt: input.now,
    releasedAt: null,
  };

  state.occupations.push(occupation);
  return occupation;
}

export function removeActiveOccupation(
  state: MutableMeowFlowState,
  input: {
    readonly threadId: string;
    readonly worktreePath: string;
  },
): void {
  const resolvedWorktreePath = path.resolve(input.worktreePath);

  state.occupations = state.occupations.filter(
    (occupation) =>
      !(
        occupation.releasedAt === null &&
        occupation.threadId === input.threadId &&
        path.resolve(occupation.worktreePath) === resolvedWorktreePath
      ),
  );
}

export function releaseActiveOccupation(
  state: MutableMeowFlowState,
  input: {
    readonly threadId: string;
    readonly worktreePath: string;
    readonly now: string;
  },
): void {
  const resolvedWorktreePath = path.resolve(input.worktreePath);

  state.occupations = state.occupations.map((occupation) => {
    if (
      occupation.releasedAt === null &&
      occupation.threadId === input.threadId &&
      path.resolve(occupation.worktreePath) === resolvedWorktreePath
    ) {
      return {
        ...occupation,
        releasedAt: input.now,
      };
    }

    return occupation;
  });
}

export function upsertAgentRecord(
  state: MutableMeowFlowState,
  input: {
    readonly threadId: string;
    readonly agentId: string;
    readonly title: string | null;
    readonly skill: MeowFlowSkill;
    readonly now: string;
  },
): ThreadRecord {
  const thread = ensureThread(state, { threadId: input.threadId });
  const existing = thread.agents.find((agent) => agent.id === input.agentId);
  const nextAgent: ThreadAgentRecord = {
    id: input.agentId,
    title: input.title,
    skill: input.skill,
    createdAt: existing?.createdAt ?? input.now,
  };
  const nextThread: ThreadRecord = {
    ...thread,
    agents: existing
      ? thread.agents.map((agent) => (agent.id === input.agentId ? nextAgent : agent))
      : [...thread.agents, nextAgent],
  };

  replaceThread(state, nextThread);
  return nextThread;
}

export function appendHandoffRecord(
  state: MutableMeowFlowState,
  input: {
    readonly threadId: string;
    readonly stage: MeowFlowStage;
    readonly content: string;
    readonly now: string;
  },
): ThreadHandoffRecord {
  const thread = ensureThread(state, { threadId: input.threadId });
  const handoff: ThreadHandoffRecord = {
    seq: getNextHandoffSequence(thread),
    stage: input.stage,
    content: input.content,
    createdAt: input.now,
  };
  const nextThread: ThreadRecord = {
    ...thread,
    handoffs: [...thread.handoffs, handoff],
  };

  replaceThread(state, nextThread);
  return handoff;
}

export function formatThreadStatus(thread: ThreadRecord): string {
  const lines: string[] = [
    `id: ${formatYamlScalar(thread.id)}`,
    `name: ${thread.name === null ? "null" : formatYamlScalar(thread.name)}`,
    `stage: ${deriveLatestStage(thread)}`,
    `archived: ${isThreadArchived(thread) ? "true" : "false"}`,
  ];

  if (thread.archivedAt !== null) {
    lines.push(`archived-at: ${formatYamlScalar(thread.archivedAt)}`);
  }

  lines.push(formatAgents(thread.agents));
  lines.push(formatBlock("request-body", thread.requestBody));
  lines.push(formatHandoffs(thread.handoffs));

  return `${lines.join("\n")}\n`;
}

export function formatHandoffs(handoffs: readonly ThreadHandoffRecord[]): string {
  if (handoffs.length === 0) {
    return "handoffs: []";
  }

  const lines = ["handoffs:"];

  for (const handoff of handoffs) {
    lines.push(`  - seq: ${handoff.seq}`);
    lines.push(`    stage: ${handoff.stage}`);
    lines.push(formatBlock("content", handoff.content, 4));
    lines.push(`    created: ${formatYamlScalar(handoff.createdAt)}`);
  }

  return lines.join("\n");
}

function normalizeState(parsed: unknown): MutableMeowFlowState {
  if (!isRecord(parsed)) {
    return createEmptyState();
  }

  return {
    version: 1,
    occupations: readArray(parsed.occupations).map(normalizeOccupation).filter(isNotNull),
    threads: readArray(parsed.threads).map(normalizeThread).filter(isNotNull),
  };
}

function normalizeOccupation(value: unknown): ThreadOccupationRecord | null {
  if (!isRecord(value)) {
    return null;
  }

  const threadId = readString(value.threadId);
  const worktreePath = readString(value.worktreePath) ?? readString(value.workspacePath);
  const createdAt = readString(value.createdAt) ?? new Date(0).toISOString();

  if (!threadId || !worktreePath) {
    return null;
  }

  return {
    threadId,
    repositoryRoot: readString(value.repositoryRoot) ?? undefined,
    worktreePath: path.resolve(worktreePath),
    createdAt,
    releasedAt: readString(value.releasedAt),
  };
}

function normalizeThread(value: unknown): ThreadRecord | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = readString(value.id);

  if (!id) {
    return null;
  }

  return {
    id,
    name: readString(value.name),
    requestBody: readString(value.requestBody),
    archivedAt: readString(value.archivedAt),
    agents: readArray(value.agents).map(normalizeAgent).filter(isNotNull),
    handoffs: readArray(value.handoffs).map(normalizeHandoff).filter(isNotNull),
  };
}

function normalizeAgent(value: unknown): ThreadAgentRecord | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = readString(value.id);
  const skill = readString(value.skill);
  const createdAt = readString(value.createdAt) ?? new Date(0).toISOString();

  if (!id || !skill || !isSupportedSkill(skill)) {
    return null;
  }

  return {
    id,
    title: readString(value.title),
    skill,
    createdAt,
  };
}

function normalizeHandoff(value: unknown): ThreadHandoffRecord | null {
  if (!isRecord(value)) {
    return null;
  }

  const seq = typeof value.seq === "number" && Number.isInteger(value.seq) ? value.seq : null;
  const stage = readString(value.stage);
  const content = readString(value.content);
  const createdAt = readString(value.createdAt) ?? new Date(0).toISOString();

  if (seq === null || !stage || !isSupportedStage(stage) || content === null) {
    return null;
  }

  return {
    seq,
    stage,
    content,
    createdAt,
  };
}

function formatAgents(agents: readonly ThreadAgentRecord[]): string {
  if (agents.length === 0) {
    return "agents: []";
  }

  const lines = ["agents:"];

  for (const agent of agents) {
    lines.push(`  - id: ${formatYamlScalar(agent.id)}`);
    lines.push(`    title: ${agent.title === null ? "null" : formatYamlScalar(agent.title)}`);
    lines.push(`    skill: ${agent.skill}`);
    lines.push(`    created: ${formatYamlScalar(agent.createdAt)}`);
  }

  return lines.join("\n");
}

function formatBlock(key: string, value: string | null, indentation = 0): string {
  const prefix = " ".repeat(indentation);

  if (value === null || value.length === 0) {
    return `${prefix}${key}: ""`;
  }

  const indented = value
    .split(/\r?\n/)
    .map((line) => `${prefix}  ${line}`)
    .join("\n");

  return `${prefix}${key}: |\n${indented}`;
}

function formatYamlScalar(value: string): string {
  if (/^[A-Za-z0-9._/@:-]+$/.test(value)) {
    return value;
  }

  return JSON.stringify(value);
}

function readArray(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function readString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNotNull<T>(value: T | null): value is T {
  return value !== null;
}
