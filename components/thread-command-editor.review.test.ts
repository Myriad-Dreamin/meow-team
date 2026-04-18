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

    expect(packageJson.dependencies?.codemirror).toBe("workspace:*");
  });

  it("does not hot-link the editor runtime from codemirror.net", () => {
    const editorSource = readFileSync(
      path.join(rootDirectory, "components", "thread-command-editor.tsx"),
      "utf8",
    );

    expect(editorSource).not.toContain("codemirror.net");
  });
});
