import { describe, expect, it } from "vitest";
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
        worktreePath: "/tmp/meow-team/.meow-team-worktrees/meow-1",
        implementationCommit: null,
      }),
    ).toMatchObject({
      repository,
      branchName: "requests/example/a1-proposal-1",
      baseBranch: "main",
      worktreePath: "/tmp/meow-team/.meow-team-worktrees/meow-1",
      implementationCommit: null,
    });
  });
});
