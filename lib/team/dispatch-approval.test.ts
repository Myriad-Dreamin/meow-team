import { promises as fs } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getTeamThreadRecord, type TeamThreadRecord } from "@/lib/team/history";
import type { TeamRepositoryOption } from "@/lib/git/repository";
import type { TeamDispatchAssignment, TeamWorkerLaneRecord } from "@/lib/team/types";

const {
  appendArchivedOpenSpecLinksToRoadmapTopicMock,
  archiveOpenSpecChangeInWorktreeMock,
  commitWorktreeChangesMock,
  createOrUpdateGitHubPullRequestMock,
  ensureLaneWorktreeMock,
  getBranchHeadMock,
  pushLaneBranchMock,
  threadFile,
  worktreeRoot,
} = vi.hoisted(() => ({
  appendArchivedOpenSpecLinksToRoadmapTopicMock: vi.fn(),
  archiveOpenSpecChangeInWorktreeMock: vi.fn(),
  commitWorktreeChangesMock: vi.fn(),
  createOrUpdateGitHubPullRequestMock: vi.fn(),
  ensureLaneWorktreeMock: vi.fn(),
  getBranchHeadMock: vi.fn(),
  pushLaneBranchMock: vi.fn(),
  threadFile: `/tmp/team-dispatch-approval-${crypto.randomUUID()}.json`,
  worktreeRoot: `/tmp/team-dispatch-worktrees-${crypto.randomUUID()}`,
}));

vi.mock("@/team.config", () => ({
  teamConfig: {
    id: "test-team",
    name: "Test Team",
    owner: {
      name: "Owner",
      objective: "Ship reliable GitHub delivery.",
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
      threadFile,
    },
    dispatch: {
      workerCount: 1,
      maxProposalCount: 6,
      branchPrefix: "team-dispatch",
      baseBranch: "main",
      worktreeRoot,
    },
    repositories: {
      roots: [],
    },
  },
}));

vi.mock("@/lib/team/git", async () => {
  const actual = await vi.importActual<typeof import("@/lib/team/git")>("@/lib/team/git");
  return {
    ...actual,
    ensureLaneWorktree: ensureLaneWorktreeMock,
    pushLaneBranch: pushLaneBranchMock,
  };
});

vi.mock("@/lib/git/ops", async () => {
  const actual = await vi.importActual<typeof import("@/lib/git/ops")>("@/lib/git/ops");
  return {
    ...actual,
    archiveOpenSpecChangeInWorktree: archiveOpenSpecChangeInWorktreeMock,
    commitWorktreeChanges: commitWorktreeChangesMock,
    createOrUpdateGitHubPullRequest: createOrUpdateGitHubPullRequestMock,
    getBranchHead: getBranchHeadMock,
  };
});

vi.mock("@/lib/team/roadmap", async () => {
  const actual = await vi.importActual<typeof import("@/lib/team/roadmap")>("@/lib/team/roadmap");
  return {
    ...actual,
    appendArchivedOpenSpecLinksToRoadmapTopic: appendArchivedOpenSpecLinksToRoadmapTopicMock,
  };
});

import { approveLanePullRequest } from "@/lib/team/dispatch";

const FIXED_TIMESTAMP = "2026-04-11T08:00:00.000Z";

const repository: TeamRepositoryOption = {
  id: "repo-1",
  name: "Repository",
  rootId: "root-1",
  rootLabel: "Root",
  path: "/tmp/repository",
  relativePath: ".",
};

const basePushedCommit = {
  remoteName: "origin",
  repositoryUrl: "https://github.com/example/meow-team",
  branchUrl: "https://github.com/example/meow-team/tree/requests/example/a1-proposal-1",
  commitUrl: "https://github.com/example/meow-team/commit/review-commit",
  commitHash: "review-commit",
  pushedAt: FIXED_TIMESTAMP,
};

