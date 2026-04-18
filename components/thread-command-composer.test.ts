import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ThreadCommandComposer } from "@/components/thread-command-composer";
import { THREAD_COMMAND_HELP_TEXT, THREAD_COMMAND_PLACEHOLDER } from "@/lib/team/thread-command";

const renderComposer = (props: Parameters<typeof ThreadCommandComposer>[0]) => {
  return renderToStaticMarkup(createElement(ThreadCommandComposer, props));
};

describe("ThreadCommandComposer", () => {
  it("renders the disabled state with the server-enforced idle gating copy", () => {
    const html = renderComposer({
      disabledReason:
        "Thread commands only run while the latest assignment is idle. Wait for queued, coding, or reviewing work to finish first.",
      isPending: false,
      notice: null,
      onChange: vi.fn(),
      onSubmit: vi.fn(),
      value: "/approve",
    });

    expect(html).toContain(THREAD_COMMAND_HELP_TEXT);
    expect(html).toContain("latest assignment is idle");
    expect(html).toContain(THREAD_COMMAND_PLACEHOLDER);
    expect(html).toContain('data-thread-command-editor="codemirror"');
    expect(html).toContain('data-disabled="true"');
    expect(html).not.toContain("<textarea");
    expect(html).toMatch(/<button[^>]*disabled/);
  });

  it("renders the pending submission state with the command helper text", () => {
    const html = renderComposer({
      disabledReason: null,
      isPending: true,
      notice: {
        kind: "info",
        message: "Queued proposal approval for proposal 1.",
      },
      onChange: vi.fn(),
      onSubmit: vi.fn(),
      value: "/approve 1",
    });

    expect(html).toContain(THREAD_COMMAND_HELP_TEXT);
    expect(html).toContain("Running command...");
    expect(html).toContain("Queued proposal approval for proposal 1.");
    expect(html).not.toContain("latest assignment is idle");
    expect(html).toContain('data-thread-command-editor="codemirror"');
    expect(html).not.toContain("<textarea");
    expect(html).toMatch(/<button[^>]*disabled/);
  });
});
