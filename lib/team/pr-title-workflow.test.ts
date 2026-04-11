import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("lint-pr-title workflow", () => {
  it("gates sticky comments from the semantic lint step outcome", async () => {
    const workflowPath = path.resolve(process.cwd(), ".github/workflows/lint-pr-title.yml");
    const workflow = await readFile(workflowPath, "utf8");

    expect(workflow).not.toContain("error_message != null");
    expect(workflow).not.toContain("error_message == null");
    expect(workflow).toContain("if: ${{ always() && steps.lint_pr_title.outcome == 'failure' }}");
    expect(workflow).toContain("if: ${{ always() && steps.lint_pr_title.outcome == 'success' }}");
  });
});
