import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  appendArchivedOpenSpecLinksToRoadmapTopic,
  resolveRoadmapTopicFromScope,
} from "@/lib/team/roadmap";

const temporaryDirectories = new Set<string>();

const createWorktree = async (): Promise<string> => {
  const worktreePath = await fs.mkdtemp(path.join(os.tmpdir(), "team-roadmap-test-"));
  temporaryDirectories.add(worktreePath);
  return worktreePath;
};

const writeWorktreeFile = async ({
  worktreePath,
  relativePath,
  content,
}: {
  worktreePath: string;
  relativePath: string;
  content: string;
}): Promise<void> => {
  const absolutePath = path.join(worktreePath, relativePath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, content, "utf8");
};

const seedRoadmapDocs = async ({
  worktreePath,
  topicContent,
}: {
  worktreePath: string;
  topicContent: string;
}): Promise<void> => {
  await writeWorktreeFile({
    worktreePath,
    relativePath: "docs/roadmap/index.md",
    content: "# Roadmaps\n",
  });
  await writeWorktreeFile({
    worktreePath,
    relativePath: "docs/roadmap/vscode-extension/index.md",
    content: `---
title: VSCode Extension
aliases:
  - vsc
---
# VSCode Extension
`,
  });
  await writeWorktreeFile({
    worktreePath,
    relativePath: "docs/roadmap/vscode-extension/command-palette.md",
    content: topicContent,
  });
};

const seedArchivedSpec = async ({
  worktreePath,
  archivedChangePath,
}: {
  worktreePath: string;
  archivedChangePath: string;
}): Promise<void> => {
  await writeWorktreeFile({
    worktreePath,
    relativePath: `${archivedChangePath}/specs/command/spec.md`,
    content: "# Spec\n",
  });
};

afterEach(async () => {
  await Promise.all(
    [...temporaryDirectories].map(async (directoryPath) => {
      await fs.rm(directoryPath, {
        force: true,
        recursive: true,
      });
    }),
  );

  temporaryDirectories.clear();
});

describe("resolveRoadmapTopicFromScope", () => {
  it("resolves roadmap and topic aliases to canonical doc paths", async () => {
    const worktreePath = await createWorktree();

    await seedRoadmapDocs({
      worktreePath,
      topicContent: `---
title: Command Palette
aliases:
  - command
---
# Command Palette

## Related Specs
`,
    });

    await expect(
      resolveRoadmapTopicFromScope({
        worktreePath,
        scope: "vsc/command",
      }),
    ).resolves.toEqual({
      scope: "vsc/command",
      roadmapSlug: "vscode-extension",
      roadmapPath: "docs/roadmap/vscode-extension/index.md",
      topicSlug: "command-palette",
      topicPath: "docs/roadmap/vscode-extension/command-palette.md",
    });
  });
});

