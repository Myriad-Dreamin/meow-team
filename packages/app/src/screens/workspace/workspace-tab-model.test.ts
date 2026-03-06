import { describe, expect, it } from "vitest";
import type { Agent } from "@/stores/session-store";
import { deriveWorkspaceTabModel } from "@/screens/workspace/workspace-tab-model";
import type { WorkspaceTab } from "@/stores/workspace-tabs-store";

function makeAgent(input: {
  id: string;
  provider?: Agent["provider"];
  title?: string | null;
  createdAt?: Date;
  lastActivityAt?: Date;
  requiresAttention?: boolean;
  attentionReason?: Agent["attentionReason"];
}): Agent {
  const createdAt = input.createdAt ?? new Date("2026-03-04T00:00:00.000Z");
  const lastActivityAt = input.lastActivityAt ?? createdAt;
  return {
    serverId: "srv",
    id: input.id,
    provider: input.provider ?? "codex",
    status: "idle",
    createdAt,
    updatedAt: createdAt,
    lastUserMessageAt: null,
    lastActivityAt,
    capabilities: {
      supportsStreaming: true,
      supportsSessionPersistence: true,
      supportsDynamicModes: true,
      supportsMcpServers: true,
      supportsReasoningStream: true,
      supportsToolInvocations: true,
    },
    currentModeId: null,
    availableModes: [],
    pendingPermissions: [],
    persistence: null,
    runtimeInfo: {
      provider: input.provider ?? "codex",
      sessionId: null,
    },
    title: input.title ?? null,
    cwd: "/repo/worktree",
    model: null,
    thinkingOptionId: null,
    labels: {},
    requiresAttention: input.requiresAttention ?? false,
    attentionReason: input.attentionReason ?? null,
    attentionTimestamp: null,
    archivedAt: null,
  };
}

