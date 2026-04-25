import { mkdirSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { getSharedMeowFlowDatabasePath } from "./shared-config.js";

type DatabaseConnection = Database.Database;

type ThreadOccupationRecord = {
  readonly thread_id: string;
  readonly repository_root: string;
  readonly slot_number: number;
  readonly workspace_relative_path: string;
  readonly request_body: string;
  readonly created_at: string;
  readonly updated_at: string;
};

export type ThreadOccupation = {
  readonly threadId: string;
  readonly repositoryRoot: string;
  readonly slotNumber: number;
  readonly workspaceRelativePath: string;
  readonly requestBody: string;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type NewThreadOccupation = {
  readonly threadId: string;
  readonly repositoryRoot: string;
  readonly slotNumber: number;
  readonly workspaceRelativePath: string;
  readonly requestBody: string;
};

export class MissingThreadOccupationsError extends Error {
  readonly missingThreadIds: readonly string[];

  constructor(missingThreadIds: readonly string[]) {
    const label = missingThreadIds.length === 1 ? "id" : "ids";

    super(`No running thread occupation found for ${label}: ${missingThreadIds.join(", ")}.`);
    this.name = "MissingThreadOccupationsError";
    this.missingThreadIds = missingThreadIds;
  }
}

export class ThreadOccupationStore {
  private readonly selectByRepositoryStatement;
  private readonly selectByThreadIdStatement;
  private readonly selectByRepositorySlotStatement;
  private readonly insertStatement;
  private readonly deleteByThreadIdStatement;

  constructor(private readonly database: DatabaseConnection) {
    applyThreadOccupationMigration(database);
    this.selectByRepositoryStatement = database.prepare(
      `
        SELECT *
        FROM thread_occupations
        WHERE repository_root = ?
        ORDER BY slot_number ASC
      `,
    );
    this.selectByThreadIdStatement = database.prepare(
      `
        SELECT *
        FROM thread_occupations
        WHERE thread_id = ?
      `,
    );
    this.selectByRepositorySlotStatement = database.prepare(
      `
        SELECT *
        FROM thread_occupations
        WHERE repository_root = ? AND slot_number = ?
      `,
    );
    this.insertStatement = database.prepare(
      `
        INSERT INTO thread_occupations (
          thread_id,
          repository_root,
          slot_number,
          workspace_relative_path,
          request_body,
          created_at,
          updated_at
        )
        VALUES (
          @threadId,
          @repositoryRoot,
          @slotNumber,
          @workspaceRelativePath,
          @requestBody,
          @createdAt,
          @updatedAt
        )
      `,
    );
    this.deleteByThreadIdStatement = database.prepare(
      `
        DELETE FROM thread_occupations
        WHERE thread_id = ?
      `,
    );
  }

  close(): void {
    this.database.close();
  }

  readOccupationsByRepository(repositoryRoot: string): readonly ThreadOccupation[] {
    return (this.selectByRepositoryStatement.all(repositoryRoot) as ThreadOccupationRecord[]).map(
      mapThreadOccupationRecord,
    );
  }

  readOccupationByThreadId(threadId: string): ThreadOccupation | null {
    const record = this.selectByThreadIdStatement.get(threadId) as
      | ThreadOccupationRecord
      | undefined;

    return record ? mapThreadOccupationRecord(record) : null;
  }

  readOccupationByRepositorySlot(
    repositoryRoot: string,
    slotNumber: number,
  ): ThreadOccupation | null {
    const record = this.selectByRepositorySlotStatement.get(repositoryRoot, slotNumber) as
      | ThreadOccupationRecord
      | undefined;

    return record ? mapThreadOccupationRecord(record) : null;
  }

  insertRunningOccupation(input: NewThreadOccupation): ThreadOccupation {
    const timestamp = new Date().toISOString();

    this.insertStatement.run({
      ...input,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    const occupation = this.readOccupationByThreadId(input.threadId);

    if (occupation === null) {
      throw new Error(`Unable to read inserted thread occupation for ${input.threadId}.`);
    }

    return occupation;
  }

  releaseThreadOccupation(threadId: string): ThreadOccupation | null {
    const occupation = this.readOccupationByThreadId(threadId);

    if (occupation === null) {
      return null;
    }

    this.deleteByThreadIdStatement.run(threadId);

    return occupation;
  }

  deleteThreadOccupations(threadIds: readonly string[]): readonly ThreadOccupation[] {
    const uniqueThreadIds = Array.from(new Set(threadIds));
    const deleteTransaction = this.database.transaction((ids: readonly string[]) => {
      const occupations = ids.map((threadId) => this.readOccupationByThreadId(threadId));
      const missingThreadIds = ids.filter((_, index) => occupations[index] === null);

      if (missingThreadIds.length > 0) {
        throw new MissingThreadOccupationsError(missingThreadIds);
      }

      for (const threadId of ids) {
        this.deleteByThreadIdStatement.run(threadId);
      }

      return occupations.filter(
        (occupation): occupation is ThreadOccupation => occupation !== null,
      );
    });

    return deleteTransaction(uniqueThreadIds) as ThreadOccupation[];
  }
}

export function openThreadOccupationStore(
  input: { readonly databasePath?: string; readonly homeDirectory?: string } = {},
): ThreadOccupationStore {
  const databasePath = input.databasePath ?? getSharedMeowFlowDatabasePath(input.homeDirectory);

  mkdirSync(path.dirname(databasePath), { recursive: true });

  return new ThreadOccupationStore(new Database(databasePath));
}

export function isSqliteConstraintError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const code = (error as { readonly code?: unknown }).code;

  return typeof code === "string" && code.startsWith("SQLITE_CONSTRAINT");
}

function applyThreadOccupationMigration(database: DatabaseConnection): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS thread_occupations (
      thread_id TEXT PRIMARY KEY,
      repository_root TEXT NOT NULL,
      slot_number INTEGER NOT NULL,
      workspace_relative_path TEXT NOT NULL,
      request_body TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(repository_root, slot_number)
    );
  `);
}

function mapThreadOccupationRecord(record: ThreadOccupationRecord): ThreadOccupation {
  return {
    threadId: record.thread_id,
    repositoryRoot: record.repository_root,
    slotNumber: record.slot_number,
    workspaceRelativePath: record.workspace_relative_path,
    requestBody: record.request_body,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  };
}
