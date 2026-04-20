import { createElement } from "react";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { TeamConsole } from "@/components/team-console";
import type { TeamRepositoryPickerModel } from "@/lib/team/repository-picker";

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EMPTY_REPOSITORY_PICKER: TeamRepositoryPickerModel = {
  suggestedRepositories: [],
  remainingRepositories: [],
  orderedRepositories: [],
};
const REPOSITORY_PICKER: TeamRepositoryPickerModel = {
  suggestedRepositories: [
    {
      id: "repo-alpha",
      name: "repo-alpha",
      path: "/tmp/repo-alpha",
      relativePath: "repo-alpha",
      rootId: "workspace",
      rootLabel: "Workspace",
    },
  ],
  remainingRepositories: [],
  orderedRepositories: [
    {
      id: "repo-alpha",
      name: "repo-alpha",
      path: "/tmp/repo-alpha",
      relativePath: "repo-alpha",
      rootId: "workspace",
      rootLabel: "Workspace",
    },
  ],
};

const renderConsole = (props: Partial<Parameters<typeof TeamConsole>[0]> = {}) => {
  return renderToStaticMarkup(
    createElement(TeamConsole, {
      disabled: false,
      initialLogThreadId: null,
      initialPrompt: "",
      onThreadActivity: vi.fn(),
      repositoryPicker: EMPTY_REPOSITORY_PICKER,
      workerCount: 2,
      ...props,
    }),
  );
};

describe("TeamConsole request editor", () => {
  it("renders the request field as a CodeMirror editor with canonical prefix helper copy", () => {
    const html = renderConsole({
      initialPrompt: "/benchmark compare worktree reuse latency",
    });

    expect(html).toContain('data-team-request-editor="codemirror"');
    expect(html).toContain('name="prompt"');
    expect(html).toContain('type="hidden"');
    expect(html).toContain(
      "Plan multiple proposals for a new onboarding flow, wait for human approval, then queue coding and machine review for the approved proposals.",
    );
    expect(html).toContain("/execution ");
    expect(html).toContain("/benchmark ");
    expect(html).toContain("/experiment ");
    expect(html).not.toContain("<textarea");
  });

  it("propagates the disabled planner gate to the request editor and submit button", () => {
    const html = renderConsole({
      disabled: true,
    });

    expect(html).toContain('data-team-request-editor="codemirror"');
    expect(html).toContain('data-disabled="true"');
    expect(html).toMatch(/<button[^>]*disabled/);
  });

  it("uses explicit native-control hooks for native fields without styling the request editor", () => {
    const html = renderConsole({
      repositoryPicker: REPOSITORY_PICKER,
    });

    const requestEditorTag = html.match(
      /<div[^>]*data-team-request-editor="codemirror"[^>]*>/,
    )?.[0];
    const titleInputTag = html.match(/<input[^>]*name="title"[^>]*>/)?.[0];
    const threadIdInputTag = html.match(/<input[^>]*name="threadId"[^>]*>/)?.[0];
    const repositorySelectTag = html.match(/<select[^>]*name="repositoryId"[^>]*>/)?.[0];

    expect(html).toContain('<span class="harness-form-label">Request</span>');
    expect(html).toContain('<span class="harness-form-label">Request Title</span>');
    expect(html).toContain('<span class="harness-form-label">Thread ID</span>');
    expect(html).toContain('<span class="harness-form-label">Repository</span>');
    expect(requestEditorTag).toBeDefined();
    expect(requestEditorTag).not.toContain("harness-native-control");
    expect(titleInputTag).toContain('class="harness-native-control"');
    expect(threadIdInputTag).toContain('class="harness-native-control"');
    expect(repositorySelectTag).toContain('class="harness-native-control"');
  });

  it("keeps request editor markdown styling scoped in the editor CSS module", () => {
    const editorCss = readFileSync(
      path.join(rootDirectory, "components", "codemirror-text-editor.module.css"),
      "utf8",
    );

    expect(editorCss).toContain(".team-request-editor :global(.cm-header)");
    expect(editorCss).toContain(".team-request-editor :global(.cm-link)");
    expect(editorCss).toContain(".team-request-editor :global(.CodeMirror-line)");
    expect(editorCss).toContain(".team-request-editor :global(.CodeMirror) textarea");
    expect(editorCss).toContain("text-transform: none;");
  });
});
