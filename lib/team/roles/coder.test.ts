import { describe, expect, it, vi } from "vitest";
import type { TeamStructuredExecutor } from "@/lib/agent/executor";
import { CoderAgent, coderRole, type CoderRoleOutput } from "@/lib/team/roles/coder";

describe("CoderAgent", () => {
  it("renders the extracted template with archive context and role instructions", async () => {
    const executor = vi.fn(async () => {
      return {
        summary: "Ready for reviewer handoff.",
        deliverable: "Applied the requested change.",
        decision: "continue",
        pullRequestTitle: null,
        pullRequestSummary: null,
      } satisfies CoderRoleOutput;
    }) as unknown as TeamStructuredExecutor;

    const agent = new CoderAgent(executor);

    await agent.run({
      input: "Extract the role prompts into meow-prompt templates.",
      state: {
        repository: {
          id: "repo",
          name: "meow-team",
          rootId: "root",
          rootLabel: "Root",
          path: "/repo/meow-team",
          relativePath: ".",
        },
        branchName: "requests/role-prompts/example",
        baseBranch: "main",
        worktreePath: "/worktrees/meow-4",
        implementationCommit: "abc1234",
        teamName: "Owner Harness Team",
        ownerName: "Your Team",
        objective: "Continuously turn requests into reviewed engineering work.",
        laneId: "lane-1",
        laneIndex: 1,
        executionPhase: "final_archive",
        taskTitle: "Extract harness role prompt templates",
        taskObjective: "Move inline role prompts into colocated meow-prompt markdown files.",
        requestTitle: "refactor(team/roles): Extract harness role prompt templates",
        conventionalTitle: {
          type: "refactor",
          scope: "team/roles",
        },
        planSummary: "Extract the inline lane prompts without changing harness behavior.",
        planDeliverable: "Proposal: Extract harness role prompt templates",
        conflictNote: "Keep the workflow behavior stable while consolidating prompt ownership.",
        archiveCommand:
          "pnpm exec openspec archive role-prompts-a1-p1-extract-harness-role-prompt-templates --yes",
        archivePathContext: "Archive under openspec/changes/archive after coder validation passes.",
        workflow: ["coder", "reviewer"],
        handoffs: {},
        handoffCounter: 0,
        assignmentNumber: 1,
      },
    });

    expect(executor).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining("# Coder"),
      }),
    );
    expect(executor).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining(coderRole.summary),
      }),
    );
    expect(executor).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining(
          "Archive continuation: this is the final coder-only archive pass. Do not route back to reviewer.",
        ),
      }),
    );
    expect(executor).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining("No previous role handoffs exist for this assignment yet."),
      }),
    );
  });
});
