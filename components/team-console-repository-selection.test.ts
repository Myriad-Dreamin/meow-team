import { describe, expect, it } from "vitest";
import type { TeamRepositoryOption } from "@/lib/git/repository";
import type { TeamRepositoryPickerModel } from "@/lib/team/repository-picker";
import {
  applyRequestedTeamConsoleRepositorySelection,
  createAutoTeamConsoleRepositorySelection,
  createManualTeamConsoleRepositorySelection,
  reconcileTeamConsoleRepositorySelection,
} from "@/components/team-console-repository-selection";

const createRepository = (id: string): TeamRepositoryOption => ({
  id,
  name: id,
  rootId: "workspace",
  rootLabel: "Workspace",
  path: `/tmp/${id}`,
  relativePath: id,
});

const createRepositoryPicker = ({
  suggestedIds = [],
  remainingIds = [],
}: {
  suggestedIds?: string[];
  remainingIds?: string[];
}): TeamRepositoryPickerModel => {
  const suggestedRepositories = suggestedIds.map(createRepository);
  const remainingRepositories = remainingIds.map(createRepository);

  return {
    suggestedRepositories,
    remainingRepositories,
    orderedRepositories: [...suggestedRepositories, ...remainingRepositories],
  };
};

describe("createAutoTeamConsoleRepositorySelection", () => {
  it("defaults to the first suggested repository when one is available", () => {
    expect(
      createAutoTeamConsoleRepositorySelection(
        createRepositoryPicker({
          suggestedIds: ["repo-alpha", "repo-beta"],
          remainingIds: ["repo-gamma"],
        }),
      ),
    ).toEqual({
      repositoryId: "repo-alpha",
      source: "auto",
    });
  });
});

describe("reconcileTeamConsoleRepositorySelection", () => {
  it("fills an automatic blank selection from the top suggestion during refresh", () => {
    expect(
      reconcileTeamConsoleRepositorySelection(
        {
          repositoryId: "",
          source: "auto",
        },
        createRepositoryPicker({
          suggestedIds: ["repo-alpha", "repo-beta"],
        }),
      ),
    ).toEqual({
      repositoryId: "repo-alpha",
      source: "auto",
    });
  });

  it("preserves an explicit blank selection during refresh", () => {
    const selection = createManualTeamConsoleRepositorySelection("");

    expect(
      reconcileTeamConsoleRepositorySelection(
        selection,
        createRepositoryPicker({
          suggestedIds: ["repo-alpha", "repo-beta"],
        }),
      ),
    ).toBe(selection);
  });

  it("preserves explicit repository overrides while the repository stays available", () => {
    const selection = createManualTeamConsoleRepositorySelection("repo-beta");

    expect(
      reconcileTeamConsoleRepositorySelection(
        selection,
        createRepositoryPicker({
          suggestedIds: ["repo-alpha"],
          remainingIds: ["repo-beta", "repo-gamma"],
        }),
      ),
    ).toBe(selection);
  });

  it("falls back to the top suggestion when the current repository disappears", () => {
    expect(
      reconcileTeamConsoleRepositorySelection(
        createManualTeamConsoleRepositorySelection("repo-missing"),
        createRepositoryPicker({
          suggestedIds: ["repo-alpha"],
          remainingIds: ["repo-beta"],
        }),
      ),
    ).toEqual({
      repositoryId: "repo-alpha",
      source: "auto",
    });
  });
});

describe("applyRequestedTeamConsoleRepositorySelection", () => {
  it("keeps rerun-provided repository ids pinned as manual selections", () => {
    expect(
      applyRequestedTeamConsoleRepositorySelection(
        createAutoTeamConsoleRepositorySelection(
          createRepositoryPicker({
            suggestedIds: ["repo-alpha"],
          }),
        ),
        "repo-beta",
      ),
    ).toEqual({
      repositoryId: "repo-beta",
      source: "manual",
    });
  });

  it("leaves the current selection unchanged when no repository id is provided", () => {
    const selection = createManualTeamConsoleRepositorySelection("");

    expect(applyRequestedTeamConsoleRepositorySelection(selection, undefined)).toBe(selection);
  });
});
