import { beforeEach, describe, expect, it, vi } from "vitest";
import { TeamThreadReplanError } from "@/lib/team/coding";

const { executeThreadCommandMock, MockTeamThreadCommandError } = vi.hoisted(() => {
  class MockTeamThreadCommandError extends Error {
    readonly statusCode: 400 | 404 | 409;

    constructor(message: string, statusCode: 400 | 404 | 409) {
      super(message);
      this.name = "TeamThreadCommandError";
      this.statusCode = statusCode;
    }
  }

  return {
    executeThreadCommandMock: vi.fn(),
    MockTeamThreadCommandError,
  };
});

vi.mock("@/lib/team/thread-command-server", () => ({
  executeThreadCommand: executeThreadCommandMock,
  TeamThreadCommandError: MockTeamThreadCommandError,
}));

import { POST } from "@/app/api/team/threads/[threadId]/command/route";

const createRequest = (command: string) =>
  new Request("http://localhost/api/team/threads/thread-1/command", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ command }),
  });

const createContext = (threadId = "thread-1") => ({
  params: Promise.resolve({ threadId }),
});

describe("POST /api/team/threads/[threadId]/command", () => {
  beforeEach(() => {
    executeThreadCommandMock.mockReset();
  });

  it.each([
    {
      error: new TeamThreadReplanError(
        "active_queue",
        "Wait for the active coding-review queue to finish before restarting planning with human feedback.",
        409,
      ),
      status: 409,
    },
    {
      error: new TeamThreadReplanError("not_found", "Thread thread-1 was not found.", 404),
      status: 404,
    },
  ])("preserves shared replanning helper status codes ($status)", async ({ error, status }) => {
    executeThreadCommandMock.mockRejectedValueOnce(error);

    const response = await POST(createRequest("/replan-all tighten the scope"), createContext());

    expect(executeThreadCommandMock).toHaveBeenCalledWith({
      threadId: "thread-1",
      commandText: "/replan-all tighten the scope",
    });
    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toEqual({
      error: error.message,
    });
  });
});
