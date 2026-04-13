import { describe, expect, it } from "vitest";
import { createManagedWorktree, createWorktree } from "@/lib/team/coding/worktree";

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
});
