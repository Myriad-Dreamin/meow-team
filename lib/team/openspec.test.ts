import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createWorktree } from "@/lib/team/coding/worktree";
import type {
  OpenSpecMaterializerInput,
  OpenSpecMaterializerOutput,
} from "@/lib/team/roles/openspec-materializer";
import { buildExpectedOpenSpecArtifactPaths } from "@/lib/team/roles/openspec-materializer";

const {
  commitContainsPathMock,
  commitWorktreeChangesMock,
  ensureBranchRefMock,
  ensureLaneWorktreeMock,
  getBranchHeadMock,
  getSymbolicHeadReferenceMock,
  hasWorktreeChangesMock,
  listCommittedPathsBetweenRevisionsMock,
  listTrackedPathsMock,
  listWorktreeChangesMock,
  runOpenSpecMock,
} = vi.hoisted(() => ({
  commitContainsPathMock: vi.fn(),
  commitWorktreeChangesMock: vi.fn(),
  ensureBranchRefMock: vi.fn(),
  ensureLaneWorktreeMock: vi.fn(),
  getBranchHeadMock: vi.fn(),
  getSymbolicHeadReferenceMock: vi.fn(),
  hasWorktreeChangesMock: vi.fn(),
  listCommittedPathsBetweenRevisionsMock: vi.fn(),
  listTrackedPathsMock: vi.fn(),
  listWorktreeChangesMock: vi.fn(),
  runOpenSpecMock: vi.fn(),
}));

vi.mock("@/lib/cli-tools/openspec", () => ({
  runOpenSpec: runOpenSpecMock,
}));

vi.mock("@/lib/git/ops", () => ({
  commitContainsPath: commitContainsPathMock,
  commitWorktreeChanges: commitWorktreeChangesMock,
  ensureBranchRef: ensureBranchRefMock,
  getBranchHead: getBranchHeadMock,
  getSymbolicHeadReference: getSymbolicHeadReferenceMock,
  hasWorktreeChanges: hasWorktreeChangesMock,
  listCommittedPathsBetweenRevisions: listCommittedPathsBetweenRevisionsMock,
  listTrackedPaths: listTrackedPathsMock,
  listWorktreeChanges: listWorktreeChangesMock,
}));

vi.mock("@/lib/team/git", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/team/git")>();
  return {
    ...actual,
    ensureLaneWorktree: ensureLaneWorktreeMock,
  };
});

import { materializeAssignmentProposals } from "@/lib/team/openspec";

const temporaryDirectories = new Set<string>();

const createTemporaryDirectory = async (): Promise<string> => {
  const directoryPath = await fs.mkdtemp(path.join(os.tmpdir(), "team-openspec-test-"));
  temporaryDirectories.add(directoryPath);
  return directoryPath;
};

const writeArtifact = async ({
  worktreePath,
  relativePath,
  content = "# Artifact\n",
}: {
  worktreePath: string;
  relativePath: string;
  content?: string;
}): Promise<void> => {
  const absolutePath = path.join(worktreePath, relativePath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, content, "utf8");
};

const seedOpenSpecChange = async ({
  worktreePath,
  proposalChangeName,
}: {
  worktreePath: string;
  proposalChangeName: string;
}): Promise<void> => {
  await writeArtifact({
    worktreePath,
    relativePath: `openspec/changes/${proposalChangeName}/.openspec.yaml`,
    content: "schema: spec-driven\n",
  });
};

const writeExpectedProposalArtifacts = async ({
  worktreePath,
  proposalChangeName,
  proposalPath,
  contentByPath = {},
}: {
  worktreePath: string;
  proposalChangeName: string;
  proposalPath: string;
  contentByPath?: Record<string, string>;
}): Promise<string[]> => {
  await seedOpenSpecChange({
    worktreePath,
    proposalChangeName,
  });

  const artifactPaths = buildExpectedOpenSpecArtifactPaths({
    proposalChangeName,
    proposalPath,
  });

  await Promise.all(
    artifactPaths.map((artifactPath) =>
      writeArtifact({
        worktreePath,
        relativePath: artifactPath,
        content: contentByPath[artifactPath] ?? "# Artifact\n",
      }),
    ),
  );

  return artifactPaths;
};

afterEach(async () => {
  await Promise.all(
    [...temporaryDirectories].map(async (directoryPath) => {
      await fs.rm(directoryPath, {
        recursive: true,
        force: true,
      });
    }),
  );
  temporaryDirectories.clear();
});

