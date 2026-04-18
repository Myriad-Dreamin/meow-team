import { describe, expect, it } from "vitest";
import {
  buildThreadRepositoryGroups,
  formatThreadSidebarMetadata,
} from "@/components/team-workspace-sidebar";
import { formatTimestamp } from "@/components/thread-view-utils";
import type { TeamRepositoryOption } from "@/lib/git/repository";
import type { TeamThreadSummary } from "@/lib/team/history";

const FIXED_TIMESTAMP = "2026-04-11T10:05:00.000Z";

const createRepository = (overrides: Partial<TeamRepositoryOption> = {}): TeamRepositoryOption => ({
  id: "repo-alpha",
  name: "Alpha Repo",
  rootId: "workspace",
  rootLabel: "Workspace",
  path: "/tmp/workspace/alpha",
  relativePath: "alpha",
  ...overrides,
});

const createThread = (overrides: Partial<TeamThreadSummary> = {}): TeamThreadSummary => ({
  threadId: "1234567890abcdef",
  assignmentNumber: 1,
  status: "running",
  archivedAt: null,
  requestTitle: "Alpha Thread",
  requestText: "Ship the alpha thread.",
  latestInput: "Ship the alpha thread.",
  repository: createRepository(),
  workflow: ["planner", "coder", "reviewer"],
  latestRoleId: "coder",
  latestRoleName: "Coder",
  nextRoleId: "reviewer",
  latestDecision: "continue",
  handoffCount: 1,
  stepCount: 1,
  userMessageCount: 1,
  startedAt: FIXED_TIMESTAMP,
  finishedAt: null,
  updatedAt: FIXED_TIMESTAMP,
  lastError: null,
  latestAssignmentStatus: "running",
  latestPlanSummary: "Implementing the approved change.",
  latestBranchPrefix: "requests/sidebar-threads",
  latestCanonicalBranchName: "requests/sidebar-threads/a1-proposal-1",
  dispatchWorkerCount: 1,
  workerCounts: {
    idle: 0,
    queued: 0,
    coding: 1,
    reviewing: 0,
    awaitingHumanApproval: 0,
    approved: 0,
    failed: 0,
  },
  workerLanes: [],
  plannerNotes: [],
  humanFeedback: [],
  ...overrides,
});

describe("buildThreadRepositoryGroups", () => {
  it("sorts repository groups alphabetically, uses stable tie-breakers, and keeps No Repository last", () => {
    const alphaRepo = createRepository({
      id: "repo-alpha",
      name: "Alpha Repo",
      relativePath: "alpha",
    });
    const alphaMirrorRepo = createRepository({
      id: "repo-alpha-mirror",
      name: "Alpha Repo",
      rootId: "archive",
      rootLabel: "Archive",
      path: "/tmp/archive/alpha",
      relativePath: "archived/alpha",
    });
    const betaRepo = createRepository({
      id: "repo-beta",
      name: "Beta Repo",
      path: "/tmp/workspace/beta",
      relativePath: "beta",
    });

    const groups = buildThreadRepositoryGroups([
      createThread({
        threadId: "thread-zeta-0001",
        requestTitle: "zeta cleanup",
        repository: betaRepo,
      }),
      createThread({
        threadId: "thread-alpha-0002",
        requestTitle: "Alpha launch",
        repository: alphaRepo,
      }),
      createThread({
        threadId: "thread-alpha-0001",
        requestTitle: "alpha launch",
        repository: alphaRepo,
      }),
      createThread({
        threadId: "thread-mirror-0001",
        requestTitle: "Mirror sync",
        repository: alphaMirrorRepo,
      }),
      createThread({
        threadId: "thread-none-0001",
        requestTitle: "No repo task",
        repository: null,
      }),
    ]);

    expect(groups.map((group) => group.key)).toEqual([
      "repo-alpha-mirror",
      "repo-alpha",
      "repo-beta",
      "__no_repository__",
    ]);
    expect(groups.at(-1)).toMatchObject({
      title: "No Repository",
      description: "Threads without a selected repository",
    });
    expect(groups[1]?.threads.map((thread) => thread.threadId)).toEqual([
      "thread-alpha-0001",
      "thread-alpha-0002",
    ]);
  });
});

describe("formatThreadSidebarMetadata", () => {
  it("formats the sidebar status and updated lines with the shared thread helpers", () => {
    expect(
      formatThreadSidebarMetadata(
        createThread({
          threadId: "abcdef1234567890",
          status: "awaiting_human_approval",
          updatedAt: FIXED_TIMESTAMP,
        }),
      ),
    ).toEqual({
      statusClassName: "status-awaiting_human_approval",
      statusLabel: "Awaiting Proposal Approval",
      threadLine: "Thread abcdef12",
      updatedLine: `Updated ${formatTimestamp(FIXED_TIMESTAMP)}`,
    });
  });

  it("switches the last metadata line to Archived once a thread is archived", () => {
    expect(
      formatThreadSidebarMetadata(
        createThread({
          archivedAt: FIXED_TIMESTAMP,
          updatedAt: "2026-04-12T11:00:00.000Z",
        }),
      ),
    ).toEqual({
      statusClassName: "status-running",
      statusLabel: "Coding / Reviewing",
      threadLine: "Thread 12345678",
      updatedLine: `Archived ${formatTimestamp(FIXED_TIMESTAMP)}`,
    });
  });

  it("renders cancelled thread summaries with the shared terminal label", () => {
    expect(
      formatThreadSidebarMetadata(
        createThread({
          status: "cancelled",
          latestAssignmentStatus: "cancelled",
          updatedAt: FIXED_TIMESTAMP,
        }),
      ),
    ).toEqual({
      statusClassName: "status-cancelled",
      statusLabel: "Cancelled",
      threadLine: "Thread 12345678",
      updatedLine: `Updated ${formatTimestamp(FIXED_TIMESTAMP)}`,
    });
  });
});
