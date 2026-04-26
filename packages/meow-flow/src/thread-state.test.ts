import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
  appendHandoffRecord,
  createEmptyState,
  deriveLatestStage,
  ensureThread,
  formatThreadStatus,
  getActiveOccupationForWorktree,
  getNextHandoffSequence,
  isThreadArchived,
  readMeowFlowState,
  recordOccupation,
  replaceThread,
  skillToStage,
  upsertAgentRecord,
  writeMeowFlowState,
} from "./thread-state.js";

const tempDirectories: string[] = [];

afterEach(() => {
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

  test("reads legacy occupation rows that used workspacePath", () => {
    const repositoryRoot = createTempRepositoryRoot();
    const statePath = path.join(repositoryRoot, ".git", "meow-flow", "state.json");
    mkdirSync(path.dirname(statePath), { recursive: true });
    writeFileSync(
      statePath,
      JSON.stringify({
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
      }),
    );

    const state = readMeowFlowState(repositoryRoot);

    expect(getActiveOccupationForWorktree(state, "/tmp/legacy-worktree")?.threadId).toBe(
      "fix-test-ci",
    );
  });

  test("writes state under git metadata", () => {
    const repositoryRoot = createTempRepositoryRoot();
    const state = createEmptyState();

    recordOccupation(state, {
      threadId: "fix-test-ci",
      worktreePath: "/tmp/worktree",
      now: "2026-04-26T00:00:00.000Z",
    });
    writeMeowFlowState(repositoryRoot, state);

    const written = readFileSync(
      path.join(repositoryRoot, ".git", "meow-flow", "state.json"),
      "utf8",
    );
    expect(written).toContain('"worktreePath": "/tmp/worktree"');
  });
});
