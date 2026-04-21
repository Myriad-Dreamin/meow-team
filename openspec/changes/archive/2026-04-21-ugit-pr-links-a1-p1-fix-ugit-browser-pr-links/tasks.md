## 1. Proposal Alignment

- [x] 1.1 Confirm the canonical request/PR title is `fix: correct ugit PR links` and keep conventional-title metadata `fix` separate from the approved change path
- [x] 1.2 Keep scope limited to repository-local ugit browser config, stable browser slug derivation, ugit PR link fixes, and focused regression coverage without changing GitHub behavior

## 2. Repository-Local Ugit Browser Config

- [x] 2.1 Add repository config helpers for the ugit browser base URL with an unset default of `http://localhost:17121/`
- [x] 2.2 Extend the CLI config surface with an explicit `meow-team config ugit base-url <url>` workflow and update command-help coverage for the new repository-local setting

## 3. Ugit Browser Link Generation

- [x] 3.1 Rework ugit remote resolution so `origin` fetch and push URLs stay transport metadata while the browser repository slug is derived from stable repo metadata, preferring `upstream`
- [x] 3.2 Rebuild ugit pull-request URL generation around the browser repository URL so ugit PR links resolve to `/owner/repo/pull-requests/<id>`

## 4. Regression Coverage

- [x] 4.1 Add or update focused tests for repository-local config persistence, default resolution, and CLI UX around ugit browser base-url overrides
- [x] 4.2 Add ugit adapter regression tests for local-path and ssh `origin` remotes, browser repository URL derivation, and unchanged GitHub link behavior

## 5. Validation

- [x] 5.1 Run targeted Vitest coverage for repository config, CLI config, and platform/ugit URL generation
- [x] 5.2 Run `pnpm fmt`, `pnpm lint`, and `pnpm build` if the shared config or adapter surface changes broadly enough during implementation
