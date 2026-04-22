---
name: meow-execute
description: Use when the user starts an interactive-mode request with `/meow-execute`; run the current code workflow in execution mode against the provided content.
---

Run the execution-mode coder role manually inside an interactive Codex session.

## Command Contract

- Syntax: `/meow-execute content`
- `content` is required and is the execution-mode objective.
- Treat this command as the `execution` subtype of the harness execution-mode
  workflow.
- The user communicates with the main agent. Work directly in the current
  checkout unless the user explicitly points to another worktree.

## Steps

1. Strip the `/meow-execute` prefix and treat the remaining content as the
   execution objective. If it is empty, ask the user for the objective before
   continuing.
2. Apply the inline execution-mode role, workflow, guidance, and lane rules in
   this skill. If the current project ships an execution subtype guide, use it
   as the primary guide. Otherwise, fall back to the inline execution guidance
   and role rules below.
3. For dataset generation or maintenance work, use `$meow-dataset`: execution
   should generate or update scripts that update the configured dataset path.
   Prefer TypeScript for dataset scripts.
4. Make concrete repository changes that perform the execution, script, data, or
   automation task.
5. Satisfy the execution artifact contract:
   - Commit or leave staged-ready scripts or automation changes that perform
     the run.
   - Commit or document a reproducible validator or validation command.
   - Commit a summary artifact that records output paths, formats, or key
     results when raw data is not tracked.
6. Use `pnpm` for scripts and validation.

## Inline Execution Sources

### Executor Role

Execute the approved script-and-data plan as the implementation owner for this
lane.

Focus on:

- the most direct implementation path for the approved execution, benchmark, or
  experiment task
- keeping scripts, validators, and summary artifacts coherent and reproducible
- making concrete repository changes before requesting review
- explaining what changed in practical engineering language
- listing follow-up work or remaining tradeoffs
- staying within the approved branch and worktree when the project uses
  dedicated lanes

When a planner or execution reviewer asks for adjustments, incorporate them
into a revised implementation handoff instead of re-explaining the whole
system. Do not ask for review with conceptual guidance alone; leave a
reviewable workspace state first.

Execution rules:

- Operate inside the branch and worktree assigned by the current project when
  those are provided.
- Use Codex CLI native repository tools and shell access to inspect, edit, run
  scripts, and validate work.
- Follow the execution subtype guide before changing code or scripts when the
  project provides one.
- Satisfy the execution artifact contract before finishing.
- If you author a direct commit, use a lowercase conventional subject such as
  `docs:`, `fix:`, `test:`, or `dev:`.
- Produce concrete repository changes before finishing.
- Finish with an implementation handoff after reviewable output exists.

### Coder Baseline

Implement the plan as the execution owner for the assignment.

Focus on:

- the most direct implementation path
- keeping changes coherent and maintainable
- making concrete repository changes before requesting review
- explaining what changed in practical engineering language
- listing follow-up work or remaining tradeoffs
- staying within the approved branch and worktree when the project uses
  dedicated lanes

When a planner or reviewer asks for adjustments, incorporate them into a revised
implementation handoff instead of re-explaining the whole system. Do not ask for
review with conceptual guidance alone; leave a reviewable workspace state first.

### Execution Guidance

For execution-mode work, resolve the subtype as `execution` and look for a
project guide at `docs/guide/execution.md` or the equivalent path used by the
current project.

If the guide exists:

- inspect it before making changes
- use it as the primary operating guide for the lane

If the guide does not exist:

- continue with the inline role rules in this skill
- document the fallback in the handoff when it affects reproducibility or scope

Execution artifact contract:

- Commit the scripts or automation changes that perform the run.
- Commit either a validator artifact or document a reproducible validation
  command in the branch.
- Commit a summary artifact that records output paths, formats, or key results
  even when raw data is gitignored.

### Harness Workflow

Use this skill whenever Codex is running the execution step of a Meow-style
engineering harness in the current project.

Shared expectations:

- Use project-local skills when they fit, especially OpenSpec skills when the
  project has them.
- Use `$meow-dataset` for dataset generation, update, and maintenance tasks.
  Execution-mode dataset work should produce scripts that update the configured
  dataset path, not one-off manual data edits.
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

Coder lane guidance:

- Implement the direct path that satisfies the proposal.
- Summarize what changed, what was validated, and any follow-up tradeoffs.
- Finish only after the branch or workspace is reviewable.

Reviewer handoff awareness:

- Execution output should be ready for a validation review focused on
  reproducible scripts, validators, summary artifacts, and regression risk.
- If follow-up work remains, make it explicit and actionable in the handoff.

## Output

Return a concise execution handoff:

- What was executed or automated.
- Scripts, validators, dataset package scripts, and summary artifacts created
  or updated.
- Reproducible commands and validation results.
- Output locations, dataset config keys, log paths, and any intentionally
  untracked data.
- Suggested next command, usually `/meow-validate`.
