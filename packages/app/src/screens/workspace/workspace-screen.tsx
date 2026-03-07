import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  Platform,
  Pressable,
  Text,
  useColorScheme,
  View,
} from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import {
  ChevronDown,
  Folder,
  GitBranch,
  PanelRight,
  Plus,
  SquareTerminal,
} from "lucide-react-native";
import { GestureDetector } from "react-native-gesture-handler";
import { StyleSheet, UnistylesRuntime, useUnistyles } from "react-native-unistyles";
import { SidebarMenuToggle } from "@/components/headers/menu-header";
import { HeaderToggleButton } from "@/components/headers/header-toggle-button";
import { ScreenHeader } from "@/components/headers/screen-header";
import { Combobox } from "@/components/ui/combobox";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ExplorerSidebar } from "@/components/explorer-sidebar";
import { FilePane } from "@/components/file-pane";
import { TerminalPane } from "@/components/terminal-pane";
import { ExplorerSidebarAnimationProvider } from "@/contexts/explorer-sidebar-animation-context";
import { useToast } from "@/contexts/toast-context";
import { useExplorerOpenGesture } from "@/hooks/use-explorer-open-gesture";
import { usePanelStore, type ExplorerCheckoutContext } from "@/stores/panel-store";
import {
  useSessionStore,
} from "@/stores/session-store";
import {
  buildWorkspaceTabPersistenceKey,
  useWorkspaceTabsStore,
} from "@/stores/workspace-tabs-store";
import { useKeyboardShortcutsStore } from "@/stores/keyboard-shortcuts-store";
import { useCreateFlowStore } from "@/stores/create-flow-store";
import {
  buildWorkspaceOpenIntentParam,
  type WorkspaceOpenIntent,
  decodeWorkspaceIdFromPathSegment,
} from "@/utils/host-routes";
import { normalizeWorkspaceIdentity } from "@/utils/workspace-identity";
import { useHostRuntimeSession } from "@/runtime/host-runtime";
import { useWorkspaceTerminalSessionRetention } from "@/terminal/hooks/use-workspace-terminal-session-retention";
import {
  checkoutStatusQueryKey,
  type CheckoutStatusPayload,
} from "@/hooks/use-checkout-status-query";
import { AgentReadyScreen } from "@/screens/agent/agent-ready-screen";
import type { ListTerminalsResponse } from "@server/shared/messages";
import { upsertTerminalListEntry } from "@/utils/terminal-list";
import { confirmDialog } from "@/utils/confirm-dialog";
import { useArchiveAgent } from "@/hooks/use-archive-agent";
import { buildProviderCommand } from "@/utils/provider-command-templates";
import { generateDraftId } from "@/stores/draft-keys";
import { normalizeAgentSnapshot } from "@/utils/agent-snapshots";
import { WorkspaceDraftAgentTab } from "@/screens/workspace/workspace-draft-agent-tab";
import { WorkspaceDesktopTabsRow } from "@/screens/workspace/workspace-desktop-tabs-row";
import {
  deriveWorkspaceTabPresentation,
  WorkspaceTabIcon,
  WorkspaceTabOptionRow,
} from "@/screens/workspace/workspace-tab-presentation";
import type { WorkspaceTabDescriptor } from "@/screens/workspace/workspace-tabs-types";
import {
  resolveWorkspaceHeader,
  shouldRenderMissingWorkspaceDescriptor,
} from "@/screens/workspace/workspace-header-source";
import {
  deriveWorkspaceAgentVisibility,
} from "@/screens/workspace/workspace-agent-visibility";
import {
  deriveWorkspaceTabModel,
} from "@/screens/workspace/workspace-tab-model";
import {
  buildBulkCloseConfirmationMessage,
  classifyBulkClosableTabs,
} from "@/screens/workspace/workspace-bulk-close";

const TERMINALS_QUERY_STALE_TIME = 5_000;
const NEW_TAB_AGENT_OPTION_ID = "__new_tab_agent__";
const NEW_TAB_TERMINAL_OPTION_ID = "__new_tab_terminal__";
const EMPTY_UI_TABS: ReturnType<typeof useWorkspaceTabsStore.getState>["uiTabsByWorkspace"][string] = [];
const EMPTY_TAB_ORDER: string[] = [];

type WorkspaceScreenProps = {
  serverId: string;
  workspaceId: string;
  openIntent?: WorkspaceOpenIntent | null;
};

