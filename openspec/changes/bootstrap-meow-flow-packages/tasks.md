## 1. Workspace Setup

- [x] 1.1 Add `packages/meow-flow-core` and `packages/meow-flow` to `pnpm-workspace.yaml`
- [x] 1.2 Add the root `cli:meow-flow` script to `package.json`

## 2. Core Package Bootstrap

- [x] 2.1 Create `packages/meow-flow-core/package.json` with library metadata, exports, and build/typecheck scripts
- [x] 2.2 Create `packages/meow-flow-core/tsconfig.json` and `packages/meow-flow-core/src/index.ts` so the package builds to `dist` with declarations

## 3. CLI Package Bootstrap

- [x] 3.1 Create `packages/meow-flow/package.json` and `packages/meow-flow/tsconfig.json` following the existing CLI package structure
- [x] 3.2 Create `packages/meow-flow/src/index.ts`, `packages/meow-flow/src/cli.ts`, `packages/meow-flow/src/version.ts`, and `packages/meow-flow/bin/meow-flow` for a minimal runnable CLI

## 4. Bootstrap Validation

- [x] 4.1 Add a foundation test that verifies `npm run cli:meow-flow -- --version` succeeds and prints the package version
- [x] 4.2 Add a foundation test that verifies `npm run cli:meow-flow -- --help` succeeds and prints help output
- [x] 4.3 Run targeted package validation, then run repository-wide `npm run typecheck` and `npm run format`
