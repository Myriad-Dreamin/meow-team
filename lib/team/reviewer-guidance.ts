export const reviewerSuggestionFollowUpOptions = {
  proofOfConceptTest:
    "Create or update a failing Proof of Concept test that reproduces the issue for the coder to fix. Mock filesystem, network, and other external dependencies with Vitest, for example via `vi.mock`, so the test runs in isolation without side effects. Create reusable mock class or mock module and share across tests if it is reusable.",
  openSpecTodo:
    "If a meaningful failing test is not practical, update at least one todo item in the relevant OpenSpec proposal task list to capture the suggestion. Prefer adding a new todo item for non-critical or independent follow-up improvements in the root TODO.md instead of updating the proposal so the proposal can still be accepted faster. Prefer to add neccessary nitpicking once to the task list.",
} as const;

export const buildReviewerExecutionRules = (): string[] => {
  return [
    "Treat missing concrete branch output as blocking; do not approve conceptual guidance alone.",
    "Approve only when the implementation is genuinely review-ready.",
    "When you give any suggestion or request changes, include one concrete follow-up artifact with the feedback.",
    `Preferred follow-up artifact: ${reviewerSuggestionFollowUpOptions.proofOfConceptTest}`,
    `Fallback follow-up artifact: ${reviewerSuggestionFollowUpOptions.openSpecTodo}`,
  ];
};
