import { describe, expect, it } from "vitest";
import {
  buildActiveLivingThreadShortcutTargets,
  parseTeamWorkspaceShortcutAction,
  resolveTeamWorkspaceShortcutTarget,
} from "@/components/team-workspace-shortcuts";
import { buildThreadRepositoryGroups } from "@/components/team-workspace-sidebar";
import type { TeamRepositoryOption } from "@/lib/git/repository";
import type { TeamThreadSummary } from "@/lib/team/history";

const FIXED_TIMESTAMP = "2026-04-18T10:05:00.000Z";

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
  latestBranchPrefix: "requests/thread-shortcuts",
  latestCanonicalBranchName: "requests/thread-shortcuts/a1-proposal-1",
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

type ShortcutTargetLike = {
  getAttribute?: (name: string) => string | null;
  isContentEditable?: boolean;
  parentElement?: ShortcutTargetLike | null;
  tagName?: string;
};

const createShortcutTarget = ({
  contentEditable = null,
  isContentEditable = false,
  parentElement = null,
  tagName,
}: {
  contentEditable?: string | null;
  isContentEditable?: boolean;
  parentElement?: ShortcutTargetLike | null;
  tagName?: string;
}): ShortcutTargetLike => ({
  getAttribute: (name: string) => (name === "contenteditable" ? contentEditable : null),
  isContentEditable,
  parentElement,
  tagName,
});

const createShortcutEvent = ({
  altKey = true,
  ctrlKey = false,
  key,
  metaKey = false,
  shiftKey = false,
  target = null,
}: {
  altKey?: boolean;
  ctrlKey?: boolean;
  key: string;
  metaKey?: boolean;
  shiftKey?: boolean;
  target?: ShortcutTargetLike | null;
}) => ({
  altKey,
  ctrlKey,
  key,
  metaKey,
  shiftKey,
  target: target as EventTarget | null,
});

describe("parseTeamWorkspaceShortcutAction", () => {
  it("parses Alt+N and Alt+1 through Alt+9 into workspace actions", () => {
    expect(parseTeamWorkspaceShortcutAction(createShortcutEvent({ key: "N" }))).toEqual({
      type: "select-run-tab",
    });
    expect(parseTeamWorkspaceShortcutAction(createShortcutEvent({ key: "5" }))).toEqual({
      type: "select-thread-index",
      index: 5,
    });
  });

  it("ignores editable targets and unsupported modifier combinations", () => {
    expect(
      parseTeamWorkspaceShortcutAction(
        createShortcutEvent({
          key: "1",
          target: createShortcutTarget({
            tagName: "input",
          }),
        }),
      ),
    ).toBeNull();
    expect(
      parseTeamWorkspaceShortcutAction(
        createShortcutEvent({
          key: "n",
          target: createShortcutTarget({
            parentElement: createShortcutTarget({
              contentEditable: "",
            }),
          }),
        }),
      ),
    ).toBeNull();
    expect(
      parseTeamWorkspaceShortcutAction(
        createShortcutEvent({
          ctrlKey: true,
          key: "2",
        }),
      ),
    ).toBeNull();
  });
});

describe("buildActiveLivingThreadShortcutTargets", () => {
  it("flattens the sidebar order and skips terminal living threads", () => {
    const betaRepo = createRepository({
      id: "repo-beta",
      name: "Beta Repo",
      path: "/tmp/workspace/beta",
      relativePath: "beta",
    });

    const groups = buildThreadRepositoryGroups([
      createThread({
        threadId: "thread-beta-0001",
        requestTitle: "Zeta task",
        repository: betaRepo,
      }),
      createThread({
        threadId: "thread-alpha-0002",
        requestTitle: "Bravo task",
      }),
      createThread({
        threadId: "thread-alpha-0001",
        requestTitle: "Alpha task",
      }),
      createThread({
        threadId: "thread-alpha-0003",
        requestTitle: "Alpha task complete",
        status: "approved",
      }),
      createThread({
        threadId: "thread-none-0001",
        requestTitle: "No repo task",
        repository: null,
        status: "planning",
      }),
    ]);

    expect(buildActiveLivingThreadShortcutTargets(groups).map((thread) => thread.threadId)).toEqual(
      ["thread-alpha-0001", "thread-alpha-0002", "thread-beta-0001", "thread-none-0001"],
    );
  });
});

describe("resolveTeamWorkspaceShortcutTarget", () => {
  const livingThreadGroups = buildThreadRepositoryGroups([
    createThread({
      threadId: "thread-alpha-0001",
      requestTitle: "Alpha task",
    }),
    createThread({
      threadId: "thread-beta-0001",
      requestTitle: "Beta task",
      repository: createRepository({
        id: "repo-beta",
        name: "Beta Repo",
        path: "/tmp/workspace/beta",
        relativePath: "beta",
      }),
    }),
  ]);

  it("returns the run surface for Alt+N from a thread detail tab", () => {
    expect(
      resolveTeamWorkspaceShortcutTarget({
        event: createShortcutEvent({ key: "n" }),
        livingThreadGroups,
        selectedTabType: "thread",
      }),
    ).toEqual({
      type: "run",
    });
  });

  it("maps numeric shortcuts onto the active living-thread order", () => {
    expect(
      resolveTeamWorkspaceShortcutTarget({
        event: createShortcutEvent({ key: "2" }),
        livingThreadGroups,
        selectedTabType: "thread",
      }),
    ).toEqual({
      type: "thread",
      threadId: "thread-beta-0001",
    });
  });

  it("ignores shortcuts outside thread detail tabs", () => {
    expect(
      resolveTeamWorkspaceShortcutTarget({
        event: createShortcutEvent({ key: "1" }),
        livingThreadGroups,
        selectedTabType: "run",
      }),
    ).toBeNull();
    expect(
      resolveTeamWorkspaceShortcutTarget({
        event: createShortcutEvent({ key: "1" }),
        livingThreadGroups,
        selectedTabType: "settings",
      }),
    ).toBeNull();
  });

  it("returns null when a numeric shortcut has no active living thread target", () => {
    expect(
      resolveTeamWorkspaceShortcutTarget({
        event: createShortcutEvent({ key: "9" }),
        livingThreadGroups,
        selectedTabType: "thread",
      }),
    ).toBeNull();
  });
});
