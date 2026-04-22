---
name: meow-review
description: Use when the user starts an interactive-mode request with `/meow-review`; run the current reviewer workflow against current changes and optional suggestion.
---

Run the reviewer role manually inside an interactive Codex session.

## Command Contract

- Syntax: `/meow-review [optional-suggestion]`
- The optional suggestion narrows review focus, for example a bug class,
  behavior, or file area.
- The user communicates with the main agent. Review the current checkout and
  conversation context; do not assume a background reviewer lane exists.

## Steps

1. Strip the `/meow-review` prefix. Treat any remaining text as review focus.
2. Apply the inline reviewer role, harness workflow, and lane rules in this
   skill.
3. Inspect the current diff and compare it against the latest plan, task
   objective, or user request.
4. Review with a bug, regression, validation, and missing-test mindset.
5. Run focused validation when practical. Use `pnpm` for repository scripts.
6. If requesting changes, include one concrete follow-up artifact:
   - Prefer a failing Proof of Concept test that reproduces the issue.
   - If a test is not practical, add a clear reviewer todo artifact near the
     affected code or in the project's shared todo tracker.
7. Do not rewrite the implementation unless the user explicitly asks for review
   plus fixes.

## Inline Review Sources

### Reviewer Role

Review the proposed work with a code review mindset.

Prioritize:

- bugs and behavioral regressions
- architectural or operational risk
- missing validation and missing tests
- whether the coder produced concrete branch or workspace output to review
- anything that would block shipping with confidence
- whether the approved proposal is ready to complete machine review

If the work is not ready, set the decision to `needs_revision` and explain what
must change. If it is ready, open or refresh the lane's review artifact and set
the decision to `approved`. Never approve conceptual guidance without
implementation.

When you give any suggestion or request changes, include one concrete follow-up
artifact with the feedback:

- Create or update a failing Proof of Concept test that reproduces the issue.
  Mock filesystem, network, and other external dependencies so the test runs in
  isolation without side effects. Create a reusable mock class or mock module
  when it is reusable.
- If a meaningful failing test is not practical, create a reviewer todo
  artifact. Prefer adding an inline code comment near the affected code that
  clearly describes the required change.
- If the code should not be edited, add a todo item to the project's shared todo
  tracker with a clear description and a link to the relevant code or issue.

Reviewer execution rules:

- Operate inside the branch and worktree assigned by the current project when
  those are provided.
- Use Codex CLI native repository tools and shell access to inspect changes, run
  tests, and verify implementation.
- If you author a direct commit, use a lowercase conventional subject such as
  `docs:`, `fix:`, `test:`, or `dev:`.
- Compare changes against the task objective and plan, noting deviations or
  issues.

### Harness Workflow

Use this skill whenever Codex is running the review step of a Meow-style
engineering harness in the current project.

Shared expectations:

- Use project-local skills when they fit, especially tracked-change or OpenSpec
  skills when the project has them.
- Use `pnpm` for validation and package commands when the project is a
  TypeScript/pnpm workspace.
- Keep final outputs concrete and structured for downstream review or
  persistence.

### Lane Rules

Lane expectations:

- Stay inside the dedicated branch and reusable worktree for the current lane
  when the project assigns them.
- Treat the approved proposal plus prior handoffs as the source of truth.
- Leave concrete repository state behind. Do not finish with conceptual advice
  alone.
- Use Codex CLI native repository tools and shell access instead of custom app
  tools.
- Run the smallest validation that proves the change, and run broader
  validation after meaningful or structural code edits when feasible.

Reviewer lane guidance:

- Review with a bug and regression mindset.
- Reject work that lacks concrete implementation output or sufficient
  validation.
- Approve only when the branch or workspace is genuinely ready for machine
  review completion.
- When you give any suggestion or request changes, include one concrete
  follow-up artifact with the feedback.
- If approving, provide a short review title and summary suitable for local CI
  or downstream review artifacts.

## Output

Return a concise review decision:

- `approved` when the changes satisfy the request and validation expectations.
- `needs_revision` when blocking issues remain.
- Findings ordered by severity, with file paths and concrete next steps.
- Validation commands run and results.
- Suggested next command, usually `/meow-code` with a fix suggestion or
  `/meow-execute` for execution-mode follow-up.
