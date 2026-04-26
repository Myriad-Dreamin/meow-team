## Why

The current embedded `meow-*` skills still describe manual single-agent role
commands and duplicate a generic harness workflow. MeowFlow now needs a single
entry skill that owns the staged thread workflow, plus an archive skill and CLI
state commands that let agents coordinate through persisted thread metadata
instead of relying on chat history alone.

## What Changes

- Add a `meow-flow` core skill triggered by `/meow-flow [content]` or
  `/mfl [content]` as the entry point for the rest of the `meow-*` skills.
- Add a `meow-archive` skill triggered by `/meow-archive` and
  `/meow-archive delete` for completing or dismissing the current MeowFlow
  thread and associated OpenSpec proposal.
- Remove the old `team-harness-workflow` skill from the embedded install set.
- Update `meow-plan`, `meow-code`, `meow-review`, `meow-execute`, and
  `meow-validate` so shared thread orchestration rules live in `meow-flow` and
  role skills refer back to it instead of duplicating harness workflow text.
- Extend `mfl run`, `mfl status`, `mfl thread`, `mfl agent`, and `mfl handoff`
  behavior so skills can discover worktree occupancy, launch staged agents,
  name threads, append/read handoffs, and archive or release worktrees.
- Preserve the existing linked-worktree launch model while making stages,
  thread names, request bodies, agent metadata, and handoff sequence numbers
  explicit in MeowFlow state.
- Update `docs/interactive-mode.md` with detailed `/meow-flow` interactive
  behavior, handoff expectations, archive/delete behavior, and Mermaid
  transition diagrams for code/review and execute/validate workflows.
- Update the root README with a minimal "plan then code then delete" example
  for simple changes that a human verifies quickly, where the OpenSpec
  proposal is treated as temporary and deleted instead of archived.

## Capabilities

### New Capabilities

- `meow-agent-skills`: Defines the bundled `meow-flow`, `meow-archive`,
  role-skill command contracts, and user-facing workflow documentation
  installed or referenced by MeowFlow.
- `thread-workflow-coordination`: Defines staged thread metadata, status,
  handoffs, self-updates, and archive/delete lifecycle commands used by the
  skills.

### Modified Capabilities

- `thread-worktree-occupancy`: Updates `mfl run` from an opaque request-body
  launcher into a stage-aware thread launcher that can create the initial plan
  thread or add stage agents to an occupied thread.

## Impact

- `.codex/skills`: add `meow-flow`, add `meow-archive`, update existing
  `meow-*` role skills, and remove `team-harness-workflow`.
- `packages/meow-flow/src/embedded-skills.ts` generation and
  `scripts/embed-skills.mjs` outputs via the existing embedding workflow.
- `packages/meow-flow` CLI commands for `run`, `status`, `agent update-self`,
  `thread status`, `thread set name`, `thread archive`, and `handoff`
  append/get.
- `packages/meow-flow` storage schema and tests for thread request bodies,
  stages, agents, handoffs, archive state, and worktree release behavior.
- Documentation in `docs/interactive-mode.md`, the root README, and package
  README for `/meow-flow`, `/mfl`, `/meow-archive`, minimal staged examples,
  and Mermaid workflow diagrams.
