## 1. Thread State Foundation

- [x] 1.1 Add or migrate persisted thread metadata for thread name, request body, archived state, agent records, and handoff records while preserving existing occupation rows.
- [x] 1.2 Add pure helpers for supported stages, skill-to-stage derivation, latest-stage derivation, archived-state detection, and next handoff sequence calculation.
- [x] 1.3 Add deterministic formatting for `mfl thread status <id> --no-color`, including YAML-compatible agents, request body, and handoffs.
- [x] 1.4 Add focused storage/helper tests for names, request bodies, agent metadata, stage derivation, archive state, and handoff sequence behavior.

## 2. CLI Coordination Commands

- [x] 2.1 Implement `mfl status` for occupied worktree, idle worktree, repository-root, and outside-git diagnostics.
- [x] 2.2 Keep `mfl worktree` as the worktree-management command group and avoid adding a `mfl workspace` alias.
- [x] 2.3 Implement `mfl thread status <id> --no-color` and missing-thread diagnostics.
- [x] 2.4 Implement `mfl thread set name <name>` for the current thread with empty-name and kebab-case validation.
- [x] 2.5 Implement `mfl agent update-self`, including current-agent detection, supported `meow-*` skill inference, `paseo agent update` metadata updates, and persisted agent records.
- [x] 2.6 Implement `mfl handoff append --stage <stage> <content>` with monotonic sequence assignment.
- [x] 2.7 Implement `mfl handoff get -n <count>` and `mfl handoff get --since <seq>` for the current thread.
- [x] 2.8 Implement `mfl thread archive` to mark the current thread archived, reject already archived threads, and release the worktree without deleting the worktree folder or reverting code changes.

## 3. Stage-Aware Run Flow

- [x] 3.1 Extend `mfl run` option parsing with `--stage plan|code|review|execute|validate` and clear unsupported-stage errors.
- [x] 3.2 Store the initial request body and launch `plan` by default only when a thread has no agents.
- [x] 3.3 Require `--stage` when launching an additional agent for a thread that already has agents.
- [x] 3.4 Allow same-thread stage launches from the occupied current worktree without allocating another worktree.
- [x] 3.5 Keep duplicate new-thread launches blocked for worktrees occupied by a different thread, including diagnostics with the occupying thread and latest Paseo agent id when available.
- [x] 3.6 Compose stage-specific Paseo prompts that select `meow-plan`, `meow-code`, `meow-review`, `meow-execute`, or `meow-validate` while preserving the user request text unchanged inside the prompt.
- [x] 3.7 Parse the created Paseo agent id, persist agent metadata when available, and print `agent-id: <id>` plus `next-seq: <seq>`.
- [x] 3.8 Keep failed `paseo run` rollback behavior for fresh allocations and add diagnostics for malformed Paseo output.

## 4. Skills

- [x] 4.1 Add `.codex/skills/meow-flow/SKILL.md` documenting `/meow-flow`, `/mfl`, status checks, stage dispatch, continuation actions, and handoff expectations.
- [x] 4.2 Add `.codex/skills/meow-archive/SKILL.md` documenting `/meow-archive` and `/meow-archive delete`.
- [x] 4.3 Remove `.codex/skills/team-harness-workflow` from the repository.
- [x] 4.4 Update `meow-plan` to follow the core `meow-flow` workflow, choose and persist a readable unused thread name, create the matching OpenSpec proposal, and commit using the configured or inferred title format.
- [x] 4.5 Update `meow-code`, `meow-review`, `meow-execute`, and `meow-validate` to refer to `meow-flow` for shared thread, worktree, stage, and handoff rules.
- [x] 4.6 Ensure stage role skills append concise handoffs through `mfl handoff append --stage <stage> <content>` before finishing when they produce implementation, review, execution, or validation results.
- [x] 4.7 Regenerate `packages/meow-flow/src/embedded-skills.ts` with the existing embed script.

## 5. Documentation

- [x] 5.1 Update `docs/interactive-mode.md` with detailed `/meow-flow` and `/mfl` startup behavior, `mfl status`, worktree creation guidance, stage-agent launch behavior, handoffs, commit/archive/delete actions, and how the role skills relate to the core skill.
- [x] 5.2 Update the root README to present `meow-flow` as the entry skill and include a minimal "plan then code then delete" example for simple human-verified changes where proposal artifacts are temporary and deleted rather than archived.
- [x] 5.3 Add matching Mermaid transition diagrams to `docs/interactive-mode.md` and the root README for the plan-code-review workflow, including plan-to-code, plan-to-commit, plan-to-delete, code-to-plan, code-to-review, code-to-archive, code-to-commit, code-to-delete, review-to-plan, review-to-code, review-to-archive, review-to-commit, review-to-delete, code-to-execute, and review-to-execute transitions.
- [x] 5.4 Add matching Mermaid transition diagrams to `docs/interactive-mode.md` and the root README for the plan-execute-validate workflow, including plan-to-execute, plan-to-commit, plan-to-delete, execute-to-plan, execute-to-validate, execute-to-archive, execute-to-commit, execute-to-delete, validate-to-plan, validate-to-execute, validate-to-archive, validate-to-commit, and validate-to-delete transitions.
- [x] 5.5 Update `packages/meow-flow/README.md` with `/meow-flow`, `/mfl`, `/meow-archive`, staged `mfl run`, status, handoff, archive, and delete examples.
- [x] 5.6 Update CLI help expectations or snapshots for `status`, `worktree`, `thread`, `agent`, `handoff`, and stage-aware `run` commands.

## 6. Validation

- [x] 6.1 Add targeted CLI tests for `mfl status` and retained `mfl worktree` behavior.
- [x] 6.2 Add targeted CLI tests for thread status, thread name updates, agent self-update, handoff append/get, and thread archive.
- [x] 6.3 Add targeted CLI tests for stage-aware `mfl run`, including default plan launch, required `--stage`, same-thread stage launch, occupied-worktree diagnostics, `agent-id`/`next-seq` output, failed-run rollback, and malformed Paseo output.
- [x] 6.4 Add targeted install-skills tests that `meow-flow` and `meow-archive` are installed and `team-harness-workflow` is not.
- [x] 6.5 Run the changed `packages/meow-flow` test files only with `npx vitest run <file> --bail=1`.
- [x] 6.6 Run `npm run typecheck`.
