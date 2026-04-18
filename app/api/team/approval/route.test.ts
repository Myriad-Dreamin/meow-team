import { beforeEach, describe, expect, it, vi } from "vitest";

const { runLaneApprovalMock } = vi.hoisted(() => ({
  runLaneApprovalMock: vi.fn(),
}));

vi.mock("@/lib/team/thread-actions", () => ({
  runLaneApproval: runLaneApprovalMock,
}));

import { POST } from "@/app/api/team/approval/route";

const createRequest = (body: Record<string, unknown>) =>
  new Request("http://localhost/api/team/approval", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

describe("POST /api/team/approval", () => {
  beforeEach(() => {
    runLaneApprovalMock.mockReset();
  });

  it("passes delete finalization mode through the approval action", async () => {
    const response = await POST(
      createRequest({
        threadId: "thread-1",
        assignmentNumber: 3,
        laneId: "lane-2",
        target: "pull_request",
        finalizationMode: "delete",
      }),
    );

    expect(runLaneApprovalMock).toHaveBeenCalledWith({
      threadId: "thread-1",
      assignmentNumber: 3,
      laneId: "lane-2",
      target: "pull_request",
      finalizationMode: "delete",
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
    });
  });

  it("rejects finalization mode when the target is not pull_request", async () => {
    const response = await POST(
      createRequest({
        threadId: "thread-1",
        assignmentNumber: 3,
        laneId: "lane-2",
        target: "proposal",
        finalizationMode: "delete",
      }),
    );

    expect(runLaneApprovalMock).not.toHaveBeenCalled();
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Invalid request body.",
    });
  });
});
