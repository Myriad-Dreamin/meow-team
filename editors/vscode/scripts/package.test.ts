import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const packageDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe(".vscodeignore", () => {
  it("excludes stale dist build artifacts from VSIX packaging", () => {
    const ignoreEntries = readFileSync(path.join(packageDirectory, ".vscodeignore"), "utf8")
      .split(/\r?\n/u)
      .map((entry) => entry.trim())
      .filter(Boolean);

    expect(ignoreEntries).toContain("dist/**");
  });
});
