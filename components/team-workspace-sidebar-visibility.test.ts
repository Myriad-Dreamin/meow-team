import { describe, expect, it } from "vitest";
import {
  DEFAULT_TEAM_WORKSPACE_SIDEBAR_VISIBILITY,
  getNextTeamWorkspaceSidebarVisibility,
  getTeamWorkspaceShellClassName,
  getTeamWorkspaceSidebarToggleState,
} from "@/components/team-workspace-sidebar-visibility";

describe("team workspace sidebar visibility", () => {
  it("starts with the sidebar collapsed and the hidden shell class applied", () => {
    expect(DEFAULT_TEAM_WORKSPACE_SIDEBAR_VISIBILITY).toBe(false);
    expect(getTeamWorkspaceShellClassName(DEFAULT_TEAM_WORKSPACE_SIDEBAR_VISIBILITY)).toBe(
      "workspace-shell workspace-shell-sidebar-hidden",
    );
  });

  it("toggles the sidebar visibility open and closed", () => {
    const opened = getNextTeamWorkspaceSidebarVisibility(DEFAULT_TEAM_WORKSPACE_SIDEBAR_VISIBILITY);
    const closed = getNextTeamWorkspaceSidebarVisibility(opened);

    expect(opened).toBe(true);
    expect(closed).toBe(false);
  });

  it("derives the status-bar toggle labels and pressed state from visibility", () => {
    expect(getTeamWorkspaceSidebarToggleState(false)).toEqual({
      actionLabel: "Show sidebar",
      isPressed: false,
    });
    expect(getTeamWorkspaceSidebarToggleState(true)).toEqual({
      actionLabel: "Hide sidebar",
      isPressed: true,
    });
  });
});
