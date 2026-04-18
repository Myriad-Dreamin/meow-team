## 1. Proposal Alignment

- [x] 1.1 Confirm the canonical request/PR title is `feat(cli/platform): wire cli platform config` and the scope stays limited to Clipanion bootstrap, repo-local platform config, and repository-aware platform resolution
- [x] 1.2 Keep `ugit` config-only in this change and preserve conventional-title metadata `feat(cli/platform)` separately from `branchPrefix` and change paths

## 2. CLI Bootstrap

- [x] 2.1 Add `clipanion`, expose a `meow-team` bin or entrypoint through the repository's `pnpm` workflow, and wire a `config` command namespace
- [x] 2.2 Implement `meow-team config platform <github|ugit>` with clear success output and actionable errors when the current working directory is not a Git repository

## 3. Repository Config Persistence

- [x] 3.1 Add repository-local harness config helpers that resolve the current repo root and read or write `meow-team.platform` through `git config --local`
- [x] 3.2 Cover config persistence with temporary-repository tests for both `github` and `ugit` writes plus out-of-repo failures

## 4. Platform Resolution

- [x] 4.1 Extend `lib/platform` types and exported operations so platform selection is resolved per repository and defaults to GitHub when `meow-team.platform` is unset
- [x] 4.2 Fail early and clearly for configured `ugit` or any unsupported configured platform before invoking GitHub-specific logic

## 5. Validation

- [x] 5.1 Add or update regression coverage for the CLI entrypoint behavior, repository-local config helpers, and platform resolution
- [x] 5.2 Run `pnpm fmt`, `pnpm lint`, relevant Vitest coverage, and `pnpm build`
