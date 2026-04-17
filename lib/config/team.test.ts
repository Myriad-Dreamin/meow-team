import path from "node:path";
import { describe, expect, it } from "vitest";
import { defineTeamConfig } from "./team";

describe("defineTeamConfig", () => {
  it("parses a minimal valid team configuration", () => {
    const config = defineTeamConfig({
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
        threadFile: "data/test-thread.json",
      },
      dispatch: {
        workerCount: 1,
        maxProposalCount: 1,
        branchPrefix: "test-dispatch",
        baseBranch: "main",
        worktreeRoot: ".test-worktrees",
      },
    });

    expect(config.workflow).toEqual(["planner", "coder", "reviewer"]);
    expect(config.dispatch.workerCount).toBe(1);
    expect(config.notifications.target).toBe("browser");
  });

  it("normalizes config-owned storage and repository paths once at definition time", () => {
    const config = defineTeamConfig({
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
        threadFile: "data/test-thread.json",
      },
      dispatch: {
        workerCount: 1,
        maxProposalCount: 1,
        branchPrefix: "test-dispatch",
        baseBranch: "main",
        worktreeRoot: ".test-worktrees",
      },
      repositories: {
        roots: [
          {
            id: "workspace",
            label: "Workspace",
            directory: "fixtures/repositories",
          },
        ],
      },
    });

    expect(config.storage.threadFile).toBe(path.resolve("data/test-thread.json"));
    expect(config.repositories?.roots).toEqual([
      {
        id: "workspace",
        label: "Workspace",
        directory: path.resolve("fixtures/repositories"),
      },
    ]);
  });

  it("preserves absolute paths and the in-memory storage target", () => {
    const absoluteThreadFile = path.join(process.cwd(), "data", "test-thread.sqlite");
    const absoluteRepositoryRoot = path.join(process.cwd(), "fixtures", "repositories");
    const absoluteConfig = defineTeamConfig({
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
        threadFile: absoluteThreadFile,
      },
      dispatch: {
        workerCount: 1,
        maxProposalCount: 1,
        branchPrefix: "test-dispatch",
        baseBranch: "main",
        worktreeRoot: ".test-worktrees",
      },
      repositories: {
        roots: [
          {
            id: "workspace",
            label: "Workspace",
            directory: absoluteRepositoryRoot,
          },
        ],
      },
    });
    const memoryConfig = defineTeamConfig({
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
        threadFile: ":memory:",
      },
      dispatch: {
        workerCount: 1,
        maxProposalCount: 1,
        branchPrefix: "test-dispatch",
        baseBranch: "main",
        worktreeRoot: ".test-worktrees",
      },
    });

    expect(absoluteConfig.storage.threadFile).toBe(absoluteThreadFile);
    expect(absoluteConfig.repositories?.roots[0]?.directory).toBe(absoluteRepositoryRoot);
    expect(memoryConfig.storage.threadFile).toBe(":memory:");
  });

  it("accepts an explicit VS Code notification target", () => {
    const config = defineTeamConfig({
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
        threadFile: "data/test-thread.json",
      },
      dispatch: {
        workerCount: 1,
        maxProposalCount: 1,
        branchPrefix: "test-dispatch",
        baseBranch: "main",
        worktreeRoot: ".test-worktrees",
      },
      notifications: {
        target: "vscode",
      },
    });

    expect(config.notifications.target).toBe("vscode");
  });

  it("accepts an explicit Android notification target", () => {
    const config = defineTeamConfig({
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
        threadFile: "data/test-thread.json",
      },
      dispatch: {
        workerCount: 1,
        maxProposalCount: 1,
        branchPrefix: "test-dispatch",
        baseBranch: "main",
        worktreeRoot: ".test-worktrees",
      },
      notifications: {
        target: "android",
      },
    });

    expect(config.notifications.target).toBe("android");
  });
});
