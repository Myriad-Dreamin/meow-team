import { describe, expect, it, vi } from "vitest";
import type { TeamStructuredExecutor } from "@/lib/agent/executor";
import { createWorktree } from "@/lib/team/coding/worktree";
import { ReviewerAgent, reviewerRole, type ReviewerRoleOutput } from "@/lib/team/roles/reviewer";

describe("ReviewerAgent", () => {
  it("renders the inline reviewer instructions and execution rules", async () => {
    const executor = vi.fn(async () => {
      return {
        summary: "Implementation is ready.",
        deliverable: "Reviewed the branch and validated the output.",
        decision: "approved",
        pullRequestTitle: "feat(team): ready",
        pullRequestSummary: "Validation passed.",
      } satisfies ReviewerRoleOutput;
    }) as unknown as TeamStructuredExecutor;

    const agent = new ReviewerAgent(executor);

    await agent.run({
      input: "Review the role prompt consolidation branch.",
      state: {
        repository: {
          id: "repo",
          name: "meow-team",
          rootId: "root",
          rootLabel: "Root",
          path: "/repo/meow-team",
          relativePath: ".",
        },
        branchName: "requests/inline-role-prompts/example",
        baseBranch: "main",
        worktree: createWorktree({
          path: "/worktrees/meow-1",
          rootPath: "/worktrees",
        }),
        implementationCommit: "abc1234",
        teamName: "Owner Harness Team",
        ownerName: "Your Team",
        objective: "Continuously turn requests into reviewed engineering work.",
        laneId: "lane-1",
        laneIndex: 1,
        taskTitle: "Inline planner/coder/reviewer role prompts",
        taskObjective: "Keep a single role prompt source without changing workflow behavior.",
        requestTitle: "refactor(team/roles): Inline planner/coder/reviewer role prompts into",
        conventionalTitle: {
          type: "refactor",
          scope: "team/roles",
        },
        planSummary: "Consolidate duplicated role prompt ownership.",
        planDeliverable: "Proposal: Inline role prompts statically",
        conflictNote: null,
        workflow: ["coder", "reviewer"],
        handoffs: {},
        handoffCounter: 0,
        assignmentNumber: 1,
      },
    });

    expect(executor).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining("# Reviewer"),
      }),
    );
    expect(executor).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining(reviewerRole.summary),
      }),
    );
    expect(executor).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining("Create or update a failing Proof of Concept test"),
      }),
    );
    expect(executor).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining(
          "If you author a direct `git commit`, use a lowercase conventional subject",
        ),
      }),
    );
  });
});
