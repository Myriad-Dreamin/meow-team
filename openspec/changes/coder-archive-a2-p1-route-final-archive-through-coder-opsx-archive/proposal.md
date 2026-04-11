## Why

Replace machine-only final approval archiving with a non-interactive coder-run `/opsx:archive <change>` pass that can sync unsynced specs and resolve archive-time `TBD` cleanup before the system pushes the branch and refreshes the GitHub PR. Route final archive continuation through a non-interactive coder `/opsx:archive <change>` pass before system PR refresh. This proposal is one candidate implementation for the request: The archive step should be finished by the coder agent using prompt `/opsx:archive` rather than the machine, as there may be some work to be done by agent e.g. `sync spec` and fill `TBD` in the created spec.

## What Changes

- Introduce the `coder-archive-a2-p1-route-final-archive-through-coder-opsx-archive` OpenSpec change for proposal "Route Final Archive Through Coder `/opsx:archive`".
- Replace machine-only final approval archiving with a non-interactive coder-run `/opsx:archive <change>` pass that can sync unsynced specs and resolve archive-time `TBD` cleanup before the system pushes the branch and refreshes the GitHub PR.
- Keep the proposal logically scoped so any approved coding-review worker can claim it without replanning.

## Capabilities

### New Capabilities
- `coder-archive-a2-p1-route-final-archive-through-coder-opsx-archive`: Replace machine-only final approval archiving with a non-interactive coder-run `/opsx:archive <change>` pass that can sync unsynced specs and resolve archive-time `TBD` cleanup before the system pushes the branch and refreshes the GitHub PR.

### Modified Capabilities
- None.

## Conventional Title

- Canonical request/PR title: `feat(archive/workflow): Route Final Archive Through Coder `/opsx:archive`
- Conventional title metadata: `feat(archive/workflow)`
- Slash-delimited roadmap/topic scope stays in conventional-title metadata and does not alter `branchPrefix` or OpenSpec change paths.


## Impact

- Affected repository: `meow-team`
- Coding-review execution: pooled workers with reusable worktrees from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N`
- Planner deliverable: OpenSpec-aligned proposal: `coder-final-archive`. Objective: Replace machine-only final approval archiving with a coder-run `/opsx:archive <change>` continuation that can sync specs, resolve archive-time cleanup such as `TBD` placeholders, and then hand control back to the system for branch push and GitHub PR refresh. Implementation shape: 1. Refactor the current `pull-request-approval` finalization path so it no longer archives directly inside `approveLanePullRequest()`; instead, queue a dedicated archive continuation for the approved lane with the branch, change name, archived-path context, and stored PR metadata. 2. Extend lane orchestration and coder state so final approval can launch a coder-only archive pass with archive-specific activity, resume, and retry messaging instead of presenting the work as normal feature implementation. 3. Make the `/opsx:archive` handoff deterministic for non-interactive execution: always pass the change name, explicitly state that the coder is not in an interactive context, and sync specs if archive inspection finds any unsynced delta specs. 4. Let the coder complete archive-time agent work before archiving finishes, including spec sync and filling archive-related `TBD` content when needed, then reuse the existing system path for commit detection, roadmap archive links, branch push, and GitHub PR create or refresh. 5. Preserve failure and resume behavior so partially completed archive results, archived paths, and PR metadata remain accurate if the coder pass or post-archive GitHub delivery fails and is retried. 6. Add regression coverage for archive-stage routing, coder prompt/input construction, non-interactive `/opsx:archive` behavior, spec-sync/archive cleanup branches, and post-archive PR delivery outcomes. Scope boundaries: - Keep the main proposal execution workflow `planner -> coder -> reviewer` unchanged. - Do not add a fresh reviewer pass for archive-only work unless implementation proves it is unavoidable. - Keep GitHub push and PR publication in system code after the coder archive pass completes. Risks and assumptions: - `/opsx:archive` is interactive by default, so the implementation must avoid any path that waits for user selection or confirmation. - Archive-time edits may touch more than the archive move itself; thread history and failure handling must continue to distinguish pre-archive, archived-but-unpushed, and pushed-but-PR-failed states. Approval note: This is one coherent proposal. Coding-review lanes stay idle until the proposal is approved.
