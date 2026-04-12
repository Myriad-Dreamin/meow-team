import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import ts from "typescript";
import { build } from "vite";
import { describe, expect, it } from "vitest";
import { createMeowPromptViteSyncConfig } from "./src/vite-plugin";

const formatDiagnostics = (
  diagnostics: readonly ts.Diagnostic[],
  currentDirectory: string,
): string => {
  return ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: (fileName) => fileName,
    getCurrentDirectory: () => currentDirectory,
    getNewLine: () => "\n",
  });
};

describe("meow-prompt typecheck regression", () => {
  it("keeps harness role prompt imports typed after the Vite bootstrap runs without a docs directory", async () => {
    const temporaryDirectory = mkdtempSync(path.join(os.tmpdir(), "meow-prompt-typecheck-review-"));
    const roleDirectory = path.join(temporaryDirectory, "lib", "team", "roles");
    const promptPath = path.join(roleDirectory, "fresh.prompt.md");
    const consumerPath = path.join(temporaryDirectory, "fresh-consumer.ts");
    const declarationPath = path.join(roleDirectory, "fresh.prompt.d.md.ts");

    try {
      mkdirSync(roleDirectory, { recursive: true });
      writeFileSync(promptPath, "---\ntitle: Fresh prompt\n---\nHello [[param:name]].\n", "utf8");
      writeFileSync(
        consumerPath,
        `import { frontmatter, prompt, type Args, type FrontMatter } from "./lib/team/roles/fresh.prompt.md";

const typedFrontmatter: FrontMatter = frontmatter;
const title: "Fresh prompt" = typedFrontmatter.title;
const args: Args = { name: title };
const output: string = prompt(args);

// @ts-expect-error missing required name argument
prompt({});

void output;
`,
        "utf8",
      );

      await build(createMeowPromptViteSyncConfig(temporaryDirectory));

      const declarationSource = readFileSync(declarationPath, "utf8");
      const program = ts.createProgram([consumerPath], {
        allowArbitraryExtensions: true,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        noEmit: true,
        skipLibCheck: true,
        strict: true,
        target: ts.ScriptTarget.ES2022,
      });
      const diagnostics = ts.getPreEmitDiagnostics(program);

      expect(declarationSource).toContain('readonly title: "Fresh prompt";');
      expect(declarationSource).toContain("readonly name: unknown;");
      expect(diagnostics, formatDiagnostics(diagnostics, temporaryDirectory)).toHaveLength(0);
    } finally {
      rmSync(temporaryDirectory, {
        force: true,
        recursive: true,
      });
    }
  }, 120_000);

  it("keeps system role prompt imports typed after the Vite bootstrap runs without a docs directory", async () => {
    const temporaryDirectory = mkdtempSync(path.join(os.tmpdir(), "meow-prompt-typecheck-review-"));
    const roleDirectory = path.join(temporaryDirectory, "prompts", "roles");
    const promptPath = path.join(roleDirectory, "fresh.prompt.md");
    const consumerPath = path.join(temporaryDirectory, "fresh-system-role-consumer.ts");
    const declarationPath = path.join(roleDirectory, "fresh.prompt.d.md.ts");

    try {
      mkdirSync(roleDirectory, { recursive: true });
      writeFileSync(
        promptPath,
        "---\ntitle: Fresh system role\nsummary: Static role summary\n---\n# Fresh system role\n\nHello reviewer.\n",
        "utf8",
      );
      writeFileSync(
        consumerPath,
        `import { frontmatter, prompt, type FrontMatter } from "./prompts/roles/fresh.prompt.md";

const typedFrontmatter: FrontMatter = frontmatter;
const title: "Fresh system role" = typedFrontmatter.title;
const summary: "Static role summary" = typedFrontmatter.summary;
const output: string = prompt();

void title;
void summary;
void output;
`,
        "utf8",
      );

      await build(createMeowPromptViteSyncConfig(temporaryDirectory));

      const declarationSource = readFileSync(declarationPath, "utf8");
      const program = ts.createProgram([consumerPath], {
        allowArbitraryExtensions: true,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        noEmit: true,
        skipLibCheck: true,
        strict: true,
        target: ts.ScriptTarget.ES2022,
      });
      const diagnostics = ts.getPreEmitDiagnostics(program);

      expect(declarationSource).toContain('readonly title: "Fresh system role";');
      expect(declarationSource).toContain('readonly summary: "Static role summary";');
      expect(diagnostics, formatDiagnostics(diagnostics, temporaryDirectory)).toHaveLength(0);
    } finally {
      rmSync(temporaryDirectory, {
        force: true,
        recursive: true,
      });
    }
  }, 120_000);
});
