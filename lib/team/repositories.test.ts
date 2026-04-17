import { mkdtemp, mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { defineTeamConfig } from "@/lib/config/team";
import {
  listConfiguredRepositories,
  resolveConfiguredRepositoryRoots,
} from "@/lib/team/repositories";

const TEMPORARY_DIRECTORIES = new Set<string>();

const createTeamConfig = ({
  repositoryRoots,
}: {
  repositoryRoots: Array<{
    id: string;
    label: string;
    directory: string;
  }>;
}) => {
  return defineTeamConfig({
    id: "test-team",
    name: "Test Team",
    owner: {
      name: "Owner",
      objective: "Keep the workflow moving.",
    },
    model: {
      provider: "openai",
      model: "gpt-5.4",
      reasoningEffort: "medium",
      textVerbosity: "medium",
      maxOutputTokens: 3200,
    },
    workflow: ["planner", "coder", "reviewer"],
    storage: {
      threadFile: "data/test-thread.sqlite",
    },
    dispatch: {
      workerCount: 1,
      maxProposalCount: 1,
      branchPrefix: "test-dispatch",
      baseBranch: "main",
      worktreeRoot: ".test-worktrees",
    },
    repositories: {
      roots: repositoryRoots,
    },
  });
};

afterEach(async () => {
  await Promise.all(
    [...TEMPORARY_DIRECTORIES].map((directory) =>
      rm(directory, {
        force: true,
        recursive: true,
      }),
    ),
  );
  TEMPORARY_DIRECTORIES.clear();
});

describe("listConfiguredRepositories", () => {
  it("uses config-normalized repository roots and skips missing roots", async () => {
    const rootDirectory = await mkdtemp(path.join(os.tmpdir(), "team-repositories-"));
    TEMPORARY_DIRECTORIES.add(rootDirectory);
    const nestedRepositoryPath = path.join(rootDirectory, "alpha");
    const missingRootDirectory = path.join(rootDirectory, "missing-root");

    await mkdir(path.join(rootDirectory, ".git"), { recursive: true });
    await mkdir(path.join(nestedRepositoryPath, ".git"), { recursive: true });

    const config = createTeamConfig({
      repositoryRoots: [
        {
          id: "workspace",
          label: "Workspace",
          directory: path.relative(process.cwd(), rootDirectory),
        },
        {
          id: "missing",
          label: "Missing",
          directory: path.relative(process.cwd(), missingRootDirectory),
        },
      ],
    });

    expect(resolveConfiguredRepositoryRoots(config)).toEqual([
      {
        id: "workspace",
        label: "Workspace",
        directory: rootDirectory,
      },
      {
        id: "missing",
        label: "Missing",
        directory: missingRootDirectory,
      },
    ]);
    await expect(listConfiguredRepositories(config)).resolves.toEqual([
      {
        id: "workspace:.",
        name: path.basename(rootDirectory),
        rootId: "workspace",
        rootLabel: "Workspace",
        path: rootDirectory,
        relativePath: ".",
      },
      {
        id: "workspace:alpha",
        name: "alpha",
        rootId: "workspace",
        rootLabel: "Workspace",
        path: nestedRepositoryPath,
        relativePath: "alpha",
      },
    ]);
  });
});
