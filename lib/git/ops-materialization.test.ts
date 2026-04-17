import { beforeEach, describe, expect, it, vi } from "vitest";

const { runGitMock } = vi.hoisted(() => ({
  runGitMock: vi.fn(),
}));

vi.mock("@/lib/cli-tools/git", () => ({
  runGit: runGitMock,
}));

import { commitWorktreeChanges, listWorktreeChanges } from "@/lib/git/ops";

describe("listWorktreeChanges", () => {
  beforeEach(() => {
    runGitMock.mockReset();
  });

  it("returns a unique sorted list across staged, unstaged, and untracked paths", async () => {
    runGitMock
      .mockResolvedValueOnce({
        stdout: "openspec/changes/example/proposal.md\nREADME.md\n",
        stderr: "",
      })
      .mockResolvedValueOnce({
        stdout: "README.md\nopenspec/changes/example/tasks.md\n",
        stderr: "",
      })
      .mockResolvedValueOnce({
        stdout: "openspec/changes/example/design.md\n",
        stderr: "",
      });

    await expect(listWorktreeChanges("/repo")).resolves.toEqual([
      "README.md",
      "openspec/changes/example/design.md",
      "openspec/changes/example/proposal.md",
      "openspec/changes/example/tasks.md",
    ]);
    expect(runGitMock).toHaveBeenNthCalledWith(1, "/repo", [
      "diff",
      "--cached",
      "--name-only",
      "--relative",
      "--no-renames",
    ]);
    expect(runGitMock).toHaveBeenNthCalledWith(2, "/repo", [
      "diff",
      "--name-only",
      "--relative",
      "--no-renames",
    ]);
    expect(runGitMock).toHaveBeenNthCalledWith(3, "/repo", [
      "ls-files",
      "--others",
      "--exclude-standard",
      "--full-name",
    ]);
  });
});

describe("commitWorktreeChanges", () => {
  beforeEach(() => {
    runGitMock.mockReset();
    runGitMock.mockResolvedValue({
      stdout: "",
      stderr: "",
    });
  });

  it("stages only the requested pathspecs before committing", async () => {
    await commitWorktreeChanges({
      worktreePath: "/repo",
      message: "docs: add openspec proposals",
      pathspecs: ["openspec/changes/example", " openspec/changes/example-two "],
    });

    expect(runGitMock).toHaveBeenNthCalledWith(1, "/repo", [
      "add",
      "-A",
      "--",
      "openspec/changes/example",
      "openspec/changes/example-two",
    ]);
    expect(runGitMock).toHaveBeenNthCalledWith(2, "/repo", [
      "commit",
      "-m",
      "docs: add openspec proposals",
    ]);
  });
});
