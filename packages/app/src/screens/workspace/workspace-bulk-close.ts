import type { WorkspaceTabDescriptor } from "@/screens/workspace/workspace-tabs-types";

export type BulkClosableTabGroups = {
  agentTabs: Array<{ tabId: string; agentId: string }>;
  terminalTabs: Array<{ tabId: string; terminalId: string }>;
  otherTabs: Array<{ tabId: string }>;
};

export function classifyBulkClosableTabs(tabs: WorkspaceTabDescriptor[]): BulkClosableTabGroups {
  const groups: BulkClosableTabGroups = {
    agentTabs: [],
    terminalTabs: [],
    otherTabs: [],
  };

  for (const tab of tabs) {
    if (tab.kind === "agent") {
      groups.agentTabs.push({ tabId: tab.tabId, agentId: tab.agentId });
      continue;
    }
    if (tab.kind === "terminal") {
      groups.terminalTabs.push({ tabId: tab.tabId, terminalId: tab.terminalId });
      continue;
    }
    groups.otherTabs.push({ tabId: tab.tabId });
  }

  return groups;
}

export function buildBulkCloseConfirmationMessage(input: BulkClosableTabGroups): string {
  const { agentTabs, terminalTabs, otherTabs } = input;
  if (agentTabs.length > 0 && terminalTabs.length > 0 && otherTabs.length > 0) {
    return `This will archive ${agentTabs.length} agent(s), close ${terminalTabs.length} terminal(s), and close ${otherTabs.length} tab(s). Any running process in a closed terminal will be stopped immediately.`;
  }
  if (agentTabs.length > 0 && terminalTabs.length > 0) {
    return `This will archive ${agentTabs.length} agent(s) and close ${terminalTabs.length} terminal(s). Any running process in a closed terminal will be stopped immediately.`;
  }
  if (terminalTabs.length > 0 && otherTabs.length > 0) {
    return `This will close ${terminalTabs.length} terminal(s) and close ${otherTabs.length} tab(s). Any running process in a closed terminal will be stopped immediately.`;
  }
  if (agentTabs.length > 0 && otherTabs.length > 0) {
    return `This will archive ${agentTabs.length} agent(s) and close ${otherTabs.length} tab(s).`;
  }
  if (terminalTabs.length > 0) {
    return `This will close ${terminalTabs.length} terminal(s). Any running process in a closed terminal will be stopped immediately.`;
  }
  if (otherTabs.length > 0) {
    return `This will close ${otherTabs.length} tab(s).`;
  }
  return `This will archive ${agentTabs.length} agent(s).`;
}
