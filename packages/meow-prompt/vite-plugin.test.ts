import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createMeowPromptVitePlugin } from "./src/vite-plugin";

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

  it("syncs prompt declarations during the Vite lifecycle", async () => {
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "meow-prompt-"));

    const promptPath = path.join(temporaryDirectory, "example.prompt.md");
    const declarationPath = path.join(temporaryDirectory, "example.prompt.d.md.ts");
    const plugin = createMeowPromptVitePlugin();

    await writeFile(promptPath, "---\ntitle: Example\n---\nHello [[param:name]].\n", "utf8");

    plugin.configResolved({
      root: temporaryDirectory,
    });

    await plugin.buildStart();

    expect(await readFile(declarationPath, "utf8")).toContain('readonly title: "Example";');

    await plugin.transform("---\ntitle: Updated\n---\nHello [[param:team]].\n", promptPath);

    const updatedDeclaration = await readFile(declarationPath, "utf8");

    expect(updatedDeclaration).toContain('readonly title: "Updated";');
    expect(updatedDeclaration).toContain("readonly team: unknown;");
  });
});
