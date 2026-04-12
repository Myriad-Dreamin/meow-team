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

  it("loads app prompts and harness role prompts through the Vite bootstrap", async () => {
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "meow-prompt-"));

    const appDirectory = path.join(temporaryDirectory, "app");
    const roleDirectory = path.join(temporaryDirectory, "lib", "team", "roles");
    const promptPath = path.join(appDirectory, "example.prompt.md");
    const declarationPath = path.join(appDirectory, "example.prompt.d.md.ts");
    const rolePromptPath = path.join(roleDirectory, "role.prompt.md");
    const roleDeclarationPath = path.join(roleDirectory, "role.prompt.d.md.ts");

    await mkdir(appDirectory, { recursive: true });
    await mkdir(roleDirectory, { recursive: true });

    await writeFile(promptPath, "---\ntitle: Example\n---\nHello [[param:name]].\n", "utf8");
    await writeFile(
      rolePromptPath,
      "---\ntitle: Role Prompt\n---\nCurrent handoffs:\n[[param:handoffs|raw]]\n",
      "utf8",
    );
    await build(createMeowPromptViteSyncConfig(temporaryDirectory));

    expect(await readFile(declarationPath, "utf8")).toContain('readonly title: "Example";');
    expect(await readFile(roleDeclarationPath, "utf8")).toContain('readonly title: "Role Prompt";');

    await writeFile(
      rolePromptPath,
      "---\ntitle: Updated Role\n---\nWorkflow: [[param:workflow]].\n",
      "utf8",
    );
    await build(createMeowPromptViteSyncConfig(temporaryDirectory));

    const updatedDeclaration = await readFile(roleDeclarationPath, "utf8");

    expect(updatedDeclaration).toContain('readonly title: "Updated Role";');
    expect(updatedDeclaration).toContain("readonly workflow: unknown;");
  });
});
