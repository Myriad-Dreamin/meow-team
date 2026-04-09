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
- If approving, provide a short pull request title and summary suitable for the
  local CI artifact.
