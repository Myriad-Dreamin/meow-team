import { describe, expect, it } from "vitest";
import { createWorktree } from "@/lib/team/coding/worktree";
import { teamRepositoryContextSchema, teamRepositoryOptionSchema } from "./repository";

const repository = {
  id: "repo-1",
  name: "meow-team",
  rootId: "root-1",
  rootLabel: "Workspace",
  path: "/tmp/meow-team",
  relativePath: ".",
};

describe("teamRepositoryOptionSchema", () => {
  it("parses shared repository selections", () => {
    expect(teamRepositoryOptionSchema.parse(repository)).toEqual(repository);
  });
});

describe("teamRepositoryContextSchema", () => {
  it("reuses the shared repository option shape for lane repository context", () => {
    expect(
      teamRepositoryContextSchema.parse({
        repository,
        branchName: "requests/example/a1-proposal-1",
        baseBranch: "main",
        worktree: createWorktree({
          path: "/tmp/meow-team/.meow-team-worktrees/meow-1",
          rootPath: "/tmp/meow-team/.meow-team-worktrees",
        }),
        implementationCommit: null,
      }),
    ).toMatchObject({
      repository,
      branchName: "requests/example/a1-proposal-1",
      baseBranch: "main",
      worktree: {
        path: "/tmp/meow-team/.meow-team-worktrees/meow-1",
        rootPath: "/tmp/meow-team/.meow-team-worktrees",
        slot: 1,
      },
      implementationCommit: null,
    });
  });
});
