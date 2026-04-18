import { describe, expect, it, vi } from "vitest";
import type { TeamStructuredExecutor } from "@/lib/agent/executor";
import { createWorktree } from "@/lib/team/coding/worktree";
import {
  ExecutionReviewerAgent,
  executionReviewerRole,
  type ExecutionReviewerRoleOutput,
} from "@/lib/team/roles/execution-reviewer";

describe("ExecutionReviewerAgent", () => {
  it("renders reproducibility rules and guide lookup context", async () => {
    const executor = vi.fn(async () => {
      return {
        summary: "Execution artifacts are review-ready.",
        deliverable: "Validated the script, validator command, and summary artifact.",
        decision: "approved",
        pullRequestTitle: "feat(team/executing): ready",
        pullRequestSummary: "Validation passed.",
      } satisfies ExecutionReviewerRoleOutput;
    }) as unknown as TeamStructuredExecutor;

    const agent = new ExecutionReviewerAgent(executor);

    await agent.run({
      input: "Review the benchmark branch.",
      state: {
        repository: {
          id: "repo",
          name: "meow-team",
          rootId: "root",
          rootLabel: "Root",
          path: "/repo/meow-team",
          relativePath: ".",
        },
        branchName: "requests/execute-mode/example",
        baseBranch: "main",
        worktree: createWorktree({
          path: "/worktrees/meow-3",
          rootPath: "/worktrees",
        }),
        implementationCommit: "abc1234",
        teamName: "Owner Harness Team",
        ownerName: "Your Team",
        objective: "Continuously turn requests into reviewed engineering work.",
        laneId: "lane-1",
        laneIndex: 1,
        executionMode: "execution",
        executionModeLabel: "execution",
        taskTitle: "Run fixture refresh script",
        taskObjective: "Refresh fixtures with a committed validator and summary.",
        requestTitle: "feat(team/executing): introduce execute mode workflow",
        conventionalTitle: {
          type: "feat",
          scope: "team/executing",
        },
        planSummary: "Route execution proposals through executor lanes.",
        planDeliverable: "Proposal: Add execute-mode workflow and roles",
        conflictNote: null,
        guideInstructions:
          "Subtype guide lookup: inspect docs/guide/execution.md before making changes.\nUse it as the primary execution operating guide for this lane.",
        artifactContract:
          "Execution artifact contract for execution lanes:\n- Commit the scripts or automation changes that perform the run.",
        workflow: ["executor", "execution-reviewer"],
        handoffs: {},
        handoffCounter: 0,
        assignmentNumber: 1,
      },
    });

    expect(executor).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining("# Execution Reviewer"),
      }),
    );
    expect(executor).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining(executionReviewerRole.summary),
      }),
    );
    expect(executor).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining("validator or reproducible validation command"),
      }),
    );
    expect(executor).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining("inspect docs/guide/execution.md before making changes."),
      }),
    );
  });
});