describe("materializeAssignmentProposals", () => {
  beforeEach(() => {
    commitContainsPathMock.mockReset();
    commitContainsPathMock.mockResolvedValue(true);
    commitWorktreeChangesMock.mockReset();
    commitWorktreeChangesMock.mockResolvedValue(undefined);
    ensureBranchRefMock.mockReset();
    ensureBranchRefMock.mockResolvedValue(undefined);
    ensureLaneWorktreeMock.mockReset();
    ensureLaneWorktreeMock.mockResolvedValue(undefined);
    getBranchHeadMock.mockReset();
    getBranchHeadMock.mockResolvedValue("planner-head-commit");
    getSymbolicHeadReferenceMock.mockReset();
    getSymbolicHeadReferenceMock.mockResolvedValue("requests/example/thread-1/a1");
    hasWorktreeChangesMock.mockReset();
    hasWorktreeChangesMock.mockResolvedValue(false);
    listCommittedPathsBetweenRevisionsMock.mockReset();
    listCommittedPathsBetweenRevisionsMock.mockResolvedValue([]);
    listTrackedPathsMock.mockReset();
    listTrackedPathsMock.mockResolvedValue([]);
    listWorktreeChangesMock.mockReset();
    listWorktreeChangesMock.mockResolvedValue([]);
    runOpenSpecMock.mockReset();
    runOpenSpecMock.mockImplementation(async (worktreePath: string, args: string[]) => {
      const proposalChangeName = args.at(-1);
      if (!proposalChangeName) {
        throw new Error("Expected change name.");
      }

      await seedOpenSpecChange({
        worktreePath,
        proposalChangeName,
      });

      return {
        stdout: "",
        stderr: "",
      };
    });
  });

  it("invokes the dedicated materializer agent and preserves the existing commit and branch flow", async () => {
    const repositoryPath = await createTemporaryDirectory();
    const worktreeRoot = path.join(repositoryPath, "worktrees");
    const plannerWorktreePath = path.join(worktreeRoot, "meow-1");
    const proposalChangeName =
      "openspec-agent-a1-p1-agent-backed-openspec-proposal-materialization";
    const proposalPath = `openspec/changes/${proposalChangeName}`;

    hasWorktreeChangesMock.mockResolvedValue(true);
    listWorktreeChangesMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        `${proposalPath}/.openspec.yaml`,
        `${proposalPath}/design.md`,
        `${proposalPath}/proposal.md`,
        `${proposalPath}/specs/${proposalChangeName}/spec.md`,
        `${proposalPath}/tasks.md`,
      ]);

    const openSpecMaterializerAgent: {
      run: (input: OpenSpecMaterializerInput) => Promise<OpenSpecMaterializerOutput>;
    } = {
      run: vi.fn(async (input: OpenSpecMaterializerInput) => {
        expect(input.worktree).toEqual(
          createWorktree({
            path: plannerWorktreePath,
            rootPath: worktreeRoot,
          }),
        );
        expect(input.state).toMatchObject({
          repositoryPath,
          canonicalBranchName: "requests/openspec-agent/thread-1/a1",
          proposalBranchName: "requests/openspec-agent/thread-1/a1-proposal-1",
          proposalChangeName,
          proposalPath,
          requestTitle: "feat(oht/workflow): Agent-backed OpenSpec proposal materialization",
          taskTitle: "Agent-backed OpenSpec proposal materialization",
          taskObjective:
            "Replace hardcoded proposal markdown generation with an agent-backed materializer.",
        });

        await seedOpenSpecChange({
          worktreePath: plannerWorktreePath,
          proposalChangeName,
        });
        await writeArtifact({
          worktreePath: plannerWorktreePath,
          relativePath: `${proposalPath}/proposal.md`,
        });
        await writeArtifact({
          worktreePath: plannerWorktreePath,
          relativePath: `${proposalPath}/design.md`,
        });
        await writeArtifact({
          worktreePath: plannerWorktreePath,
          relativePath: `${proposalPath}/tasks.md`,
        });
        await writeArtifact({
          worktreePath: plannerWorktreePath,
          relativePath: `${proposalPath}/specs/${proposalChangeName}/spec.md`,
        });

        return {
          summary: "Materialized the OpenSpec proposal artifacts.",
          deliverable: "Wrote the proposal, design, tasks, and spec files.",
          artifactsCreated: [
            `${proposalPath}/proposal.md`,
            `${proposalPath}/design.md`,
            `${proposalPath}/tasks.md`,
            `${proposalPath}/specs/${proposalChangeName}/spec.md`,
          ],
        };
      }),
    };

    const lanes: Parameters<typeof materializeAssignmentProposals>[0]["lanes"] = [
      {
        laneIndex: 1,
        taskTitle: "Agent-backed OpenSpec proposal materialization",
        taskObjective:
          "Replace hardcoded proposal markdown generation with an agent-backed materializer.",
        proposalChangeName,
        proposalPath,
        branchName: "requests/openspec-agent/thread-1/a1-proposal-1",
      },
    ];

    await materializeAssignmentProposals({
      repositoryPath,
      baseBranch: "main",
      canonicalBranchName: "requests/openspec-agent/thread-1/a1",
      requestTitle: "feat(oht/workflow): Agent-backed OpenSpec proposal materialization",
      conventionalTitle: {
        type: "feat",
        scope: "oht/workflow",
      },
      plannerSummary: "Replace the inline markdown builders with an OpenSpec materializer agent.",
      plannerDeliverable: "Proposal 1 is the preferred path.",
      requestInput:
        "Replace hardcoded markdown generation in lib/team/openspec.ts with a dedicated agent.",
      worktreeRoot,
      plannerWorktreePath,
      lanes,
      openSpecMaterializerAgent,
    });

    expect(ensureLaneWorktreeMock).toHaveBeenCalledWith({
      repositoryPath,
      worktreeRoot,
      worktreePath: plannerWorktreePath,
      branchName: "requests/openspec-agent/thread-1/a1",
      startPoint: "main",
    });
    expect(runOpenSpecMock).toHaveBeenCalledWith(plannerWorktreePath, [
      "new",
      "change",
      proposalChangeName,
    ]);
    expect(openSpecMaterializerAgent.run).toHaveBeenCalledTimes(1);
    expect(commitWorktreeChangesMock).toHaveBeenCalledWith({
      worktreePath: plannerWorktreePath,
      message: "docs: add openspec proposals for requests/openspec-agent/thread-1/a1",
      pathspecs: [proposalPath],
    });
    expect(ensureBranchRefMock).toHaveBeenCalledWith({
      repositoryPath,
      branchName: "requests/openspec-agent/thread-1/a1-proposal-1",
      startPoint: "planner-head-commit",
      forceUpdate: true,
    });
    expect(lanes[0]?.proposalCommitHash).toBe("planner-head-commit");
  });

  it("fails when the materializer does not leave the required proposal artifacts on disk", async () => {
    const repositoryPath = await createTemporaryDirectory();
    const worktreeRoot = path.join(repositoryPath, "worktrees");
    const plannerWorktreePath = path.join(worktreeRoot, "meow-1");
    const proposalChangeName = "change-1";
    const proposalPath = "openspec/changes/change-1";

    const openSpecMaterializerAgent: {
      run: (input: OpenSpecMaterializerInput) => Promise<OpenSpecMaterializerOutput>;
    } = {
      run: vi.fn(async () => {
        await seedOpenSpecChange({
          worktreePath: plannerWorktreePath,
          proposalChangeName,
        });
        await writeArtifact({
          worktreePath: plannerWorktreePath,
          relativePath: `${proposalPath}/proposal.md`,
        });

        return {
          summary: "Materialized part of the change.",
          deliverable: "Wrote only the proposal artifact.",
          artifactsCreated: [`${proposalPath}/proposal.md`],
        };
      }),
    };

    await expect(
      materializeAssignmentProposals({
        repositoryPath,
        baseBranch: "main",
        canonicalBranchName: "requests/example/thread-1/a1",
        requestTitle: "feat(dispatch): Materialize proposal artifacts",
        conventionalTitle: {
          type: "feat",
          scope: "dispatch",
        },
        plannerSummary: "Planner summary",
        plannerDeliverable: "Planner deliverable",
        requestInput: "Materialize proposal artifacts through the agent.",
        worktreeRoot,
        plannerWorktreePath,
        lanes: [
          {
            laneIndex: 1,
            taskTitle: "Materialize proposal artifacts",
            taskObjective: "Write the proposal files from the agent.",
            proposalChangeName,
            proposalPath,
            branchName: "requests/example/thread-1/a1-proposal-1",
          },
        ],
        openSpecMaterializerAgent,
      }),
    ).rejects.toThrow("OpenSpec materializer did not produce the expected artifacts for change-1");

    expect(commitWorktreeChangesMock).not.toHaveBeenCalled();
    expect(ensureBranchRefMock).not.toHaveBeenCalled();
  });

  it("allows untracked planner residue outside the proposal path", async () => {
    const repositoryPath = await createTemporaryDirectory();
    const worktreeRoot = path.join(repositoryPath, "worktrees");
    const plannerWorktreePath = path.join(worktreeRoot, "meow-1");
    const proposalChangeName = "change-1";
    const proposalPath = "openspec/changes/change-1";

    hasWorktreeChangesMock.mockResolvedValue(true);
    listWorktreeChangesMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        `${proposalPath}/.openspec.yaml`,
        `${proposalPath}/design.md`,
        `${proposalPath}/proposal.md`,
        `${proposalPath}/specs/${proposalChangeName}/spec.md`,
        `${proposalPath}/tasks.md`,
        ".codex/materializer/session.json",
      ]);

    const openSpecMaterializerAgent: {
      run: (input: OpenSpecMaterializerInput) => Promise<OpenSpecMaterializerOutput>;
    } = {
      run: vi.fn(async () => {
        const artifactsCreated = await writeExpectedProposalArtifacts({
          worktreePath: plannerWorktreePath,
          proposalChangeName,
          proposalPath,
        });

        await writeArtifact({
          worktreePath: plannerWorktreePath,
          relativePath: ".codex/materializer/session.json",
          content: '{"status":"ignored"}\n',
        });

        return {
          summary: "Materialized the OpenSpec proposal artifacts.",
          deliverable: "Wrote the expected artifacts and left untracked planner residue behind.",
          artifactsCreated,
        };
      }),
    };

    const lanes: Parameters<typeof materializeAssignmentProposals>[0]["lanes"] = [
      {
        laneIndex: 1,
        taskTitle: "Materialize proposal artifacts",
        taskObjective: "Write the proposal files from the agent.",
        proposalChangeName,
        proposalPath,
        branchName: "requests/example/thread-1/a1-proposal-1",
      },
    ];

    await materializeAssignmentProposals({
      repositoryPath,
      baseBranch: "main",
      canonicalBranchName: "requests/example/thread-1/a1",
      requestTitle: "feat(dispatch): Materialize proposal artifacts",
      conventionalTitle: {
        type: "feat",
        scope: "dispatch",
      },
      plannerSummary: "Planner summary",
      plannerDeliverable: "Planner deliverable",
      requestInput: "Materialize proposal artifacts through the agent.",
      worktreeRoot,
      plannerWorktreePath,
      lanes,
      openSpecMaterializerAgent,
    });

    expect(commitWorktreeChangesMock).toHaveBeenCalledWith({
      worktreePath: plannerWorktreePath,
      message: "docs: add openspec proposals for requests/example/thread-1/a1",
      pathspecs: [proposalPath],
    });
    expect(ensureBranchRefMock).toHaveBeenCalledWith({
      repositoryPath,
      branchName: "requests/example/thread-1/a1-proposal-1",
      startPoint: "planner-head-commit",
      forceUpdate: true,
    });
    expect(lanes[0]?.proposalCommitHash).toBe("planner-head-commit");
  });

  it("fails when tracked planner residue is outside the proposal path", async () => {
    const repositoryPath = await createTemporaryDirectory();
    const worktreeRoot = path.join(repositoryPath, "worktrees");
    const plannerWorktreePath = path.join(worktreeRoot, "meow-1");
    const proposalChangeName = "change-1";
    const proposalPath = "openspec/changes/change-1";
    const trackedOutsidePath = ".codex/materializer/session.json";

    hasWorktreeChangesMock.mockResolvedValue(true);
    listTrackedPathsMock.mockResolvedValue([trackedOutsidePath]);
    listWorktreeChangesMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        `${proposalPath}/.openspec.yaml`,
        `${proposalPath}/design.md`,
        `${proposalPath}/proposal.md`,
        `${proposalPath}/specs/${proposalChangeName}/spec.md`,
        `${proposalPath}/tasks.md`,
        trackedOutsidePath,
      ]);

    const openSpecMaterializerAgent: {
      run: (input: OpenSpecMaterializerInput) => Promise<OpenSpecMaterializerOutput>;
    } = {
      run: vi.fn(async () => {
        const artifactsCreated = await writeExpectedProposalArtifacts({
          worktreePath: plannerWorktreePath,
          proposalChangeName,
          proposalPath,
        });

        await writeArtifact({
          worktreePath: plannerWorktreePath,
          relativePath: trackedOutsidePath,
          content: '{"status":"tracked"}\n',
        });

        return {
          summary: "Materialized the OpenSpec proposal artifacts.",
          deliverable: "Wrote the expected artifacts and a tracked planner path.",
          artifactsCreated,
        };
      }),
    };

    const lanes: Parameters<typeof materializeAssignmentProposals>[0]["lanes"] = [
      {
        laneIndex: 1,
        taskTitle: "Materialize proposal artifacts",
        taskObjective: "Write the proposal files from the agent.",
        proposalChangeName,
        proposalPath,
        branchName: "requests/example/thread-1/a1-proposal-1",
      },
    ];

    await expect(
      materializeAssignmentProposals({
        repositoryPath,
        baseBranch: "main",
        canonicalBranchName: "requests/example/thread-1/a1",
        requestTitle: "feat(dispatch): Materialize proposal artifacts",
        conventionalTitle: {
          type: "feat",
          scope: "dispatch",
        },
        plannerSummary: "Planner summary",
        plannerDeliverable: "Planner deliverable",
        requestInput: "Materialize proposal artifacts through the agent.",
        worktreeRoot,
        plannerWorktreePath,
        lanes,
        openSpecMaterializerAgent,
      }),
    ).rejects.toThrow(
      "OpenSpec materializer changed planner worktree paths outside change-1: .codex/materializer/session.json.",
    );

    expect(commitWorktreeChangesMock).not.toHaveBeenCalled();
    expect(ensureBranchRefMock).not.toHaveBeenCalled();
  });

  it("fails when committed planner changes land outside the proposal path", async () => {
    const repositoryPath = await createTemporaryDirectory();
    const worktreeRoot = path.join(repositoryPath, "worktrees");
    const plannerWorktreePath = path.join(worktreeRoot, "meow-1");
    const proposalChangeName = "change-1";
    const proposalPath = "openspec/changes/change-1";
    const committedOutsidePath = "README.md";

    hasWorktreeChangesMock.mockResolvedValue(true);
    listCommittedPathsBetweenRevisionsMock.mockResolvedValue([committedOutsidePath]);
    listWorktreeChangesMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        `${proposalPath}/.openspec.yaml`,
        `${proposalPath}/design.md`,
        `${proposalPath}/proposal.md`,
        `${proposalPath}/specs/${proposalChangeName}/spec.md`,
        `${proposalPath}/tasks.md`,
      ]);

    const openSpecMaterializerAgent: {
      run: (input: OpenSpecMaterializerInput) => Promise<OpenSpecMaterializerOutput>;
    } = {
      run: vi.fn(async () => {
        const artifactsCreated = await writeExpectedProposalArtifacts({
          worktreePath: plannerWorktreePath,
          proposalChangeName,
          proposalPath,
        });

        return {
          summary: "Materialized the OpenSpec proposal artifacts.",
          deliverable: "Wrote the expected artifacts before an unrelated committed README update.",
          artifactsCreated,
        };
      }),
    };

    await expect(
      materializeAssignmentProposals({
        repositoryPath,
        baseBranch: "main",
        canonicalBranchName: "requests/example/thread-1/a1",
        requestTitle: "feat(dispatch): Materialize proposal artifacts",
        conventionalTitle: {
          type: "feat",
          scope: "dispatch",
        },
        plannerSummary: "Planner summary",
        plannerDeliverable: "Planner deliverable",
        requestInput: "Materialize proposal artifacts through the agent.",
        worktreeRoot,
        plannerWorktreePath,
        lanes: [
          {
            laneIndex: 1,
            taskTitle: "Materialize proposal artifacts",
            taskObjective: "Write the proposal files from the agent.",
            proposalChangeName,
            proposalPath,
            branchName: "requests/example/thread-1/a1-proposal-1",
          },
        ],
        openSpecMaterializerAgent,
      }),
    ).rejects.toThrow(
      "OpenSpec materializer changed planner worktree paths outside change-1: README.md.",
    );

    expect(commitWorktreeChangesMock).not.toHaveBeenCalled();
    expect(ensureBranchRefMock).not.toHaveBeenCalled();
  });

  it("fails when a later materializer run removes artifacts from an earlier proposal", async () => {
    const repositoryPath = await createTemporaryDirectory();
    const worktreeRoot = path.join(repositoryPath, "worktrees");
    const plannerWorktreePath = path.join(worktreeRoot, "meow-1");
    const firstProposalChangeName = "change-1";
    const firstProposalPath = "openspec/changes/change-1";
    const secondProposalChangeName = "change-2";
    const secondProposalPath = "openspec/changes/change-2";
    const firstProposalChangedPaths = [
      `${firstProposalPath}/.openspec.yaml`,
      ...buildExpectedOpenSpecArtifactPaths({
        proposalChangeName: firstProposalChangeName,
        proposalPath: firstProposalPath,
      }),
    ];
    const secondProposalChangedPaths = [
      `${secondProposalPath}/.openspec.yaml`,
      ...buildExpectedOpenSpecArtifactPaths({
        proposalChangeName: secondProposalChangeName,
        proposalPath: secondProposalPath,
      }),
    ];

    listWorktreeChangesMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(firstProposalChangedPaths)
      .mockResolvedValueOnce(firstProposalChangedPaths)
      .mockResolvedValueOnce(
        [
          ...firstProposalChangedPaths.filter(
            (changedPath) => changedPath !== `${firstProposalPath}/proposal.md`,
          ),
          ...secondProposalChangedPaths,
        ].sort(),
      );

    const openSpecMaterializerAgent: {
      run: (input: OpenSpecMaterializerInput) => Promise<OpenSpecMaterializerOutput>;
    } = {
      run: vi.fn(async (input: OpenSpecMaterializerInput) => {
        if (input.state.proposalChangeName === firstProposalChangeName) {
          return {
            summary: "Materialized the first proposal.",
            deliverable: "Wrote the first proposal artifacts.",
            artifactsCreated: await writeExpectedProposalArtifacts({
              worktreePath: plannerWorktreePath,
              proposalChangeName: firstProposalChangeName,
              proposalPath: firstProposalPath,
            }),
          };
        }

        const artifactsCreated = await writeExpectedProposalArtifacts({
          worktreePath: plannerWorktreePath,
          proposalChangeName: secondProposalChangeName,
          proposalPath: secondProposalPath,
        });
        await fs.rm(path.join(plannerWorktreePath, firstProposalPath, "proposal.md"));

        return {
          summary: "Materialized the second proposal.",
          deliverable: "Wrote the second proposal artifacts and removed the first proposal file.",
          artifactsCreated,
        };
      }),
    };

    await expect(
      materializeAssignmentProposals({
        repositoryPath,
        baseBranch: "main",
        canonicalBranchName: "requests/example/thread-1/a1",
        requestTitle: "feat(dispatch): Materialize proposal artifacts",
        conventionalTitle: {
          type: "feat",
          scope: "dispatch",
        },
        plannerSummary: "Planner summary",
        plannerDeliverable: "Planner deliverable",
        requestInput: "Materialize proposal artifacts through the agent.",
        worktreeRoot,
        plannerWorktreePath,
        lanes: [
          {
            laneIndex: 1,
            taskTitle: "Materialize proposal artifacts",
            taskObjective: "Write the first proposal files from the agent.",
            proposalChangeName: firstProposalChangeName,
            proposalPath: firstProposalPath,
            branchName: "requests/example/thread-1/a1-proposal-1",
          },
          {
            laneIndex: 2,
            taskTitle: "Materialize proposal artifacts",
            taskObjective: "Write the second proposal files from the agent.",
            proposalChangeName: secondProposalChangeName,
            proposalPath: secondProposalPath,
            branchName: "requests/example/thread-1/a1-proposal-2",
          },
        ],
        openSpecMaterializerAgent,
      }),
    ).rejects.toThrow(
      `OpenSpec materializer modified previously materialized planner artifacts while processing ${secondProposalChangeName}: ${firstProposalPath}/proposal.md.`,
    );

    expect(commitWorktreeChangesMock).not.toHaveBeenCalled();
    expect(ensureBranchRefMock).not.toHaveBeenCalled();
  });

  it("fails when a later materializer run rewrites artifacts from an earlier proposal", async () => {
    const repositoryPath = await createTemporaryDirectory();
    const worktreeRoot = path.join(repositoryPath, "worktrees");
    const plannerWorktreePath = path.join(worktreeRoot, "meow-1");
    const firstProposalChangeName = "change-1";
    const firstProposalPath = "openspec/changes/change-1";
    const secondProposalChangeName = "change-2";
    const secondProposalPath = "openspec/changes/change-2";
    const firstProposalChangedPaths = [
      `${firstProposalPath}/.openspec.yaml`,
      ...buildExpectedOpenSpecArtifactPaths({
        proposalChangeName: firstProposalChangeName,
        proposalPath: firstProposalPath,
      }),
    ];
    const secondProposalChangedPaths = [
      `${secondProposalPath}/.openspec.yaml`,
      ...buildExpectedOpenSpecArtifactPaths({
        proposalChangeName: secondProposalChangeName,
        proposalPath: secondProposalPath,
      }),
    ];

    listWorktreeChangesMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(firstProposalChangedPaths)
      .mockResolvedValueOnce(firstProposalChangedPaths)
      .mockResolvedValueOnce([...firstProposalChangedPaths, ...secondProposalChangedPaths].sort());

    const openSpecMaterializerAgent: {
      run: (input: OpenSpecMaterializerInput) => Promise<OpenSpecMaterializerOutput>;
    } = {
      run: vi.fn(async (input: OpenSpecMaterializerInput) => {
        if (input.state.proposalChangeName === firstProposalChangeName) {
          return {
            summary: "Materialized the first proposal.",
            deliverable: "Wrote the first proposal artifacts.",
            artifactsCreated: await writeExpectedProposalArtifacts({
              worktreePath: plannerWorktreePath,
              proposalChangeName: firstProposalChangeName,
              proposalPath: firstProposalPath,
            }),
          };
        }

        const artifactsCreated = await writeExpectedProposalArtifacts({
          worktreePath: plannerWorktreePath,
          proposalChangeName: secondProposalChangeName,
          proposalPath: secondProposalPath,
        });
        await writeArtifact({
          worktreePath: plannerWorktreePath,
          relativePath: `${firstProposalPath}/proposal.md`,
          content: "# Rewritten\n",
        });

        return {
          summary: "Materialized the second proposal.",
          deliverable: "Wrote the second proposal artifacts and rewrote the first proposal file.",
          artifactsCreated,
        };
      }),
    };

    await expect(
      materializeAssignmentProposals({
        repositoryPath,
        baseBranch: "main",
        canonicalBranchName: "requests/example/thread-1/a1",
        requestTitle: "feat(dispatch): Materialize proposal artifacts",
        conventionalTitle: {
          type: "feat",
          scope: "dispatch",
        },
        plannerSummary: "Planner summary",
        plannerDeliverable: "Planner deliverable",
        requestInput: "Materialize proposal artifacts through the agent.",
        worktreeRoot,
        plannerWorktreePath,
        lanes: [
          {
            laneIndex: 1,
            taskTitle: "Materialize proposal artifacts",
            taskObjective: "Write the first proposal files from the agent.",
            proposalChangeName: firstProposalChangeName,
            proposalPath: firstProposalPath,
            branchName: "requests/example/thread-1/a1-proposal-1",
          },
          {
            laneIndex: 2,
            taskTitle: "Materialize proposal artifacts",
            taskObjective: "Write the second proposal files from the agent.",
            proposalChangeName: secondProposalChangeName,
            proposalPath: secondProposalPath,
            branchName: "requests/example/thread-1/a1-proposal-2",
          },
        ],
        openSpecMaterializerAgent,
      }),
    ).rejects.toThrow(
      `OpenSpec materializer modified previously materialized planner artifacts while processing ${secondProposalChangeName}: ${firstProposalPath}/proposal.md.`,
    );

    expect(commitWorktreeChangesMock).not.toHaveBeenCalled();
    expect(ensureBranchRefMock).not.toHaveBeenCalled();
  });

  it("fails when rematerializing an existing proposal without rewriting its stale artifacts", async () => {
    const repositoryPath = await createTemporaryDirectory();
    const worktreeRoot = path.join(repositoryPath, "worktrees");
    const plannerWorktreePath = path.join(worktreeRoot, "meow-1");
    const proposalChangeName = "change-1";
    const proposalPath = "openspec/changes/change-1";
    const staleArtifacts = await writeExpectedProposalArtifacts({
      worktreePath: plannerWorktreePath,
      proposalChangeName,
      proposalPath,
      contentByPath: {
        [`${proposalPath}/proposal.md`]: "# Stale proposal\n",
        [`${proposalPath}/design.md`]: "# Stale design\n",
        [`${proposalPath}/tasks.md`]: "- [ ] stale task\n",
        [`${proposalPath}/specs/${proposalChangeName}/spec.md`]: "# Stale spec\n",
      },
    });

    const openSpecMaterializerAgent: {
      run: (input: OpenSpecMaterializerInput) => Promise<OpenSpecMaterializerOutput>;
    } = {
      run: vi.fn(async () => {
        await expect(
          fs.access(path.join(plannerWorktreePath, `${proposalPath}/proposal.md`)),
        ).rejects.toMatchObject({
          code: "ENOENT",
        });

        return {
          summary: "Reused the existing proposal artifacts.",
          deliverable: "Reported the expected artifact paths without rewriting any files.",
          artifactsCreated: staleArtifacts,
        };
      }),
    };

    await expect(
      materializeAssignmentProposals({
        repositoryPath,
        baseBranch: "main",
        canonicalBranchName: "requests/example/thread-1/a1",
        requestTitle: "feat(dispatch): Materialize proposal artifacts",
        conventionalTitle: {
          type: "feat",
          scope: "dispatch",
        },
        plannerSummary: "Planner summary",
        plannerDeliverable: "Planner deliverable",
        requestInput: "Materialize proposal artifacts through the agent.",
        worktreeRoot,
        plannerWorktreePath,
        lanes: [
          {
            laneIndex: 1,
            taskTitle: "Materialize proposal artifacts",
            taskObjective: "Rewrite the existing proposal files from the agent.",
            proposalChangeName,
            proposalPath,
            branchName: "requests/example/thread-1/a1-proposal-1",
          },
        ],
        openSpecMaterializerAgent,
      }),
    ).rejects.toThrow("OpenSpec materializer did not produce the expected artifacts for change-1");

    expect(commitWorktreeChangesMock).not.toHaveBeenCalled();
    expect(ensureBranchRefMock).not.toHaveBeenCalled();
  });

  it("fails when the materializer deletes the change scaffold after OpenSpec creates it", async () => {
    const repositoryPath = await createTemporaryDirectory();
    const worktreeRoot = path.join(repositoryPath, "worktrees");
    const plannerWorktreePath = path.join(worktreeRoot, "meow-1");
    const proposalChangeName = "change-1";
    const proposalPath = "openspec/changes/change-1";

    const openSpecMaterializerAgent: {
      run: (input: OpenSpecMaterializerInput) => Promise<OpenSpecMaterializerOutput>;
    } = {
      run: vi.fn(async () => {
        const artifactsCreated = await writeExpectedProposalArtifacts({
          worktreePath: plannerWorktreePath,
          proposalChangeName,
          proposalPath,
        });

        await fs.rm(path.join(plannerWorktreePath, proposalPath, ".openspec.yaml"));

        return {
          summary: "Materialized the change artifacts.",
          deliverable: "Wrote the proposal files and removed the OpenSpec scaffold.",
          artifactsCreated,
        };
      }),
    };

    await expect(
      materializeAssignmentProposals({
        repositoryPath,
        baseBranch: "main",
        canonicalBranchName: "requests/example/thread-1/a1",
        requestTitle: "feat(dispatch): Materialize proposal artifacts",
        conventionalTitle: {
          type: "feat",
          scope: "dispatch",
        },
        plannerSummary: "Planner summary",
        plannerDeliverable: "Planner deliverable",
        requestInput: "Materialize proposal artifacts through the agent.",
        worktreeRoot,
        plannerWorktreePath,
        lanes: [
          {
            laneIndex: 1,
            taskTitle: "Materialize proposal artifacts",
            taskObjective: "Write the proposal files from the agent.",
            proposalChangeName,
            proposalPath,
            branchName: "requests/example/thread-1/a1-proposal-1",
          },
        ],
        openSpecMaterializerAgent,
      }),
    ).rejects.toThrow(
      `OpenSpec materializer did not produce the expected artifacts for ${proposalChangeName}: ${proposalPath}/.openspec.yaml`,
    );

    expect(commitWorktreeChangesMock).not.toHaveBeenCalled();
    expect(ensureBranchRefMock).not.toHaveBeenCalled();
  });

  it("accepts planner-side commits that leave the planner worktree clean", async () => {
    const repositoryPath = await createTemporaryDirectory();
    const worktreeRoot = path.join(repositoryPath, "worktrees");
    const plannerWorktreePath = path.join(worktreeRoot, "meow-1");
    const proposalChangeName = "change-1";
    const proposalPath = "openspec/changes/change-1";

    listWorktreeChangesMock.mockResolvedValue([]);
    getBranchHeadMock
      .mockResolvedValueOnce("planner-head-before")
      .mockResolvedValueOnce("planner-head-after")
      .mockResolvedValueOnce("planner-head-after");
    listCommittedPathsBetweenRevisionsMock.mockResolvedValueOnce([
      `${proposalPath}/.openspec.yaml`,
      `${proposalPath}/design.md`,
      `${proposalPath}/proposal.md`,
      `${proposalPath}/specs/${proposalChangeName}/spec.md`,
      `${proposalPath}/tasks.md`,
    ]);

    const openSpecMaterializerAgent: {
      run: (input: OpenSpecMaterializerInput) => Promise<OpenSpecMaterializerOutput>;
    } = {
      run: vi.fn(async () => {
        const artifactsCreated = await writeExpectedProposalArtifacts({
          worktreePath: plannerWorktreePath,
          proposalChangeName,
          proposalPath,
        });

        return {
          summary: "Materialized the change artifacts.",
          deliverable: "Wrote the expected proposal files but left the worktree clean.",
          artifactsCreated,
        };
      }),
    };

    const lanes: Parameters<typeof materializeAssignmentProposals>[0]["lanes"] = [
      {
        laneIndex: 1,
        taskTitle: "Materialize proposal artifacts",
        taskObjective: "Write the proposal files from the agent.",
        proposalChangeName,
        proposalPath,
        branchName: "requests/example/thread-1/a1-proposal-1",
      },
    ];

    await materializeAssignmentProposals({
      repositoryPath,
      baseBranch: "main",
      canonicalBranchName: "requests/example/thread-1/a1",
      requestTitle: "feat(dispatch): Materialize proposal artifacts",
      conventionalTitle: {
        type: "feat",
        scope: "dispatch",
      },
      plannerSummary: "Planner summary",
      plannerDeliverable: "Planner deliverable",
      requestInput: "Materialize proposal artifacts through the agent.",
      worktreeRoot,
      plannerWorktreePath,
      lanes,
      openSpecMaterializerAgent,
    });

    expect(commitWorktreeChangesMock).not.toHaveBeenCalled();
    expect(ensureBranchRefMock).toHaveBeenCalledWith({
      repositoryPath,
      branchName: "requests/example/thread-1/a1-proposal-1",
      startPoint: "planner-head-after",
      forceUpdate: true,
    });
    expect(lanes[0]?.proposalCommitHash).toBe("planner-head-after");
  });

  it("creates a follow-up planner commit when materialization still leaves proposal changes uncommitted", async () => {
    const repositoryPath = await createTemporaryDirectory();
    const worktreeRoot = path.join(repositoryPath, "worktrees");
    const plannerWorktreePath = path.join(worktreeRoot, "meow-1");
    const proposalChangeName = "change-1";
    const proposalPath = "openspec/changes/change-1";

    listWorktreeChangesMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([`${proposalPath}/scratch.md`]);
    getBranchHeadMock
      .mockResolvedValueOnce("planner-head-before")
      .mockResolvedValueOnce("planner-head-after")
      .mockResolvedValueOnce("planner-head-final");
    hasWorktreeChangesMock.mockResolvedValue(true);
    listCommittedPathsBetweenRevisionsMock.mockResolvedValueOnce([
      `${proposalPath}/.openspec.yaml`,
      `${proposalPath}/design.md`,
      `${proposalPath}/proposal.md`,
      `${proposalPath}/specs/${proposalChangeName}/spec.md`,
      `${proposalPath}/tasks.md`,
    ]);

    const openSpecMaterializerAgent: {
      run: (input: OpenSpecMaterializerInput) => Promise<OpenSpecMaterializerOutput>;
    } = {
      run: vi.fn(async () => {
        const artifactsCreated = await writeExpectedProposalArtifacts({
          worktreePath: plannerWorktreePath,
          proposalChangeName,
          proposalPath,
        });

        await writeArtifact({
          worktreePath: plannerWorktreePath,
          relativePath: `${proposalPath}/scratch.md`,
        });

        return {
          summary: "Materialized the change artifacts.",
          deliverable:
            "Committed the expected proposal files and left one planner-side scratch file behind.",
          artifactsCreated,
        };
      }),
    };

    const lanes: Parameters<typeof materializeAssignmentProposals>[0]["lanes"] = [
      {
        laneIndex: 1,
        taskTitle: "Materialize proposal artifacts",
        taskObjective: "Write the proposal files from the agent.",
        proposalChangeName,
        proposalPath,
        branchName: "requests/example/thread-1/a1-proposal-1",
      },
    ];

    await materializeAssignmentProposals({
      repositoryPath,
      baseBranch: "main",
      canonicalBranchName: "requests/example/thread-1/a1",
      requestTitle: "feat(dispatch): Materialize proposal artifacts",
      conventionalTitle: {
        type: "feat",
        scope: "dispatch",
      },
      plannerSummary: "Planner summary",
      plannerDeliverable: "Planner deliverable",
      requestInput: "Materialize proposal artifacts through the agent.",
      worktreeRoot,
      plannerWorktreePath,
      lanes,
      openSpecMaterializerAgent,
    });

    expect(commitWorktreeChangesMock).toHaveBeenCalledWith({
      worktreePath: plannerWorktreePath,
      message: "docs: add openspec proposals for requests/example/thread-1/a1",
      pathspecs: [proposalPath],
    });
    expect(ensureBranchRefMock).toHaveBeenCalledWith({
      repositoryPath,
      branchName: "requests/example/thread-1/a1-proposal-1",
      startPoint: "planner-head-final",
      forceUpdate: true,
    });
    expect(lanes[0]?.proposalCommitHash).toBe("planner-head-final");
  });

  it("fails when the materializer switches the checked out planner branch", async () => {
    const repositoryPath = await createTemporaryDirectory();
    const worktreeRoot = path.join(repositoryPath, "worktrees");
    const plannerWorktreePath = path.join(worktreeRoot, "meow-1");
    const proposalChangeName = "change-1";
    const proposalPath = "openspec/changes/change-1";
    const proposalBranchName = "requests/example/thread-1/a1-proposal-1";

    listWorktreeChangesMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        `${proposalPath}/.openspec.yaml`,
        `${proposalPath}/design.md`,
        `${proposalPath}/proposal.md`,
        `${proposalPath}/specs/${proposalChangeName}/spec.md`,
        `${proposalPath}/tasks.md`,
      ]);
    getSymbolicHeadReferenceMock
      .mockResolvedValueOnce("requests/example/thread-1/a1")
      .mockResolvedValueOnce(proposalBranchName);

    const openSpecMaterializerAgent: {
      run: (input: OpenSpecMaterializerInput) => Promise<OpenSpecMaterializerOutput>;
    } = {
      run: vi.fn(async () => {
        const artifactsCreated = await writeExpectedProposalArtifacts({
          worktreePath: plannerWorktreePath,
          proposalChangeName,
          proposalPath,
        });

        return {
          summary: "Materialized the change artifacts.",
          deliverable: "Wrote the expected proposal files after switching branches.",
          artifactsCreated,
        };
      }),
    };

    await expect(
      materializeAssignmentProposals({
        repositoryPath,
        baseBranch: "main",
        canonicalBranchName: "requests/example/thread-1/a1",
        requestTitle: "feat(dispatch): Materialize proposal artifacts",
        conventionalTitle: {
          type: "feat",
          scope: "dispatch",
        },
        plannerSummary: "Planner summary",
        plannerDeliverable: "Planner deliverable",
        requestInput: "Materialize proposal artifacts through the agent.",
        worktreeRoot,
        plannerWorktreePath,
        lanes: [
          {
            laneIndex: 1,
            taskTitle: "Materialize proposal artifacts",
            taskObjective: "Write the proposal files from the agent.",
            proposalChangeName,
            proposalPath,
            branchName: proposalBranchName,
          },
        ],
        openSpecMaterializerAgent,
      }),
    ).rejects.toThrow(
      "OpenSpec materializer must not change the checked out planner branch while materializing change-1",
    );

    expect(commitWorktreeChangesMock).not.toHaveBeenCalled();
    expect(ensureBranchRefMock).not.toHaveBeenCalled();
  });

  it("fails when the materializer leaves directories at required artifact paths", async () => {
    const repositoryPath = await createTemporaryDirectory();
    const worktreeRoot = path.join(repositoryPath, "worktrees");
    const plannerWorktreePath = path.join(worktreeRoot, "meow-1");
    const proposalChangeName = "change-1";
    const proposalPath = "openspec/changes/change-1";

    const openSpecMaterializerAgent: {
      run: (input: OpenSpecMaterializerInput) => Promise<OpenSpecMaterializerOutput>;
    } = {
      run: vi.fn(async () => {
        await seedOpenSpecChange({
          worktreePath: plannerWorktreePath,
          proposalChangeName,
        });

        await Promise.all(
          buildExpectedOpenSpecArtifactPaths({
            proposalChangeName,
            proposalPath,
          }).map(async (artifactPath) => {
            await fs.mkdir(path.join(plannerWorktreePath, artifactPath), {
              recursive: true,
            });
          }),
        );

        return {
          summary: "Materialized the change artifacts.",
          deliverable: "Left directories at the required artifact paths.",
          artifactsCreated: buildExpectedOpenSpecArtifactPaths({
            proposalChangeName,
            proposalPath,
          }),
        };
      }),
    };

    await expect(
      materializeAssignmentProposals({
        repositoryPath,
        baseBranch: "main",
        canonicalBranchName: "requests/example/thread-1/a1",
        requestTitle: "feat(dispatch): Materialize proposal artifacts",
        conventionalTitle: {
          type: "feat",
          scope: "dispatch",
        },
        plannerSummary: "Planner summary",
        plannerDeliverable: "Planner deliverable",
        requestInput: "Materialize proposal artifacts through the agent.",
        worktreeRoot,
        plannerWorktreePath,
        lanes: [
          {
            laneIndex: 1,
            taskTitle: "Materialize proposal artifacts",
            taskObjective: "Write the proposal files from the agent.",
            proposalChangeName,
            proposalPath,
            branchName: "requests/example/thread-1/a1-proposal-1",
          },
        ],
        openSpecMaterializerAgent,
      }),
    ).rejects.toThrow("OpenSpec materializer did not produce the expected artifacts for change-1");

    expect(commitWorktreeChangesMock).not.toHaveBeenCalled();
    expect(ensureBranchRefMock).not.toHaveBeenCalled();
  });
});
