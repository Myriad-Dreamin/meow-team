import { describe, expect, it } from "vitest";
import {
  createManagedWorktree,
  createWorktree,
  parseManagedWorktreeSlotFromPath,
  resolveManagedWorktree,
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

  it("parses a meow-N slot from a legacy path outside the current root", () => {
    expect(parseManagedWorktreeSlotFromPath("/legacy/worktrees/meow-4")).toBe(4);
  });

  it("rebuilds a managed worktree under the current root from legacy metadata", () => {
    expect(
      resolveManagedWorktree({
        rootPath: "/tmp/current-worktrees",
        path: "/legacy/worktrees/meow-4",
      }),
    ).toEqual({
      path: "/tmp/current-worktrees/meow-4",
      rootPath: "/tmp/current-worktrees",
      slot: 4,
    });
  });
});
