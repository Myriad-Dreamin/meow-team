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

  it("does not reopen autocomplete when proposal numbers refresh from polling", () => {
    const editorSource = readFileSync(
      path.join(rootDirectory, "components", "thread-command-editor.tsx"),
      "utf8",
    );

    const proposalRefreshEffect = editorSource.match(
      /useEffect\(\(\) => \{\s*proposalNumbersRef\.current = proposalNumbers;(?<body>[\s\S]*?)\}, \[proposalNumbers\]\);/,
    );

    expect(proposalRefreshEffect?.groups?.body).toBeDefined();
    expect(proposalRefreshEffect?.groups?.body).not.toContain("showAutocomplete");
  });
});