describe("deriveWorkspaceTabModel", () => {
  it("derives agent and terminal tabs from domain state, not UI membership", () => {
    const model = deriveWorkspaceTabModel({
      workspaceAgents: [
        makeAgent({ id: "agent-a", title: "Build API" }),
        makeAgent({ id: "agent-b", title: "" }),
      ],
      terminals: [{ id: "term-1", name: "shell" }],
      tabs: [
        { tabId: "agent_agent-a", target: { kind: "agent", agentId: "agent-a" }, createdAt: 1 },
        { tabId: "agent_agent-b", target: { kind: "agent", agentId: "agent-b" }, createdAt: 2 },
        { tabId: "terminal_term-1", target: { kind: "terminal", terminalId: "term-1" }, createdAt: 3 },
      ],
      tabOrder: [],
    });

    expect(model.tabs.map((tab) => tab.descriptor.tabId)).toEqual([
      "agent_agent-a",
      "agent_agent-b",
      "terminal_term-1",
    ]);
    const firstAgent = model.tabs[0]?.descriptor;
    const secondAgent = model.tabs[1]?.descriptor;
    expect(firstAgent?.kind === "agent" ? firstAgent.titleState : null).toBe("ready");
    expect(secondAgent?.kind === "agent" ? secondAgent.titleState : null).toBe("loading");
    expect(secondAgent?.label).toBe("");
  });

  it("keeps draft and file tabs as explicit UI tabs", () => {
    const uiTabs: WorkspaceTab[] = [
      {
        tabId: "draft_123",
        target: { kind: "draft", draftId: "draft_123" },
        createdAt: 1,
      },
      {
        tabId: "file_/repo/worktree/README.md",
        target: { kind: "file", path: "/repo/worktree/README.md" },
        createdAt: 2,
      },
    ];

    const model = deriveWorkspaceTabModel({
      workspaceAgents: [makeAgent({ id: "agent-a", title: "A" })],
      terminals: [],
      tabs: [
        ...uiTabs,
        { tabId: "agent_agent-a", target: { kind: "agent", agentId: "agent-a" }, createdAt: 3 },
      ],
      tabOrder: ["draft_123", "agent_agent-a", "file_/repo/worktree/README.md"],
    });

    expect(model.tabs.map((tab) => tab.descriptor.kind)).toEqual(["draft", "agent", "file"]);
  });

  it("applies stored order and appends newly-derived tabs deterministically", () => {
    const model = deriveWorkspaceTabModel({
      workspaceAgents: [makeAgent({ id: "agent-a" }), makeAgent({ id: "agent-b" })],
      terminals: [{ id: "term-1", name: "zsh" }],
      tabs: [
        { tabId: "agent_agent-a", target: { kind: "agent", agentId: "agent-a" }, createdAt: 1 },
        { tabId: "agent_agent-b", target: { kind: "agent", agentId: "agent-b" }, createdAt: 2 },
        { tabId: "terminal_term-1", target: { kind: "terminal", terminalId: "term-1" }, createdAt: 3 },
      ],
      tabOrder: ["terminal_term-1", "agent_agent-b"],
    });

    expect(model.tabs.map((tab) => tab.descriptor.tabId)).toEqual([
      "terminal_term-1",
      "agent_agent-b",
      "agent_agent-a",
    ]);
  });

  it("uses focused tab when present, otherwise falls back to first tab", () => {
    const base: Parameters<typeof deriveWorkspaceTabModel>[0] = {
      workspaceAgents: [makeAgent({ id: "agent-a" }), makeAgent({ id: "agent-b" })],
      terminals: [],
      tabs: [
        { tabId: "agent_agent-a", target: { kind: "agent", agentId: "agent-a" }, createdAt: 1 },
        { tabId: "agent_agent-b", target: { kind: "agent", agentId: "agent-b" }, createdAt: 2 },
      ],
      tabOrder: ["agent_agent-a", "agent_agent-b"],
    };

    expect(
      deriveWorkspaceTabModel({
        ...base,
        focusedTabId: "agent_agent-b",
      }).activeTabId
    ).toBe("agent_agent-b");

    expect(
      deriveWorkspaceTabModel({
        ...base,
        focusedTabId: "agent_agent-b",
      }).activeTabId
    ).toBe("agent_agent-b");
  });

  it("prefers the route-selected target over stale focused tab state", () => {
    const model = deriveWorkspaceTabModel({
      workspaceAgents: [makeAgent({ id: "agent-a" }), makeAgent({ id: "agent-b" })],
      terminals: [],
      tabs: [
        { tabId: "agent_agent-a", target: { kind: "agent", agentId: "agent-a" }, createdAt: 1 },
        { tabId: "agent_agent-b", target: { kind: "agent", agentId: "agent-b" }, createdAt: 2 },
      ],
      tabOrder: ["agent_agent-a", "agent_agent-b"],
      focusedTabId: "agent_agent-a",
      preferredTarget: { kind: "agent", agentId: "agent-b" },
    });

    expect(model.activeTabId).toBe("agent_agent-b");
    expect(model.activeTab?.target).toEqual({ kind: "agent", agentId: "agent-b" });
  });

  it("re-resolves active content for a new workspace when prior focused tab is not available", () => {
    const model = deriveWorkspaceTabModel({
      workspaceAgents: [makeAgent({ id: "workspace-b-agent", title: "B" })],
      terminals: [],
      tabs: [
        {
          tabId: "agent_workspace-b-agent",
          target: { kind: "agent", agentId: "workspace-b-agent" },
          createdAt: 1,
        },
      ],
      tabOrder: ["agent_workspace-b-agent"],
      focusedTabId: "agent_workspace-a-agent",
    });

    expect(model.activeTabId).toBe("agent_workspace-b-agent");
    expect(model.activeTab?.target).toEqual({
      kind: "agent",
      agentId: "workspace-b-agent",
    });
  });

  it("does not materialize tabs absent from workspace tab membership", () => {
    const offending = makeAgent({
      id: "offender",
      title: "Needs permission",
      requiresAttention: true,
      attentionReason: "permission",
    });

    const model = deriveWorkspaceTabModel({
      workspaceAgents: [offending],
      terminals: [],
      tabs: [
        {
          tabId: "draft_123",
          target: { kind: "draft", draftId: "draft_123" },
          createdAt: 1,
        },
      ],
      tabOrder: ["draft_123"],
    });

    expect(model.tabs.some((tab) => tab.descriptor.tabId === "agent_offender")).toBe(false);
  });

  it("keeps retargeted agent tab id stable while upgrading descriptor data", () => {
    const model = deriveWorkspaceTabModel({
      workspaceAgents: [],
      terminals: [],
      tabs: [
        {
          tabId: "draft_abc",
          target: { kind: "agent", agentId: "agent-1" },
          createdAt: 1,
        },
      ],
      tabOrder: ["draft_abc"],
    });
    const initial = model.tabs[0]?.descriptor;
    expect(initial?.tabId).toBe("draft_abc");
    expect(initial?.kind).toBe("agent");
    if (initial?.kind === "agent") {
      expect(initial.titleState).toBe("loading");
      expect(initial.agentId).toBe("agent-1");
    }

    const upgraded = deriveWorkspaceTabModel({
      workspaceAgents: [makeAgent({ id: "agent-1", title: "Ready title" })],
      terminals: [],
      tabs: [
        {
          tabId: "draft_abc",
          target: { kind: "agent", agentId: "agent-1" },
          createdAt: 1,
        },
      ],
      tabOrder: ["draft_abc"],
    });
    const upgradedDescriptor = upgraded.tabs[0]?.descriptor;
    expect(upgradedDescriptor?.tabId).toBe("draft_abc");
    if (upgradedDescriptor?.kind === "agent") {
      expect(upgradedDescriptor.titleState).toBe("ready");
      expect(upgradedDescriptor.label).toBe("Ready title");
    }
  });

  it("prefers a retargeted tab when the route selects its upgraded agent target", () => {
    const model = deriveWorkspaceTabModel({
      workspaceAgents: [makeAgent({ id: "agent-1", title: "Ready title" })],
      terminals: [],
      tabs: [
        {
          tabId: "draft_abc",
          target: { kind: "agent", agentId: "agent-1" },
          createdAt: 1,
        },
      ],
      tabOrder: ["draft_abc"],
      focusedTabId: "some_other_tab",
      preferredTarget: { kind: "agent", agentId: "agent-1" },
    });

    expect(model.activeTabId).toBe("draft_abc");
    expect(model.activeTab?.descriptor.tabId).toBe("draft_abc");
  });
});
