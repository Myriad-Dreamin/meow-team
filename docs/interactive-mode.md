---
title: Interactive Mode
---

# Interactive mode

Interactive mode is a lightweight way to run the harness roles while talking to
the main Codex agent directly. Instead of starting the web harness queue and
waiting for background lanes, you choose the role behavior with a slash-prefixed
skill command and the main agent performs that role in the current conversation.

These commands are repo-local Codex skills under `.codex/skills`. They are a
conversation convention for the main agent, not the thread approval commands
served by `POST /api/team/threads/:threadId/command`.

## Commands

| Command | Purpose | Input |
| --- | --- | --- |
| `/meow-plan content` | Use the current planner workflow to turn a request into an approval-ready plan. | Required planning content. |
| `/meow-code [optional-suggestion]` | Use the current coder workflow to implement the latest plan or visible task. | Optional implementation focus. |
| `/meow-review [optional-suggestion]` | Use the current reviewer workflow to review the current changes. | Optional review focus. |
| `/meow-execute content` | Use the current code workflow in execution mode for script, data, automation, or run-oriented work. | Required execution objective. |
| `/meow-validate [optional-suggestion]` | Use the current review workflow in execution mode to validate reproducibility and artifacts. | Optional validation focus. |

## Recommended flow

1. Start with `/meow-plan content` when the task needs scoping before edits.
2. Continue with `/meow-code` after the plan is clear and approved in the
   conversation.
3. Use `/meow-review` to get a review decision on the current workspace changes.
4. Use `/meow-execute content` instead of `/meow-code` when the work is about
   reproducible execution, scripts, benchmark-like runs, generated data, or
   automation artifacts.
5. Use `/meow-validate` after `/meow-execute` to check scripts, validators,
   summary artifacts, and reproducibility.

## How it differs from the web harness

- The main agent executes the selected role behavior in the current checkout.
- No planner, coder, or reviewer lane starts automatically after a command.
- No background approval queue is created unless you separately use the web
  harness.
- The conversation is the handoff state, so keep approvals and requested
  suggestions explicit.
- Repository rules still apply: read `INSTRUCTIONS.md`, follow applicable
  `AGENTS.md`, keep project text in English, and use `pnpm` for scripts.

## Command details

### `/meow-plan content`

Use this when you want planning without implementation. The planner should
produce one preferred implementation proposal by default and multiple proposals
only when separate options or workstreams improve safety or approval clarity.

Example:

```text
/meow-plan add interactive role skills and document how to use them
```

### `/meow-code [optional-suggestion]`

Use this when a plan already exists or the current task is obvious enough to
implement directly. The optional suggestion should be a short refinement, such
as a preferred scope, a specific file area, or a reviewer-requested fix.

Example:

```text
/meow-code keep the implementation limited to repo-local skills and docs
```

### `/meow-review [optional-suggestion]`

Use this after implementation. The reviewer checks the diff against the request,
looks for regressions and missing validation, and returns either `approved` or
`needs_revision`. If the reviewer requests changes, the feedback should include
a concrete follow-up artifact such as a failing test or reviewer todo.

Example:

```text
/meow-review focus on command trigger clarity and docs discoverability
```

### `/meow-execute content`

Use this for execution-mode work. The executor should leave reproducible
execution artifacts: scripts or automation, a validator or documented
validation command, and a summary artifact that records outputs or key results
when raw data is intentionally untracked.

Example:

```text
/meow-execute generate a reproducible fixture refresh script and summarize output paths
```

### `/meow-validate [optional-suggestion]`

Use this after execution-mode work. The validator reviews reproducibility,
artifact coverage, validation commands, and summary output instead of treating
the work as a code-style-only review.

Example:

```text
/meow-validate confirm the execution summary can be reproduced from committed scripts
```

## Tips

- Keep command content concise and action-oriented.
- Use `/meow-plan` again when the target changes significantly.
- Use `/meow-code` again when `/meow-review` returns `needs_revision`.
- Use `/meow-execute` again when `/meow-validate` finds missing execution
  artifacts.
- Prefer the web harness when you want persisted background lane state,
  approval queues, or multiple concurrent proposals.
