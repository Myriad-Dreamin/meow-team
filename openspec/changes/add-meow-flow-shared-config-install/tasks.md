## 1. Shared config contract

- [ ] 1.1 Add shared config path helpers and supported-extension validation for `.js` and `.ts`.
- [ ] 1.2 Implement a portable install pipeline that loads the source config in its original project context and writes `~/.local/shared/meow-flow/config.js` as JavaScript output.
- [ ] 1.3 Update default config resolution to prefer the shared installed artifact after `--config`, with local `team.config.ts` and `team.config.js` discovery as a compatibility fallback.

## 2. CLI surface and docs

- [ ] 2.1 Add a `config` command group with `config install <path>` help text and user-facing success/error output.
- [ ] 2.2 Update `packages/meow-flow/README.md` to document the shared config path, supported source file types, and reinstall expectations after repo moves.

## 3. Verification

- [ ] 3.1 Add targeted tests for `.ts` install, `.js` install, unsupported extensions, overwrite behavior, and shared-config loading precedence.
- [ ] 3.2 Run `pnpm --filter meow-flow test <targeted args as needed>` for the touched tests and `npm run typecheck`.
