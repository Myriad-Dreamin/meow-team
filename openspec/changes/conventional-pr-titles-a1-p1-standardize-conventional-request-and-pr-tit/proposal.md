## Why

Introduce shared conventional-title metadata and formatting across planner/OpenSpec materialization, request-title storage, reviewer/finalization PR handling, and the new PR-title lint workflow, while keeping slash-delimited roadmap/topic scopes separate from `branchPrefix` and OpenSpec change paths. One proposal to make the harness generate and enforce Conventional Commit-style request and PR titles using OpenSpec-derived roadmap/topic metadata. This proposal is one candidate implementation for the request: Add commit convention: - convention is based on `conventional commits`. - the roadmaps and topics are determined on creating specs (openspec), and the PR title should contain the topic name if determined e.g. `dev(vscode-extension/command)`, and short alias can be used e.g. `dev(vsc/command)`. - request title (`lib/team/request-title.ts`) should be the name of the PR and also follow above convention. - add following CI: ```yaml name: meow-team::lint_pr_title on: pull_request: types: [opened, edited, synchronize] permissions: pull-requests: write jobs: main: name: Validate PR title runs-on: ubuntu-latest steps: - uses: amannn/action-semantic-pull-request@v5 id: lint_pr_title env: GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }} with: # Configure which types are allowed (newline-delimited). # Default: https://github.com/commitizen/conventional-commit-types # extraType: dev: internal development types: | dev feat fix docs style refactor perf test build ci chore revert ignoreLabels: | bot ignore-semantic-pull-request - uses: marocchino/sticky-pull-request-comment@v2 # When the previous steps fails, the workflow would stop. By adding this # condition you can continue the execution with the populated error message. if: always() && (steps.lint_pr_title.outputs.error_message != null) with: header: pr-title-lint-error message: | Hey there and thank you for opening this pull request! 👋🏼 We require pull request titles to follow the [Conventional Commits specification](https://www.conventionalcommits.org/en/v1.0.0/) and it looks like your proposed title needs to be adjusted. Details: ``` ${{ steps.lint_pr_title.outputs.error_message }} ``` # Delete a previous comment when the issue has been resolved - if: ${{ steps.lint_pr_title.outputs.error_message == null }} uses: marocchino/sticky-pull-request-comment@v2 with: header: pr-title-lint-error delete: true ```.

## What Changes

- Introduce the `conventional-pr-titles-a1-p1-standardize-conventional-request-and-pr-tit` OpenSpec change for proposal "Standardize Conventional Request and PR Titles".
- Introduce shared conventional-title metadata and formatting across planner/OpenSpec materialization, request-title storage, reviewer/finalization PR handling, and the new PR-title lint workflow, while keeping slash-delimited roadmap/topic scopes separate from `branchPrefix` and OpenSpec change paths.
- Keep the proposal logically scoped so any approved coding-review worker can claim it without replanning.

## Capabilities

### New Capabilities
- `conventional-pr-titles-a1-p1-standardize-conventional-request-and-pr-tit`: Introduce shared conventional-title metadata and formatting across planner/OpenSpec materialization, request-title storage, reviewer/finalization PR handling, and the new PR-title lint workflow, while keeping slash-delimited roadmap/topic scopes separate from `branchPrefix` and OpenSpec change paths.

### Modified Capabilities
- None.

## Impact

- Affected repository: `meow-team`
- Coding-review execution: pooled workers with reusable worktrees from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N`
- Planner deliverable: Single OpenSpec-aligned proposal. Persist explicit conventional-title metadata for type and optional roadmap/topic scope, keep that metadata separate from `branchPrefix`, use it to normalize the canonical request title and final PR title, mirror the scope decision into generated OpenSpec artifacts, and add the requested PR-title lint workflow. Validation should cover request-title formatting, metadata propagation through planning and dispatch, reviewer/finalization PR title behavior, and the new CI workflow. Coding-review lanes remain idle until this proposal is approved.
