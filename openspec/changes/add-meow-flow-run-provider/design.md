## Context

MeowFlow stage launches currently flow through `mfl run`, which resolves the
thread/worktree/stage and then invokes `paseo run`. The command already owns
the compatibility boundary with Paseo labels, stage prompts, and created-agent
output parsing, so provider selection belongs in that launch path rather than
inside individual stage skills.

Paseo already exposes provider discovery and selection through
`paseo provider ls` and `paseo run --provider <provider>`. MeowFlow only needs
to resolve which provider string to pass and to document that provider strings
come from Paseo.

## Goals / Non-Goals

**Goals:**

- Allow `mfl run --provider <provider>` to override the provider for a single
  plan or continuation launch.
- Use `claude` as the default provider when the user has not configured one.
- Support a local MeowFlow config file at
  `~/.local/share/meow-flow/config.json` for changing the default provider.
- Keep the config shape small and explicit so invalid values fail before
  `paseo run` starts.
- Update installed skill guidance and README docs so interactive `/meow-flow`
  usage points users at the same provider behavior.

**Non-Goals:**

- Add a new provider registry to MeowFlow.
- Validate provider ids against the live Paseo daemon before launch.
- Change Paseo WebSocket or message schemas.
- Merge this runtime provider config with the older team planning config
  concepts.

## Decisions

1. Resolve provider precedence in `mfl run` as:
   explicit `--provider`, then `~/.local/share/meow-flow/config.json`, then
   `claude`.

   This keeps one-off launches ergonomic while making the machine-level default
   stable. The alternative was to require every interactive skill to pass a
   provider, but that would duplicate parsing behavior across skills and make
   the default less discoverable.

2. Store the default provider in JSON as a top-level string field:

   ```json
   {
     "provider": "codex/gpt-5.4"
   }
   ```

   A JSON object leaves room for later MeowFlow runtime defaults without
   making the first provider setting ambiguous. The alternative was a plain
   text file containing only a provider string, but that would not extend
   cleanly.

3. Treat provider strings as opaque Paseo provider values.

   MeowFlow SHALL require a non-empty string, trim surrounding whitespace, and
   pass the value to `paseo run --provider`. It SHALL not maintain its own list
   of supported providers or models. Users can inspect available values with
   `paseo provider ls`.

4. Keep the config file separate from shared team config.

   Existing OpenSpec text references team planning config paths such as
   `~/.local/share/meow-flow/config.js`. This change introduces a lightweight
   runtime config at `~/.local/share/meow-flow/config.json` for launch defaults
   only. The implementation should keep names and docs explicit to avoid
   implying that team planning config and run-provider config are the same
   artifact.

## Risks / Trade-offs

- Invalid configured provider prevents all default launches -> validate the
  config value before allocation or `paseo run`, and include
  `paseo provider ls` in the diagnostic.
- Provider ids can change as Paseo providers change -> delegate discovery to
  `paseo provider ls` instead of hard-coding allowed values in MeowFlow.
- A new `config.json` can be confused with older config docs -> README text
  must call it the MeowFlow run-provider config and show the exact path.
- Passing a provider/model string that the local daemon does not support will
  still fail in Paseo -> preserve Paseo's error output so the user sees the
  provider-specific failure.
