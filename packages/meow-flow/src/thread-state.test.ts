import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, test } from "vitest";
import {
  appendHandoffRecord,
  createEmptyState,
  deriveLatestStage,
  ensureThread,
  formatThreadStatus,
  getActiveOccupationForWorktree,
  getNextHandoffSequence,
  getStateDatabasePath,
  getThread,
  isThreadArchived,
  readMeowFlowState,
  recordOccupation,
  replaceThread,
  skillToStage,
  upsertAgentRecord,
  writeMeowFlowState,
} from "./thread-state.js";

const tempDirectories: string[] = [];
const originalStateDatabasePath = process.env.MFL_STATE_DB_PATH;

afterEach(() => {
  if (originalStateDatabasePath === undefined) {
    delete process.env.MFL_STATE_DB_PATH;
  } else {
    process.env.MFL_STATE_DB_PATH = originalStateDatabasePath;
  }

  while (tempDirectories.length > 0) {
    const nextDirectory = tempDirectories.pop();
    if (nextDirectory) {
      rmSync(nextDirectory, { recursive: true, force: true });
    }
  }
});

function createTempRepositoryRoot(): string {
  const directory = mkdtempSync(path.join(tmpdir(), "meow-flow-state-"));
  tempDirectories.push(directory);
  mkdirSync(path.join(directory, ".git"), { recursive: true });
  return directory;
}

function useTempStateDatabase(): string {
  const directory = mkdtempSync(path.join(tmpdir(), "meow-flow-state-db-"));
  tempDirectories.push(directory);
  const databasePath = path.join(directory, "meow-flow.sqlite");
  process.env.MFL_STATE_DB_PATH = databasePath;
  return databasePath;
}

describe("MeowFlow thread state", () => {
  test("persists thread metadata, agents, handoffs, and archive state", () => {
    const state = createEmptyState();

    let thread = ensureThread(state, {
      threadId: "fix-test-ci",
      requestBody: "the content of request",
    });
    replaceThread(state, {
      ...thread,
      name: "install-meow-flow-skills",
    });
    thread = upsertAgentRecord(state, {
      threadId: "fix-test-ci",
      agentId: "123456",
      title: "paseo recorded title",
      skill: "meow-plan",
      now: "2026-04-26T00:00:00.000Z",
    });
    const firstHandoff = appendHandoffRecord(state, {
      threadId: "fix-test-ci",
      stage: "code",
      content: "code diff",
      now: "2026-04-26T00:01:00.000Z",
    });
    const secondHandoff = appendHandoffRecord(state, {
      threadId: "fix-test-ci",
      stage: "review",
      content: "review notes",
      now: "2026-04-26T00:02:00.000Z",
    });

    expect(skillToStage("meow-code")).toBe("code");
    expect(skillToStage("meow-archive")).toBe("archived");
    expect(deriveLatestStage(thread)).toBe("plan");
    expect(firstHandoff.seq).toBe(1);
    expect(secondHandoff.seq).toBe(2);
    expect(getNextHandoffSequence(state.threads[0]!)).toBe(3);

    const archived = {
      ...state.threads[0]!,
      archivedAt: "2026-04-26T00:03:00.000Z",
    };
    replaceThread(state, archived);

    expect(isThreadArchived(archived)).toBe(true);
    expect(deriveLatestStage(archived)).toBe("archived");

    const formatted = formatThreadStatus(archived);
    expect(formatted).toContain("name: install-meow-flow-skills");
    expect(formatted).toContain("stage: archived");
    expect(formatted).toContain("agents:");
    expect(formatted).toContain("id: 123456");
    expect(formatted).toContain("request-body: |");
    expect(formatted).toContain("  the content of request");
    expect(formatted).toContain("seq: 1");
    expect(formatted).toContain("content: |");
    expect(formatted).toContain("      code diff");
  });

  test("reads existing SQLite occupation rows and request bodies", () => {
    const repositoryRoot = createTempRepositoryRoot();
    const databasePath = useTempStateDatabase();
    const worktreePath = path.join(repositoryRoot, ".paseo-workspaces", "paseo-2");
    const database = new Database(databasePath);
    database.exec(`
      CREATE TABLE thread_occupations (
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
    database
      .prepare(
        `
          INSERT INTO thread_occupations (
            thread_id,
            repository_root,
            slot_number,
            workspace_relative_path,
            request_body,
            created_at,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .run(
        "fix-test-ci",
        repositoryRoot,
        2,
        ".paseo-workspaces/paseo-2",
        "persisted request",
        "2026-04-26T00:00:00.000Z",
        "2026-04-26T00:00:00.000Z",
      );
    database.close();

    const state = readMeowFlowState(repositoryRoot);

    expect(getActiveOccupationForWorktree(state, worktreePath)?.threadId).toBe("fix-test-ci");
    expect(getThread(state, "fix-test-ci")?.requestBody).toBe("persisted request");
  });

  test("writes state under shared SQLite storage", () => {
    const repositoryRoot = createTempRepositoryRoot();
    const databasePath = useTempStateDatabase();
    const worktreePath = path.join(repositoryRoot, ".paseo-workspaces", "paseo-1");
    const state = createEmptyState();

    recordOccupation(state, {
      threadId: "fix-test-ci",
      worktreePath,
      now: "2026-04-26T00:00:00.000Z",
    });
    writeMeowFlowState(repositoryRoot, state);

    const database = new Database(databasePath, { readonly: true });
    const row = database
      .prepare(
        `
          SELECT thread_id, repository_root, slot_number, workspace_relative_path
          FROM thread_occupations
        `,
      )
      .get() as
      | {
          readonly thread_id: string;
          readonly repository_root: string;
          readonly slot_number: number;
          readonly workspace_relative_path: string;
        }
      | undefined;
    database.close();

    expect(getStateDatabasePath()).toBe(databasePath);
    expect(row).toEqual({
      thread_id: "fix-test-ci",
      repository_root: repositoryRoot,
      slot_number: 1,
      workspace_relative_path: path.join(".paseo-workspaces", "paseo-1"),
    });
  });

  test("supports legacy in-memory occupation records that used workspacePath", () => {
    const repositoryRoot = createTempRepositoryRoot();
    useTempStateDatabase();
    const legacyState = {
      version: 1,
      occupations: [
        {
          threadId: "fix-test-ci",
          workspacePath: "/tmp/legacy-worktree",
          createdAt: "2026-04-26T00:00:00.000Z",
          releasedAt: null,
        },
      ],
      threads: [],
    } as unknown as ReturnType<typeof createEmptyState>;

    writeMeowFlowState(repositoryRoot, legacyState);

    const state = readMeowFlowState(repositoryRoot);

    expect(getActiveOccupationForWorktree(state, "/tmp/legacy-worktree")?.threadId).toBe(
      "fix-test-ci",
    );
  });
});
