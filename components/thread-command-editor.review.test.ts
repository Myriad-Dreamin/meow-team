import { fileURLToPath } from "node:url";
import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("ThreadCommandEditor review guard", () => {
  it("keeps the editor bundled through a declared CodeMirror dependency", () => {
    const packageJson = JSON.parse(
      readFileSync(path.join(rootDirectory, "package.json"), "utf8"),
    ) as {
      dependencies?: Record<string, string>;
    };

    expect(packageJson.dependencies?.codemirror).toBe("5.65.20");
  });

  it("does not hot-link the editor runtime from codemirror.net", () => {
    const editorSource = readFileSync(
      path.join(rootDirectory, "components", "thread-command-editor.tsx"),
      "utf8",
    );

    expect(editorSource).not.toContain("@/packages/codemirror");
    expect(editorSource).not.toContain("codemirror.net");
  });

  it("records the upstream CodeMirror package contract in the lockfile", () => {
    const lockfile = readFileSync(path.join(rootDirectory, "pnpm-lock.yaml"), "utf8");

    expect(lockfile).toContain("specifier: 5.65.20");
    expect(lockfile).toContain("codemirror@5.65.20:");
    expect(lockfile).not.toContain("version: link:packages/codemirror");
  });

  it("does not redirect codemirror imports to a vendored runtime", () => {
    const tsconfig = JSON.parse(
      readFileSync(path.join(rootDirectory, "tsconfig.json"), "utf8"),
    ) as {
      compilerOptions?: {
        paths?: Record<string, string[] | undefined>;
      };
    };
    const vitestConfig = readFileSync(path.join(rootDirectory, "vitest.config.ts"), "utf8");

    expect(tsconfig.compilerOptions?.paths?.codemirror).toBeUndefined();
    expect(tsconfig.compilerOptions?.paths?.["codemirror/*"]).toBeUndefined();
    expect(vitestConfig).not.toContain("vendor/codemirror");
    expect(existsSync(path.join(rootDirectory, "vendor", "codemirror"))).toBe(false);
  });

  it("loads the upstream CodeMirror styles before local overrides", () => {
    const layoutSource = readFileSync(path.join(rootDirectory, "app", "layout.tsx"), "utf8");
    const globalErrorSource = readFileSync(
      path.join(rootDirectory, "app", "global-error.tsx"),
      "utf8",
    );

    for (const source of [layoutSource, globalErrorSource]) {
      const baseCssImport = 'import "codemirror/lib/codemirror.css";';
      const hintCssImport = 'import "codemirror/addon/hint/show-hint.css";';
      const globalsImport = 'import "./globals.css";';

      expect(source).toContain(baseCssImport);
      expect(source).toContain(hintCssImport);
      expect(source).toContain(globalsImport);
      expect(source.indexOf(baseCssImport)).toBeLessThan(source.indexOf(globalsImport));
      expect(source.indexOf(hintCssImport)).toBeLessThan(source.indexOf(globalsImport));
    }
  });

  it("loads markdown mode in the shared CodeMirror runtime without dropping hint addons", () => {
    const editorSource = readFileSync(
      path.join(rootDirectory, "components", "codemirror-text-editor.tsx"),
      "utf8",
    );

    const placeholderImport = 'import("codemirror/addon/display/placeholder")';
    const hintImport = 'import("codemirror/addon/hint/show-hint")';
    const markdownImport = 'import("codemirror/mode/markdown/markdown")';

    expect(editorSource).toContain(placeholderImport);
    expect(editorSource).toContain(hintImport);
    expect(editorSource).toContain(markdownImport);
    expect(editorSource.indexOf(placeholderImport)).toBeLessThan(
      editorSource.indexOf(markdownImport),
    );
    expect(editorSource.indexOf(hintImport)).toBeLessThan(editorSource.indexOf(markdownImport));
    expect(editorSource).toContain('mode: "markdown"');
  });

  it("pins shared editor input behavior to normal text casing", () => {
    const editorSource = readFileSync(
      path.join(rootDirectory, "components", "codemirror-text-editor.tsx"),
      "utf8",
    );

    expect(editorSource).toContain('input.setAttribute("autocapitalize", "off")');
    expect(editorSource).toContain('input.setAttribute("autocorrect", "off")');
    expect(editorSource).toContain("input.spellcheck = false");
  });

  it("does not reopen autocomplete when proposal numbers refresh from polling", () => {
    const editorSource = readFileSync(
      path.join(rootDirectory, "components", "thread-command-editor.tsx"),
      "utf8",
    );

    const proposalRefreshEffect = editorSource.match(
      /useEffect\(\(\) => \{\s*proposalNumbersRef\.current = proposalNumbers;([\s\S]*?)\}, \[proposalNumbers\]\);/,
    );
    const proposalRefreshEffectBody = proposalRefreshEffect?.[1];

    expect(proposalRefreshEffectBody).toBeDefined();
    expect(proposalRefreshEffectBody).not.toContain("showAutocomplete");
  });
});
