import { describe, expect, it, vi } from "vitest";
import { buildWorkspaceTabMenuEntries } from "@/screens/workspace/workspace-tab-menu";
import type { WorkspaceTabDescriptor } from "@/screens/workspace/workspace-tabs-types";

function createAgentTab(): WorkspaceTabDescriptor {
  return {
    key: "agent_123",
    tabId: "agent_123",
    kind: "agent",
    target: { kind: "agent", agentId: "agent-123" },
  };
}

function createFileTab(path = "/repo/src/index.ts"): WorkspaceTabDescriptor {
  return {
    key: "file_%2Frepo%2Fsrc%2Findex.ts",
    tabId: "file_%2Frepo%2Fsrc%2Findex.ts",
    kind: "file",
    target: { kind: "file", path },
  };
}

describe("buildWorkspaceTabMenuEntries", () => {
  it("uses desktop tab ordering labels for desktop menus", () => {
    const onCopyResumeCommand = vi.fn();
    const onCopyAgentId = vi.fn();
    const onCopyFilePath = vi.fn();
    const onReloadAgent = vi.fn();
    const onCloseTab = vi.fn();
    const onCloseTabsBefore = vi.fn();
    const onCloseTabsAfter = vi.fn();
    const onCloseOtherTabs = vi.fn();

    const entries = buildWorkspaceTabMenuEntries({
      surface: "desktop",
      tab: createAgentTab(),
      index: 1,
      tabCount: 3,
      menuTestIDBase: "workspace-tab-context-agent_123",
      onCopyResumeCommand,
      onCopyAgentId,
      onCopyFilePath,
      onReloadAgent,
      onCloseTab,
      onCloseTabsBefore,
      onCloseTabsAfter,
      onCloseOtherTabs,
    });

    expect(entries.filter((entry) => entry.kind === "item").map((entry) => entry.label)).toEqual([
      "Copy resume command",
      "Copy agent id",
      "Close to the left",
      "Close to the right",
      "Close other tabs",
      "Reload agent",
      "Close",
    ]);
  });

  it("uses stacked ordering labels for mobile menus", () => {
    const entries = buildWorkspaceTabMenuEntries({
      surface: "mobile",
      tab: createAgentTab(),
      index: 1,
      tabCount: 3,
      menuTestIDBase: "workspace-tab-menu-agent_123",
      onCopyResumeCommand: vi.fn(),
      onCopyAgentId: vi.fn(),
      onCopyFilePath: vi.fn(),
      onReloadAgent: vi.fn(),
      onCloseTab: vi.fn(),
      onCloseTabsBefore: vi.fn(),
      onCloseTabsAfter: vi.fn(),
      onCloseOtherTabs: vi.fn(),
    });

    expect(entries.filter((entry) => entry.kind === "item").map((entry) => entry.label)).toEqual([
      "Copy resume command",
      "Copy agent id",
      "Close tabs above",
      "Close tabs below",
      "Close other tabs",
      "Reload agent",
      "Close",
    ]);
  });

  it("omits agent copy actions for non-agent tabs", () => {
    const entries = buildWorkspaceTabMenuEntries({
      surface: "mobile",
      tab: {
        key: "draft_123",
        tabId: "draft_123",
        kind: "draft",
        target: { kind: "draft", draftId: "draft_123" },
      },
      index: 0,
      tabCount: 1,
      menuTestIDBase: "workspace-tab-menu-draft_123",
      onCopyResumeCommand: vi.fn(),
      onCopyAgentId: vi.fn(),
      onCopyFilePath: vi.fn(),
      onReloadAgent: vi.fn(),
      onCloseTab: vi.fn(),
      onCloseTabsBefore: vi.fn(),
      onCloseTabsAfter: vi.fn(),
      onCloseOtherTabs: vi.fn(),
    });

    expect(entries.some((entry) => entry.kind === "item" && entry.label === "Copy agent id")).toBe(
      false,
    );
    expect(entries.some((entry) => entry.kind === "item" && entry.label === "Reload agent")).toBe(
      false,
    );
    expect(entries.some((entry) => entry.kind === "separator")).toBe(false);
  });

  it("adds reload tooltip copy for agent tabs", () => {
    const entries = buildWorkspaceTabMenuEntries({
      surface: "desktop",
      tab: createAgentTab(),
      index: 0,
      tabCount: 1,
      menuTestIDBase: "workspace-tab-context-agent_123",
      onCopyResumeCommand: vi.fn(),
      onCopyAgentId: vi.fn(),
      onCopyFilePath: vi.fn(),
      onReloadAgent: vi.fn(),
      onCloseTab: vi.fn(),
      onCloseTabsBefore: vi.fn(),
      onCloseTabsAfter: vi.fn(),
      onCloseOtherTabs: vi.fn(),
    });

    expect(entries).toContainEqual(
      expect.objectContaining({
        kind: "item",
        key: "reload-agent",
        tooltip: "Reload agent to update skills, MCPs or login status.",
      }),
    );
  });

  it("adds copy path for file tabs", () => {
    const onCopyFilePath = vi.fn();
    const entries = buildWorkspaceTabMenuEntries({
      surface: "desktop",
      tab: createFileTab("/repo/src/index.ts"),
      index: 0,
      tabCount: 2,
      menuTestIDBase: "workspace-tab-context-file_%2Frepo%2Fsrc%2Findex.ts",
      onCopyResumeCommand: vi.fn(),
      onCopyAgentId: vi.fn(),
      onCopyFilePath,
      onReloadAgent: vi.fn(),
      onCloseTab: vi.fn(),
      onCloseTabsBefore: vi.fn(),
      onCloseTabsAfter: vi.fn(),
      onCloseOtherTabs: vi.fn(),
    });

    expect(entries.filter((entry) => entry.kind === "item").map((entry) => entry.label)).toEqual([
      "Copy path",
      "Close to the left",
      "Close to the right",
      "Close other tabs",
      "Close",
    ]);

    const copyPathEntry = entries.find(
      (entry) => entry.kind === "item" && entry.key === "copy-path",
    );
    expect(copyPathEntry).toEqual(
      expect.objectContaining({
        kind: "item",
        icon: "copy",
        label: "Copy path",
        testID: "workspace-tab-context-file_%2Frepo%2Fsrc%2Findex.ts-copy-path",
      }),
    );

    if (copyPathEntry?.kind === "item") {
      copyPathEntry.onSelect();
    }
    expect(onCopyFilePath).toHaveBeenCalledWith("/repo/src/index.ts");
  });
});
