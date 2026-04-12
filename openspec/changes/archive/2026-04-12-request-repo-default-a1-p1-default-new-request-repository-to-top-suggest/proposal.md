## Why

Implement New Request repository defaulting so the form selects the first suggested repository when available, preserves explicit user overrides and rerun-provided repository ids, keeps manual blank selection available, and adds regression coverage for refresh and fallback behavior. Default the New Request repository picker to the top suggested repository while preserving explicit user selections and current ranking behavior. This proposal is one candidate implementation for the request: Set default repository selected in the "New Request" tab to the most suggested repository.

## What Changes

- Introduce the `request-repo-default-a1-p1-default-new-request-repository-to-top-suggest` OpenSpec change for proposal "Default New Request Repository to Top Suggestion".
- Implement New Request repository defaulting so the form selects the first suggested repository when available, preserves explicit user overrides and rerun-provided repository ids, keeps manual blank selection available, and adds regression coverage for refresh and fallback behavior.
- Keep the proposal logically scoped so any approved coding-review worker can claim it without replanning.

## Capabilities

### New Capabilities
- `request-repo-default-a1-p1-default-new-request-repository-to-top-suggest`: Implement New Request repository defaulting so the form selects the first suggested repository when available, preserves explicit user overrides and rerun-provided repository ids, keeps manual blank selection available, and adds regression coverage for refresh and fallback behavior.

### Modified Capabilities
- None.

## Conventional Title

- Canonical request/PR title: `fix: Default New Request Repository to Top Suggestion`
- Conventional title metadata: `fix`
- Slash-delimited roadmap/topic scope stays in conventional-title metadata and does not alter `branchPrefix` or OpenSpec change paths.


## Impact

- Affected repository: `meow-team`
- Coding-review execution: pooled workers with reusable worktrees from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N`
- Planner deliverable: Proposed single change: make the New Request repository field default to the highest-ranked suggested repository, using the existing suggestion order from the repository picker model. Execution boundaries - Touch only the New Request selection behavior and its regression coverage. - Do not alter suggestion generation, history collection, or repository dispatch rules. - Keep `No repository selected` as a valid manual choice. Implementation notes - Seed the form from the first suggested repository instead of an unconditional empty string. - Add safe reconciliation for picker refreshes so empty or invalid state can recover to the top suggestion, but explicit user selections are preserved. - Leave rerun flows that already pass a concrete `repositoryId` unchanged. - Add tests for defaulting and non-overwrite behavior so the polling workspace update path stays stable. Approval risk to watch The main failure mode is unintentionally reselecting the suggested repository after the user changes the field. The approved implementation should explicitly guard against that.
