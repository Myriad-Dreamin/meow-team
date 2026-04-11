import { describe, expect, it, vi } from "vitest";
import type { TeamRoleDependencies } from "./dependencies";
import { resolveTeamRoleDependencies } from "./dependencies";

describe("resolveTeamRoleDependencies", () => {
  it("builds default agent instances from an injected executor", async () => {
    const executor = vi.fn(async () => {
      return {
        title: "Injected Title",
        conventionalTitle: null,
      };
    }) as unknown as TeamRoleDependencies["executor"];

    const dependencies = resolveTeamRoleDependencies({
      executor,
    });

    await expect(
      dependencies.requestTitleAgent.run({
        input: "Ship reliable dispatch coordination.",
        requestText: "Ship reliable dispatch coordination.",
        worktreePath: "/tmp/meow-team",
      }),
    ).resolves.toEqual({
      title: "Injected Title",
      conventionalTitle: null,
    });

    expect(executor).toHaveBeenCalledWith(
      expect.objectContaining({
        worktreePath: "/tmp/meow-team",
        codexHomePrefix: "request-title",
      }),
    );
  });

  it("keeps explicit agent overrides intact", () => {
    const requestTitleAgent = {
      run: vi.fn(),
    };

    const dependencies = resolveTeamRoleDependencies({
      requestTitleAgent,
    });

    expect(dependencies.requestTitleAgent).toBe(requestTitleAgent);
  });
});
