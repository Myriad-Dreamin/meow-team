## 1. Shared config contract

- [x] 1.1 Add shared config path helpers and supported-extension validation for `.js` and `.ts`.
- [x] 1.2 Implement a portable install pipeline that loads the source config in its original project context and writes `~/.local/shared/meow-flow/config.js` as JavaScript output.
- [x] 1.3 Update default config resolution to use `--config` first, then the shared installed artifact, and fail clearly when no shared config exists.

## 2. CLI surface and docs

- [x] 2.1 Add a `config` command group with `config install <path>` help text and user-facing success/error output.
- [x] 2.2 Update `packages/meow-flow/README.md` to document the shared config path, supported source file types, and reinstall expectations after repo moves.

## 3. Verification

- [x] 3.1 Add targeted tests for `.ts` install, `.js` install, unsupported extensions, overwrite behavior, shared-config loading precedence, and missing shared config diagnostics.
- [x] 3.2 Run `pnpm --filter meow-flow test <targeted args as needed>` for the touched tests and `npm run typecheck`.
