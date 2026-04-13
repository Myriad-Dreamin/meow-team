import { describe, expect, it } from "vitest";
import { buildEndpointUrl, normalizeBackendBaseUrl, runTeam, TeamApiError } from "./team-client";

describe("normalizeBackendBaseUrl", () => {
  it("removes trailing slashes and keeps path prefixes", () => {
    expect(normalizeBackendBaseUrl("http://127.0.0.1:3000/")).toBe("http://127.0.0.1:3000");
    expect(normalizeBackendBaseUrl("http://127.0.0.1:3000/app")).toBe("http://127.0.0.1:3000/app");
  });

  it("rejects non-http URLs", () => {
    expect(() => normalizeBackendBaseUrl("file:///tmp")).toThrow(TeamApiError);
  });
});

describe("buildEndpointUrl", () => {
  it("resolves API paths relative to the configured base URL", () => {
    expect(buildEndpointUrl("http://127.0.0.1:3000/app", "/api/team/threads")).toBe(
      "http://127.0.0.1:3000/app/api/team/threads",
    );
  });
});

describe("runTeam", () => {
  it("streams accepted, log, and result events", async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            [
              JSON.stringify({
                type: "accepted",
                threadId: "thread-1",
                startedAt: "2026-04-14T00:00:00.000Z",
                status: "running",
              }),
              JSON.stringify({
                type: "codex_event",
                entry: {
                  id: "entry-1",
                  source: "stdout",
                  message: "Planner started",
                  createdAt: "2026-04-14T00:00:01.000Z",
                  threadId: "thread-1",
                  assignmentNumber: 1,
                  roleId: "planner",
                  laneId: null,
                },
              }),
              JSON.stringify({
                type: "result",
                result: {
                  threadId: "thread-1",
                  assignmentNumber: 1,
                  requestTitle: "Example request",
                  requestText: "Do the thing",
                  approved: false,
                  repository: null,
                  workflow: ["planner", "coder", "reviewer"],
                  handoffs: [],
                  steps: [],
                },
              }),
            ].join("\n"),
          ),
        );
        controller.close();
      },
    });

    globalThis.fetch = async () =>
      new Response(stream, {
        status: 200,
        headers: {
          "Content-Type": "application/x-ndjson; charset=utf-8",
        },
      });

    const progress: string[] = [];
    const result = await runTeam(
      "http://127.0.0.1:3000",
      {
        input: "Do the thing",
      },
      (event) => {
        progress.push(`${event.type}:${event.detail}`);
      },
    );

    expect(result.acceptedThreadId).toBe("thread-1");
    expect(result.result.requestTitle).toBe("Example request");
    expect(progress).toEqual([
      "accepted:Planner accepted the request at 2026-04-14T00:00:00.000Z.",
      "log:Planner started",
      "result:Assignment 1 finished.",
    ]);
  });

  it("surfaces branch deletion guidance", async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            JSON.stringify({
              type: "branch_delete_required",
              threadId: "thread-1",
              error: "Branches already exist.",
              branches: ["requests/example/a1-proposal-1"],
            }),
          ),
        );
        controller.close();
      },
    });

    globalThis.fetch = async () =>
      new Response(stream, {
        status: 200,
        headers: {
          "Content-Type": "application/x-ndjson; charset=utf-8",
        },
      });

    await expect(
      runTeam("http://127.0.0.1:3000", {
        input: "Retry request",
      }),
    ).rejects.toMatchObject({
      message: "Branches already exist.",
      branches: ["requests/example/a1-proposal-1"],
    });
  });
});