const createLane = (overrides: Partial<TeamWorkerLaneRecord> = {}): TeamWorkerLaneRecord => ({
  laneId: "lane-1",
  laneIndex: 1,
  status: "approved",
  taskTitle: "Ship the feature",
  taskObjective: "Archive the approved proposal and open a GitHub PR.",
  proposalChangeName: "change-1",
  proposalPath: "openspec/changes/change-1",
  workerSlot: null,
  branchName: "requests/example/a1-proposal-1",
  baseBranch: "main",
  worktreePath: "/tmp/meow-1",
  latestImplementationCommit: "review-commit",
  pushedCommit: basePushedCommit,
  latestCoderHandoff: null,
  latestReviewerHandoff: null,
  latestDecision: "approved",
  latestCoderSummary: "Implemented the requested branch updates.",
  latestReviewerSummary: "Machine review approved the branch.",
  latestActivity: "Waiting for final human approval.",
  approvalRequestedAt: FIXED_TIMESTAMP,
  approvalGrantedAt: FIXED_TIMESTAMP,
  queuedAt: FIXED_TIMESTAMP,
  runCount: 1,
  revisionCount: 0,
  requeueReason: null,
  lastError: null,
  pullRequest: {
    id: "pr-1",
    provider: "local-ci",
    title: "Ship the feature",
    summary: "Machine review approved the branch.",
    branchName: "requests/example/a1-proposal-1",
    baseBranch: "main",
    status: "awaiting_human_approval",
    requestedAt: FIXED_TIMESTAMP,
    humanApprovalRequestedAt: FIXED_TIMESTAMP,
    humanApprovedAt: null,
    machineReviewedAt: FIXED_TIMESTAMP,
    updatedAt: FIXED_TIMESTAMP,
    url: null,
  },
  events: [],
  startedAt: FIXED_TIMESTAMP,
  finishedAt: FIXED_TIMESTAMP,
  updatedAt: FIXED_TIMESTAMP,
  ...overrides,
});

const createAssignment = (
  lane: TeamWorkerLaneRecord,
  overrides: Partial<TeamDispatchAssignment> = {},
): TeamDispatchAssignment => ({
  assignmentNumber: 1,
  status: "approved",
  repository,
  requestTitle: "Ship the feature",
  conventionalTitle: null,
  requestText: "Finalize the reviewed branch.",
  requestedAt: FIXED_TIMESTAMP,
  startedAt: FIXED_TIMESTAMP,
  finishedAt: FIXED_TIMESTAMP,
  updatedAt: FIXED_TIMESTAMP,
  plannerSummary: "Wait for final human approval after machine review.",
  plannerDeliverable: "Planner deliverable",
  branchPrefix: "example",
  canonicalBranchName: "requests/example/a1",
  baseBranch: "main",
  workerCount: 1,
  lanes: [lane],
  plannerNotes: [],
  humanFeedback: [],
  supersededAt: null,
  supersededReason: null,
  ...overrides,
});

const createThread = (
  lane: TeamWorkerLaneRecord,
  assignmentOverrides: Partial<TeamDispatchAssignment> = {},
): TeamThreadRecord => ({
  threadId: "thread-1",
  data: {
    teamId: "test-team",
    teamName: "Test Team",
    ownerName: "Owner",
    objective: "Ship reliable GitHub delivery.",
    selectedRepository: repository,
    workflow: ["planner", "coder", "reviewer"],
    handoffs: {},
    handoffCounter: 0,
    assignmentNumber: 1,
    requestTitle: assignmentOverrides.requestTitle ?? "Ship the feature",
    conventionalTitle: assignmentOverrides.conventionalTitle ?? null,
    requestText: assignmentOverrides.requestText ?? "Finalize the reviewed branch.",
    latestInput: assignmentOverrides.requestText ?? "Finalize the reviewed branch.",
    forceReset: false,
  },
  results: [],
  userMessages: [],
  dispatchAssignments: [createAssignment(lane, assignmentOverrides)],
  run: {
    status: "approved",
    startedAt: FIXED_TIMESTAMP,
    finishedAt: FIXED_TIMESTAMP,
    lastError: null,
  },
  createdAt: FIXED_TIMESTAMP,
  updatedAt: FIXED_TIMESTAMP,
});

const writeThreadStore = async (
  lane: TeamWorkerLaneRecord,
  assignmentOverrides: Partial<TeamDispatchAssignment> = {},
) => {
  await fs.mkdir(worktreeRoot, { recursive: true });
  await fs.writeFile(
    threadFile,
    JSON.stringify({ threads: { "thread-1": createThread(lane, assignmentOverrides) } }, null, 2),
    "utf8",
  );
};

