import { describe, expect, it } from "vitest";
import { extractFrontmatter, stripYamlFrontmatter } from "./src/frontmatter";

describe("meow-prompt frontmatter", () => {
  it("preserves body whitespace after the closing delimiter", () => {
    expect(stripYamlFrontmatter("---\ntitle: Example\n---\n\nBody")).toEqual({
      frontmatter: "title: Example",
      body: "\nBody",
    });
  });

  it("treats an unterminated frontmatter block as plain body text", () => {
    expect(stripYamlFrontmatter("---\ntitle: Example")).toEqual({
      frontmatter: null,
      body: "---\ntitle: Example",
    });
  });

  it("parses yaml mappings with js-yaml", () => {
    expect(
      extractFrontmatter(
        "---\ntitle: Example\nmetadata:\n  ready: true\nitems:\n  - first\n---\nBody",
      ),
    ).toEqual({
      body: "Body",
      frontmatter: {
        title: "Example",
        metadata: {
          ready: true,
        },
        items: ["first"],
      },
    });
  });

  it("rejects non-mapping yaml frontmatter", () => {
    expect(() => extractFrontmatter("---\n- first\n---\nBody")).toThrow(
      "Prompt frontmatter must be a top-level mapping.",
    );
  });
});
