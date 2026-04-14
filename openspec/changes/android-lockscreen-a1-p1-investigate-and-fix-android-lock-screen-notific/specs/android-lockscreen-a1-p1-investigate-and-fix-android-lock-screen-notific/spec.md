## ADDED Requirements

### Requirement: Android lock-screen notification delivery must be reproducible

The system SHALL provide a documented validation path for Android attention
notifications on a secure device or emulator so missing lock-screen delivery
can be reproduced instead of inferred from an unlocked or foreground-only test.

#### Scenario: Developer validates the secure-device path

- **WHEN** the developer follows the Android notification runbook with
  `team.config.ts` targeting `android`, a saved backend URL, background
  monitoring active, and a secure lock screen enabled
- **THEN** the app SHALL provide a repeatable way to trigger or observe an
  approval or failure attention notification while the device is locked
- **AND** the runbook SHALL identify the prerequisite states that must be true
  before delivery is treated as broken

### Requirement: Attention notifications must declare explicit lock-screen visibility

The system SHALL build Android attention notifications with explicit
lock-screen visibility semantics and a public version that is suitable for a
secure lock screen.

#### Scenario: Secure lock screen shows a public alert

- **WHEN** an approval or failure attention notification is posted while the
  device is locked and Android delivery is otherwise allowed
- **THEN** the app SHALL post the notification with explicit visibility and a
  public version
- **AND** the lock screen SHALL show the public representation instead of
  silently dropping the alert or exposing unintended private-body content

### Requirement: Android 13+ permission state must be surfaced before relying on alerts

The system SHALL check the Android 13+ `POST_NOTIFICATIONS` permission before
relying on Android attention notifications and SHALL surface denied or pending
permission states in the Android shell.

#### Scenario: Fresh install has not granted notifications

- **WHEN** the app starts on Android 13 or newer and `POST_NOTIFICATIONS` has
  not been granted
- **THEN** the shell SHALL request permission in context or show that Android
  alerts are blocked until the permission is granted
- **AND** the app SHALL not report Android attention delivery as healthy until
  the permission becomes available

### Requirement: App-level and channel-level notification blocks must be distinguished

The system SHALL inspect app-wide notification availability and attention
channel state so the Android shell can distinguish app-disabled, channel-
disabled, and user-owned settings blocks.

#### Scenario: App notifications are disabled

- **WHEN** Android reports that app notifications are disabled for the meow-team
  Android app
- **THEN** the shell SHALL surface that all Android alerts are blocked at the
  app level
- **AND** the recovery guidance SHALL open the app notification settings screen

#### Scenario: Attention channel is disabled or demoted

- **WHEN** the attention channel exists but its effective state prevents the
  intended lock-screen delivery behavior
- **THEN** the shell SHALL surface that the channel is blocking delivery
- **AND** the recovery guidance SHALL open the channel notification settings
  screen when the remaining block is user-controlled

### Requirement: Existing installs must keep user-owned channel settings intact

The system SHALL preserve user-owned notification settings for existing installs
and SHALL only migrate to a replacement attention channel when an immutable
app-owned default must change to restore the approved behavior.

#### Scenario: Existing install has a stale attention channel

- **WHEN** the app detects that an existing attention channel cannot satisfy the
  approved lock-screen behavior because of an immutable app-owned default
- **THEN** the app SHALL migrate delivery to a compatible channel definition
  without resetting unrelated user-owned notification choices
- **AND** the app SHALL avoid forced channel migration when the remaining block
  is controlled by the user or platform settings

### Requirement: Android notification troubleshooting must be documented

The system SHALL document the exact prerequisites and failure cases for Android
lock-screen attention delivery, including fresh-install and existing-channel
differences.

#### Scenario: Operator diagnoses silent alerts

- **WHEN** an operator or developer follows the Android notification
  documentation
- **THEN** the docs SHALL cover notification target routing, secure lock-screen
  setup, Android 13+ permission state, app notifications disabled, attention
  channel disabled, and lock-screen privacy settings
- **AND** the docs SHALL distinguish fresh-install behavior from
  existing-channel behavior
