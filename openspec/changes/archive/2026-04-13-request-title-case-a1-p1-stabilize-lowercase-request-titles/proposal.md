## Why

Repair the canonical title pipeline so single-proposal request groups no longer surface title-cased planner subjects as the final request or PR title, align title-producing prompts with the lowercase-initial rule where needed, and add regression coverage for shared request-title formatting and planning metadata generation. Investigate and correct request-title casing so canonical request and PR titles keep the intended lowercase initial subject through planning and dispatch. This proposal is one candidate implementation for the request: The generated title are upper cased, figure out the reason. If it is a bug that we converted the title, fix the code; if it is that the agent generated upper cased title, then we should fix prompt to enforce that the first letter must be lower cased.

## What Changes

- Introduce the `request-title-case-a1-p1-stabilize-lowercase-request-titles` OpenSpec change for proposal "stabilize lowercase request titles".
- Repair the canonical title pipeline so single-proposal request groups no longer surface title-cased planner subjects as the final request or PR title, align title-producing prompts with the lowercase-initial rule where needed, and add regression coverage for shared request-title formatting and planning metadata generation.
- Keep the proposal logically scoped so any approved coding-review worker can claim it without replanning.

## Capabilities

### New Capabilities
- `request-title-case-a1-p1-stabilize-lowercase-request-titles`: Repair the canonical title pipeline so single-proposal request groups no longer surface title-cased planner subjects as the final request or PR title, align title-producing prompts with the lowercase-initial rule where needed, and add regression coverage for shared request-title formatting and planning metadata generation.

### Modified Capabilities
- None.

## Conventional Title

- Canonical request/PR title: `fix(planning/request-title): stabilize lowercase request titles`
- Conventional title metadata: `fix(planning/request-title)`
- Slash-delimited roadmap/topic scope stays in conventional-title metadata and does not alter `branchPrefix` or OpenSpec change paths.


## Impact

- Affected repository: `meow-team`
- Coding-review execution: pooled workers with reusable worktrees from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N`
- Planner deliverable: Recommended proposal set: 1 proposal. This request looks like a single implementation lane, not multiple independent workstreams. The evidence points to canonical title assembly preserving planner task casing for single-proposal requests rather than a UI transform. The practical fix should therefore focus on the shared title pipeline first, then align prompts and tests with the chosen lowercase rule. Why this stays one proposal: - The bug spans one cohesive path: request-title generation, planner task titles, canonical title assembly, and regression coverage. - Splitting prompt work from formatter/orchestration work would risk approving only half of the contract, which would leave uppercase titles reappearing through whichever path was not updated. - The validation burden is shared across the same tests and the same title helpers. Expected implementation boundaries: - Inspect and adjust the canonical title source-selection path in `lib/team/request-title.ts` and `lib/team/coding/plan.ts`. - Update title-producing prompts only where they materially influence canonical or PR title text. - Refresh request-title and planning-flow tests so they assert the approved lowercase-initial behavior instead of the current capitalized snapshots. - Keep unrelated UI styling, branch-prefix behavior, and repository-dispatch flow unchanged. Open risk: - If the team still wants Title Case proposal names in planner output but lowercase canonical request and PR titles, the coder will need to separate proposal-display titles from canonical subject formatting instead of forcing one representation everywhere. Validation target: - `pnpm fmt` - `pnpm lint` - targeted Vitest for `lib/team/request-title.test.ts`, `lib/team/roles/request-title.test.ts`, and `lib/team/coding/index.test.ts` - `pnpm build` if shared prompt/type artifacts or title helpers change Approval note: - Materialize this as one OpenSpec change. The pooled coder/reviewer lanes should remain idle until approval arrives.