describe("approveLanePullRequest", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await fs.rm(threadFile, { force: true });
    await fs.rm(worktreeRoot, { recursive: true, force: true });
    appendArchivedOpenSpecLinksToRoadmapTopicMock.mockResolvedValue({
      updated: false,
      topicPath: null,
      linkedSpecs: [],
    });
  });

  afterEach(async () => {
    await fs.rm(threadFile, { force: true });
    await fs.rm(worktreeRoot, { recursive: true, force: true });
  });

  it("archives the reviewed OpenSpec change and finalizes GitHub PR delivery", async () => {
    archiveOpenSpecChangeInWorktreeMock.mockResolvedValue({
      archivedPath: "openspec/changes/archive/2026-04-11-change-1",
      createdArchive: true,
    });
    commitWorktreeChangesMock.mockResolvedValue(undefined);
    getBranchHeadMock.mockResolvedValue("archive-commit");
    pushLaneBranchMock.mockResolvedValue({
      ...basePushedCommit,
      commitUrl: "https://github.com/example/meow-team/commit/archive-commit",
      commitHash: "archive-commit",
    });
    createOrUpdateGitHubPullRequestMock.mockResolvedValue({
      url: "https://github.com/example/meow-team/pull/42",
    });

    await writeThreadStore(createLane());

    await approveLanePullRequest({
      threadId: "thread-1",
      assignmentNumber: 1,
      laneId: "lane-1",
    });

    const thread = await getTeamThreadRecord(threadFile, "thread-1");
    const lane = thread?.dispatchAssignments[0]?.lanes[0];

    expect(ensureLaneWorktreeMock).toHaveBeenCalled();
    expect(appendArchivedOpenSpecLinksToRoadmapTopicMock).toHaveBeenCalledWith({
      worktreePath: expect.stringContaining("finalize-"),
      changeName: "change-1",
      archivedChangePath: "openspec/changes/archive/2026-04-11-change-1",
      conventionalTitle: null,
    });
    expect(commitWorktreeChangesMock).toHaveBeenCalledWith({
      worktreePath: expect.stringContaining("finalize-"),
      message: "system: archive change-1",
    });
    expect(createOrUpdateGitHubPullRequestMock).toHaveBeenCalledWith({
      repositoryPath: expect.stringContaining("finalize-"),
      branchName: "requests/example/a1-proposal-1",
      baseBranch: "main",
      title: "Ship the feature",
      body: "Machine review approved the branch.",
    });
    expect(lane?.proposalPath).toBe("openspec/changes/archive/2026-04-11-change-1");
    expect(lane?.latestImplementationCommit).toBe("archive-commit");
    expect(lane?.pushedCommit?.commitHash).toBe("archive-commit");
    expect(lane?.pullRequest?.provider).toBe("github");
    expect(lane?.pullRequest?.status).toBe("approved");
    expect(lane?.pullRequest?.url).toBe("https://github.com/example/meow-team/pull/42");
    expect(lane?.pullRequest?.humanApprovedAt).toBeTruthy();
    expect(lane?.events.at(-2)?.message).toBe(
      "Archived OpenSpec change to openspec/changes/archive/2026-04-11-change-1 and pushed commit [archive-comm](<https://github.com/example/meow-team/commit/archive-commit>) to GitHub via origin.",
    );
    expect(lane?.events.at(-1)?.message).toContain("GitHub PR ready");
    expect(thread?.dispatchAssignments[0]?.plannerNotes.at(-1)?.message).toContain(
      "GitHub PR is ready",
    );
    expect(thread?.dispatchAssignments[0]?.status).toBe("completed");
    expect(thread?.run?.status).toBe("completed");
  });

  it("normalizes the final GitHub PR title from stored conventional metadata", async () => {
    archiveOpenSpecChangeInWorktreeMock.mockResolvedValue({
      archivedPath: "openspec/changes/archive/2026-04-11-change-1",
      createdArchive: true,
    });
    commitWorktreeChangesMock.mockResolvedValue(undefined);
    getBranchHeadMock.mockResolvedValue("archive-commit");
    pushLaneBranchMock.mockResolvedValue({
      ...basePushedCommit,
      commitUrl: "https://github.com/example/meow-team/commit/archive-commit",
      commitHash: "archive-commit",
    });
    createOrUpdateGitHubPullRequestMock.mockResolvedValue({
      url: "https://github.com/example/meow-team/pull/77",
    });

    await writeThreadStore(createLane(), {
      requestTitle: "dev(vsc/command): Ship the feature",
      conventionalTitle: {
        type: "dev",
        scope: "vsc/command",
      },
    });

    await approveLanePullRequest({
      threadId: "thread-1",
      assignmentNumber: 1,
      laneId: "lane-1",
    });

    const thread = await getTeamThreadRecord(threadFile, "thread-1");
    const lane = thread?.dispatchAssignments[0]?.lanes[0];

    expect(createOrUpdateGitHubPullRequestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "dev(vsc/command): Ship the feature",
      }),
    );
    expect(appendArchivedOpenSpecLinksToRoadmapTopicMock).toHaveBeenCalledWith({
      worktreePath: expect.stringContaining("finalize-"),
      changeName: "change-1",
      archivedChangePath: "openspec/changes/archive/2026-04-11-change-1",
      conventionalTitle: {
        type: "dev",
        scope: "vsc/command",
      },
    });
    expect(lane?.pullRequest?.title).toBe("dev(vsc/command): Ship the feature");
  });

  it("resumes an interrupted final approval without duplicating the human approval event", async () => {
    archiveOpenSpecChangeInWorktreeMock.mockResolvedValue({
      archivedPath: "openspec/changes/archive/2026-04-11-change-1",
      createdArchive: false,
    });
    getBranchHeadMock.mockResolvedValue("archive-commit");
    pushLaneBranchMock.mockResolvedValue({
      ...basePushedCommit,
      commitUrl: "https://github.com/example/meow-team/commit/archive-commit",
      commitHash: "archive-commit",
    });
    createOrUpdateGitHubPullRequestMock.mockResolvedValue({
      url: "https://github.com/example/meow-team/pull/88",
    });

    await writeThreadStore(
      createLane({
        latestActivity:
          "Human approved the machine-reviewed branch. Archiving the OpenSpec change and refreshing the GitHub PR.",
        pullRequest: {
          id: "pr-1",
          provider: "local-ci",
          title: "Ship the feature",
          summary: "Machine review approved the branch.",
          branchName: "requests/example/a1-proposal-1",
          baseBranch: "main",
          status: "awaiting_human_approval",
          requestedAt: FIXED_TIMESTAMP,
          humanApprovalRequestedAt: FIXED_TIMESTAMP,
          humanApprovedAt: FIXED_TIMESTAMP,
          machineReviewedAt: FIXED_TIMESTAMP,
          updatedAt: FIXED_TIMESTAMP,
          url: null,
        },
        events: [
          {
            id: "event-1",
            actor: "human",
            message: "Human approved the machine-reviewed branch for GitHub PR delivery.",
            createdAt: FIXED_TIMESTAMP,
          },
        ],
      }),
    );

    await approveLanePullRequest({
      threadId: "thread-1",
      assignmentNumber: 1,
      laneId: "lane-1",
    });

    const thread = await getTeamThreadRecord(threadFile, "thread-1");
    const lane = thread?.dispatchAssignments[0]?.lanes[0];

    expect(commitWorktreeChangesMock).not.toHaveBeenCalled();
    expect(lane?.events.filter((event) => event.actor === "human")).toHaveLength(1);
    expect(lane?.pullRequest?.status).toBe("approved");
    expect(lane?.pullRequest?.humanApprovedAt).toBe(FIXED_TIMESTAMP);
    expect(lane?.pullRequest?.url).toBe("https://github.com/example/meow-team/pull/88");
  });

  it("records an archive failure as a blocking finalization error", async () => {
    archiveOpenSpecChangeInWorktreeMock.mockRejectedValue(new Error("OpenSpec change not found."));

    await writeThreadStore(createLane());

    await expect(
      approveLanePullRequest({
        threadId: "thread-1",
        assignmentNumber: 1,
        laneId: "lane-1",
      }),
    ).rejects.toThrow("OpenSpec change not found.");

    const thread = await getTeamThreadRecord(threadFile, "thread-1");
    const lane = thread?.dispatchAssignments[0]?.lanes[0];

    expect(pushLaneBranchMock).not.toHaveBeenCalled();
    expect(createOrUpdateGitHubPullRequestMock).not.toHaveBeenCalled();
    expect(lane?.proposalPath).toBe("openspec/changes/change-1");
    expect(lane?.pushedCommit?.commitHash).toBe("review-commit");
    expect(lane?.pullRequest?.status).toBe("failed");
    expect(lane?.lastError).toContain("OpenSpec change not found");
    expect(thread?.dispatchAssignments[0]?.status).toBe("failed");
    expect(thread?.run?.status).toBe("failed");
  });

  it("records a roadmap archive-link failure as a blocking finalization error", async () => {
    archiveOpenSpecChangeInWorktreeMock.mockResolvedValue({
      archivedPath: "openspec/changes/archive/2026-04-11-change-1",
      createdArchive: true,
    });
    appendArchivedOpenSpecLinksToRoadmapTopicMock.mockRejectedValue(
      new Error(
        "Roadmap topic docs/roadmap/vscode-extension/command-palette.md is missing a ## Related Specs section.",
      ),
    );

    await writeThreadStore(createLane(), {
      requestTitle: "dev(vsc/command): Ship the feature",
      conventionalTitle: {
        type: "dev",
        scope: "vsc/command",
      },
    });

    await expect(
      approveLanePullRequest({
        threadId: "thread-1",
        assignmentNumber: 1,
        laneId: "lane-1",
      }),
    ).rejects.toThrow("Roadmap topic docs/roadmap/vscode-extension/command-palette.md");

    const thread = await getTeamThreadRecord(threadFile, "thread-1");
    const lane = thread?.dispatchAssignments[0]?.lanes[0];

    expect(commitWorktreeChangesMock).not.toHaveBeenCalled();
    expect(pushLaneBranchMock).not.toHaveBeenCalled();
    expect(createOrUpdateGitHubPullRequestMock).not.toHaveBeenCalled();
    expect(lane?.proposalPath).toBe("openspec/changes/change-1");
    expect(lane?.latestImplementationCommit).toBe("review-commit");
    expect(lane?.pullRequest?.status).toBe("failed");
    expect(lane?.latestActivity).toBe(
      "Final human approval failed before the OpenSpec archive and GitHub PR delivery could complete.",
    );
    expect(lane?.lastError).toContain(
      "Roadmap topic docs/roadmap/vscode-extension/command-palette.md",
    );
    expect(thread?.dispatchAssignments[0]?.status).toBe("failed");
    expect(thread?.run?.status).toBe("failed");
  });

  it("persists archive progress when GitHub PR creation fails after the branch push", async () => {
    archiveOpenSpecChangeInWorktreeMock.mockResolvedValue({
      archivedPath: "openspec/changes/archive/2026-04-11-change-1",
      createdArchive: true,
    });
    commitWorktreeChangesMock.mockResolvedValue(undefined);
    getBranchHeadMock.mockResolvedValue("archive-commit");
    pushLaneBranchMock.mockResolvedValue({
      ...basePushedCommit,
      commitUrl: "https://github.com/example/meow-team/commit/archive-commit",
      commitHash: "archive-commit",
    });
    createOrUpdateGitHubPullRequestMock.mockRejectedValue(new Error("gh auth token missing"));

    await writeThreadStore(createLane());

    await expect(
      approveLanePullRequest({
        threadId: "thread-1",
        assignmentNumber: 1,
        laneId: "lane-1",
      }),
    ).rejects.toThrow("gh auth token missing");

    const thread = await getTeamThreadRecord(threadFile, "thread-1");
    const lane = thread?.dispatchAssignments[0]?.lanes[0];

    expect(lane?.proposalPath).toBe("openspec/changes/archive/2026-04-11-change-1");
    expect(lane?.latestImplementationCommit).toBe("archive-commit");
    expect(lane?.pushedCommit?.commitHash).toBe("archive-commit");
    expect(lane?.pullRequest?.status).toBe("failed");
    expect(lane?.pullRequest?.humanApprovedAt).toBeTruthy();
    expect(lane?.lastError).toContain("gh auth token missing");
    expect(thread?.dispatchAssignments[0]?.status).toBe("failed");
    expect(thread?.run?.status).toBe("failed");
  });

  it("keeps the proposal unarchived when the archive commit fails", async () => {
    archiveOpenSpecChangeInWorktreeMock.mockResolvedValue({
      archivedPath: "openspec/changes/archive/2026-04-11-change-1",
      createdArchive: true,
    });
    commitWorktreeChangesMock.mockRejectedValue(new Error("git user identity missing"));

    await writeThreadStore(createLane());

    await expect(
      approveLanePullRequest({
        threadId: "thread-1",
        assignmentNumber: 1,
        laneId: "lane-1",
      }),
    ).rejects.toThrow("git user identity missing");

    const thread = await getTeamThreadRecord(threadFile, "thread-1");
    const lane = thread?.dispatchAssignments[0]?.lanes[0];

    expect(pushLaneBranchMock).not.toHaveBeenCalled();
    expect(createOrUpdateGitHubPullRequestMock).not.toHaveBeenCalled();
    expect(lane?.proposalPath).toBe("openspec/changes/change-1");
    expect(lane?.latestImplementationCommit).toBe("review-commit");
    expect(lane?.pushedCommit?.commitHash).toBe("review-commit");
    expect(lane?.pullRequest?.status).toBe("failed");
    expect(lane?.pullRequest?.humanApprovedAt).toBeTruthy();
    expect(lane?.latestActivity).toBe(
      "Final human approval failed before the OpenSpec archive and GitHub PR delivery could complete.",
    );
    expect(lane?.lastError).toContain("git user identity missing");
    expect(thread?.dispatchAssignments[0]?.plannerNotes.at(-1)?.message).toBe(
      "Final approval for proposal 1 failed: git user identity missing",
    );
    expect(thread?.dispatchAssignments[0]?.status).toBe("failed");
    expect(thread?.run?.status).toBe("failed");
  });
});
