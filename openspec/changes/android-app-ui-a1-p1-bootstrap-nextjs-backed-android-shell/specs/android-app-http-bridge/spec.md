## ADDED Requirements

### Requirement: Use an explicit HTTP bridge to the Next.js backend

The system SHALL connect the Android app to the existing Next.js backend
through explicit HTTP GET/POST requests against a resolved base URL instead of
through in-process runtime imports.

#### Scenario: Android shell reads backend state

- **WHEN** the Android shell needs thread, run, or configuration data
- **THEN** the app SHALL issue a GET request to the configured backend base URL
- **AND** the response SHALL be translated into mobile UI state

#### Scenario: Android shell mutates backend state

- **WHEN** the owner submits, retries, or approves an action from the Android
  shell
- **THEN** the app SHALL issue a POST request to the configured backend
  endpoint for that action

### Requirement: Make backend connectivity configurable and observable

The system SHALL let the owner configure the backend base URL used by the
Android app and SHALL surface connection failures with actionable recovery
guidance.

#### Scenario: Backend becomes unreachable

- **WHEN** the Android app cannot reach the configured backend
- **THEN** the workspace UI SHALL show that the backend connection failed
- **AND** the UI SHALL provide recovery guidance instead of failing silently

#### Scenario: Owner updates the backend URL

- **WHEN** the owner changes the backend base URL in the app configuration
- **THEN** subsequent GET/POST requests SHALL use the updated endpoint
