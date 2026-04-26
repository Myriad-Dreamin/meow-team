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
  SUPPORTED_MEOW_FLOW_SKILLS,
  skillToStage,
  updateMeowFlowState,
  upsertAgentRecord,
  writeMeowFlowState,
} from "./thread-state.js";

const tempDirectories: string[] = [];
const originalStateDatabasePath = process.env.MFL_STATE_DB_PATH;
const originalHome = process.env.HOME;
const originalUserProfile = process.env.USERPROFILE;

afterEach(() => {
  if (originalStateDatabasePath === undefined) {
    delete process.env.MFL_STATE_DB_PATH;
  } else {
    process.env.MFL_STATE_DB_PATH = originalStateDatabasePath;
  }
  if (originalHome === undefined) {
    delete process.env.HOME;
  } else {
    process.env.HOME = originalHome;
  }
  if (originalUserProfile === undefined) {
    delete process.env.USERPROFILE;
  } else {
    process.env.USERPROFILE = originalUserProfile;
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
  test("uses ~/.local/share for the default SQLite database path", () => {
    const homeDirectory = mkdtempSync(path.join(tmpdir(), "meow-flow-home-"));
    tempDirectories.push(homeDirectory);
    delete process.env.MFL_STATE_DB_PATH;
    process.env.HOME = homeDirectory;
    delete process.env.USERPROFILE;

    expect(getStateDatabasePath()).toBe(
      path.join(homeDirectory, ".local", "share", "meow-flow", "meow-flow.sqlite"),
    );
  });

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

    expect(SUPPORTED_MEOW_FLOW_SKILLS).toEqual([
      "meow-plan",
      "meow-code",
      "meow-review",
      "meow-execute",
      "meow-validate",
      "meow-archive",
    ]);
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

  test("reads repository state and requested archived threads without loading every thread", () => {
    const repositoryRoot = createTempRepositoryRoot();
    const otherRepositoryRoot = createTempRepositoryRoot();
    useTempStateDatabase();
    const repositoryState = createEmptyState();
    const otherState = createEmptyState();

    recordOccupation(repositoryState, {
      threadId: "active-thread",
      worktreePath: path.join(repositoryRoot, ".paseo-workspaces", "paseo-1"),
      now: "2026-04-26T00:00:00.000Z",
    });
    ensureThread(repositoryState, {
      threadId: "active-thread",
      requestBody: "active request",
    });
    replaceThread(otherState, {
      id: "archived-thread",
      name: "archived-thread",
      requestBody: "archived request",
      archivedAt: "2026-04-26T01:00:00.000Z",
      agents: [],
      handoffs: [],
    });

    writeMeowFlowState(repositoryRoot, repositoryState);
    writeMeowFlowState(otherRepositoryRoot, otherState);

    const repositoryOnly = readMeowFlowState(repositoryRoot);
    const withRequestedThread = readMeowFlowState(repositoryRoot, {
      threadIds: ["archived-thread"],
      includeOccupationThreads: false,
    });

    expect(getThread(repositoryOnly, "active-thread")?.requestBody).toBe("active request");
    expect(getThread(repositoryOnly, "archived-thread")).toBeNull();
    expect(getThread(withRequestedThread, "archived-thread")?.archivedAt).toBe(
      "2026-04-26T01:00:00.000Z",
    );
  });

  test("scoped writes preserve unrelated occupation request bodies", () => {
    const repositoryRoot = createTempRepositoryRoot();
    const databasePath = useTempStateDatabase();
    const state = createEmptyState();

    for (const threadId of ["first-thread", "second-thread"]) {
      recordOccupation(state, {
        threadId,
        worktreePath: path.join(
          repositoryRoot,
          ".paseo-workspaces",
          threadId === "first-thread" ? "paseo-1" : "paseo-2",
        ),
        now: "2026-04-26T00:00:00.000Z",
      });
      ensureThread(state, {
        threadId,
        requestBody: `${threadId} request`,
      });
      upsertAgentRecord(state, {
        threadId,
        agentId: `${threadId}-agent`,
        title: null,
        skill: "meow-plan",
        now: "2026-04-26T00:01:00.000Z",
      });
    }
    writeMeowFlowState(repositoryRoot, state);

    updateMeowFlowState(
      repositoryRoot,
      (mutableState) => {
        const thread = getThread(mutableState, "first-thread");
        if (!thread) {
          throw new Error("Expected first-thread to be loaded.");
        }
        replaceThread(mutableState, {
          ...thread,
          name: "renamed-thread",
        });
      },
      {
        threadIds: ["first-thread"],
        includeOccupationThreads: false,
      },
    );

    const database = new Database(databasePath, { readonly: true });
    const rows = database
      .prepare(
        `
          SELECT thread_id, request_body
          FROM thread_occupations
          ORDER BY thread_id
        `,
      )
      .all() as readonly { readonly thread_id: string; readonly request_body: string }[];
    database.close();

    expect(rows).toEqual([
      {
        thread_id: "first-thread",
        request_body: "first-thread request",
      },
      {
        thread_id: "second-thread",
        request_body: "second-thread request",
      },
    ]);
    expect(
      getThread(
        readMeowFlowState(repositoryRoot, {
          threadIds: ["second-thread"],
          includeOccupationThreads: false,
        }),
        "second-thread",
      )?.agents.map((agent) => agent.id),
    ).toEqual(["second-thread-agent"]);
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
