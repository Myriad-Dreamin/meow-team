import { describe, expect, it, vi } from "vitest";
import type { TeamStructuredExecutor } from "@/lib/agent/executor";
import { PlannerAgent, type PlannerRoleOutput } from "@/lib/team/roles/planner";

describe("PlannerAgent", () => {
  it("renders the inline planner instructions and repository context", async () => {
    const executor = vi.fn(async () => {
      return {
        handoff: {
          summary: "Prepared one proposal.",
          deliverable: "Planner notes.",
          decision: "continue",
        },
        dispatch: null,
      } satisfies PlannerRoleOutput;
    }) as unknown as TeamStructuredExecutor;

    const agent = new PlannerAgent(executor);

    await agent.run({
      worktreePath: "/tmp/meow-team",
      state: {
        teamName: "Owner Harness Team",
        ownerName: "Your Team",
        objective: "Continuously turn requests into reviewed engineering work.",
        selectedRepository: null,
        workflow: ["planner", "coder", "reviewer"],
        handoffs: {},
        handoffCounter: 0,
        assignmentNumber: 1,
        requestTitle: null,
        conventionalTitle: null,
        requestText: "Inline planner/coder/reviewer role prompts into lib/team/roles.",
        latestInput: "Inline planner/coder/reviewer role prompts into lib/team/roles.",
      },
    });

    expect(executor).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining("# Planner"),
      }),
    );
    expect(executor).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining(
          "Selected repository: none. Proposal dispatch is blocked until a repository is selected.",
        ),
      }),
    );
    expect(executor).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining(
          "Turn the latest user request into a crisp proposal set that the rest of the",
        ),
      }),
    );
  });
});
