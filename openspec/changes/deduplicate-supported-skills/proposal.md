## Why

`mfl install-skills` correctly embeds and installs 8 MeowFlow skills, but
`mfl agent update-self` keeps a separate hardcoded 6-skill list for detecting
stage-agent labels. That second list duplicates the stage/skill mapping source
of truth and makes the CLI diagnostics look like the installable skill set is
missing `meow-flow` and `meow-dataset`.

## What Changes

- Validate that the embedded skill set is still 8 skills:
  `meow-flow`, `meow-archive`, `meow-plan`, `meow-code`, `meow-review`,
  `meow-execute`, `meow-validate`, and `meow-dataset`.
- Keep stage-agent classification limited to the skills that can correspond to
  thread stages or archive actions.
- Remove the duplicated `SUPPORTED_SKILLS` array in `agent-command` when it is
  exactly equivalent to the shared `MeowFlowSkill` source of truth.
- Update tests so future skill-count or stage-skill drift is caught by focused
  assertions rather than by stale diagnostics.

## Capabilities

### New Capabilities

### Modified Capabilities

- `meow-agent-skills`: Clarify that embedded/installable skills are an
  8-skill set while stage-agent detection uses the shared supported MeowFlow
  stage/action skill set without a duplicate hardcoded array.

## Impact

- `packages/meow-flow/src/agent-command.ts`
- `packages/meow-flow/src/thread-state.ts`
- Focused tests for `mfl agent update-self` and `mfl install-skills`
- No WebSocket or message schema changes
