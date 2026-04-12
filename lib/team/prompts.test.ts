import type { TeamConfig } from "@/lib/config/team";
import {
  listAvailableRolePrompts,
  loadRolePrompt,
  loadWorkflowRolePrompts,
} from "@/lib/team/prompts";
import { describe, expect, it } from "vitest";

describe("team role prompt registry", () => {
  it("loads static role prompt metadata without YAML frontmatter in the prompt body", async () => {
    const plannerPrompt = await loadRolePrompt("planner");

    expect(plannerPrompt).toMatchObject({
      filePath: "prompts/roles/planner.prompt.md",
      id: "planner",
      name: "Planner",
      summary: "Turn the latest user request into a crisp proposal set that the rest of the",
    });
    expect(plannerPrompt.prompt).toContain("# Planner");
    expect(plannerPrompt.prompt.startsWith("---")).toBe(false);
  });

  it("lists static role prompts in sorted order", async () => {
    const rolePrompts = await listAvailableRolePrompts();

    expect(rolePrompts.map((rolePrompt) => rolePrompt.id)).toEqual([
      "coder",
      "planner",
      "reviewer",
    ]);
  });

  it("loads workflow role prompts in workflow order", async () => {
    const rolePrompts = await loadWorkflowRolePrompts({
      workflow: ["reviewer", "coder"],
    } as TeamConfig);

    expect(rolePrompts.map((rolePrompt) => rolePrompt.id)).toEqual(["reviewer", "coder"]);
  });

  it("throws a helpful error for unknown role prompts", async () => {
    await expect(loadRolePrompt("researcher")).rejects.toThrow(
      'Unknown role prompt "researcher". Available role IDs: coder, planner, reviewer.',
    );
  });

  it("rejects inherited prototype keys as unknown role prompts", async () => {
    await expect(loadRolePrompt("toString")).rejects.toThrow(
      'Unknown role prompt "toString". Available role IDs: coder, planner, reviewer.',
    );
  });
});