describe("appendArchivedOpenSpecLinksToRoadmapTopic", () => {
  it("appends archived spec links to the resolved roadmap topic without duplicating retries", async () => {
    const worktreePath = await createWorktree();
    const archivedChangePath = "openspec/changes/archive/2026-04-11-change-1";

    await seedRoadmapDocs({
      worktreePath,
      topicContent: `---
title: Command Palette
aliases:
  - command
---
# Command Palette

## Command registration
Track command surface changes here.

## Related Specs
`,
    });
    await seedArchivedSpec({
      worktreePath,
      archivedChangePath,
    });

    await expect(
      appendArchivedOpenSpecLinksToRoadmapTopic({
        worktreePath,
        changeName: "change-1",
        archivedChangePath,
        conventionalTitle: {
          type: "feat",
          scope: "vsc/command",
        },
      }),
    ).resolves.toEqual({
      updated: true,
      topicPath: "docs/roadmap/vscode-extension/command-palette.md",
      linkedSpecs: ["openspec/changes/archive/2026-04-11-change-1/specs/command/spec.md"],
    });

    const topicPath = path.join(worktreePath, "docs/roadmap/vscode-extension/command-palette.md");
    const firstTopicContent = await fs.readFile(topicPath, "utf8");

    expect(firstTopicContent).toContain(
      "- [change-1](../../../openspec/changes/archive/2026-04-11-change-1/specs/command/spec.md)",
    );

    await expect(
      appendArchivedOpenSpecLinksToRoadmapTopic({
        worktreePath,
        changeName: "change-1",
        archivedChangePath,
        conventionalTitle: {
          type: "feat",
          scope: "vsc/command",
        },
      }),
    ).resolves.toEqual({
      updated: false,
      topicPath: "docs/roadmap/vscode-extension/command-palette.md",
      linkedSpecs: ["openspec/changes/archive/2026-04-11-change-1/specs/command/spec.md"],
    });

    await expect(fs.readFile(topicPath, "utf8")).resolves.toBe(firstTopicContent);
  });

  it("fails when the resolved topic does not define a Related Specs section", async () => {
    const worktreePath = await createWorktree();
    const archivedChangePath = "openspec/changes/archive/2026-04-11-change-1";

    await seedRoadmapDocs({
      worktreePath,
      topicContent: `---
title: Command Palette
aliases:
  - command
---
# Command Palette

## Command registration
Track command surface changes here.
`,
    });
    await seedArchivedSpec({
      worktreePath,
      archivedChangePath,
    });

    await expect(
      appendArchivedOpenSpecLinksToRoadmapTopic({
        worktreePath,
        changeName: "change-1",
        archivedChangePath,
        conventionalTitle: {
          type: "feat",
          scope: "vsc/command",
        },
      }),
    ).rejects.toThrow(
      "Roadmap topic docs/roadmap/vscode-extension/command-palette.md is missing a ## Related Specs section.",
    );
  });

  it("scaffolds a missing roadmap and topic, then records one TODO item without retry duplicates", async () => {
    const worktreePath = await createWorktree();
    const archivedChangePath = "openspec/changes/archive/2026-04-11-change-1";

    await writeWorktreeFile({
      worktreePath,
      relativePath: "docs/roadmap/index.md",
      content: "# Roadmaps\n",
    });
    await seedArchivedSpec({
      worktreePath,
      archivedChangePath,
    });

    await expect(
      appendArchivedOpenSpecLinksToRoadmapTopic({
        worktreePath,
        changeName: "change-1",
        archivedChangePath,
        conventionalTitle: {
          type: "feat",
          scope: "archive/workflow",
        },
      }),
    ).resolves.toEqual({
      updated: true,
      topicPath: "docs/roadmap/archive/workflow.md",
      linkedSpecs: ["openspec/changes/archive/2026-04-11-change-1/specs/command/spec.md"],
    });

    const rootRoadmapIndexPath = path.join(worktreePath, "docs/roadmap/index.md");
    const roadmapIndexPath = path.join(worktreePath, "docs/roadmap/archive/index.md");
    const topicPath = path.join(worktreePath, "docs/roadmap/archive/workflow.md");
    const todoPath = path.join(worktreePath, "TODO.md");

    const rootRoadmapIndexContent = await fs.readFile(rootRoadmapIndexPath, "utf8");
    const roadmapIndexContent = await fs.readFile(roadmapIndexPath, "utf8");
    const topicContent = await fs.readFile(topicPath, "utf8");
    const todoContent = await fs.readFile(todoPath, "utf8");

    expect(rootRoadmapIndexContent).toContain("## Available Roadmaps");
    expect(rootRoadmapIndexContent).toContain("- [Archive](/roadmap/archive/)");
    expect(roadmapIndexContent).toContain("# Archive");
    expect(roadmapIndexContent).toContain("- [Workflow](/roadmap/archive/workflow)");
    expect(topicContent).toContain("# Workflow");
    expect(topicContent).toContain("## Planned Work");
    expect(topicContent).toContain(
      "- [change-1](../../../openspec/changes/archive/2026-04-11-change-1/specs/command/spec.md)",
    );
    expect(todoContent).toContain("## Items");
    expect(todoContent).toContain("[Archive roadmap](docs/roadmap/archive/index.md)");
    expect(todoContent).toContain("[Workflow topic](docs/roadmap/archive/workflow.md)");

    await expect(
      appendArchivedOpenSpecLinksToRoadmapTopic({
        worktreePath,
        changeName: "change-1",
        archivedChangePath,
        conventionalTitle: {
          type: "feat",
          scope: "archive/workflow",
        },
      }),
    ).resolves.toEqual({
      updated: false,
      topicPath: "docs/roadmap/archive/workflow.md",
      linkedSpecs: ["openspec/changes/archive/2026-04-11-change-1/specs/command/spec.md"],
    });

    await expect(fs.readFile(rootRoadmapIndexPath, "utf8")).resolves.toBe(rootRoadmapIndexContent);
    await expect(fs.readFile(roadmapIndexPath, "utf8")).resolves.toBe(roadmapIndexContent);
    await expect(fs.readFile(topicPath, "utf8")).resolves.toBe(topicContent);
    await expect(fs.readFile(todoPath, "utf8")).resolves.toBe(todoContent);
  });
});

describe("roadmap topic docs", () => {
  it("require an opening frontmatter fence on topic pages", async () => {
    const roadmapRoot = path.join(process.cwd(), "docs/roadmap");
    const roadmapEntries = await fs.readdir(roadmapRoot, { withFileTypes: true });

    for (const roadmapEntry of roadmapEntries) {
      if (!roadmapEntry.isDirectory()) {
        continue;
      }

      const topicEntries = await fs.readdir(path.join(roadmapRoot, roadmapEntry.name), {
        withFileTypes: true,
      });

      for (const topicEntry of topicEntries) {
        if (
          !topicEntry.isFile() ||
          topicEntry.name === "index.md" ||
          !topicEntry.name.endsWith(".md")
        ) {
          continue;
        }

        const topicPath = path.join(roadmapRoot, roadmapEntry.name, topicEntry.name);
        const topicContent = await fs.readFile(topicPath, "utf8");
        const [firstLine = ""] = topicContent.split(/\r?\n/u);

        expect(
          firstLine,
          `${roadmapEntry.name}/${topicEntry.name} must start with an opening frontmatter fence.`,
        ).toBe("---");
      }
    }
  });
});
