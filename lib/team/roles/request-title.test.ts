import { describe, expect, it, vi } from "vitest";
import type { TeamStructuredExecutor } from "@/lib/agent/executor";
import { createWorktree } from "@/lib/team/coding/worktree";
import { RequestTitleAgent } from "@/lib/team/roles/request-title";

describe("RequestTitleAgent", () => {
  it("tells the model to emit conventional titles as lowercased verb phrases", async () => {
    const executor = vi.fn(async () => {
      return {
        title: "link lane commit activity to GitHub",
        conventionalTitle: {
          type: "feat",
          scope: "lane/commits",
        },
      };
    }) as unknown as TeamStructuredExecutor;

    const agent = new RequestTitleAgent(executor);

    await agent.run({
      input: "Link lane commit activity to GitHub.",
      requestText: "Link lane commit activity to GitHub.",
      worktree: createWorktree({ path: "/tmp/meow-team" }),
      tasks: [
        {
          title: "Link lane commit activity to GitHub",
          objective: "Expose lane commit activity in the GitHub-facing workflow.",
        },
      ],
    });

    expect(executor).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining(
          "When you set `conventionalTitle` to a non-null value:\n  - The title must begin with a lowercased verb phrase",
        ),
      }),
    );
    expect(executor).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining(
          "The verb used in the title **must not** repeat the same leading verb implied by `type`.",
        ),
      }),
    );
  });
});
