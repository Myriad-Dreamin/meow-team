import { describe, expect, it } from "vitest";
import type { TeamRepositoryOption } from "@/lib/git/repository";
import { buildTeamRepositoryPickerModel } from "@/lib/team/repository-picker";

const createRepository = (id: string): TeamRepositoryOption => {
  return {
    id,
    name: id.split(":").at(-1) ?? id,
    rootId: "workspace",
    rootLabel: "Workspace",
    path: `/repos/${id}`,
    relativePath: id.split(":").at(-1) ?? ".",
  };
};

describe("buildTeamRepositoryPickerModel", () => {
  it("sorts suggested repositories by most recent use and deduplicates by repository id", () => {
    const repositories = [
      createRepository("workspace:alpha"),
      createRepository("workspace:beta"),
      createRepository("workspace:gamma"),
    ];

    const picker = buildTeamRepositoryPickerModel({
      repositories,
      usageRecords: [
        {
          repositoryId: "workspace:alpha",
          requestedAt: "2026-04-09T08:00:00.000Z",
        },
        {
          repositoryId: "workspace:beta",
          requestedAt: "2026-04-11T08:00:00.000Z",
        },
        {
          repositoryId: "workspace:alpha",
          requestedAt: "2026-04-12T08:00:00.000Z",
        },
      ],
    });

    expect(picker.suggestedRepositories.map((repository) => repository.id)).toEqual([
      "workspace:alpha",
      "workspace:beta",
    ]);
    expect(picker.remainingRepositories.map((repository) => repository.id)).toEqual([
      "workspace:gamma",
    ]);
  });

  it("keeps every configured repository selectable even when history references unknown ids", () => {
    const repositories = [
      createRepository("workspace:alpha"),
      createRepository("workspace:beta"),
      createRepository("workspace:gamma"),
    ];

    const picker = buildTeamRepositoryPickerModel({
      repositories,
      usageRecords: [
        {
          repositoryId: "workspace:missing",
          requestedAt: "2026-04-12T08:00:00.000Z",
        },
        {
          repositoryId: "workspace:beta",
          requestedAt: "2026-04-10T08:00:00.000Z",
        },
      ],
    });

    expect(picker.orderedRepositories.map((repository) => repository.id)).toEqual([
      "workspace:beta",
      "workspace:alpha",
      "workspace:gamma",
    ]);
    expect(new Set(picker.orderedRepositories.map((repository) => repository.id))).toEqual(
      new Set(repositories.map((repository) => repository.id)),
    );
  });

  it("leaves repositories without prior usage in the accessible list", () => {
    const repositories = [createRepository("workspace:alpha"), createRepository("workspace:beta")];

    const picker = buildTeamRepositoryPickerModel({
      repositories,
      usageRecords: [],
    });

    expect(picker.suggestedRepositories).toEqual([]);
    expect(picker.remainingRepositories.map((repository) => repository.id)).toEqual([
      "workspace:alpha",
      "workspace:beta",
    ]);
    expect(picker.orderedRepositories.map((repository) => repository.id)).toEqual([
      "workspace:alpha",
      "workspace:beta",
    ]);
  });
});
