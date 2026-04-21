---
name: meow-validate
description: Use when the user starts an interactive-mode request with `/meow-validate`; run the current review workflow in execution mode against current changes and optional suggestion.
---

Run the execution-mode reviewer role manually inside an interactive Codex
session.

## Command Contract

- Syntax: `/meow-validate [optional-suggestion]`
- The optional suggestion narrows validation focus.
- Treat this command as the `execution` subtype of the harness execution-mode
  review workflow.
- The user communicates with the main agent. Validate the current checkout and
  conversation context; do not assume a background execution-reviewer lane
  exists.

## Steps

1. Strip the `/meow-validate` prefix. Treat any remaining text as validation
   focus.
2. Apply the inline execution-review role, reviewer baseline, execution
   guidance, harness workflow, and lane rules in this skill. If the current
   project ships an execution subtype guide, use it as the primary guide.
   Otherwise, fall back to the inline execution guidance and review rules below.
3. Review with a reproducibility and validation mindset:
   - Scripts or automation reliably perform the execution.
   - Validators or documented validation commands are reproducible.
   - Summary artifacts record output paths, formats, or key results.
   - Raw data handling is clear when data is intentionally untracked.
4. Run focused validation when practical. Use `pnpm` for repository scripts.
5. If requesting changes, include one concrete follow-up artifact:
   - Prefer a failing Proof of Concept test or validator artifact.
   - If a test or validator is not practical, add a clear execution-review todo
     artifact near the affected code or in the project's shared todo tracker.

## Inline Validation Sources

### Execution Reviewer Role

Review execute-mode work with a reproducibility and validation mindset.

Prioritize:

- missing or unreliable execution scripts
- missing validators or unreproducible validation commands
- missing summary artifacts for collected data or reported results
- behavioral regressions, incorrect benchmark setup, and experiment integrity
  risks
- whether the executor produced concrete branch or workspace output to review
- whether the approved proposal is ready to complete machine review

If the work is not ready, set the decision to `needs_revision` and explain what
must change. If it is ready, open or refresh the lane's review artifact and set
the decision to `approved`. Never approve conceptual guidance without
implementation.

When you give any suggestion or request changes, include one concrete follow-up
artifact with the feedback:

- Create or update a failing Proof of Concept test that reproduces the issue for
  the executor to fix. Mock external dependencies so the test runs in isolation
  without side effects, and share reusable mocks when practical.
- If a meaningful failing test is not practical, create an execution-review
  todo artifact. Prefer adding an inline code comment near the affected code
  that clearly describes the required change.
- If the code should not be edited, add a todo item to the project's shared todo
  tracker with a clear description and a link to the relevant code or issue.

Execution reviewer rules:

- Operate inside the branch and worktree assigned by the current project when
  those are provided.
- Use Codex CLI native repository tools and shell access to inspect changes, run
  scripts, and verify validation.
- Follow the execution subtype guide before evaluating the branch when the
  project provides one.
- Enforce the execution artifact contract before approving the lane.
- If you author a direct commit, use a lowercase conventional subject such as
  `docs:`, `fix:`, `test:`, or `dev:`.
- Compare changes against the task objective and plan, noting deviations or
  issues.

### Reviewer Baseline

Review the proposed work with a code review mindset.

Baseline review priorities still apply:

- bugs and behavioral regressions
- architectural or operational risk
- missing validation and missing tests
- whether the implementer produced concrete output to review
- anything that would block shipping with confidence

### Execution Guidance

For execution-mode work, resolve the subtype as `execution` and look for a
project guide at `docs/guide/execution.md` or the equivalent path used by the
current project.

If the guide exists:

- inspect it before making changes or validating the branch
- use it as the primary operating guide for the lane

If the guide does not exist:

- continue with the inline review and validation rules in this skill
- document the fallback in the handoff when it affects reproducibility or scope

Execution artifact contract:

- Commit the scripts or automation changes that perform the run.
- Commit either a validator artifact or document a reproducible validation
  command in the branch.
- Commit a summary artifact that records output paths, formats, or key results
  even when raw data is gitignored.

Execution reviewer follow-up artifact preference:

- Preferred follow-up artifact: a failing Proof of Concept test.
- Fallback follow-up artifact: an execution-review todo artifact.

### Harness Workflow

Use this skill whenever Codex is running the execution-review step of a
Meow-style engineering harness in the current project.

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

- Review with a bug, regression, and reproducibility mindset.
- Reject work that lacks concrete implementation output or sufficient
  validation.
- Approve only when the branch or workspace is genuinely ready for machine
  review completion.
- When you give any suggestion or request changes, include one concrete
  follow-up artifact with the feedback.

## Output

Return a concise execution-review decision:

- `approved` when execution artifacts are reproducible and satisfy the request.
- `needs_revision` when blocking reproducibility, artifact, or validation issues
  remain.
- Findings ordered by severity, with file paths and concrete next steps.
- Validation commands run and results.
- Suggested next command, usually `/meow-execute` with a fix suggestion.
