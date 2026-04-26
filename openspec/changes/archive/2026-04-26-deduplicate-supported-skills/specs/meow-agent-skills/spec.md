## ADDED Requirements

### Requirement: Agent skill detection uses a shared supported skill source

MeowFlow SHALL keep the embedded installable skill set separate from the
thread agent skill set. Thread agent skill detection SHALL use the shared
supported MeowFlow stage/action skill source of truth rather than a duplicate
hardcoded list in the agent command.

#### Scenario: Embedded installable skills remain distinct from agent skills

- **WHEN** a user runs `mfl install-skills --list`
- **THEN** the output includes the 8 embedded installable skills
- **AND** the installable skill set includes `meow-flow` and `meow-dataset`
- **AND** thread agent skill detection is not derived from the installable
  skill set

#### Scenario: Agent update diagnostics use the shared supported skill list

- **WHEN** `mfl agent update-self` cannot infer the current agent skill
- **THEN** the diagnostic lists the shared supported thread agent skills
- **AND** the diagnostic does not depend on a separate hardcoded array in the
  agent command implementation

#### Scenario: Stage labels still infer the matching role skill

- **WHEN** the current Paseo agent has label `x-meow-flow-stage=plan`
- **THEN** `mfl agent update-self` records the agent skill as `meow-plan`
- **AND** the recorded skill remains valid for deriving the thread stage
