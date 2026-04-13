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
});
