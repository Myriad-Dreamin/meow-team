import { describe, expect, it } from "vitest";
import { coderRole } from "@/lib/team/roles/coder";
import { executionReviewerRole } from "@/lib/team/roles/execution-reviewer";
import { executorRole } from "@/lib/team/roles/executor";
import { plannerRole } from "@/lib/team/roles/planner";
import { reviewerRole } from "@/lib/team/roles/reviewer";

describe("team role metadata", () => {
  it("derives planner, implementation, and review role metadata from the colocated templates", () => {
    expect(plannerRole).toMatchObject({
      id: "planner",
      name: "Planner",
      summary:
        "Turn the latest user request into a crisp proposal set that the rest of the team can execute after human approval.",
      filePath: "lib/team/roles/planner.prompt.md",
    });
    expect(coderRole).toMatchObject({
      id: "coder",
      name: "Coder",
      summary: "Implement the plan as if you are the execution owner for this assignment.",
      filePath: "lib/team/roles/coder.prompt.md",
    });
    expect(reviewerRole).toMatchObject({
      id: "reviewer",
      name: "Reviewer",
      summary: "Review the proposed work with a code review mindset.",
      filePath: "lib/team/roles/reviewer.prompt.md",
    });
    expect(executorRole).toMatchObject({
      id: "executor",
      name: "Executor",
      summary:
        "Execute the approved script-and-data plan as the implementation owner for this lane.",
      filePath: "lib/team/roles/executor.prompt.md",
    });
    expect(executionReviewerRole).toMatchObject({
      id: "execution-reviewer",
      name: "Execution Reviewer",
      summary: "Review execute-mode work with a reproducibility and validation mindset.",
      filePath: "lib/team/roles/execution-reviewer.prompt.md",
    });
  });
});
