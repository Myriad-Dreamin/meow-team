import { describe, expect, it } from "vitest";
import { coderRole } from "@/lib/team/roles/coder";
import { plannerRole } from "@/lib/team/roles/planner";
import { reviewerRole } from "@/lib/team/roles/reviewer";

describe("team role metadata", () => {
  it("derives planner, coder, and reviewer metadata from the colocated role templates", () => {
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
  });
});
