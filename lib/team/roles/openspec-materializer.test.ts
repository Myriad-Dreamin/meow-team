import { describe, expect, it, vi } from "vitest";
import type { TeamStructuredExecutor } from "@/lib/agent/executor";
import { createWorktree } from "@/lib/team/coding/worktree";
import {
  OpenSpecMaterializerAgent,
  type OpenSpecMaterializerOutput,
} from "@/lib/team/roles/openspec-materializer";

describe("OpenSpecMaterializerAgent", () => {
  it("renders the materializer prompt with skill references and expected artifact paths", async () => {
    const executor = vi.fn(async () => {
      return {
        summary: "Materialized the proposal artifacts.",
        deliverable: "Wrote the OpenSpec proposal, design, tasks, and spec files.",
        artifactsCreated: [
          "openspec/changes/openspec-agent-a1-p1-agent-backed-openspec-proposal-materialization/proposal.md",
        ],
      } satisfies OpenSpecMaterializerOutput;
    }) as unknown as TeamStructuredExecutor;

    const agent = new OpenSpecMaterializerAgent(executor);

    await agent.run({
      worktree: createWorktree({
        path: "/worktrees/meow-1",
        rootPath: "/worktrees",
      }),
      state: {
        repositoryPath: "/repo/meow-team",
        canonicalBranchName: "requests/openspec-agent/thread-1/a1",
        proposalBranchName: "requests/openspec-agent/thread-1/a1-proposal-1",
        proposalChangeName: "openspec-agent-a1-p1-agent-backed-openspec-proposal-materialization",
        proposalPath:
          "openspec/changes/openspec-agent-a1-p1-agent-backed-openspec-proposal-materialization",
        requestTitle: "feat(oht/workflow): Agent-backed OpenSpec proposal materialization",
        conventionalTitle: {
          type: "feat",
          scope: "oht/workflow",
        },
        taskTitle: "Agent-backed OpenSpec proposal materialization",
        taskObjective:
          "Replace hardcoded proposal markdown generation with an agent-backed materializer.",
        plannerSummary: "Use a dedicated Codex helper for OpenSpec proposal artifacts.",
        plannerDeliverable: "Proposal 1 is the preferred path.",
        requestInput:
          "Replace the hardcoded markdown builders in lib/team/openspec.ts with an agent-backed materializer.",
        worktreeRoot: "/worktrees",
      },
    });

    expect(executor).toHaveBeenCalledWith(
      expect.objectContaining({
        codexHomePrefix: "openspec-materializer",
      }),
    );
    expect(executor).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining(".codex/skills/openspec-propose/SKILL.md"),
      }),
    );
    expect(executor).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining(
          "openspec/changes/openspec-agent-a1-p1-agent-backed-openspec-proposal-materialization",
        ),
      }),
    );
    expect(executor).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining(
          "openspec/changes/openspec-agent-a1-p1-agent-backed-openspec-proposal-materialization/specs/openspec-agent-a1-p1-agent-backed-openspec-proposal-materialization/spec.md",
        ),
      }),
    );
    expect(executor).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining(
          "feat(oht/workflow): Agent-backed OpenSpec proposal materialization",
        ),
      }),
    );
    expect(executor).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining("Planner summary:"),
      }),
    );
    expect(executor).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining(
          "commits on the currently checked out planner branch are allowed",
        ),
      }),
    );
  });
});
