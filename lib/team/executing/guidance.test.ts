import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildExecutionArtifactContract,
  buildExecutionGuideInstructions,
  buildExecutionReviewerExecutionRules,
  resolveExecutionGuideContext,
} from "@/lib/team/executing/guidance";

const temporaryDirectories = new Set<string>();

afterEach(async () => {
  await Promise.all(
    [...temporaryDirectories].map(async (directoryPath) => {
      await rm(directoryPath, { force: true, recursive: true });
    }),
  );
  temporaryDirectories.clear();
});

describe("resolveExecutionGuideContext", () => {
  it("uses the subtype guide when the repository provides one", async () => {
    const worktreePath = await mkdtemp(path.join(os.tmpdir(), "execution-guide-"));
    temporaryDirectories.add(worktreePath);
    await mkdir(path.join(worktreePath, "docs/guide"), { recursive: true });
    await writeFile(path.join(worktreePath, "docs/guide/execution.md"), "# guide\n");

    const context = await resolveExecutionGuideContext({
      worktreePath,
      executionMode: "execution",
    });

    expect(context).toMatchObject({
      executionMode: "execution",
      selectedGuidePath: "docs/guide/execution.md",
      usedAgentsFallback: false,
    });
    expect(buildExecutionGuideInstructions(context)).toContain(
      "inspect docs/guide/execution.md before making changes.",
    );
  });

  it("falls back to AGENTS.md when the subtype guide is absent", async () => {
    const worktreePath = await mkdtemp(path.join(os.tmpdir(), "execution-fallback-"));
    temporaryDirectories.add(worktreePath);
    await writeFile(path.join(worktreePath, "AGENTS.md"), "# fallback\n");

    const context = await resolveExecutionGuideContext({
      worktreePath,
      executionMode: "benchmark",
    });

    expect(context).toMatchObject({
      executionMode: "benchmark",
      selectedGuidePath: "AGENTS.md",
      usedAgentsFallback: true,
    });
    expect(buildExecutionGuideInstructions(context)).toContain(
      "Inspect AGENTS.md for benchmark guidance before making changes.",
    );
  });
});

describe("execution guidance contracts", () => {
  it("describes the committed validation artifacts required for review", () => {
    expect(buildExecutionArtifactContract("experiment")).toContain(
      "Commit either a validator artifact or document a reproducible validation command in the branch.",
    );
    expect(buildExecutionArtifactContract("experiment")).toContain(
      "Commit a summary artifact that records output paths, formats, or key results even when raw data is gitignored.",
    );
  });

  it("keeps execution-review follow-up artifact rules explicit", () => {
    expect(buildExecutionReviewerExecutionRules()).toEqual(
      expect.arrayContaining([
        expect.stringContaining("validator or reproducible validation command"),
        expect.stringContaining("Preferred follow-up artifact"),
        expect.stringContaining("Fallback follow-up artifact"),
      ]),
    );
  });
});
