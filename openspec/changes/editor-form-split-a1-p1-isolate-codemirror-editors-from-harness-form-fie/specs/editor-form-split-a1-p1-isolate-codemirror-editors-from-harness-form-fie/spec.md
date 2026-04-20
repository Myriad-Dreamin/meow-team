## ADDED Requirements

### Requirement: Harness native form styling uses explicit native-control hooks

The system SHALL treat the harness form-field wrapper as a structural layout
primitive and SHALL apply the shared harness-native chrome only through
explicit caption and native-control hooks for native `input`, `select`, and
`textarea` elements.

#### Scenario: Continuous Assignment Console keeps native field chrome

- **WHEN** the Continuous Assignment Console renders the request title input,
  thread ID input, and repository select beside the CodeMirror request editor
- **THEN** those native controls SHALL keep the current harness border,
  background, padding, and focus styling
- **AND** the surrounding request form layout SHALL remain unchanged

#### Scenario: Thread feedback textareas keep native field chrome

- **WHEN** proposal-feedback or request-group feedback forms render in the
  thread status board or thread detail timeline
- **THEN** their native textareas SHALL keep the current harness textarea
  styling and focus treatment
- **AND** the feedback submission controls and copy SHALL remain unchanged

### Requirement: Embedded CodeMirror editors stay isolated from harness native-field styling

The system SHALL prevent the shared harness form-field wrapper from changing
the appearance of embedded CodeMirror editors that already define their own
module-scoped styling.

#### Scenario: Planner request editor keeps its existing editor chrome

- **WHEN** the Continuous Assignment Console renders `TeamRequestEditor`
  inside the harness request form
- **THEN** the editor SHALL keep its existing module-scoped border, focus
  ring, placeholder, and text presentation
- **AND** nested CodeMirror `span` and `textarea` elements SHALL NOT inherit
  harness native-field descendant styling

#### Scenario: Thread command editor keeps its existing editor chrome

- **WHEN** the selected thread detail renders `ThreadCommandEditor` inside the
  command composer wrapper
- **THEN** the editor SHALL keep its existing module-scoped shell, disabled
  presentation, and helper-copy behavior
- **AND** nested CodeMirror `span` and `textarea` elements SHALL NOT inherit
  harness native-field descendant styling

### Requirement: Focused regression coverage protects the style boundary

The repository SHALL include focused automated coverage that protects the CSS
boundary between harness native form controls and embedded CodeMirror editors.

#### Scenario: Broad descendant selector regressions fail focused tests

- **WHEN** a change reintroduces broad `.harness-form-field` descendant
  styling that targets nested editor `span` or `textarea` nodes
- **THEN** focused regression coverage SHALL fail before the change is treated
  as complete

#### Scenario: Editor or native-field wiring regressions fail focused tests

- **WHEN** native harness controls stop opting into the explicit native-field
  styling path or either embedded CodeMirror editor starts depending on the
  shared form wrapper for its chrome
- **THEN** adjacent focused tests SHALL fail before the regression is accepted

### Requirement: Conventional title metadata stays explicit

The system SHALL carry the canonical request/PR title
`fix(harness/forms): separate editor and field styles` and conventional-title
metadata `fix(harness/forms)` through the materialized OpenSpec artifacts
without changing the approved change path
`editor-form-split-a1-p1-isolate-codemirror-editors-from-harness-form-fie`.

#### Scenario: Materialized artifacts mirror the approved title metadata

- **WHEN** planner materializes this proposal
- **THEN** the generated proposal, design, spec, and tasks SHALL reference the
  canonical request/PR title `fix(harness/forms): separate editor and field styles`
- **AND** the conventional-title metadata SHALL remain `fix(harness/forms)`
