## ADDED Requirements

### Requirement: Host the meow-team workspace inside an Android app

The system SHALL provide an Android application package in
`projects/meow-team-apk` that opens a meow-team mobile shell instead of
requiring the owner to work exclusively in the browser.

#### Scenario: Owner opens the workspace from Android

- **WHEN** the owner launches the Android app on a device or emulator
- **THEN** the app SHALL open the meow-team workspace shell
- **AND** the shell SHALL show which backend endpoint it is connected to

### Requirement: Bootstrap the Android app with `cargo-ndk`

The system SHALL define a `cargo-ndk`-based build path for the Android app so
the repository can produce and validate the first hello-world mobile shell.

#### Scenario: Developer builds the bootstrap shell

- **WHEN** the developer runs the documented Android build workflow
- **THEN** the repository SHALL compile the Rust Android package in
  `projects/meow-team-apk` through `cargo-ndk`
- **AND** the resulting bootstrap app SHALL render a minimal hello-world
  experience

### Requirement: Keep the Android UI thin

The Android-hosted workspace UI SHALL delegate orchestration, persistence, and
workflow mutations to backend APIs instead of implementing those behaviors
locally on the device.

#### Scenario: Owner triggers a team action from the Android shell

- **WHEN** the owner starts, refreshes, or approves work from the Android UI
- **THEN** the app SHALL route the action through the configured backend
  contract
- **AND** the device SHALL not run the workflow locally
