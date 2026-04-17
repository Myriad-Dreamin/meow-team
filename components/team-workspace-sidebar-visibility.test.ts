import { describe, expect, it } from "vitest";
import {
  DEFAULT_TEAM_WORKSPACE_SIDEBAR_VISIBILITY,
  getNextTeamWorkspaceSidebarVisibility,
  getTeamWorkspaceShellClassName,
  getTeamWorkspaceSidebarToggleState,
  parseStoredTeamWorkspaceSidebarVisibility,
  persistTeamWorkspaceSidebarVisibility,
  readStoredTeamWorkspaceSidebarVisibility,
  TEAM_WORKSPACE_SIDEBAR_VISIBILITY_STORAGE_KEY,
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

  it("restores valid stored visibility values", () => {
    expect(parseStoredTeamWorkspaceSidebarVisibility("true")).toBe(true);
    expect(parseStoredTeamWorkspaceSidebarVisibility("false")).toBe(false);
  });

  it("falls back to the collapsed default when the stored visibility is missing", () => {
    expect(parseStoredTeamWorkspaceSidebarVisibility(null)).toBe(
      DEFAULT_TEAM_WORKSPACE_SIDEBAR_VISIBILITY,
    );
  });

  it("falls back to the collapsed default when the stored visibility is invalid", () => {
    expect(parseStoredTeamWorkspaceSidebarVisibility("sidebar-open")).toBe(
      DEFAULT_TEAM_WORKSPACE_SIDEBAR_VISIBILITY,
    );
  });

  it("reads the stored visibility value from storage", () => {
    const storage = {
      getItem: (key: string) =>
        key === TEAM_WORKSPACE_SIDEBAR_VISIBILITY_STORAGE_KEY ? "true" : null,
    };

    expect(readStoredTeamWorkspaceSidebarVisibility(storage)).toBe(true);
  });

  it("persists visibility changes as explicit boolean strings", () => {
    const writes: Array<[string, string]> = [];
    const storage = {
      setItem: (key: string, value: string) => {
        writes.push([key, value]);
      },
    };

    persistTeamWorkspaceSidebarVisibility(true, storage);
    persistTeamWorkspaceSidebarVisibility(false, storage);

    expect(writes).toEqual([
      [TEAM_WORKSPACE_SIDEBAR_VISIBILITY_STORAGE_KEY, "true"],
      [TEAM_WORKSPACE_SIDEBAR_VISIBILITY_STORAGE_KEY, "false"],
    ]);
  });
});
