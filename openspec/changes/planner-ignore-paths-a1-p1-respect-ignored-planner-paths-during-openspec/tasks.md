## 1. Proposal Alignment

- [x] 1.1 Review the approved OpenSpec artifacts for "Respect ignored planner paths during OpenSpec materialization" and confirm the canonical request/PR title is `fix(openspec/planner): honor ignored planner paths`
- [x] 1.2 Confirm the proposal stays scoped to one focused planner fix, the reusable worktree from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N` can be claimed after approval, and conventional-title metadata `fix(openspec/planner)` stays separate from `branchPrefix` and change paths

## 2. Planner Delta Isolation

- [ ] 2.1 Add the direct `ignore` dependency and load repository `.gitignore` rules in the planner materialization validation path in `lib/team/openspec.ts`
- [ ] 2.2 Filter unexpected planner worktree delta paths through the ignore matcher before failing, while preserving the current failure behavior for non-ignored unrelated edits

## 3. Regression Coverage And Validation

- [ ] 3.1 Extend `lib/team/openspec.test.ts` with a regression for ignored `.codex` planner residue and a guard that `README.md`-style external edits still fail
- [ ] 3.2 Run `pnpm fmt`, `pnpm lint`, targeted `pnpm test -- lib/team/openspec.test.ts`, and `pnpm build` before review
