import { describe, expect, it } from "vitest";
import { defineTeamConfig } from "./config";

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
      maxIterations: 3,
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
  });
});
