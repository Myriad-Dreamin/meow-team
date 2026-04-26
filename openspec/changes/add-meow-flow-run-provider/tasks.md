## 1. Provider Resolution

- [x] 1.1 Add a focused MeowFlow run-provider config helper that resolves `--provider`, then `~/.local/share/meow-flow/config.json`, then `claude`.
- [x] 1.2 Validate provider values as trimmed non-empty strings and report invalid config with a diagnostic that mentions `paseo provider ls`.
- [x] 1.3 Keep provider strings opaque to MeowFlow and do not hard-code a provider/model allow-list.

## 2. Run Command Integration

- [x] 2.1 Add `--provider <provider>` to `mfl run --help`.
- [x] 2.2 Resolve the provider before mutating thread occupation state.
- [x] 2.3 Pass the resolved provider to `paseo run --provider <provider>` for new plan launches and occupied-thread continuation launches.
- [x] 2.4 Include the resolved provider in `mfl run` output so users can confirm which provider was launched.

## 3. Skill And Documentation Updates

- [x] 3.1 Update `.codex/skills/meow-flow/SKILL.md` so initial plan launches and staged continuation examples document optional `--provider <provider>` usage.
- [x] 3.2 Regenerate `packages/meow-flow/src/embedded-skills.ts` from the skill source.
- [x] 3.3 Update the root README and `packages/meow-flow/README.md` with the `--provider` flag, `claude` default, `~/.local/share/meow-flow/config.json` provider config, and `paseo provider ls`.

## 4. Verification

- [x] 4.1 Add focused `mfl run` tests for default provider, explicit provider, configured provider, and invalid provider config.
- [x] 4.2 Update help or embedded-skill tests affected by the new provider help/docs.
- [x] 4.3 Run the changed MeowFlow test files only with `npx vitest run <file> --bail=1`.
- [x] 4.4 Run `pnpm --filter meow-flow run typecheck`.
- [x] 4.5 Run `npm run format` before committing.
