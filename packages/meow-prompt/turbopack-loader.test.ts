import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);

describe("meow-prompt turbopack loader", () => {
  it("compiles frontmatter-backed prompts through the CommonJS TS hook", () => {
    const temporaryDirectory = mkdtempSync(path.join(os.tmpdir(), "meow-prompt-loader-"));
    const promptPath = path.join(temporaryDirectory, "system.prompt.md");
    const declarationPath = path.join(temporaryDirectory, "system.prompt.d.md.ts");
    const loader = require("./turbopack-loader.cjs") as (
      this: { cacheable?: (flag?: boolean) => void; resourcePath: string },
      source: string,
    ) => string;

    try {
      const code = loader.call(
        {
          cacheable() {},
          resourcePath: promptPath,
        },
        "---\ntitle: System Role\nsummary: Static summary\n---\n# System Role\n\nReview the branch.\n",
      );

      expect(code).toContain("export const frontmatter = {");
      expect(code).toContain('"title": "System Role"');
      expect(readFileSync(declarationPath, "utf8")).toContain(
        'readonly summary: "Static summary";',
      );
    } finally {
      rmSync(temporaryDirectory, {
        force: true,
        recursive: true,
      });
    }
  });
});
