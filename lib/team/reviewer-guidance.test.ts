import { describe, expect, it } from "vitest";
import {
  buildReviewerExecutionRules,
  reviewerSuggestionFollowUpOptions,
} from "@/lib/team/reviewer-guidance";

describe("buildReviewerExecutionRules", () => {
  it("requires each reviewer suggestion to carry a follow-up artifact", () => {
    expect(buildReviewerExecutionRules()).toEqual(
      expect.arrayContaining([
        "Treat missing concrete branch output as blocking; do not approve conceptual guidance alone.",
        "Approve only when the implementation is genuinely review-ready.",
        "When you give any suggestion or request changes, include one concrete follow-up artifact with the feedback.",
        `Preferred follow-up artifact: ${reviewerSuggestionFollowUpOptions.proofOfConceptTest}`,
        `Fallback follow-up artifact: ${reviewerSuggestionFollowUpOptions.reviewerTodo}`,
      ]),
    );
  });
});
