## Context

This change captures proposal "Route Final Archive Through Coder `/opsx:archive`" as OpenSpec change `coder-archive-a2-p1-route-final-archive-through-coder-opsx-archive`.
Implementation starts only after human approval and is claimed by the next
available coding-review worker from the shared pool.

## Goals / Non-Goals

**Goals:**
- Replace machine-only final approval archiving with a non-interactive coder-run `/opsx:archive <change>` pass that can sync unsynced specs and resolve archive-time `TBD` cleanup before the system pushes the branch and refreshes the GitHub PR.
- Preserve a reviewable OpenSpec contract before coding starts.
- Keep the proposal logical enough that any pooled worker can execute it.
- Reuse a managed worktree from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N` for cache-friendly execution.

**Non-Goals:**
- Bind this proposal to a specific branch or worker slot before approval.
- Expand scope beyond the approved proposal without human feedback.
- Merge sibling proposals into a single coding pass without replanning.

## Decisions

- Store the proposal as a dedicated OpenSpec change before coding begins.
- Let the pooled coding-review runtime allocate execution branches and worktrees after approval.
- Use planner output as the starting point for reviewer validation and follow-up tasks.
- Prefer incremental implementation that can be requeued after machine review feedback.
- Keep the canonical request/PR title as `feat(archive/workflow): Route Final Archive Through Coder `/opsx:archive`.
- Keep slash-delimited roadmap/topic scope in conventional-title metadata `feat(archive/workflow)` instead of `branchPrefix` or OpenSpec change paths.

## Conventional Title

- Canonical request/PR title: `feat(archive/workflow): Route Final Archive Through Coder `/opsx:archive`
- Conventional title metadata: `feat(archive/workflow)`
- Slash-delimited roadmap/topic scope stays in conventional-title metadata and does not alter `branchPrefix` or OpenSpec change paths.


## Risks / Trade-offs

- [Proposal drift] -> Compare implementation against the approved OpenSpec artifacts before coding.
- [Sibling proposal overlap] -> Send cross-proposal changes back to request-group replanning.
- [Reusable worktree residue] -> Reset the managed worktree before each proposal run.
- [Validation gaps] -> Require reviewer findings and task completion before treating work as complete.

Planner deliverable reference: OpenSpec-aligned proposal: `coder-final-archive`. Objective: Replace machine-only final approval archiving with a coder-run `/opsx:archive <change>` continuation that can sync specs, resolve archive-time cleanup such as `TBD` placeholders, and then hand control back to the system for branch push and GitHub PR refresh. Implementation shape: 1. Refactor the current `pull-request-approval` finalization path so it no longer archives directly inside `approveLanePullRequest()`; instead, queue a dedicated archive continuation for the approved lane with the branch, change name, archived-path context, and stored PR metadata. 2. Extend lane orchestration and coder state so final approval can launch a coder-only archive pass with archive-specific activity, resume, and retry messaging instead of presenting the work as normal feature implementation. 3. Make the `/opsx:archive` handoff deterministic for non-interactive execution: always pass the change name, explicitly state that the coder is not in an interactive context, and sync specs if archive inspection finds any unsynced delta specs. 4. Let the coder complete archive-time agent work before archiving finishes, including spec sync and filling archive-related `TBD` content when needed, then reuse the existing system path for commit detection, roadmap archive links, branch push, and GitHub PR create or refresh. 5. Preserve failure and resume behavior so partially completed archive results, archived paths, and PR metadata remain accurate if the coder pass or post-archive GitHub delivery fails and is retried. 6. Add regression coverage for archive-stage routing, coder prompt/input construction, non-interactive `/opsx:archive` behavior, spec-sync/archive cleanup branches, and post-archive PR delivery outcomes. Scope boundaries: - Keep the main proposal execution workflow `planner -> coder -> reviewer` unchanged. - Do not add a fresh reviewer pass for archive-only work unless implementation proves it is unavoidable. - Keep GitHub push and PR publication in system code after the coder archive pass completes. Risks and assumptions: - `/opsx:archive` is interactive by default, so the implementation must avoid any path that waits for user selection or confirmation. - Archive-time edits may touch more than the archive move itself; thread history and failure handling must continue to distinguish pre-archive, archived-but-unpushed, and pushed-but-PR-failed states. Approval note: This is one coherent proposal. Coding-review lanes stay idle until the proposal is approved.
