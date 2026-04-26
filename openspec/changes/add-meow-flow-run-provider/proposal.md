## Why

`mfl run` always launches staged MeowFlow agents through Paseo without an
explicit provider selection path. Users need a predictable default provider,
a per-machine config override, and a per-invocation `--provider` flag so plan
and continuation agents can run on the intended Paseo provider without editing
the command internals.

## What Changes

- Add `--provider <provider>` to `mfl run` and pass the resolved value through
  to `paseo run --provider`.
- Default the provider to `claude` when no flag or config value is present.
- Load the default provider from `~/.local/share/meow-flow/config.json` when it
  contains a valid provider setting, with the CLI flag taking precedence.
- Keep provider values compatible with Paseo's provider syntax, including plain
  provider ids and provider/model values.
- Surface invalid provider config with a clear diagnostic that points users to
  `paseo provider ls`.
- Update the `meow-flow` skill's startup and staged continuation guidance so
  `/meow-flow`, `/mfl plan`, and other stage launches can use the configured
  provider or an explicit provider flag.
- Document the `--provider` flag, the `claude` default, the config file path,
  and `paseo provider ls` provider discovery in the README files.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `thread-workspace-occupancy`: `mfl run` resolves a provider from flag,
  config, or default before invoking Paseo.
- `meow-agent-skills`: The interactive entry and continuation skill guidance
  documents provider-aware plan and stage launches, plus the README-facing
  provider configuration details.

## Impact

- `packages/meow-flow/src/run-command.ts` and supporting configuration helpers
  for resolving and validating provider settings.
- `packages/meow-flow` focused CLI tests for default, flag, config, and invalid
  config behavior.
- `.codex/skills/meow-flow/SKILL.md` and generated embedded skill output so
  installed skills describe provider-aware launch commands.
- Root and package README files for user-facing provider selection docs.
