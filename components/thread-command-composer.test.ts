import { createElement } from "react";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ThreadCommandComposer } from "@/components/thread-command-composer";

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const renderComposer = (props: Parameters<typeof ThreadCommandComposer>[0]) => {
  return renderToStaticMarkup(createElement(ThreadCommandComposer, props));
};

describe("ThreadCommandComposer", () => {
  it("uses the disabled reason as the placeholder for eligibility-driven read-only states", () => {
    const disabledReason =
      "Thread commands only run while the latest assignment is idle. Wait for queued, coding, or reviewing work to finish first.";
    const html = renderComposer({
      disabledReason,
      isPending: false,
      notice: null,
      onChange: vi.fn(),
      onSubmit: vi.fn(),
      proposalNumbers: [1, 2],
      value: "/approve",
    });

    expect(html).toContain(`data-placeholder="${disabledReason}"`);
    expect(html).toContain('data-thread-command-editor="codemirror"');
    expect(html).toContain('data-disabled="true"');
    expect(html).not.toContain("<textarea");
    expect(html).toMatch(/<button[^>]*disabled/);
  });

  it("keeps the default placeholder when the editor remains editable", () => {
    const html = renderComposer({
      disabledReason: null,
      isPending: false,
      notice: null,
      onChange: vi.fn(),
      onSubmit: vi.fn(),
      proposalNumbers: [1],
      value: "/approve",
    });

    expect(html).toContain('data-placeholder="Enter slash commands..."');
    expect(html).toContain('data-thread-command-editor="codemirror"');
    expect(html).toContain('data-disabled="false"');
    expect(html).not.toContain("<textarea");
    expect(html).not.toMatch(/<button[^>]*disabled/);
  });

  it("keeps the default placeholder during pending-only disablement", () => {
    const html = renderComposer({
      disabledReason: null,
      isPending: true,
      notice: {
        kind: "info",
        message: "Queued proposal approval for proposal 1.",
      },
      onChange: vi.fn(),
      onSubmit: vi.fn(),
      proposalNumbers: [1],
      value: "/approve 1",
    });

    expect(html).toContain("Running command...");
    expect(html).toContain("Queued proposal approval for proposal 1.");
    expect(html).toContain('data-placeholder="Enter slash commands..."');
    expect(html).toContain('data-thread-command-editor="codemirror"');
    expect(html).not.toContain("<textarea");
    expect(html).toMatch(/<button[^>]*disabled/);
  });

  it("keeps thread command markdown styling scoped in the editor CSS module", () => {
    const editorCss = readFileSync(
      path.join(rootDirectory, "components", "codemirror-text-editor.module.css"),
      "utf8",
    );

    expect(editorCss).toContain(".thread-command-editor :global(.cm-header)");
    expect(editorCss).toContain(".thread-command-editor :global(.cm-link)");
    expect(editorCss).toContain(".thread-command-editor :global(.CodeMirror-line)");
    expect(editorCss).toContain(".thread-command-editor :global(.CodeMirror) textarea");
    expect(editorCss).toContain("text-transform: none;");
  });
});
