## 1. Proposal Alignment

- [x] 1.1 Review the approved OpenSpec artifacts for "Validate planner materialization with tracked paths only" and confirm the canonical request/PR title is `fix(planner/openspec): limit planner materialization to tracked paths`
- [x] 1.2 Confirm the proposal stays scoped to one planner-materialization fix, reusable worktrees still come from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N` after approval, and conventional-title metadata `fix(planner/openspec)` stays separate from `branchPrefix` and OpenSpec change paths

## 2. Planner Isolation Refactor

- [x] 2.1 Refactor `lib/team/openspec.ts` so outside-path validation is derived from tracked members of the uncommitted delta plus committed path deltas, while preserving expected artifact checks, prior-snapshot protection, and planner HEAD-stability validation
- [x] 2.2 Remove the direct `ignore` dependency from `package.json` and refresh `pnpm-lock.yaml` after planner materialization no longer reads `.gitignore`

## 3. Regression Coverage And Contract

- [x] 3.1 Update `lib/team/openspec.test.ts` so untracked residue like `.codex` is allowed, tracked unexpected paths including tracked `.codex` still fail, and the negative regression no longer depends on `.gitignore` matching
- [x] 3.2 Refresh the planner materialization OpenSpec contract text so it documents tracked and committed path isolation instead of repository ignore rules

## 4. Validation

- [x] 4.1 Run `pnpm fmt`, `pnpm lint`, and targeted planner materialization tests covering `lib/team/openspec.test.ts`
- [x] 4.2 Run `pnpm build` before review because the change updates shared planner harness code and dependency metadata
