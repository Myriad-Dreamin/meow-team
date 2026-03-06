import { useEffect } from "react";
import { Platform } from "react-native";
import { usePathname, useRouter } from "expo-router";
import { getIsTauri } from "@/constants/layout";
import { useSessionStore } from "@/stores/session-store";
import { useKeyboardShortcutsStore } from "@/stores/keyboard-shortcuts-store";
import { setCommandCenterFocusRestoreElement } from "@/utils/command-center-focus-restore";
import {
  buildHostNewAgentRoute,
  buildHostWorkspaceRoute,
  parseHostAgentRouteFromPathname,
  parseHostWorkspaceRouteFromPathname,
  parseServerIdFromPathname,
} from "@/utils/host-routes";
import {
  type MessageInputKeyboardActionKind,
  type KeyboardShortcutPayload,
} from "@/keyboard/actions";
import { canToggleFileExplorerShortcut } from "@/keyboard/keyboard-shortcut-routing";
import { keyboardActionDispatcher } from "@/keyboard/keyboard-action-dispatcher";
import { resolveKeyboardShortcut } from "@/keyboard/keyboard-shortcuts";
import { resolveKeyboardFocusScope } from "@/keyboard/focus-scope";
import { getShortcutOs } from "@/utils/shortcut-platform";

export function useKeyboardShortcuts({
  enabled,
  isMobile,
  toggleAgentList,
  selectedAgentId,
  toggleFileExplorer,
}: {
  enabled: boolean;
  isMobile: boolean;
  toggleAgentList: () => void;
  selectedAgentId?: string;
  toggleFileExplorer?: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const resetModifiers = useKeyboardShortcutsStore((s) => s.resetModifiers);

  useEffect(() => {
    if (!enabled) return;
    if (Platform.OS !== "web") return;
    if (isMobile) return;

    const isTauri = getIsTauri();
    const isMac = getShortcutOs() === "mac";

    const shouldHandle = () => {
      if (typeof document === "undefined") return false;
      if (document.visibilityState !== "visible") return false;
      return true;
    };

    const navigateToWorkspaceShortcut = (index: number): boolean => {
      const state = useKeyboardShortcutsStore.getState();
      const target = state.sidebarShortcutWorkspaceTargets[index - 1] ?? null;
      if (!target) {
        return false;
      }

      const shouldReplace =
        Boolean(parseHostWorkspaceRouteFromPathname(pathname)) ||
        Boolean(parseHostAgentRouteFromPathname(pathname));
      const navigate = shouldReplace ? router.replace : router.push;
      navigate(buildHostWorkspaceRoute(target.serverId, target.workspaceId) as any);
      return true;
    };
    const navigateRelativeWorkspace = (delta: 1 | -1): boolean => {
      const state = useKeyboardShortcutsStore.getState();
      const targets = state.visibleWorkspaceTargets;
      if (targets.length === 0) {
        return false;
      }

      const workspaceRoute = parseHostWorkspaceRouteFromPathname(pathname);
      if (!workspaceRoute) {
        const fallback = targets[delta > 0 ? 0 : targets.length - 1] ?? null;
        if (!fallback) {
          return false;
        }
        router.push(buildHostWorkspaceRoute(fallback.serverId, fallback.workspaceId) as any);
        return true;
      }

      const currentIndex = targets.findIndex(
        (target) =>
          target.serverId === workspaceRoute.serverId &&
          target.workspaceId === workspaceRoute.workspaceId
      );
      const fromIndex = currentIndex >= 0 ? currentIndex : delta > 0 ? -1 : 0;
      const nextIndex = (fromIndex + delta + targets.length) % targets.length;
      const target = targets[nextIndex] ?? null;
      if (!target) {
        return false;
      }
      router.replace(buildHostWorkspaceRoute(target.serverId, target.workspaceId) as any);
      return true;
    };

    const navigateToNewAgent = (): boolean => {
      let targetServerId = parseServerIdFromPathname(pathname);

      if (!targetServerId) {
        const sessionServerIds = Object.keys(useSessionStore.getState().sessions);
        targetServerId = sessionServerIds[0] ?? null;
      }

      if (!targetServerId) {
        return false;
      }

      router.push(buildHostNewAgentRoute(targetServerId) as any);
      return true;
    };

    const dispatchMessageInputAction = (
      kind: MessageInputKeyboardActionKind
    ): boolean => {
      switch (kind) {
        case "focus":
          return keyboardActionDispatcher.dispatch({
            id: "message-input.focus",
            scope: "message-input",
          });
        case "dictation-toggle":
          return keyboardActionDispatcher.dispatch({
            id: "message-input.dictation-toggle",
            scope: "message-input",
          });
        case "dictation-cancel":
          return keyboardActionDispatcher.dispatch({
            id: "message-input.dictation-cancel",
            scope: "message-input",
          });
        case "voice-toggle":
          return keyboardActionDispatcher.dispatch({
            id: "message-input.voice-toggle",
            scope: "message-input",
          });
        case "voice-mute-toggle":
          return keyboardActionDispatcher.dispatch({
            id: "message-input.voice-mute-toggle",
            scope: "message-input",
          });
        default:
          return false;
      }
    };
    const requestWorkspaceTabAction = (input:
      | { kind: "new" | "close-current" }
      | { kind: "navigate-index"; index: number }
      | { kind: "navigate-relative"; delta: 1 | -1 }): boolean => {
      const route = parseHostWorkspaceRouteFromPathname(pathname);
      if (!route) {
        return false;
      }
      useKeyboardShortcutsStore.getState().requestWorkspaceTabAction({
        serverId: route.serverId,
        workspaceId: route.workspaceId,
        ...input,
      });
      return true;
    };

    const handleAction = (input: {
      action: string;
      payload: KeyboardShortcutPayload;
      event: KeyboardEvent;
    }): boolean => {
      switch (input.action) {
        case "agent.new":
          return navigateToNewAgent();
        case "workspace.tab.new":
          return requestWorkspaceTabAction({ kind: "new" });
        case "workspace.tab.close.current":
          return requestWorkspaceTabAction({ kind: "close-current" });
        case "workspace.tab.navigate.index":
          if (!input.payload || typeof input.payload !== "object" || !("index" in input.payload)) {
            return false;
          }
          return requestWorkspaceTabAction({
            kind: "navigate-index",
            index: input.payload.index,
          });
        case "workspace.tab.navigate.relative":
          if (!input.payload || typeof input.payload !== "object" || !("delta" in input.payload)) {
            return false;
          }
          return requestWorkspaceTabAction({
            kind: "navigate-relative",
            delta: input.payload.delta,
          });
        case "workspace.navigate.index":
          if (!input.payload || typeof input.payload !== "object" || !("index" in input.payload)) {
            return false;
          }
          return navigateToWorkspaceShortcut(input.payload.index);
        case "workspace.navigate.relative":
          if (!input.payload || typeof input.payload !== "object" || !("delta" in input.payload)) {
            return false;
          }
          return navigateRelativeWorkspace(input.payload.delta);
        case "sidebar.toggle.left":
          toggleAgentList();
          return true;
        case "sidebar.toggle.right":
          if (!toggleFileExplorer) {
            return false;
          }
          if (
            !canToggleFileExplorerShortcut({
              selectedAgentId,
              pathname,
              toggleFileExplorer,
            })
          ) {
            return false;
          }
          toggleFileExplorer();
          return true;
        case "command-center.toggle": {
          const store = useKeyboardShortcutsStore.getState();
          if (!store.commandCenterOpen) {
            const target =
              input.event.target instanceof Element ? (input.event.target as Element) : null;
            const targetEl =
              target?.closest?.("textarea, input, [contenteditable='true']") ??
              (target instanceof HTMLElement ? target : null);
            const active = document.activeElement;
            const activeEl = active instanceof HTMLElement ? active : null;
            setCommandCenterFocusRestoreElement(
              (targetEl as HTMLElement | null) ?? activeEl ?? null
            );
          }
          store.setCommandCenterOpen(!store.commandCenterOpen);
          return true;
        }
        case "shortcuts.dialog.toggle": {
          const store = useKeyboardShortcutsStore.getState();
          store.setShortcutsDialogOpen(!store.shortcutsDialogOpen);
          return true;
        }
        case "message-input.action":
          if (!input.payload || typeof input.payload !== "object" || !("kind" in input.payload)) {
            return false;
          }
          return dispatchMessageInputAction(input.payload.kind);
        default:
          return false;
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!shouldHandle()) {
        return;
      }

      const key = event.key ?? "";
      if (key === "Alt" && !event.shiftKey) {
        useKeyboardShortcutsStore.getState().setAltDown(true);
      }
      if (isTauri && (key === "Meta" || key === "Control") && !event.shiftKey) {
        useKeyboardShortcutsStore.getState().setCmdOrCtrlDown(true);
      }
      if (key === "Shift") {
        const state = useKeyboardShortcutsStore.getState();
        if (state.altDown || state.cmdOrCtrlDown) {
          state.resetModifiers();
        }
      }

      const store = useKeyboardShortcutsStore.getState();
      const focusScope = resolveKeyboardFocusScope({
        target: event.target,
        commandCenterOpen: store.commandCenterOpen,
      });
      const match = resolveKeyboardShortcut({
        event,
        context: {
          isMac,
          isTauri,
          focusScope,
          commandCenterOpen: store.commandCenterOpen,
          hasSelectedAgent: canToggleFileExplorerShortcut({
            selectedAgentId,
            pathname,
            toggleFileExplorer,
          }),
        },
      });
      if (!match) {
        return;
      }

      const handled = handleAction({
        action: match.action,
        payload: match.payload,
        event,
      });
      if (!handled) {
        return;
      }

      if (match.preventDefault) {
        event.preventDefault();
      }
      if (match.stopPropagation) {
        event.stopPropagation();
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      const key = event.key ?? "";
      if (key === "Alt") {
        useKeyboardShortcutsStore.getState().setAltDown(false);
      }
      if (isTauri && (key === "Meta" || key === "Control")) {
        useKeyboardShortcutsStore.getState().setCmdOrCtrlDown(false);
      }
    };

    const handleBlurOrHide = () => {
      resetModifiers();
    };

    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("keyup", handleKeyUp, true);
    window.addEventListener("blur", handleBlurOrHide);
    document.addEventListener("visibilitychange", handleBlurOrHide);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("keyup", handleKeyUp, true);
      window.removeEventListener("blur", handleBlurOrHide);
      document.removeEventListener("visibilitychange", handleBlurOrHide);
    };
  }, [
    enabled,
    isMobile,
    pathname,
    resetModifiers,
    router,
    selectedAgentId,
    toggleAgentList,
    toggleFileExplorer,
  ]);
}
