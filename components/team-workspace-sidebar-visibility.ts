export const DEFAULT_TEAM_WORKSPACE_SIDEBAR_VISIBILITY = false;
export const TEAM_WORKSPACE_SIDEBAR_ID = "team-workspace-sidebar";
export const TEAM_WORKSPACE_SHELL_HIDDEN_CLASS_NAME = "workspace-shell-sidebar-hidden";

export type TeamWorkspaceSidebarToggleState = {
  actionLabel: string;
  isPressed: boolean;
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
