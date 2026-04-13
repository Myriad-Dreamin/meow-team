import { beforeEach, describe, expect, it, vi } from "vitest";
import { MeowTeamWorkspaceViewProvider } from "./workspace-view-provider";

const vscodeMocks = vi.hoisted(() => {
  return {
    executeCommand: vi.fn(async () => undefined),
    getConfiguration: vi.fn(),
    joinPath: vi.fn((_base: unknown, ...pathSegments: string[]) => {
      return {
        toString: () => `file:///extension/${pathSegments.join("/")}`,
      };
    }),
  };
});

const teamClientMocks = vi.hoisted(() => {
  return {
    approveLane: vi.fn(),
    buildConnectionGuidance: vi.fn((baseUrl: string) => {
      return `Connect to ${baseUrl}`;
    }),
    getThreadDetail: vi.fn(),
    getWorkspace: vi.fn(),
    normalizeBackendBaseUrl: vi.fn((value: string) => {
      return value.trim();
    }),
    runTeam: vi.fn(),
    submitFeedback: vi.fn(),
  };
});

vi.mock("vscode", () => {
  return {
    Uri: {
      joinPath: vscodeMocks.joinPath,
    },
    commands: {
      executeCommand: vscodeMocks.executeCommand,
    },
    workspace: {
      getConfiguration: vscodeMocks.getConfiguration,
    },
  };
});

vi.mock("./team-client", () => {
  class MockTeamApiError extends Error {
    readonly status: number | null;
    readonly guidance: string | null;
    readonly threadId: string | null;
    readonly branches: string[] | null;

    constructor(
      message: string,
      options: {
        status?: number | null;
        guidance?: string | null;
        threadId?: string | null;
        branches?: string[] | null;
      } = {},
    ) {
      super(message);
      this.name = "TeamApiError";
      this.status = options.status ?? null;
      this.guidance = options.guidance ?? null;
      this.threadId = options.threadId ?? null;
      this.branches = options.branches ?? null;
    }
  }

  return {
    TeamApiError: MockTeamApiError,
    ...teamClientMocks,
  };
});

const createContext = () => {
  return {
    extensionUri: {
      toString: () => "file:///extension",
    },
    subscriptions: {
      push: vi.fn(),
    },
  };
};

describe("MeowTeamWorkspaceViewProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vscodeMocks.getConfiguration.mockReturnValue({
      get: vi.fn(() => "http://127.0.0.1:3000"),
    });
    teamClientMocks.runTeam.mockResolvedValue({
      acceptedThreadId: "thread-1",
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
    });
  });

  it("omits blank optional run fields before calling runTeam", async () => {
    const provider = new MeowTeamWorkspaceViewProvider(createContext() as never);
    vi.spyOn(provider, "refresh").mockResolvedValue(undefined);

    await (
      provider as never as { handleWebviewMessage: (message: unknown) => Promise<void> }
    ).handleWebviewMessage({
      type: "run",
      payload: {
        input: "Do the thing",
        title: "",
        threadId: "   ",
        repositoryId: "",
        reset: false,
        deleteExistingBranches: false,
      },
    });

    expect(teamClientMocks.runTeam).toHaveBeenCalledWith(
      "http://127.0.0.1:3000",
      {
        input: "Do the thing",
        reset: false,
        deleteExistingBranches: false,
      },
      expect.any(Function),
    );
  });
});
