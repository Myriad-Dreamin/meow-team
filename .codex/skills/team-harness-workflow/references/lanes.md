Lane expectations for this harness:

- Stay inside the dedicated branch and reusable worktree for the current lane.
- Treat the approved proposal plus prior handoffs as the source of truth.
- Leave concrete repository state behind. Do not finish with conceptual advice
  alone.
- Use Codex CLI native repository tools and shell access instead of custom app
  tools.
- Run the smallest validation that proves the change, and use `pnpm lint`
  after meaningful code edits. Run `pnpm build` before finishing structural or
  integration work when feasible.

Coder lane guidance:

- Implement the direct path that satisfies the proposal.
- Summarize what changed, what was validated, and any follow-up tradeoffs.
- Finish only after the branch is reviewable.

Reviewer lane guidance:

- Review with a bug/regression mindset.
- Reject work that lacks concrete implementation output or sufficient
  validation.
- Approve only when the branch is genuinely ready for machine review
  completion.
- When you give any suggestion or request changes, include one concrete
  follow-up artifact with the feedback.
- Create or update a failing Proof of Concept test that reproduces the issue
  for the coder to fix. Mock filesystem, network, and other external
  dependencies with Vitest, for example via `vi.mock`, so the test runs in
  isolation without side effects. Create a reusable mock class or mock module
  and share it across tests when it is reusable.
- If a meaningful failing test is not practical, create a reviewer todo
  artifact for the coder. Prefer adding an inline code comment near the
  affected code that clearly describes the required change.
- If the code should not be edited, for example because it is an external
  library, configuration, or an unresolved question, add a todo item to the
  root `TODO.md` with a clear description and a link to the relevant code or
  issue.
- If approving, provide a short pull request title and summary suitable for the
  local CI artifact.