function trimNonEmpty(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function decodeSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function WorkspaceScreen({
  serverId,
  workspaceId,
  openIntent,
}: WorkspaceScreenProps) {
  return (
    <ExplorerSidebarAnimationProvider>
      <WorkspaceScreenContent
        serverId={serverId}
        workspaceId={workspaceId}
        openIntent={openIntent}
      />
    </ExplorerSidebarAnimationProvider>
  );
}

function WorkspaceScreenContent({
  serverId,
  workspaceId,
  openIntent,
}: WorkspaceScreenProps) {
  const { theme } = useUnistyles();
  const isDarkMode = useColorScheme() === "dark";
  const mainBackgroundColor = isDarkMode ? theme.colors.surface1 : theme.colors.surface0;
  const toast = useToast();
  const isMobile =
    UnistylesRuntime.breakpoint === "xs" || UnistylesRuntime.breakpoint === "sm";

  const normalizedServerId = trimNonEmpty(decodeSegment(serverId)) ?? "";
  const normalizedWorkspaceId =
    normalizeWorkspaceIdentity(decodeWorkspaceIdFromPathSegment(workspaceId)) ?? "";
  const workspaceTerminalScopeKey =
    normalizedServerId && normalizedWorkspaceId
      ? `${normalizedServerId}:${normalizedWorkspaceId}`
      : null;
  useWorkspaceTerminalSessionRetention({
    scopeKey: workspaceTerminalScopeKey,
  });

  const queryClient = useQueryClient();
  const { client, isConnected } = useHostRuntimeSession(normalizedServerId);

  const sessionAgents = useSessionStore(
    (state) => state.sessions[normalizedServerId]?.agents
  );
  const workspaceAgentVisibility = useMemo(
    () =>
      deriveWorkspaceAgentVisibility({
        sessionAgents,
        workspaceId: normalizedWorkspaceId,
      }),
    [normalizedWorkspaceId, sessionAgents]
  );
  const workspaceAgents = workspaceAgentVisibility.visibleAgents;

  const terminalsQueryKey = useMemo(
    () => ["terminals", normalizedServerId, normalizedWorkspaceId] as const,
    [normalizedServerId, normalizedWorkspaceId]
  );
  type ListTerminalsPayload = ListTerminalsResponse["payload"];
  const terminalsQuery = useQuery({
    queryKey: terminalsQueryKey,
    enabled:
      Boolean(client && isConnected) &&
      normalizedWorkspaceId.length > 0 &&
      normalizedWorkspaceId.startsWith("/"),
    queryFn: async () => {
      if (!client) {
        throw new Error("Host is not connected");
      }
      return await client.listTerminals(normalizedWorkspaceId);
    },
    staleTime: TERMINALS_QUERY_STALE_TIME,
  });
  const terminals = terminalsQuery.data?.terminals ?? [];
  const createTerminalMutation = useMutation({
    mutationFn: async () => {
      if (!client) {
        throw new Error("Host is not connected");
      }
      return await client.createTerminal(normalizedWorkspaceId);
    },
    onSuccess: (payload) => {
      const createdTerminal = payload.terminal;
      if (createdTerminal) {
        queryClient.setQueryData<ListTerminalsPayload>(
          terminalsQueryKey,
          (current) => {
            const nextTerminals = upsertTerminalListEntry({
              terminals: current?.terminals ?? [],
              terminal: createdTerminal,
            });
            return {
              cwd: current?.cwd ?? normalizedWorkspaceId,
              terminals: nextTerminals,
              requestId: current?.requestId ?? `terminal-create-${createdTerminal.id}`,
            };
          }
        );
      }

      void queryClient.invalidateQueries({ queryKey: terminalsQueryKey });
      if (createdTerminal) {
        const tabId = useWorkspaceTabsStore
          .getState()
          .openOrFocusTab({
            serverId: normalizedServerId,
            workspaceId: normalizedWorkspaceId,
            target: { kind: "terminal", terminalId: createdTerminal.id },
          });
        if (tabId) {
          useWorkspaceTabsStore.getState().focusTab({
            serverId: normalizedServerId,
            workspaceId: normalizedWorkspaceId,
            tabId,
          });
        }
      }
    },
  });
  const killTerminalMutation = useMutation({
    mutationFn: async (terminalId: string) => {
      if (!client) {
        throw new Error("Host is not connected");
      }
      const payload = await client.killTerminal(terminalId);
      if (!payload.success) {
        throw new Error("Unable to close terminal");
      }
      return payload;
    },
  });
  const { archiveAgent, isArchivingAgent } = useArchiveAgent();

  useEffect(() => {
    if (!client || !isConnected || !normalizedWorkspaceId.startsWith("/")) {
      return;
    }

    const unsubscribeChanged = client.on("terminals_changed", (message) => {
      if (message.type !== "terminals_changed") {
        return;
      }
      if (message.payload.cwd !== normalizedWorkspaceId) {
        return;
      }

      queryClient.setQueryData<ListTerminalsPayload>(terminalsQueryKey, (current) => ({
        cwd: message.payload.cwd,
        terminals: message.payload.terminals,
        requestId: current?.requestId ?? `terminals-changed-${Date.now()}`,
      }));
    });

    const unsubscribeStreamExit = client.on("terminal_stream_exit", (message) => {
      if (message.type !== "terminal_stream_exit") {
        return;
      }
    });

    client.subscribeTerminals({ cwd: normalizedWorkspaceId });

    return () => {
      unsubscribeChanged();
      unsubscribeStreamExit();
      client.unsubscribeTerminals({ cwd: normalizedWorkspaceId });
    };
  }, [client, isConnected, normalizedWorkspaceId, queryClient, terminalsQueryKey]);

  const checkoutQuery = useQuery({
    queryKey: checkoutStatusQueryKey(normalizedServerId, normalizedWorkspaceId),
    enabled:
      Boolean(client && isConnected) &&
      normalizedWorkspaceId.length > 0 &&
      normalizedWorkspaceId.startsWith("/"),
    queryFn: async () => {
      if (!client) {
        throw new Error("Host is not connected");
      }
      return (await client.getCheckoutStatus(
        normalizedWorkspaceId
      )) as CheckoutStatusPayload;
    },
    staleTime: 15_000,
  });

  const workspaceDescriptor = useSessionStore(
    (state) =>
      state.sessions[normalizedServerId]?.workspaces.get(normalizedWorkspaceId) ??
      null
  );
  const hasHydratedWorkspaces = useSessionStore(
    (state) => state.sessions[normalizedServerId]?.hasHydratedWorkspaces ?? false
  );
  const hasHydratedAgents = useSessionStore(
    (state) => state.sessions[normalizedServerId]?.hasHydratedAgents ?? false
  );
  const workspaceHeader = workspaceDescriptor
    ? resolveWorkspaceHeader({ workspace: workspaceDescriptor })
    : null;
  const isWorkspaceHeaderLoading = workspaceHeader === null;

  const isGitCheckout = checkoutQuery.data?.isGit ?? false;
  const mobileView = usePanelStore((state) => state.mobileView);
  const desktopFileExplorerOpen = usePanelStore(
    (state) => state.desktop.fileExplorerOpen
  );
  const toggleFileExplorer = usePanelStore((state) => state.toggleFileExplorer);
  const openFileExplorer = usePanelStore((state) => state.openFileExplorer);
  const activateExplorerTabForCheckout = usePanelStore(
    (state) => state.activateExplorerTabForCheckout
  );
  const closeToAgent = usePanelStore((state) => state.closeToAgent);
  const setActiveExplorerCheckout = usePanelStore(
    (state) => state.setActiveExplorerCheckout
  );

  const isExplorerOpen = isMobile
    ? mobileView === "file-explorer"
    : desktopFileExplorerOpen;

  const activeExplorerCheckout = useMemo<ExplorerCheckoutContext | null>(() => {
    if (!normalizedServerId || !normalizedWorkspaceId.startsWith("/")) {
      return null;
    }
    return {
      serverId: normalizedServerId,
      cwd: normalizedWorkspaceId,
      isGit: isGitCheckout,
    };
  }, [isGitCheckout, normalizedServerId, normalizedWorkspaceId]);

  useEffect(() => {
    setActiveExplorerCheckout(activeExplorerCheckout);
  }, [activeExplorerCheckout, setActiveExplorerCheckout]);

  const openExplorerForWorkspace = useCallback(() => {
    if (!activeExplorerCheckout) {
      return;
    }
    activateExplorerTabForCheckout(activeExplorerCheckout);
    openFileExplorer();
  }, [
    activateExplorerTabForCheckout,
    activeExplorerCheckout,
    openFileExplorer,
  ]);

  const handleToggleExplorer = useCallback(() => {
    if (isExplorerOpen) {
      toggleFileExplorer();
      return;
    }
    openExplorerForWorkspace();
  }, [isExplorerOpen, openExplorerForWorkspace, toggleFileExplorer]);

  const explorerOpenGesture = useExplorerOpenGesture({
    enabled: isMobile && mobileView === "agent",
    onOpen: openExplorerForWorkspace,
  });

  useEffect(() => {
    if (Platform.OS === "web" || !isExplorerOpen) {
      return;
    }

    const handler = BackHandler.addEventListener("hardwareBackPress", () => {
      if (isExplorerOpen) {
        closeToAgent();
        return true;
      }
      return false;
    });

    return () => handler.remove();
  }, [closeToAgent, isExplorerOpen]);

  const agentsById = workspaceAgentVisibility.lookupById;

  const persistenceKey = useMemo(
    () =>
      buildWorkspaceTabPersistenceKey({
        serverId: normalizedServerId,
        workspaceId: normalizedWorkspaceId,
      }),
    [normalizedServerId, normalizedWorkspaceId]
  );

  const uiTabs = useWorkspaceTabsStore((state) =>
    persistenceKey
      ? state.uiTabsByWorkspace[persistenceKey] ?? EMPTY_UI_TABS
      : EMPTY_UI_TABS
  );
  const tabOrder = useWorkspaceTabsStore((state) =>
    persistenceKey
      ? state.tabOrderByWorkspace[persistenceKey] ?? EMPTY_TAB_ORDER
      : EMPTY_TAB_ORDER
  );
  const focusedTabId = useWorkspaceTabsStore((state) =>
    persistenceKey ? state.focusedTabIdByWorkspace[persistenceKey] ?? "" : ""
  );
  const openDraftTab = useWorkspaceTabsStore((state) => state.openDraftTab);
  const ensureTab = useWorkspaceTabsStore((state) => state.ensureTab);
  const openOrFocusTab = useWorkspaceTabsStore((state) => state.openOrFocusTab);
  const focusTab = useWorkspaceTabsStore((state) => state.focusTab);
  const closeWorkspaceTab = useWorkspaceTabsStore((state) => state.closeTab);
  const retargetWorkspaceTab = useWorkspaceTabsStore((state) => state.retargetTab);
  const reorderWorkspaceTabs = useWorkspaceTabsStore((state) => state.reorderTabs);
  const pendingByDraftId = useCreateFlowStore((state) => state.pendingByDraftId);
  const workspaceTabActionRequest = useKeyboardShortcutsStore(
    (state) => state.workspaceTabActionRequest
  );
  const clearWorkspaceTabActionRequest = useKeyboardShortcutsStore(
    (state) => state.clearWorkspaceTabActionRequest
  );
  const consumedOpenIntentsRef = useRef(new Set<string>());

  useEffect(() => {
    if (!openIntent || !persistenceKey) {
      return;
    }

    const openParam = buildWorkspaceOpenIntentParam(openIntent);
    if (!openParam) {
      return;
    }
    const intentKey = `${normalizedServerId}:${normalizedWorkspaceId}:${openParam}`;
    if (consumedOpenIntentsRef.current.has(intentKey)) {
      return;
    }
    consumedOpenIntentsRef.current.add(intentKey);

    if (openIntent.kind === "draft") {
      const draftId = openIntent.draftId.trim();
      const tabId =
        draftId === "new"
          ? openDraftTab({
              serverId: normalizedServerId,
              workspaceId: normalizedWorkspaceId,
              draftId: generateDraftId(),
            })
          : openDraftTab({
              serverId: normalizedServerId,
              workspaceId: normalizedWorkspaceId,
              draftId,
            });
      if (tabId) {
        focusTab({
          serverId: normalizedServerId,
          workspaceId: normalizedWorkspaceId,
          tabId,
        });
      }
      return;
    }

    const tabId = openOrFocusTab({
      serverId: normalizedServerId,
      workspaceId: normalizedWorkspaceId,
      target:
        openIntent.kind === "agent"
          ? { kind: "agent", agentId: openIntent.agentId }
          : openIntent.kind === "terminal"
            ? { kind: "terminal", terminalId: openIntent.terminalId }
            : { kind: "file", path: openIntent.path },
    });
    if (tabId) {
      focusTab({
        serverId: normalizedServerId,
        workspaceId: normalizedWorkspaceId,
        tabId,
      });
    }
  }, [
    focusTab,
    openDraftTab,
    openIntent,
    openOrFocusTab,
    persistenceKey,
    normalizedServerId,
    normalizedWorkspaceId,
  ]);

  useEffect(() => {
    if (!normalizedServerId || !normalizedWorkspaceId) {
      return;
    }

    const agentIds = new Set(workspaceAgents.map((agent) => agent.id));
    const terminalIds = new Set(terminals.map((terminal) => terminal.id));
    const hasActivePendingDraftCreateInWorkspace = uiTabs.some((tab) => {
      if (tab.target.kind !== "draft") {
        return false;
      }
      const pending = pendingByDraftId[tab.target.draftId];
      return pending?.serverId === normalizedServerId && pending.lifecycle === "active";
    });

    for (const agent of workspaceAgents) {
      const representedByTarget = uiTabs.some(
        (tab) => tab.target.kind === "agent" && tab.target.agentId === agent.id
      );
      const representedByDeterministicTabId = uiTabs.some(
        (tab) => tab.tabId === `agent_${agent.id}`
      );
      if (
        hasActivePendingDraftCreateInWorkspace &&
        !representedByTarget &&
        !representedByDeterministicTabId
      ) {
        continue;
      }
      ensureTab({
        serverId: normalizedServerId,
        workspaceId: normalizedWorkspaceId,
        target: { kind: "agent", agentId: agent.id },
      });
    }
    for (const terminal of terminals) {
      ensureTab({
        serverId: normalizedServerId,
        workspaceId: normalizedWorkspaceId,
        target: { kind: "terminal", terminalId: terminal.id },
      });
    }

    const canPruneAgentTabs = hasHydratedAgents;
    const canPruneTerminalTabs = terminalsQuery.isSuccess;
    for (const tab of uiTabs) {
      if (canPruneAgentTabs && tab.target.kind === "agent" && !agentIds.has(tab.target.agentId)) {
        closeWorkspaceTab({
          serverId: normalizedServerId,
          workspaceId: normalizedWorkspaceId,
          tabId: tab.tabId,
        });
      }
      if (
        canPruneTerminalTabs &&
        tab.target.kind === "terminal" &&
        !terminalIds.has(tab.target.terminalId)
      ) {
        closeWorkspaceTab({
          serverId: normalizedServerId,
          workspaceId: normalizedWorkspaceId,
          tabId: tab.tabId,
        });
      }
    }
  }, [
    closeWorkspaceTab,
    ensureTab,
    hasHydratedAgents,
    normalizedServerId,
    normalizedWorkspaceId,
    pendingByDraftId,
    terminals,
    terminalsQuery.isSuccess,
    uiTabs,
    workspaceAgents,
  ]);

  const tabModel = useMemo(
    () =>
      deriveWorkspaceTabModel({
        workspaceAgents,
        terminals,
        tabs: uiTabs,
        tabOrder,
        focusedTabId,
        preferredTarget:
          openIntent?.kind === "agent"
            ? { kind: "agent", agentId: openIntent.agentId }
            : openIntent?.kind === "terminal"
              ? { kind: "terminal", terminalId: openIntent.terminalId }
              : openIntent?.kind === "draft"
                ? { kind: "draft", draftId: openIntent.draftId }
                : openIntent?.kind === "file"
                  ? { kind: "file", path: openIntent.path }
                  : null,
      }),
    [focusedTabId, openIntent, tabOrder, terminals, uiTabs, workspaceAgents]
  );
  const activeTabId = tabModel.activeTabId;

  useEffect(() => {
    if (!activeTabId || !persistenceKey) {
      return;
    }
    focusTab({ serverId: normalizedServerId, workspaceId: normalizedWorkspaceId, tabId: activeTabId });
  }, [activeTabId, focusTab, normalizedServerId, normalizedWorkspaceId, persistenceKey]);

  const activeTab = tabModel.activeTab;

  const tabs = useMemo<WorkspaceTabDescriptor[]>(
    () => tabModel.tabs.map((tab) => tab.descriptor),
    [tabModel.tabs]
  );

  const handleReorderTabs = useCallback(
    (nextTabs: WorkspaceTabDescriptor[]) => {
      reorderWorkspaceTabs({
        serverId: normalizedServerId,
        workspaceId: normalizedWorkspaceId,
        tabIds: nextTabs.map((tab) => tab.tabId),
      });
    },
    [normalizedServerId, normalizedWorkspaceId, reorderWorkspaceTabs]
  );

  const navigateToTabId = useCallback(
    (tabId: string) => {
      if (!tabId || !normalizedServerId || !normalizedWorkspaceId) {
        return;
      }
      focusTab({
        serverId: normalizedServerId,
        workspaceId: normalizedWorkspaceId,
        tabId,
      });
    },
    [focusTab, normalizedServerId, normalizedWorkspaceId]
  );

  const emptyWorkspaceSeedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!persistenceKey) {
      return;
    }
    if (workspaceAgents.length > 0 || terminals.length > 0) {
      emptyWorkspaceSeedRef.current = null;
      return;
    }
    if (tabs.length > 0) {
      emptyWorkspaceSeedRef.current = null;
      return;
    }
    const workspaceKey = `${normalizedServerId}:${normalizedWorkspaceId}`;
    if (emptyWorkspaceSeedRef.current === workspaceKey) {
      return;
    }
    emptyWorkspaceSeedRef.current = workspaceKey;
    const draftId = generateDraftId();
    const tabId = openDraftTab({
      serverId: normalizedServerId,
      workspaceId: normalizedWorkspaceId,
      draftId,
    });
    if (tabId) {
      navigateToTabId(tabId);
    }
  }, [
    navigateToTabId,
    normalizedServerId,
    normalizedWorkspaceId,
    openDraftTab,
    persistenceKey,
    terminals.length,
    tabs.length,
    workspaceAgents.length,
  ]);

  const handleOpenFileFromExplorer = useCallback(
    (filePath: string) => {
      if (isMobile) {
        closeToAgent();
      }
      const tabId = openOrFocusTab({
        serverId: normalizedServerId,
        workspaceId: normalizedWorkspaceId,
        target: { kind: "file", path: filePath },
      });
      if (tabId) {
        navigateToTabId(tabId);
      }
    },
    [closeToAgent, isMobile, navigateToTabId, normalizedServerId, normalizedWorkspaceId, openOrFocusTab]
  );

  const [isTabSwitcherOpen, setIsTabSwitcherOpen] = useState(false);
  const [isNewTerminalHovered, setIsNewTerminalHovered] = useState(false);
  const [hoveredTabKey, setHoveredTabKey] = useState<string | null>(null);
  const [hoveredCloseTabKey, setHoveredCloseTabKey] = useState<string | null>(
    null
  );
  const tabSwitcherAnchorRef = useRef<View>(null);

  const tabByKey = useMemo(() => {
    const map = new Map<string, WorkspaceTabDescriptor>();
    for (const tab of tabs) {
      map.set(tab.key, tab);
    }
    return map;
  }, [tabs]);

  const activeTabKey = activeTabId ?? "";
  const tabPresentationsByKey = useMemo(() => {
    const map = new Map<string, ReturnType<typeof deriveWorkspaceTabPresentation>>();
    for (const tab of tabs) {
      const agent = tab.kind === "agent" ? agentsById.get(tab.agentId) ?? null : null;
      map.set(tab.key, deriveWorkspaceTabPresentation({ tab, agent }));
    }
    return map;
  }, [agentsById, tabs]);
  const activeTabPresentation = tabPresentationsByKey.get(activeTabKey) ?? null;

  const tabSwitcherOptions = useMemo(
    () =>
      tabs.map((tab) => ({
        id: tab.key,
        label: tabPresentationsByKey.get(tab.key)?.titleState === "loading" ? "Loading..." : tab.label,
        description: tab.subtitle,
      })),
    [tabPresentationsByKey, tabs]
  );

  const activeTabLabel = useMemo(() => {
    if (activeTabPresentation?.titleState === "loading") {
      return "Loading...";
    }
    return activeTabPresentation?.label ?? "Select tab";
  }, [activeTabPresentation]);

  const handleCreateDraftTab = useCallback(() => {
    if (!normalizedServerId || !normalizedWorkspaceId) {
      return;
    }
    const draftId = generateDraftId();
    const tabId = openDraftTab({
      serverId: normalizedServerId,
      workspaceId: normalizedWorkspaceId,
      draftId,
    });
    if (tabId) {
      navigateToTabId(tabId);
    }
  }, [navigateToTabId, normalizedServerId, normalizedWorkspaceId, openDraftTab]);

  const handleCreateTerminal = useCallback(() => {
    if (createTerminalMutation.isPending) {
      return;
    }
    if (!normalizedWorkspaceId.startsWith("/")) {
      return;
    }
    createTerminalMutation.mutate();
  }, [createTerminalMutation, normalizedWorkspaceId]);

  const handleSelectSwitcherTab = useCallback(
    (key: string) => {
      setIsTabSwitcherOpen(false);
      navigateToTabId(key);
    },
    [navigateToTabId]
  );

  const handleSelectNewTabOption = useCallback(
    (key: typeof NEW_TAB_AGENT_OPTION_ID | typeof NEW_TAB_TERMINAL_OPTION_ID) => {
      if (key === NEW_TAB_AGENT_OPTION_ID) {
        handleCreateDraftTab();
        return;
      }
      if (key === NEW_TAB_TERMINAL_OPTION_ID) {
        handleCreateTerminal();
      }
    },
    [handleCreateDraftTab, handleCreateTerminal]
  );

  const handleCloseTerminalTab = useCallback(
    async (input: { tabId: string; terminalId: string }) => {
      const { tabId, terminalId } = input;
      if (
        killTerminalMutation.isPending &&
        killTerminalMutation.variables === terminalId
      ) {
        return;
      }

      const confirmed = await confirmDialog({
        title: "Close terminal?",
        message: "Any running process in this terminal will be stopped immediately.",
        confirmLabel: "Close",
        cancelLabel: "Cancel",
        destructive: true,
      });
      if (!confirmed) {
        return;
      }

      killTerminalMutation.mutate(terminalId, {
        onSuccess: () => {
          setHoveredTabKey((current) => (current === tabId ? null : current));
          setHoveredCloseTabKey((current) => (current === tabId ? null : current));

          queryClient.setQueryData<ListTerminalsPayload>(
            terminalsQueryKey,
            (current) => {
              if (!current) {
                return current;
              }
              return {
                ...current,
                terminals: current.terminals.filter(
                  (terminal) => terminal.id !== terminalId
                ),
              };
            }
          );

          closeWorkspaceTab({
            serverId: normalizedServerId,
            workspaceId: normalizedWorkspaceId,
            tabId,
          });
        },
      });
    },
    [
      closeWorkspaceTab,
      killTerminalMutation,
      normalizedServerId,
      normalizedWorkspaceId,
      queryClient,
      terminalsQueryKey,
    ]
  );

  const handleCloseAgentTab = useCallback(
    async (input: { tabId: string; agentId: string }) => {
      const { tabId, agentId } = input;
      if (
        !normalizedServerId ||
        isArchivingAgent({ serverId: normalizedServerId, agentId })
      ) {
        return;
      }

      const confirmed = await confirmDialog({
        title: "Archive agent?",
        message: "This closes the tab and archives the agent.",
        confirmLabel: "Archive",
        cancelLabel: "Cancel",
        destructive: true,
      });
      if (!confirmed) {
        return;
      }

      await archiveAgent({ serverId: normalizedServerId, agentId });
      setHoveredTabKey((current) => (current === tabId ? null : current));
      setHoveredCloseTabKey((current) => (current === tabId ? null : current));
      closeWorkspaceTab({
        serverId: normalizedServerId,
        workspaceId: normalizedWorkspaceId,
        tabId,
      });
    },
    [
      archiveAgent,
      closeWorkspaceTab,
      isArchivingAgent,
      normalizedServerId,
      normalizedWorkspaceId,
    ]
  );

  const handleCloseDraftOrFileTab = useCallback(
    (tabId: string) => {
      setHoveredTabKey((current) => (current === tabId ? null : current));
      setHoveredCloseTabKey((current) => (current === tabId ? null : current));
      closeWorkspaceTab({
        serverId: normalizedServerId,
        workspaceId: normalizedWorkspaceId,
        tabId,
      });
    },
    [closeWorkspaceTab, normalizedServerId, normalizedWorkspaceId]
  );

  const handleCloseTabById = useCallback(
    async (tabId: string) => {
      const tab = tabByKey.get(tabId);
      if (!tab) {
        return;
      }
      if (tab.kind === "terminal") {
        await handleCloseTerminalTab({ tabId, terminalId: tab.terminalId });
        return;
      }
      if (tab.kind === "agent") {
        await handleCloseAgentTab({ tabId, agentId: tab.agentId });
        return;
      }
      handleCloseDraftOrFileTab(tabId);
    },
    [handleCloseAgentTab, handleCloseDraftOrFileTab, handleCloseTerminalTab, tabByKey]
  );

  const handleCopyAgentId = useCallback(
    async (agentId: string) => {
      if (!agentId) return;
      try {
        await Clipboard.setStringAsync(agentId);
        toast.copied("Agent ID");
      } catch {
        toast.error("Copy failed");
      }
    },
    [toast]
  );

  const handleCopyResumeCommand = useCallback(
    async (agentId: string) => {
      if (!agentId) return;
      const agent = sessionAgents?.get(agentId) ?? null;
      const providerSessionId =
        agent?.runtimeInfo?.sessionId ?? agent?.persistence?.sessionId ?? null;
      if (!agent || !providerSessionId) {
        toast.error("Resume ID not available");
        return;
      }

      const command =
        buildProviderCommand({
          provider: agent.provider,
          id: "resume",
          sessionId: providerSessionId,
        }) ?? null;
      if (!command) {
        toast.error("Resume command not available");
        return;
      }
      try {
        await Clipboard.setStringAsync(command);
        toast.copied("resume command");
      } catch {
        toast.error("Copy failed");
      }
    },
    [sessionAgents, toast]
  );

  const handleBulkCloseTabs = useCallback(
    async (input: { tabsToClose: WorkspaceTabDescriptor[]; title: string; logLabel: string }) => {
      const { tabsToClose, title, logLabel } = input;
      if (tabsToClose.length === 0) {
        return;
      }

      const groups = classifyBulkClosableTabs(tabsToClose);
      const confirmed = await confirmDialog({
        title,
        message: buildBulkCloseConfirmationMessage(groups),
        confirmLabel: "Close",
        cancelLabel: "Cancel",
        destructive: true,
      });
      if (!confirmed) {
        return;
      }

      for (const { tabId, terminalId } of groups.terminalTabs) {
        try {
          await killTerminalMutation.mutateAsync(terminalId);
          queryClient.setQueryData<ListTerminalsPayload>(terminalsQueryKey, (current) => {
            if (!current) {
              return current;
            }
            return {
              ...current,
              terminals: current.terminals.filter((terminal) => terminal.id !== terminalId),
            };
          });
          closeWorkspaceTab({
            serverId: normalizedServerId,
            workspaceId: normalizedWorkspaceId,
            tabId,
          });
        } catch (error) {
          console.warn(`[WorkspaceScreen] Failed to close terminal tab ${logLabel}`, { terminalId, error });
        }
      }

      for (const { tabId, agentId } of groups.agentTabs) {
        if (!normalizedServerId) {
          continue;
        }
        try {
          await archiveAgent({ serverId: normalizedServerId, agentId });
          closeWorkspaceTab({
            serverId: normalizedServerId,
            workspaceId: normalizedWorkspaceId,
            tabId,
          });
        } catch (error) {
          console.warn(`[WorkspaceScreen] Failed to archive agent tab ${logLabel}`, { agentId, error });
        }
      }

      for (const { tabId } of groups.otherTabs) {
        closeWorkspaceTab({
          serverId: normalizedServerId,
          workspaceId: normalizedWorkspaceId,
          tabId,
        });
      }

      const closedKeys = new Set(tabsToClose.map((tab) => tab.key));
      setHoveredTabKey((current) => (current && closedKeys.has(current) ? null : current));
      setHoveredCloseTabKey((current) => (current && closedKeys.has(current) ? null : current));
    },
    [
      archiveAgent,
      closeWorkspaceTab,
      killTerminalMutation,
      normalizedServerId,
      normalizedWorkspaceId,
      queryClient,
      terminalsQueryKey,
    ]
  );

  const handleCloseTabsToLeft = useCallback(
    async (tabId: string) => {
      const index = tabs.findIndex((tab) => tab.tabId === tabId);
      if (index < 0) {
        return;
      }
      await handleBulkCloseTabs({
        tabsToClose: tabs.slice(0, index),
        title: "Close tabs to the left?",
        logLabel: "to the left",
      });
    },
    [handleBulkCloseTabs, tabs]
  );

  const handleCloseTabsToRight = useCallback(
    async (tabId: string) => {
      const index = tabs.findIndex((tab) => tab.tabId === tabId);
      if (index < 0) {
        return;
      }
      await handleBulkCloseTabs({
        tabsToClose: tabs.slice(index + 1),
        title: "Close tabs to the right?",
        logLabel: "to the right",
      });
    },
    [handleBulkCloseTabs, tabs]
  );

  const handleCloseOtherTabs = useCallback(
    async (tabId: string) => {
      const tabsToClose = tabs.filter((tab) => tab.tabId !== tabId);
      await handleBulkCloseTabs({
        tabsToClose,
        title: "Close other tabs?",
        logLabel: "from close other tabs",
      });
    },
    [handleBulkCloseTabs, tabs]
  );

  useEffect(() => {
    if (!workspaceTabActionRequest) {
      return;
    }
    if (
      workspaceTabActionRequest.serverId !== normalizedServerId ||
      workspaceTabActionRequest.workspaceId !== normalizedWorkspaceId
    ) {
      return;
    }

    if (workspaceTabActionRequest.kind === "new") {
      handleCreateDraftTab();
      clearWorkspaceTabActionRequest(workspaceTabActionRequest.id);
      return;
    }
    if (workspaceTabActionRequest.kind === "close-current") {
      if (activeTabId) {
        void handleCloseTabById(activeTabId);
      }
      clearWorkspaceTabActionRequest(workspaceTabActionRequest.id);
      return;
    }
    if (workspaceTabActionRequest.kind === "navigate-index") {
      const next = tabs[workspaceTabActionRequest.index - 1] ?? null;
      if (next?.tabId) {
        navigateToTabId(next.tabId);
      }
      clearWorkspaceTabActionRequest(workspaceTabActionRequest.id);
      return;
    }
    if (workspaceTabActionRequest.kind === "navigate-relative") {
      if (tabs.length > 0) {
        const currentIndex = tabs.findIndex((tab) => tab.tabId === activeTabId);
        const fromIndex = currentIndex >= 0 ? currentIndex : 0;
        const nextIndex =
          (fromIndex + workspaceTabActionRequest.delta + tabs.length) % tabs.length;
        const next = tabs[nextIndex] ?? null;
        if (next?.tabId) {
          navigateToTabId(next.tabId);
        }
      }
      clearWorkspaceTabActionRequest(workspaceTabActionRequest.id);
    }
  }, [
    activeTabId,
    clearWorkspaceTabActionRequest,
    handleCloseTabById,
    handleCreateDraftTab,
    navigateToTabId,
    normalizedServerId,
    normalizedWorkspaceId,
    tabs,
    workspaceTabActionRequest,
  ]);

  const renderContent = () => {
    if (
      shouldRenderMissingWorkspaceDescriptor({
        workspace: workspaceDescriptor,
        hasHydratedWorkspaces,
      })
    ) {
      return (
        <View style={styles.emptyState}>
          <ActivityIndicator color={theme.colors.foregroundMuted} />
        </View>
      );
    }

    const target = activeTab?.target ?? null;
    if (!target) {
      if (!hasHydratedAgents) {
        return (
          <View style={styles.emptyState}>
            <ActivityIndicator color={theme.colors.foregroundMuted} />
          </View>
        );
      }
      return (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateText}>
            No tabs are available yet. Use New tab to create an agent or terminal.
          </Text>
        </View>
      );
    }

    if (target.kind === "draft") {
      return (
        <WorkspaceDraftAgentTab
          serverId={normalizedServerId}
          workspaceId={normalizedWorkspaceId}
          tabId={activeTabId ?? target.draftId}
          draftId={target.draftId}
          onCreated={(agentSnapshot) => {
            const tabId = activeTabId ?? target.draftId;
            const normalized = normalizeAgentSnapshot(agentSnapshot, normalizedServerId);
            const nextTabId = retargetWorkspaceTab({
              serverId: normalizedServerId,
              workspaceId: normalizedWorkspaceId,
              tabId,
              target: { kind: "agent", agentId: agentSnapshot.id },
            });
            if (nextTabId) {
              focusTab({
                serverId: normalizedServerId,
                workspaceId: normalizedWorkspaceId,
                tabId: nextTabId,
              });
            }
            useSessionStore.getState().setAgents(normalizedServerId, (prev) => {
              const next = new Map(prev);
              next.set(agentSnapshot.id, normalized);
              return next;
            });
          }}
        />
      );
    }

    if (target.kind === "agent") {
      return (
        <AgentReadyScreen
          serverId={normalizedServerId}
          agentId={target.agentId}
          showExplorerSidebar={false}
          wrapWithExplorerSidebarProvider={false}
        />
      );
    }

    if (target.kind === "file") {
      return (
        <FilePane
          serverId={normalizedServerId}
          workspaceRoot={normalizedWorkspaceId}
          filePath={target.path}
        />
      );
    }

    return (
      <TerminalPane
        serverId={normalizedServerId}
        cwd={normalizedWorkspaceId}
        selectedTerminalId={target.terminalId}
        onSelectedTerminalIdChange={(terminalId) => {
          if (!terminalId) {
            return;
          }
          const tabId = openOrFocusTab({
            serverId: normalizedServerId,
            workspaceId: normalizedWorkspaceId,
            target: { kind: "terminal", terminalId },
          });
          if (tabId) {
            navigateToTabId(tabId);
          }
        }}
        hideHeader
        manageTerminalDirectorySubscription={false}
      />
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: mainBackgroundColor }]}>
      <View style={styles.threePaneRow}>
        <View style={styles.centerColumn}>
          <ScreenHeader
            left={
              <>
                <SidebarMenuToggle />
                <View style={styles.headerTitleContainer}>
                  {isWorkspaceHeaderLoading ? (
                    <>
                      <View style={styles.headerTitleSkeleton} />
                      <View style={styles.headerProjectTitleSkeleton} />
                    </>
                  ) : (
                    <>
                      <Text
                        testID="workspace-header-title"
                        style={styles.headerTitle}
                        numberOfLines={1}
                      >
                        {workspaceHeader.title}
                      </Text>
                      <Text
                        testID="workspace-header-subtitle"
                        style={styles.headerProjectTitle}
                        numberOfLines={1}
                      >
                        {workspaceHeader.subtitle}
                      </Text>
                    </>
                  )}
                </View>
              </>
            }
            right={
              <View style={styles.headerRight}>
                <HeaderToggleButton
                  testID="workspace-explorer-toggle"
                  onPress={handleToggleExplorer}
                  tooltipLabel="Toggle explorer"
                  tooltipKeys={["mod", "E"]}
                  tooltipSide="left"
                  style={styles.menuButton}
                  accessible
                  accessibilityRole="button"
                  accessibilityLabel={isExplorerOpen ? "Close explorer" : "Open explorer"}
                  accessibilityState={{ expanded: isExplorerOpen }}
                >
                  {isMobile ? (
                    isGitCheckout ? (
                      <GitBranch
                        size={theme.iconSize.lg}
                        color={
                          isExplorerOpen
                            ? theme.colors.foreground
                            : theme.colors.foregroundMuted
                        }
                      />
                    ) : (
                      <Folder
                        size={theme.iconSize.lg}
                        color={
                          isExplorerOpen
                            ? theme.colors.foreground
                            : theme.colors.foregroundMuted
                        }
                      />
                    )
                  ) : (
                    <PanelRight
                      size={theme.iconSize.md}
                      color={
                        isExplorerOpen
                          ? theme.colors.foreground
                          : theme.colors.foregroundMuted
                      }
                    />
                  )}
                </HeaderToggleButton>

              </View>
            }
          />

          {isMobile ? (
            <View style={styles.mobileTabsRow} testID="workspace-tabs-row">
              <Pressable
                ref={tabSwitcherAnchorRef}
                style={({ hovered, pressed }) => [
                  styles.switcherTrigger,
                  (hovered || pressed || isTabSwitcherOpen) && styles.switcherTriggerActive,
                  { borderWidth: 0, borderColor: "transparent" },
                  Platform.OS === "web"
                    ? {
                        outlineStyle: "solid",
                        outlineWidth: 0,
                        outlineColor: "transparent",
                      }
                    : null,
                ]}
                onPress={() => setIsTabSwitcherOpen(true)}
              >
                <View style={styles.switcherTriggerLeft}>
                  <View style={styles.switcherTriggerIcon} testID="workspace-active-tab-icon">
                    {activeTabPresentation ? (
                      <WorkspaceTabIcon presentation={activeTabPresentation} active />
                    ) : null}
                  </View>

                  <Text style={styles.switcherTriggerText} numberOfLines={1}>
                    {activeTabLabel}
                  </Text>
                </View>

                <ChevronDown size={theme.iconSize.sm} color={theme.colors.foregroundMuted} />
              </Pressable>

              <View style={styles.mobileTabsActions}>
                <Tooltip delayDuration={0} enabledOnDesktop enabledOnMobile={false}>
                  <TooltipTrigger
                    testID="workspace-new-agent-tab"
                    onPress={() => handleSelectNewTabOption(NEW_TAB_AGENT_OPTION_ID)}
                    accessibilityRole="button"
                    accessibilityLabel="New agent tab"
                    style={({ hovered, pressed }) => [
                      styles.newTabActionButton,
                      (hovered || pressed) && styles.newTabActionButtonHovered,
                    ]}
                  >
                    <Plus size={theme.iconSize.sm} color={theme.colors.foregroundMuted} />
                  </TooltipTrigger>
                  <TooltipContent side="bottom" align="end" offset={8}>
                    <Text style={styles.newTabTooltipText}>New agent tab</Text>
                  </TooltipContent>
                </Tooltip>

                <Tooltip delayDuration={0} enabledOnDesktop enabledOnMobile={false}>
                  <TooltipTrigger
                    testID="workspace-new-terminal-tab"
                    onPress={() => handleSelectNewTabOption(NEW_TAB_TERMINAL_OPTION_ID)}
                    onHoverIn={() => setIsNewTerminalHovered(true)}
                    onHoverOut={() => setIsNewTerminalHovered(false)}
                    disabled={createTerminalMutation.isPending}
                    accessibilityRole="button"
                    accessibilityLabel="New terminal tab"
                    style={({ hovered, pressed }) => [
                      styles.newTabActionButton,
                      createTerminalMutation.isPending && styles.newTabActionButtonDisabled,
                      (hovered || pressed) && styles.newTabActionButtonHovered,
                    ]}
                  >
                    {createTerminalMutation.isPending ? (
                      <ActivityIndicator size="small" color={theme.colors.foregroundMuted} />
                    ) : (
                      <View style={styles.terminalPlusIcon}>
                        <SquareTerminal size={theme.iconSize.sm} color={theme.colors.foregroundMuted} />
                        <View style={[styles.terminalPlusBadge, isNewTerminalHovered && styles.terminalPlusBadgeHovered]}>
                          <Plus size={10} color={theme.colors.foregroundMuted} />
                        </View>
                      </View>
                    )}
                  </TooltipTrigger>
                  <TooltipContent side="bottom" align="end" offset={8}>
                    <Text style={styles.newTabTooltipText}>New terminal tab</Text>
                  </TooltipContent>
                </Tooltip>
              </View>

              <Combobox
                options={tabSwitcherOptions}
                value={activeTabKey}
                onSelect={handleSelectSwitcherTab}
                searchable={false}
                title="Switch tab"
                searchPlaceholder="Search tabs"
                open={isTabSwitcherOpen}
                onOpenChange={setIsTabSwitcherOpen}
                anchorRef={tabSwitcherAnchorRef}
                renderOption={({ option, selected, active, onPress }) => {
                  const tab = tabByKey.get(option.id);
                  if (!tab) {
                    return <View />;
                  }
                  const presentation =
                    tabPresentationsByKey.get(option.id) ??
                    deriveWorkspaceTabPresentation({ tab });
                  return (
                    <WorkspaceTabOptionRow
                      presentation={presentation}
                      selected={selected}
                      active={active}
                      onPress={onPress}
                    />
                  );
                }}
              />
            </View>
          ) : (
            <WorkspaceDesktopTabsRow
              tabs={tabs}
              activeTabKey={activeTabKey}
              agentsById={agentsById}
              normalizedServerId={normalizedServerId}
              hoveredCloseTabKey={hoveredCloseTabKey}
              setHoveredTabKey={setHoveredTabKey}
              setHoveredCloseTabKey={setHoveredCloseTabKey}
              isArchivingAgent={isArchivingAgent}
              killTerminalPending={killTerminalMutation.isPending}
              killTerminalId={killTerminalMutation.variables ?? null}
              onNavigateTab={navigateToTabId}
              onCloseTab={handleCloseTabById}
              onCopyResumeCommand={handleCopyResumeCommand}
              onCopyAgentId={handleCopyAgentId}
              onCloseTabsToLeft={handleCloseTabsToLeft}
              onCloseTabsToRight={handleCloseTabsToRight}
              onCloseOtherTabs={handleCloseOtherTabs}
              onSelectNewTabOption={handleSelectNewTabOption}
              newTabAgentOptionId={NEW_TAB_AGENT_OPTION_ID}
              newTabTerminalOptionId={NEW_TAB_TERMINAL_OPTION_ID}
              createTerminalPending={createTerminalMutation.isPending}
              isNewTerminalHovered={isNewTerminalHovered}
              setIsNewTerminalHovered={setIsNewTerminalHovered}
              onReorderTabs={handleReorderTabs}
            />
          )}

          <View style={styles.centerContent}>
            {isMobile ? (
              <GestureDetector gesture={explorerOpenGesture} touchAction="pan-y">
                <View style={styles.content}>{renderContent()}</View>
              </GestureDetector>
            ) : (
              <View style={styles.content}>{renderContent()}</View>
            )}
          </View>
        </View>

        <ExplorerSidebar
          serverId={normalizedServerId}
          workspaceId={normalizedWorkspaceId}
          workspaceRoot={normalizedWorkspaceId}
          isGit={isGitCheckout}
          onOpenFile={handleOpenFileFromExplorer}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.surface0,
  },
  threePaneRow: {
    flex: 1,
    minHeight: 0,
    flexDirection: "row",
    alignItems: "stretch",
  },
  centerColumn: {
    flex: 1,
    minHeight: 0,
  },
  headerTitle: {
    fontSize: theme.fontSize.base,
    fontWeight: {
      xs: "400",
      md: "300",
    },
    color: theme.colors.foreground,
    flexShrink: 1,
  },
  headerTitleContainer: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  headerProjectTitle: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.base,
    flexShrink: 1,
  },
  headerTitleSkeleton: {
    width: 190,
    maxWidth: "45%",
    height: 22,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.surface3,
    opacity: 0.25,
  },
  headerProjectTitleSkeleton: {
    width: 300,
    maxWidth: "45%",
    height: 22,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.surface3,
    opacity: 0.18,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  menuButton: {
    padding: theme.spacing[3],
    borderRadius: theme.borderRadius.lg,
  },
  newTabActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
  },
  newTabActionButton: {
    width: 30,
    height: 30,
    borderRadius: theme.borderRadius.md,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface1,
    alignItems: "center",
    justifyContent: "center",
  },
  newTabActionButtonHovered: {
    backgroundColor: theme.colors.surface2,
  },
  newTabActionButtonDisabled: {
    opacity: 0.6,
  },
  newTabTooltipText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.popoverForeground,
  },
  terminalPlusIcon: {
    position: "relative",
    width: theme.iconSize.sm,
    height: theme.iconSize.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  terminalPlusBadge: {
    position: "absolute",
    right: -5,
    bottom: -5,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: theme.colors.surface1,
    alignItems: "center",
    justifyContent: "center",
  },
  terminalPlusBadgeHovered: {
    backgroundColor: theme.colors.surface2,
  },
  mobileTabsRow: {
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.surface0,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1],
  },
  mobileTabsActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
  },
  switcherTrigger: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    flex: 1,
    minWidth: 0,
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1],
    borderRadius: theme.borderRadius.md,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    justifyContent: "space-between",
  },
  switcherTriggerActive: {
    backgroundColor: theme.colors.surface2,
  },
  switcherTriggerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    flex: 1,
    minWidth: 0,
  },
  switcherTriggerIcon: {
    flexShrink: 0,
  },
  switcherTriggerText: {
    minWidth: 0,
    flex: 1,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
  tabsContainer: {
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.surface0,
    flexDirection: "row",
    alignItems: "center",
  },
  tabsScroll: {
    flex: 1,
    minWidth: 0,
  },
  tabsContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1],
  },
  tabsActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    paddingRight: theme.spacing[2],
    paddingVertical: theme.spacing[1],
  },
  centerContent: {
    flex: 1,
    minHeight: 0,
  },
  tab: {
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    borderRadius: theme.borderRadius.md,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    maxWidth: 260,
  },
  tabHandle: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    flex: 1,
    minWidth: 0,
  },
  tabIcon: {
    flexShrink: 0,
  },
  tabActive: {
    backgroundColor: theme.colors.surface2,
  },
  tabHovered: {
    backgroundColor: theme.colors.surface2,
  },
  tabLabel: {
    flexShrink: 1,
    minWidth: 0,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.normal,
  },
  tabLabelWithCloseButton: {
    paddingRight: 0,
  },
  tabLabelActive: {
    color: theme.colors.foreground,
  },
  tabCloseButton: {
    width: 18,
    height: 18,
    marginLeft: 0,
    borderRadius: theme.borderRadius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  tabCloseButtonShown: {
    opacity: 1,
  },
  tabCloseButtonHidden: {
    opacity: 0,
  },
  tabCloseButtonActive: {
    backgroundColor: theme.colors.surface3,
  },
  content: {
    flex: 1,
    minHeight: 0,
    backgroundColor: theme.colors.surface0,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing[3],
    paddingHorizontal: theme.spacing[6],
  },
  emptyStateText: {
    color: theme.colors.foregroundMuted,
    textAlign: "center",
  },
}));
