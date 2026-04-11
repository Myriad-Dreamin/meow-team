export const reviewerSuggestionFollowUpOptions = {
  proofOfConceptTest:
    "Create or update a failing Proof of Concept test that reproduces the issue for the coder to fix. Mock filesystem, network, and other external dependencies with Vitest, for example via `vi.mock`, so the test runs in isolation without side effects. Create a reusable mock class or mock module and share it across tests when it is reusable.",
  reviewerTodo:
    "If a meaningful failing test is not practical, create a reviewer todo artifact for the coder. Prefer adding an inline code comment near the affected code that clearly describes the required change. If the code should not be edited, for example because it is an external library, configuration, or an unresolved question, add a todo item to the root `TODO.md` with a clear description and a link to the relevant code or issue.",
} as const;

export const buildReviewerExecutionRules = (): string[] => {
  return [
    "Treat missing concrete branch output as blocking; do not approve conceptual guidance alone.",
    "Approve only when the implementation is genuinely review-ready.",
    "When you give any suggestion or request changes, include one concrete follow-up artifact with the feedback.",
    `Preferred follow-up artifact: ${reviewerSuggestionFollowUpOptions.proofOfConceptTest}`,
    `Fallback follow-up artifact: ${reviewerSuggestionFollowUpOptions.reviewerTodo}`,
  ];
};
