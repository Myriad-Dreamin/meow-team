export const DEFAULT_TEAM_WORKSPACE_SIDEBAR_VISIBILITY = false;
export const TEAM_WORKSPACE_SIDEBAR_VISIBILITY_STORAGE_KEY = "team-workspace.sidebar.visible";
export const TEAM_WORKSPACE_SIDEBAR_ID = "team-workspace-sidebar";
export const TEAM_WORKSPACE_SHELL_HIDDEN_CLASS_NAME = "workspace-shell-sidebar-hidden";

export type TeamWorkspaceSidebarToggleState = {
  actionLabel: string;
  isPressed: boolean;
};

const getTeamWorkspaceSidebarVisibilityStorage = (): Storage | null => {
  return typeof window === "undefined" ? null : window.localStorage;
};

const serializeTeamWorkspaceSidebarVisibility = (isVisible: boolean): string => {
  return isVisible ? "true" : "false";
};

export const parseStoredTeamWorkspaceSidebarVisibility = (value: string | null): boolean => {
  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  return DEFAULT_TEAM_WORKSPACE_SIDEBAR_VISIBILITY;
};

export const readStoredTeamWorkspaceSidebarVisibility = (
  storage: Pick<Storage, "getItem"> | null = getTeamWorkspaceSidebarVisibilityStorage(),
): boolean => {
  if (!storage) {
    return DEFAULT_TEAM_WORKSPACE_SIDEBAR_VISIBILITY;
  }

  return parseStoredTeamWorkspaceSidebarVisibility(
    storage.getItem(TEAM_WORKSPACE_SIDEBAR_VISIBILITY_STORAGE_KEY),
  );
};

export const persistTeamWorkspaceSidebarVisibility = (
  isVisible: boolean,
  storage: Pick<Storage, "setItem"> | null = getTeamWorkspaceSidebarVisibilityStorage(),
): void => {
  if (!storage) {
    return;
  }

  storage.setItem(
    TEAM_WORKSPACE_SIDEBAR_VISIBILITY_STORAGE_KEY,
    serializeTeamWorkspaceSidebarVisibility(isVisible),
  );
};

export const getNextTeamWorkspaceSidebarVisibility = (isVisible: boolean): boolean => {
  return !isVisible;
};

export const getTeamWorkspaceShellClassName = (isVisible: boolean): string => {
  return isVisible
    ? "workspace-shell"
    : `workspace-shell ${TEAM_WORKSPACE_SHELL_HIDDEN_CLASS_NAME}`;
};

export const getTeamWorkspaceSidebarToggleState = (
  isVisible: boolean,
): TeamWorkspaceSidebarToggleState => {
  return {
    actionLabel: isVisible ? "Hide sidebar" : "Show sidebar",
    isPressed: isVisible,
  };
};
