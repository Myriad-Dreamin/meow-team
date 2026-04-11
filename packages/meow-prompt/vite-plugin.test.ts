import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { build } from "vite";
import { afterEach, describe, expect, it } from "vitest";
import { createMeowPromptViteSyncConfig } from "./src/vite-plugin";

describe("meow-prompt vite plugin", () => {
  let temporaryDirectory: string | null = null;

  afterEach(async () => {
    if (!temporaryDirectory) {
      return;
    }

    await rm(temporaryDirectory, {
      force: true,
      recursive: true,
    });

    temporaryDirectory = null;
  });

  it("loads app prompts through the Vite bootstrap and tolerates a missing docs directory", async () => {
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "meow-prompt-"));

    const appDirectory = path.join(temporaryDirectory, "app");
    const promptPath = path.join(appDirectory, "example.prompt.md");
    const declarationPath = path.join(appDirectory, "example.prompt.d.md.ts");

    await mkdir(appDirectory, { recursive: true });

    await writeFile(promptPath, "---\ntitle: Example\n---\nHello [[param:name]].\n", "utf8");
    await build(createMeowPromptViteSyncConfig(temporaryDirectory));

    expect(await readFile(declarationPath, "utf8")).toContain('readonly title: "Example";');

    await writeFile(promptPath, "---\ntitle: Updated\n---\nHello [[param:team]].\n", "utf8");
    await build(createMeowPromptViteSyncConfig(temporaryDirectory));

    const updatedDeclaration = await readFile(declarationPath, "utf8");

    expect(updatedDeclaration).toContain('readonly title: "Updated";');
    expect(updatedDeclaration).toContain("readonly team: unknown;");
  });
});
