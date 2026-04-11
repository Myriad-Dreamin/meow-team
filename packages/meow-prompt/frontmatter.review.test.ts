import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { extractFrontmatter } from "./src/frontmatter";

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
});
