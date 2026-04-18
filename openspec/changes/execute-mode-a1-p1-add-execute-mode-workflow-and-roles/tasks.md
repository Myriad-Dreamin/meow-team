## 1. Proposal Alignment

- [x] 1.1 Review the approved OpenSpec artifacts for "Add execute-mode workflow and roles" and confirm the canonical request/PR title is `feat(team/executing): introduce execute mode workflow`
- [x] 1.2 Confirm the proposal keeps pooled approval and worktree scheduling unchanged, keeps `lib/team/coding/index.ts` as the public coordinator, and uses the `AGENTS.md` fallback because this repository currently lacks `docs/guide/`

## 2. Request Mode Parsing

- [ ] 2.1 Parse `execution:`, `benchmark:`, and `experiment:` prefixes during planning, strip them from canonical request-title generation, and persist normalized execute-mode metadata on assignments without changing the existing unprefixed request flow
- [ ] 2.2 Update assignment materialization, lane activity text, resume paths, and stored metadata so approved execute-mode proposals stay mode-aware without leaking the prefix into canonical titles, branch prefixes, or change paths

## 3. Execute Runtime And Roles

- [ ] 3.1 Add `lib/team/executing/*` by copying the current coding-stage layout, then adapt approval, execution, review, and archive handling for script-and-data work while keeping `lib/team/coding/index.ts` as the public run coordinator
- [ ] 3.2 Add `executor` and `execution-reviewer` prompt and role modules, run `pnpm meow-prompt:sync-types`, and wire dependency resolution plus subtype-specific guide lookup with `docs/guide/<mode>.md` and `AGENTS.md` fallback behavior

## 4. Validation, Docs, And Regression Coverage

- [ ] 4.1 Implement the execution review artifact contract for committed scripts, validators or reproducible validation commands, and summarized collected data so execution-review can validate correctness even when raw data is ignored by git
- [ ] 4.2 Update focused docs, activity strings, and regression tests for execute-mode parsing, fallback guidance, approval routing, and unprefixed coder/reviewer stability; run the relevant validation commands before review
