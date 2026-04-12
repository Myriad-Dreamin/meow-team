## Why

Implement history-based repository suggestion ranking in the Run Team picker so repositories used in prior team runs are suggested first by most recent use, while the full configured repository list remains selectable. Prioritize Run Team repository suggestions from persisted repository usage history. This proposal is one candidate implementation for the request: Suggest repositories in "Run team" flow: - by default, the suggested repositories are the same as the recent selected repositories, and the user can also select from the list of repositories that the user has access to. - If there are multiple repositories, the repositories that a user ever requested to run a team in will be suggested first, and if there are multiple, the most recently used one will be suggested.

## What Changes

- Introduce the `run-team-repos-a1-p1-prioritize-run-team-repository-suggestions` OpenSpec change for proposal "Prioritize Run Team repository suggestions".
- Implement history-based repository suggestion ranking in the Run Team picker so repositories used in prior team runs are suggested first by most recent use, while the full configured repository list remains selectable.
- Keep the proposal logically scoped so any approved coding-review worker can claim it without replanning.

## Capabilities

### New Capabilities
- `run-team-repos-a1-p1-prioritize-run-team-repository-suggestions`: Implement history-based repository suggestion ranking in the Run Team picker so repositories used in prior team runs are suggested first by most recent use, while the full configured repository list remains selectable.

### Modified Capabilities
- None.

## Conventional Title

- Canonical request/PR title: `feat(run/team): Prioritize Run Team repository suggestions`
- Conventional title metadata: `feat(run/team)`
- Slash-delimited roadmap/topic scope stays in conventional-title metadata and does not alter `branchPrefix` or OpenSpec change paths.


## Impact

- Affected repository: `meow-team`
- Coding-review execution: pooled workers with reusable worktrees from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N`
- Planner deliverable: OpenSpec-aligned change: `prioritize-run-team-repository-suggestions` Deliver: - A repository suggestion helper that reads full team thread history and returns repositories with prior Run Team usage first, sorted by most recent request timestamp descending. - A combined picker model for the Run Team form that keeps all configured repositories selectable, with suggested repositories grouped or ordered ahead of the remaining accessible repositories. - Run Team UI updates that make the suggestion behavior clear without silently overriding an explicit user choice. - Tests covering MRU ordering, deduplication by repository id, repositories with no prior usage, and preservation of the full accessible list. Likely touch points: - `lib/team/history.ts` or a new repository-suggestion helper - `app/page.tsx` - `components/team-workspace.tsx` - `components/team-console.tsx` - history/helper test files Validation: - `pnpm test` - `pnpm lint` - `pnpm fmt:check` - `pnpm build` if the final implementation changes page data flow structurally Pool behavior: - Do not start coder or reviewer lane work until this proposal is explicitly approved.
