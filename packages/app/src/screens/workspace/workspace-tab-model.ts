import type { Agent } from "@/stores/session-store";
import type { WorkspaceTab, WorkspaceTabTarget } from "@/stores/workspace-tabs-store";
import type { WorkspaceTabDescriptor } from "@/screens/workspace/workspace-tabs-types";

type TerminalLike = {
  id: string;
  name?: string | null;
};

export type WorkspaceDerivedTab = {
  descriptor: WorkspaceTabDescriptor;
  target: WorkspaceTabTarget;
};

export type WorkspaceTabModel = {
  tabs: WorkspaceDerivedTab[];
  activeTabId: string | null;
  activeTab: WorkspaceDerivedTab | null;
};

function trimNonEmpty(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function tabTargetsEqual(left: WorkspaceTabTarget, right: WorkspaceTabTarget): boolean {
  if (left.kind !== right.kind) {
    return false;
  }
  if (left.kind === "draft" && right.kind === "draft") {
    return left.draftId === right.draftId;
  }
  if (left.kind === "agent" && right.kind === "agent") {
    return left.agentId === right.agentId;
  }
  if (left.kind === "terminal" && right.kind === "terminal") {
    return left.terminalId === right.terminalId;
  }
  if (left.kind === "file" && right.kind === "file") {
    return left.path === right.path;
  }
  return false;
}

function formatProviderLabel(provider: Agent["provider"]): string {
  if (provider === "claude") {
    return "Claude";
  }
  if (provider === "codex") {
    return "Codex";
  }
  if (!provider) {
    return "Agent";
  }
  return provider.charAt(0).toUpperCase() + provider.slice(1);
}

function resolveWorkspaceAgentTabLabel(title: string | null | undefined): string | null {
  if (typeof title !== "string") {
    return null;
  }
  const normalized = title.trim();
  if (!normalized) {
    return null;
  }
  if (normalized.toLowerCase() === "new agent") {
    return null;
  }
  return normalized;
}

function normalizeWorkspaceTab(tab: WorkspaceTab): WorkspaceTab | null {
  if (!tab || typeof tab !== "object") {
    return null;
  }
  const tabId = trimNonEmpty(tab.tabId);
  if (!tabId) {
    return null;
  }
  if (!tab.target || typeof tab.target !== "object") {
    return null;
  }
  if (tab.target.kind === "draft") {
    const draftId = trimNonEmpty(tab.target.draftId);
    if (!draftId) {
      return null;
    }
    return {
      tabId,
      target: { kind: "draft", draftId },
      createdAt: tab.createdAt,
    };
  }
  if (tab.target.kind === "agent") {
    const agentId = trimNonEmpty(tab.target.agentId);
    if (!agentId) {
      return null;
    }
    return {
      tabId,
      target: { kind: "agent", agentId },
      createdAt: tab.createdAt,
    };
  }
  if (tab.target.kind === "terminal") {
    const terminalId = trimNonEmpty(tab.target.terminalId);
    if (!terminalId) {
      return null;
    }
    return {
      tabId,
      target: { kind: "terminal", terminalId },
      createdAt: tab.createdAt,
    };
  }
  if (tab.target.kind === "file") {
    const path = trimNonEmpty(tab.target.path);
    if (!path) {
      return null;
    }
    return {
      tabId,
      target: { kind: "file", path: path.replace(/\\/g, "/") },
      createdAt: tab.createdAt,
    };
  }
  return null;
}

export function buildWorkspaceTabId(target: WorkspaceTabTarget): string {
  if (target.kind === "draft") {
    return target.draftId;
  }
  if (target.kind === "agent") {
    return `agent_${target.agentId}`;
  }
  if (target.kind === "terminal") {
    return `terminal_${target.terminalId}`;
  }
  return `file_${target.path}`;
}

export function deriveWorkspaceTabModel(input: {
  workspaceAgents: Agent[];
  terminals: TerminalLike[];
  tabs: WorkspaceTab[];
  tabOrder: string[];
  focusedTabId?: string | null;
  preferredTarget?: WorkspaceTabTarget | null;
}): WorkspaceTabModel {
  const tabsById = new Map<string, WorkspaceDerivedTab>();
  const agentsById = new Map(input.workspaceAgents.map((agent) => [agent.id, agent]));
  const terminalsById = new Map(input.terminals.map((terminal) => [terminal.id, terminal]));

  const normalizedTabs = input.tabs
    .map((tab) => normalizeWorkspaceTab(tab))
    .filter((tab): tab is WorkspaceTab => tab !== null)
    .sort((left, right) => left.createdAt - right.createdAt);

  for (const tab of normalizedTabs) {
    if (tab.target.kind === "draft") {
      tabsById.set(tab.tabId, {
        target: tab.target,
        descriptor: {
          key: tab.tabId,
          tabId: tab.tabId,
          kind: "draft",
          draftId: tab.target.draftId,
          label: "Draft",
          subtitle: "Draft",
        },
      });
      continue;
    }

    if (tab.target.kind === "agent") {
      const agent = agentsById.get(tab.target.agentId) ?? null;
      const label = resolveWorkspaceAgentTabLabel(agent?.title);
      const provider = agent?.provider ?? "codex";
      tabsById.set(tab.tabId, {
        target: tab.target,
        descriptor: {
          key: tab.tabId,
          tabId: tab.tabId,
          kind: "agent",
          agentId: tab.target.agentId,
          provider,
          label: label ?? "",
          subtitle: `${formatProviderLabel(provider)} agent`,
          titleState: label ? "ready" : "loading",
        },
      });
      continue;
    }

    if (tab.target.kind === "terminal") {
      const terminal = terminalsById.get(tab.target.terminalId) ?? null;
      tabsById.set(tab.tabId, {
        target: tab.target,
        descriptor: {
          key: tab.tabId,
          tabId: tab.tabId,
          kind: "terminal",
          terminalId: tab.target.terminalId,
          label: trimNonEmpty(terminal?.name ?? null) ?? "Terminal",
          subtitle: "Terminal",
        },
      });
      continue;
    }

    if (tab.target.kind === "file") {
      const filePath = tab.target.path;
      const fileName = filePath.split("/").filter(Boolean).pop() ?? filePath;
      tabsById.set(tab.tabId, {
        target: tab.target,
        descriptor: {
          key: tab.tabId,
          tabId: tab.tabId,
          kind: "file",
          filePath,
          label: fileName,
          subtitle: filePath,
        },
      });
    }
  }

  const orderedTabIds: string[] = [];
  const used = new Set<string>();
  for (const tabId of input.tabOrder) {
    const normalizedTabId = trimNonEmpty(tabId);
    if (!normalizedTabId || used.has(normalizedTabId) || !tabsById.has(normalizedTabId)) {
      continue;
    }
    used.add(normalizedTabId);
    orderedTabIds.push(normalizedTabId);
  }

  for (const tabId of tabsById.keys()) {
    if (used.has(tabId)) {
      continue;
    }
    used.add(tabId);
    orderedTabIds.push(tabId);
  }

  const tabs = orderedTabIds
    .map((tabId) => tabsById.get(tabId) ?? null)
    .filter((tab): tab is WorkspaceDerivedTab => tab !== null);

  const openTabIds = new Set(tabs.map((tab) => tab.descriptor.tabId));
  const focusedTabId = trimNonEmpty(input.focusedTabId);
  const preferredTarget = input.preferredTarget ?? null;
  const preferredTabId = (() => {
    if (!preferredTarget) {
      return null;
    }
    const matchingTab =
      tabs.find((tab) => tabTargetsEqual(tab.target, preferredTarget)) ?? null;
    return matchingTab?.descriptor.tabId ?? buildWorkspaceTabId(preferredTarget);
  })();

  const activeTabId =
    preferredTabId && openTabIds.has(preferredTabId)
      ? preferredTabId
      : focusedTabId && openTabIds.has(focusedTabId)
      ? focusedTabId
      : tabs[0]?.descriptor.tabId ?? null;

  const activeTab = activeTabId
    ? tabs.find((tab) => tab.descriptor.tabId === activeTabId) ?? null
    : null;

  return {
    tabs,
    activeTabId,
    activeTab,
  };
}
