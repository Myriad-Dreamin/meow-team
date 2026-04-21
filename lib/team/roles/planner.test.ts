import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TeamStructuredExecutor } from "@/lib/agent/executor";
import { defineTeamConfig } from "@/lib/config/team";
import {
  resetTeamConfigLoaderForTests,
  setTeamConfigOverrideForTests,
} from "@/lib/config/team-loader";
import { createWorktree } from "@/lib/team/coding/worktree";
import { PlannerAgent, type PlannerRoleOutput } from "@/lib/team/roles/planner";

const createTestTeamConfig = () => {
  return defineTeamConfig({
    id: "test-team",
    name: "Owner Harness Team",
    owner: {
      name: "Your Team",
      objective: "Continuously turn requests into reviewed engineering work.",
    },
    model: {
      provider: "openai",
      model: "gpt-5",
      reasoningEffort: "medium",
      textVerbosity: "medium",
      maxOutputTokens: 3200,
    },
    workflow: ["planner", "coder", "reviewer"],
    storage: {
      threadFile: "/tmp/team-thread.json",
    },
    dispatch: {
      workerCount: 2,
      maxProposalCount: 2,
      branchPrefix: "team-dispatch",
      baseBranch: "main",
      worktreeRoot: "/tmp/team-worktrees",
    },
    notifications: {
      target: "browser",
    },
    repositories: {
      roots: [
        {
          id: "test-root",
          label: "Test Root",
          directory: "/tmp",
        },
      ],
    },
  });
};

describe("PlannerAgent", () => {
  let teamConfig = createTestTeamConfig();

  beforeEach(() => {
    resetTeamConfigLoaderForTests();
    teamConfig = createTestTeamConfig();
    setTeamConfigOverrideForTests(teamConfig);
  });

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
      worktree: createWorktree({ path: "/tmp/meow-team" }),
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

  it("rebuilds the planner schema and prompt from the latest config", async () => {
    const observedTaskLimits: number[] = [];
    const observedWorkerCounts: number[] = [];
    const executor = vi.fn(
      async ({
        prompt,
        responseSchema,
      }: {
        prompt: string;
        responseSchema: {
          parse: (value: unknown) => PlannerRoleOutput;
        };
      }) => {
        const workerCountMatch = prompt.match(/pool size\*\*: (\d+)/u);
        observedWorkerCounts.push(Number(workerCountMatch?.[1] ?? 0));

        const oneTask = {
          handoff: {
            summary: "Prepared one proposal.",
            deliverable: "Planner notes.",
            decision: "continue",
          },
          dispatch: {
            planSummary: "Summary",
            plannerDeliverable: "Deliverable",
            branchPrefix: "team-dispatch",
            tasks: [
              {
                title: "Only task",
                objective: "Ship one task.",
              },
            ],
          },
        };

        const twoTasks = {
          ...oneTask,
          dispatch: {
            ...oneTask.dispatch,
            tasks: [
              ...oneTask.dispatch.tasks,
              {
                title: "Second task",
                objective: "Ship two tasks.",
              },
            ],
          },
        };

        const proposalLimitMatch = prompt.match(
          /between \*\*1\*\* and \*\*(\d+)\*\* concrete proposals/u,
        );
        const proposalLimit = Number(proposalLimitMatch?.[1] ?? 0);

        if (proposalLimit === 1) {
          responseSchema.parse(oneTask);
          expect(() => responseSchema.parse(twoTasks)).toThrow();
          observedTaskLimits.push(1);
        } else {
          responseSchema.parse(twoTasks);
          observedTaskLimits.push(2);
        }

        return {
          handoff: {
            summary: "Prepared proposals.",
            deliverable: "Planner notes.",
            decision: "continue",
          },
          dispatch: null,
        } satisfies PlannerRoleOutput;
      },
    ) as unknown as TeamStructuredExecutor;

    const agent = new PlannerAgent(executor);

    teamConfig.dispatch.maxProposalCount = 1;
    teamConfig.dispatch.workerCount = 1;
    await agent.run({
      worktree: createWorktree({ path: "/tmp/meow-team" }),
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
        requestText: "Tighten planner proposal limits.",
        latestInput: "Tighten planner proposal limits.",
      },
    });

    teamConfig.dispatch.maxProposalCount = 2;
    teamConfig.dispatch.workerCount = 4;
    await agent.run({
      worktree: createWorktree({ path: "/tmp/meow-team" }),
      state: {
        teamName: "Owner Harness Team",
        ownerName: "Your Team",
        objective: "Continuously turn requests into reviewed engineering work.",
        selectedRepository: null,
        workflow: ["planner", "coder", "reviewer"],
        handoffs: {},
        handoffCounter: 0,
        assignmentNumber: 2,
        requestTitle: null,
        conventionalTitle: null,
        requestText: "Expand planner proposal limits.",
        latestInput: "Expand planner proposal limits.",
      },
    });

    expect(observedTaskLimits).toEqual([1, 2]);
    expect(observedWorkerCounts).toEqual([1, 4]);
  });
});
