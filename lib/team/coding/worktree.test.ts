import { describe, expect, it } from "vitest";
import {
  createManagedWorktree,
  createWorktree,
  resolveLaneWorktree,
  resolveManagedWorktreeRoot,
} from "@/lib/team/coding/worktree";

describe("worktree helpers", () => {
  it("captures managed slot metadata from meow-N paths", () => {
    expect(
      createWorktree({
        path: "/tmp/worktrees/meow-3",
        rootPath: "/tmp/worktrees",
      }),
    ).toEqual({
      path: "/tmp/worktrees/meow-3",
      rootPath: "/tmp/worktrees",
      slot: 3,
    });
  });

  it("builds managed worktree paths from a root and slot", () => {
    expect(
      createManagedWorktree({
        rootPath: "/tmp/worktrees",
        slot: 2,
      }),
    ).toEqual({
      path: "/tmp/worktrees/meow-2",
      rootPath: "/tmp/worktrees",
      slot: 2,
    });
  });

  it("resolves lane worktrees against the managed root while preserving fallback behavior", () => {
    expect(
      resolveLaneWorktree({
        repositoryPath: "/repo/meow-team",
        worktreeRoot: ".meow-team-worktrees",
        worktreePath: null,
      }),
    ).toEqual({
      path: "/repo/meow-team/.meow-team-worktrees",
      rootPath: "/repo/meow-team/.meow-team-worktrees",
      slot: null,
    });
  });

  it("keeps absolute managed roots stable", () => {
    expect(
      resolveManagedWorktreeRoot({
        repositoryPath: "/repo/meow-team",
        worktreeRoot: "/tmp/worktrees",
      }),
    ).toBe("/tmp/worktrees");
  });
});
