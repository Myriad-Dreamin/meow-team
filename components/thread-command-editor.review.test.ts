import { fileURLToPath } from "node:url";
import path from "node:path";
import { readFileSync } from "node:fs";
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
});
