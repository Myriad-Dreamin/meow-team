## Context

MeowFlow has two related but different skill concepts:

- Embedded/installable skills generated into `EMBEDDED_SKILLS`. This set is
  currently 8 skills and includes entry/helper skills such as `meow-flow` and
  `meow-dataset`.
- Stage/action skills persisted on thread agent records. This set currently
  maps to plan, code, review, execute, validate, and archive behavior.

`packages/meow-flow/src/agent-command.ts` currently defines a local
`SUPPORTED_SKILLS` array for label detection. It has the same six values as
the `MeowFlowSkill` union in `thread-state.ts`, so it is an exact duplicate of
the stage/action skill source of truth, not a count of embedded installable
skills.

## Goals / Non-Goals

**Goals:**

- Validate the user's count concern: embedded skills are 8, while
  stage/action detection is 6.
- Keep `mfl install-skills` behavior at 8 embedded skills.
- Remove the local duplicate supported-skill list used by `agent update-self`.
- Preserve existing label-based stage detection and archive detection.
- Add focused regression coverage for both counts and the shared detection
  source.

**Non-Goals:**

- Treat `meow-flow` or `meow-dataset` as thread agent skills.
- Change thread schema, WebSocket schema, or persisted agent record shape.
- Regenerate embedded skills unless an implementation edit touches skill
  source files.

## Decisions

Use a shared exported skill list from `thread-state.ts` for stage/action agent
detection. `agent-command.ts` should import that list instead of declaring a
second array. This keeps `isSupportedSkill`, label inference, error messages,
and the `MeowFlowSkill` type aligned from one module.

Keep embedded skill counting separate from stage/action skill detection.
`EMBEDDED_SKILLS.length` remains the install count. The agent metadata path
continues to recognize only values that can be stored in `ThreadAgentRecord`.

Update diagnostics to build the "Expected one of ..." list from the shared
skill list. This avoids hardcoded text drifting after future additions.

## Risks / Trade-offs

[Confusing two skill sets] -> Tests should name the two sets explicitly:
embedded installable skills and supported thread agent skills.

[Future stage skill additions still require mapping updates] -> The shared
list should remain close to `MeowFlowSkill`, `isSupportedSkill`, and
`stageToSkill` so TypeScript and tests expose incomplete changes.

[Over-widening accepted agent skills] -> Do not derive agent-detectable skills
from `EMBEDDED_SKILLS`; that would incorrectly allow helper skills that do not
map to thread stages or archive actions.
