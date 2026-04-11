import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { syncMeowPromptDeclarationsForNext } from "../../next.config";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const formatDiagnostics = (diagnostics: readonly ts.Diagnostic[]): string => {
  return ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: (fileName) => fileName,
    getCurrentDirectory: () => repoRoot,
    getNewLine: () => "\n",
  });
};

describe("meow-prompt typecheck regression", () => {
  it("keeps fresh prompt imports typed for TypeScript validation", () => {
    const temporaryDirectory = mkdtempSync(
      path.join(repoRoot, "tmp-meow-prompt-typecheck-review-"),
    );
    const promptPath = path.join(temporaryDirectory, "fresh.prompt.md");
    const consumerPath = path.join(temporaryDirectory, "fresh-consumer.ts");
    const declarationPath = path.join(temporaryDirectory, "fresh.prompt.d.md.ts");

    try {
      writeFileSync(promptPath, "---\ntitle: Fresh prompt\n---\nHello [[param:name]].\n", "utf8");
      writeFileSync(
        consumerPath,
        `import { frontmatter, prompt, type Args, type FrontMatter } from "./fresh.prompt.md";

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

      syncMeowPromptDeclarationsForNext();

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
      expect(diagnostics, formatDiagnostics(diagnostics)).toHaveLength(0);
    } finally {
      rmSync(temporaryDirectory, {
        force: true,
        recursive: true,
      });
    }
  }, 120_000);
});
