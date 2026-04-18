import { describe, expect, it, vi } from "vitest";
import type { TeamStructuredExecutor } from "@/lib/agent/executor";
import { createWorktree } from "@/lib/team/coding/worktree";
import { ExecutorAgent, executorRole, type ExecutorRoleOutput } from "@/lib/team/roles/executor";

describe("ExecutorAgent", () => {
  it("renders guide fallback and artifact contract context", async () => {
    const executor = vi.fn(async () => {
      return {
        summary: "Execution artifacts are ready for review.",
        deliverable: "Committed the benchmark script, validator, and summary artifact.",
        decision: "continue",
        pullRequestTitle: null,
        pullRequestSummary: null,
      } satisfies ExecutorRoleOutput;
    }) as unknown as TeamStructuredExecutor;

    const agent = new ExecutorAgent(executor);

    await agent.run({
      input: "Run the benchmark lane.",
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
          path: "/worktrees/meow-2",
          rootPath: "/worktrees",
        }),
        implementationCommit: "abc1234",
        teamName: "Owner Harness Team",
        ownerName: "Your Team",
        objective: "Continuously turn requests into reviewed engineering work.",
        laneId: "lane-1",
        laneIndex: 1,
        executionPhase: "implementation",
        executionMode: "benchmark",
        executionModeLabel: "benchmark",
        taskTitle: "Benchmark worktree reuse latency",
        taskObjective: "Collect reproducible worktree reuse timings.",
        requestTitle: "feat(team/executing): introduce execute mode workflow",
        conventionalTitle: {
          type: "feat",
          scope: "team/executing",
        },
        planSummary: "Route benchmark proposals through executor lanes.",
        planDeliverable: "Proposal: Add execute-mode workflow and roles",
        conflictNote: null,
        archiveCommand: null,
        archivePathContext: "openspec/changes/change-1",
        guideInstructions:
          "Subtype guide lookup: docs/guide/benchmark.md was not found in this repository.\nInspect AGENTS.md for benchmark guidance before making changes.",
        artifactContract:
          "Execution artifact contract for benchmark lanes:\n- Commit the scripts or automation changes that perform the run.",
        workflow: ["executor", "execution-reviewer"],
        handoffs: {},
        handoffCounter: 0,
        assignmentNumber: 1,
      },
    });

    expect(executor).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining("# Executor"),
      }),
    );
    expect(executor).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining(executorRole.summary),
      }),
    );
    expect(executor).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining(
          "Inspect AGENTS.md for benchmark guidance before making changes.",
        ),
      }),
    );
    expect(executor).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining("Execution artifact contract"),
      }),
    );
  });
});
