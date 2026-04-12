import { describe, expect, it } from "vitest";
import {
  buildCanonicalRequestTitle,
  buildLanePullRequestTitle,
  formatConventionalTitle,
  normalizeConventionalTitleMetadata,
  parseConventionalTitle,
} from "@/lib/team/request-title";

describe("request-title conventional formatting", () => {
  it("normalizes slash-delimited conventional metadata", () => {
    expect(
      normalizeConventionalTitleMetadata({
        type: "DEV",
        scope: " VSCode-Extension / Command ",
      }),
    ).toEqual({
      type: "dev",
      scope: "vscode-extension/command",
    });
  });

  it("builds a canonical request title from planner metadata and the single proposal title", () => {
    expect(
      buildCanonicalRequestTitle({
        requestTitle: "Dispatch Coordination",
        taskTitle: "Standardize Conventional Request and PR Titles",
        taskCount: 1,
        conventionalTitle: {
          type: "dev",
          scope: "vsc/command",
        },
      }),
    ).toBe("dev(vsc/command): standardize conventional request and PR titles");
  });

  it("uses the lane task title when multiple proposals share one request group", () => {
    expect(
      buildLanePullRequestTitle({
        requestTitle: "dev(planner/dispatch): Coordinate request titles",
        taskTitle: "Repair reviewer finalization flow",
        taskCount: 2,
        conventionalTitle: {
          type: "dev",
          scope: "planner/dispatch",
        },
      }),
    ).toBe("dev(planner/dispatch): Repair reviewer finalization flow");
  });

  it("lowercases scoped canonical request title subjects", () => {
    expect(
      buildCanonicalRequestTitle({
        requestTitle: "feat(lane/commits): Link lane commit activity to GitHub",
        taskTitle: null,
        taskCount: 1,
        conventionalTitle: {
          type: "feat",
          scope: "lane/commits",
        },
      }),
    ).toBe("feat(lane/commits): link lane commit activity to GitHub");
  });

  it("removes duplicated leading conventional verbs from scoped canonical subjects", () => {
    expect(
      buildCanonicalRequestTitle({
        requestTitle: "refactor(team/runteam): Refactor `runTeam` into a persisted stage machine",
        taskTitle: null,
        taskCount: 1,
        conventionalTitle: {
          type: "refactor",
          scope: "team/runteam",
        },
      }),
    ).toBe("refactor(team/runteam): `runTeam` into a persisted stage machine");
  });

  it("parses canonical titles and preserves the subject when reformatting", () => {
    const parsed = parseConventionalTitle("feat(workflow/pr-title): Standardize PR titles");

    expect(parsed).toEqual({
      metadata: {
        type: "feat",
        scope: "workflow/pr-title",
      },
      subject: "Standardize PR titles",
    });
    expect(
      formatConventionalTitle({
        metadata: parsed!.metadata,
        subject: parsed!.subject,
      }),
    ).toBe("feat(workflow/pr-title): Standardize PR titles");
  });
});
