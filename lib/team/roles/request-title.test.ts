import { describe, expect, it, vi } from "vitest";
import type { TeamStructuredExecutor } from "@/lib/agent/executor";
import { RequestTitleAgent } from "@/lib/team/roles/request-title";

describe("RequestTitleAgent", () => {
  it("tells the model to emit scoped titles as lowercased verb phrases", async () => {
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
      worktreePath: "/tmp/meow-team",
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
          "When conventionalTitle.scope is not null, title must start with a lowercased verb phrase",
        ),
      }),
    );
    expect(executor).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining(
          "When conventionalTitle.scope is not null, do not repeat the same leading verb as conventionalTitle.type in title.",
        ),
      }),
    );
  });
});
