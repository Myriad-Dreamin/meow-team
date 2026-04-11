import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LaneMarkdownText, renderLaneMarkdown } from "@/components/lane-markdown";

describe("renderLaneMarkdown", () => {
  it("renders explicit markdown links with the lane link styling and safe anchor attributes", () => {
    const html = renderLaneMarkdown(
      "Published commit [abcdef123456](<https://github.com/example/meow-team/commit/abcdef123456>) to GitHub via origin.",
    );

    expect(html).toContain('href="https://github.com/example/meow-team/commit/abcdef123456"');
    expect(html).toContain('class="lane-meta-link"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noreferrer noopener"');
    expect(html).toContain(">abcdef123456</a>");
  });

  it("does not auto-link raw URLs or plain commit hashes", () => {
    const html = renderLaneMarkdown(
      "GitHub PR ready: https://github.com/example/meow-team/pull/42 and commit abcdef123456",
    );

    expect(html).not.toContain("<a ");
    expect(html).toContain("https://github.com/example/meow-team/pull/42");
    expect(html).toContain("abcdef123456");
  });

  it("escapes raw HTML and refuses unsafe markdown link destinations", () => {
    const html = renderLaneMarkdown("Unsafe <script>alert(1)</script> [bad](javascript:alert(1))");

    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain('href="javascript:alert(1)"');
  });
});

describe("LaneMarkdownText", () => {
  it("renders lane copy paragraphs from the shared markdown renderer", () => {
    expect(
      renderToStaticMarkup(
        <LaneMarkdownText
          className="lane-copy"
          text="Published commit [abcdef123456](<https://github.com/example/meow-team/commit/abcdef123456>) to GitHub via origin."
        />,
      ),
    ).toContain('<p class="lane-copy">Published commit <a href=');
  });
});
