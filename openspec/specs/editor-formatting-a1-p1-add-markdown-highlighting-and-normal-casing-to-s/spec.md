# editor-formatting-a1-p1-add-markdown-highlighting-and-normal-casing-to-s Specification

## Purpose
Define the shared request-editor polish that enables markdown-aware
highlighting and preserves typed casing in the editable CodeMirror surfaces
used by the Continuous Assignment Console and thread command composer.

## Requirements
### Requirement: Shared request editors support markdown-aware highlighting

The system SHALL configure the shared CodeMirror request-editor runtime to use
CodeMirror markdown mode for the editable surfaces used by the Continuous
Assignment Console request editor and the thread command editor.

#### Scenario: Planner request editor highlights markdown syntax

- **WHEN** the owner opens the Continuous Assignment Console request editor
  and types markdown content
- **THEN** the editor SHALL use the shared CodeMirror runtime with markdown
  mode enabled
- **AND** common markdown constructs such as headings, emphasis markers,
  inline code, lists, and links SHALL receive markdown-token styling

#### Scenario: Thread command editor keeps markdown mode without losing command help

- **WHEN** the owner opens the thread command editor and types slash commands
  or markdown-like text
- **THEN** the editor SHALL keep markdown mode enabled through the same shared
  runtime
- **AND** the existing slash-command placeholder, helper copy, and
  autocomplete behavior SHALL remain available

### Requirement: Shared request editors render editable text in normal casing

The system SHALL prevent inherited uppercase presentation from changing how
editable text appears inside the shared request-editor surfaces.

#### Scenario: Planner request text stays in typed casing

- **WHEN** the owner types lowercase, mixed-case, or uppercase text into the
  planner request editor
- **THEN** the editor SHALL display the content using the typed casing instead
  of forcing uppercase presentation

#### Scenario: Thread command text stays in typed casing

- **WHEN** the owner types lowercase, mixed-case, or uppercase text into the
  thread command editor
- **THEN** the editor SHALL display the content using the typed casing instead
  of forcing uppercase presentation

### Requirement: Focused regression coverage protects the shared editor polish

The repository SHALL include focused automated coverage for the shared editor
runtime and the two approved request-editor surfaces so markdown-mode wiring
and normal-casing behavior remain stable.

#### Scenario: Shared runtime packaging drift fails focused tests

- **WHEN** the shared editor runtime stops loading the approved markdown mode
  or breaks the existing addon packaging contract
- **THEN** focused regression coverage SHALL fail before the change is treated
  as complete

#### Scenario: Surface-specific formatting regressions fail focused tests

- **WHEN** either the planner request editor or the thread command editor
  stops rendering markdown-aware styling or reintroduces forced uppercase
  presentation
- **THEN** adjacent focused tests SHALL fail before the UI polish change is
  accepted
