import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TeamRepositoryOption } from "@/lib/team/repository-types";

const {
  deleteManagedBranchesMock,
  listExistingBranchesMock,
  materializeAssignmentProposalsMock,
  resolveRepositoryBaseBranchMock,
  synchronizeDispatchAssignmentMock,
  updateTeamThreadRecordMock,
} = vi.hoisted(() => ({
  deleteManagedBranchesMock: vi.fn(),
  listExistingBranchesMock: vi.fn(),
  materializeAssignmentProposalsMock: vi.fn(),
  resolveRepositoryBaseBranchMock: vi.fn(),
  synchronizeDispatchAssignmentMock: vi.fn(),
  updateTeamThreadRecordMock: vi.fn(),
}));

vi.mock("@/lib/team/git", async () => {
  const actual = await vi.importActual<typeof import("@/lib/team/git")>("@/lib/team/git");
  return {
    ...actual,
    deleteManagedBranches: deleteManagedBranchesMock,
    listExistingBranches: listExistingBranchesMock,
    resolveRepositoryBaseBranch: resolveRepositoryBaseBranchMock,
  };
});

vi.mock("@/lib/team/history", async () => {
  const actual = await vi.importActual<typeof import("@/lib/team/history")>("@/lib/team/history");
  return {
    ...actual,
    synchronizeDispatchAssignment: synchronizeDispatchAssignmentMock,
    updateTeamThreadRecord: updateTeamThreadRecordMock,
  };
});

vi.mock("@/lib/team/openspec", async () => {
  const actual = await vi.importActual<typeof import("@/lib/team/openspec")>("@/lib/team/openspec");
  return {
    ...actual,
    materializeAssignmentProposals: materializeAssignmentProposalsMock,
  };
});

import { createPlannerDispatchAssignment } from "@/lib/team/dispatch";

const repository: TeamRepositoryOption = {
  id: "repo-1",
  name: "Repository",
  rootId: "root-1",
  rootLabel: "Root",
  path: "/tmp/repository",
  relativePath: ".",
};

const plannerInput = {
  assignmentNumber: 1,
  repository,
  requestTitle: "Fix Parallel Worktree Allocation",
  requestText: "Isolate planner staging worktrees and shared lane slots across threads.",
  plannerSummary: "Planner summary",
  plannerDeliverable: "Planner deliverable",
  branchPrefix: "parallel-worktrees",
  tasks: [
    {
      title: "Proposal 1",
      objective: "Implement the scoped worktree allocation change.",
    },
  ],
};

describe("createPlannerDispatchAssignment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    deleteManagedBranchesMock.mockResolvedValue(undefined);
    listExistingBranchesMock.mockResolvedValue([]);
    materializeAssignmentProposalsMock.mockResolvedValue(undefined);
    resolveRepositoryBaseBranchMock.mockResolvedValue("main");
    synchronizeDispatchAssignmentMock.mockImplementation((assignment) => assignment);
    updateTeamThreadRecordMock.mockResolvedValue(undefined);
  });

  it("isolates canonical and lane branches when different threads reuse the same prefix", async () => {
    const alphaAssignment = await createPlannerDispatchAssignment({
      threadId: "thread-alpha",
      ...plannerInput,
    });
    const betaAssignment = await createPlannerDispatchAssignment({
      threadId: "thread-beta",
      ...plannerInput,
    });

    expect(alphaAssignment.canonicalBranchName).toMatch(/^requests\/parallel-worktrees\//);
    expect(betaAssignment.canonicalBranchName).toMatch(/^requests\/parallel-worktrees\//);
    expect(alphaAssignment.canonicalBranchName).not.toBe(betaAssignment.canonicalBranchName);
    expect(alphaAssignment.lanes[0]?.branchName).not.toBe(betaAssignment.lanes[0]?.branchName);

    expect(materializeAssignmentProposalsMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        threadId: "thread-alpha",
        canonicalBranchName: alphaAssignment.canonicalBranchName,
      }),
    );
    expect(materializeAssignmentProposalsMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        threadId: "thread-beta",
        canonicalBranchName: betaAssignment.canonicalBranchName,
      }),
    );
  });

  it("reuses the same branch namespace when rematerializing the same thread assignment", async () => {
    const firstAssignment = await createPlannerDispatchAssignment({
      threadId: "thread-alpha",
      ...plannerInput,
    });
    const secondAssignment = await createPlannerDispatchAssignment({
      threadId: "thread-alpha",
      ...plannerInput,
    });

    expect(firstAssignment.canonicalBranchName).toBe(secondAssignment.canonicalBranchName);
    expect(firstAssignment.lanes[0]?.branchName).toBe(secondAssignment.lanes[0]?.branchName);
  });
});
