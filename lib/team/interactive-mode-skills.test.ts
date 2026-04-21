import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const commandSkillContracts = [
  {
    command: "/meow-plan",
    skillName: "meow-plan",
  },
  {
    command: "/meow-code",
    skillName: "meow-code",
  },
  {
    command: "/meow-review",
    skillName: "meow-review",
  },
  {
    command: "/meow-execute",
    skillName: "meow-execute",
  },
  {
    command: "/meow-validate",
    skillName: "meow-validate",
  },
] as const;

const meowPlanInlinedSourceMarkers = [
  "## Inline Planning Sources",
  "### Planner Role",
  "Turn the latest user request into a crisp proposal set",
  "### Harness Workflow",
  "### Proposal Shaping Rules",
  "### Planning Helper Guidance",
] as const;

const meowPlanRemovedSourcePaths = [
  "lib/team/roles/planner.prompt.md",
  ".codex/skills/team-harness-workflow/SKILL.md",
  ".codex/skills/team-harness-workflow/references/planner.md",
  ".codex/skills/openspec-propose/SKILL.md",
  ".codex/skills/openspec-explore/SKILL.md",
] as const;

const meowCodeInlinedSourceMarkers = [
  "## Inline Implementation Sources",
  "### Coder Role",
  "Implement the plan as the execution owner",
  "### Harness Workflow",
  "### Lane Rules",
] as const;

const meowCodeRemovedSourcePaths = [
  "lib/team/roles/coder.prompt.md",
  ".codex/skills/team-harness-workflow/SKILL.md",
  ".codex/skills/team-harness-workflow/references/lanes.md",
] as const;

const meowReviewInlinedSourceMarkers = [
  "## Inline Review Sources",
  "### Reviewer Role",
  "Review the proposed work with a code review mindset.",
  "### Harness Workflow",
  "### Lane Rules",
] as const;

const meowReviewRemovedSourcePaths = [
  "lib/team/roles/reviewer.prompt.md",
  ".codex/skills/team-harness-workflow/SKILL.md",
  ".codex/skills/team-harness-workflow/references/lanes.md",
] as const;

const meowExecuteInlinedSourceMarkers = [
  "## Inline Execution Sources",
  "### Executor Role",
  "Execute the approved script-and-data plan as the implementation owner",
  "### Coder Baseline",
  "Implement the plan as the execution owner",
  "### Execution Guidance",
  "Execution artifact contract:",
  "### Harness Workflow",
  "### Lane Rules",
] as const;

const meowExecuteRemovedSourcePaths = [
  "lib/team/roles/executor.prompt.md",
  "lib/team/roles/coder.prompt.md",
  "lib/team/executing/guidance.ts",
  ".codex/skills/team-harness-workflow/SKILL.md",
  ".codex/skills/team-harness-workflow/references/lanes.md",
] as const;

const meowValidateInlinedSourceMarkers = [
  "## Inline Validation Sources",
  "### Execution Reviewer Role",
  "Review execute-mode work with a reproducibility and validation mindset.",
  "### Reviewer Baseline",
  "### Execution Guidance",
  "### Harness Workflow",
  "### Lane Rules",
] as const;

const meowValidateRemovedSourcePaths = [
  "lib/team/roles/execution-reviewer.prompt.md",
  "lib/team/roles/reviewer.prompt.md",
  "lib/team/executing/guidance.ts",
  ".codex/skills/team-harness-workflow/SKILL.md",
  ".codex/skills/team-harness-workflow/references/lanes.md",
] as const;

const readProjectFile = (...segments: string[]): string => {
  return readFileSync(path.join(rootDirectory, ...segments), "utf8");
};

const readSkillFile = (skillName: string): string => {
  return readProjectFile(".codex", "skills", skillName, "SKILL.md");
};

const listNonOpenSpecSkillNames = (): string[] => {
  return readdirSync(path.join(rootDirectory, ".codex", "skills"), {
    withFileTypes: true,
  })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((skillName) => !skillName.startsWith("openspec-"));
};

describe("interactive mode skills", () => {
  it("publishes every interactive slash-command skill in the user guide", () => {
    const guide = readProjectFile("docs", "interactive-mode.md");

    for (const { command, skillName } of commandSkillContracts) {
      const skill = readSkillFile(skillName);

      expect(skill).toContain(`name: ${skillName}`);
      expect(skill).toContain(command);
      expect(guide).toContain(command);
    }
  });

  it("keeps source references inline and avoids repo-specific instruction files", () => {
    for (const { skillName } of commandSkillContracts) {
      const skill = readSkillFile(skillName);

      expect(skill).not.toContain("## Sources");
      expect(skill).not.toContain("INSTRUCTIONS.md");
      expect(skill).not.toContain("AGENTS.md");

      if (skillName === "meow-plan") {
        for (const removedPath of meowPlanRemovedSourcePaths) {
          expect(skill).not.toContain(removedPath);
        }
        for (const marker of meowPlanInlinedSourceMarkers) {
          expect(skill).toContain(marker);
        }
      } else if (skillName === "meow-code") {
        for (const removedPath of meowCodeRemovedSourcePaths) {
          expect(skill).not.toContain(removedPath);
        }
        for (const marker of meowCodeInlinedSourceMarkers) {
          expect(skill).toContain(marker);
        }
      } else if (skillName === "meow-review") {
        for (const removedPath of meowReviewRemovedSourcePaths) {
          expect(skill).not.toContain(removedPath);
        }
        for (const marker of meowReviewInlinedSourceMarkers) {
          expect(skill).toContain(marker);
        }
      } else if (skillName === "meow-execute") {
        for (const removedPath of meowExecuteRemovedSourcePaths) {
          expect(skill).not.toContain(removedPath);
        }
        for (const marker of meowExecuteInlinedSourceMarkers) {
          expect(skill).toContain(marker);
        }
      } else if (skillName === "meow-validate") {
        for (const removedPath of meowValidateRemovedSourcePaths) {
          expect(skill).not.toContain(removedPath);
        }
        for (const marker of meowValidateInlinedSourceMarkers) {
          expect(skill).toContain(marker);
        }
      }
    }
  });

  it("keeps non-OpenSpec local skills reusable outside this repository", () => {
    for (const skillName of listNonOpenSpecSkillNames()) {
      const skill = readSkillFile(skillName);

      expect(skill).not.toContain("INSTRUCTIONS.md");
      expect(skill).not.toContain("AGENTS.md");
    }
  });
});
