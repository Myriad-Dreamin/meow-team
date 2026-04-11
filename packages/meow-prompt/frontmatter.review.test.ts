import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { extractFrontmatter } from "./src/frontmatter";

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

describe("meow-prompt frontmatter review regression", () => {
  it("resolves js-yaml independently from process.cwd()", async () => {
    const originalCwd = process.cwd();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "meow-prompt-frontmatter-"));

    try {
      process.chdir(tempDir);

      const moduleUrl = new URL("./src/frontmatter.ts", import.meta.url);
      moduleUrl.searchParams.set("cwd", Date.now().toString());
      const { extractFrontmatter } = await import(/* @vite-ignore */ moduleUrl.href);

      expect(extractFrontmatter("---\ntitle: Example\n---\nBody")).toEqual({
        body: "Body",
        frontmatter: {
          title: "Example",
        },
      });
    } finally {
      process.chdir(originalCwd);
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("keeps YAML timestamp scalars as strings", () => {
    expect(
      extractFrontmatter("---\ncreated: 2024-01-01\npublishedAt: 2024-01-01T12:30:00Z\n---\nBody"),
    ).toEqual({
      body: "Body",
      frontmatter: {
        created: "2024-01-01",
        publishedAt: "2024-01-01T12:30:00Z",
      },
    });
  });

  it("typechecks the frontmatter module without external js-yaml typings", () => {
    const currentDirectory = process.cwd();
    const frontmatterPath = fileURLToPath(new URL("./src/frontmatter.ts", import.meta.url));
    const jsYamlTypesPath = fileURLToPath(new URL("./src/js-yaml.d.ts", import.meta.url));
    const program = ts.createProgram([frontmatterPath, jsYamlTypesPath], {
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      noEmit: true,
      skipLibCheck: true,
      strict: true,
      target: ts.ScriptTarget.ES2022,
    });
    const diagnostics = ts.getPreEmitDiagnostics(program);

    expect(diagnostics, formatDiagnostics(diagnostics, currentDirectory)).toHaveLength(0);
  });
});
