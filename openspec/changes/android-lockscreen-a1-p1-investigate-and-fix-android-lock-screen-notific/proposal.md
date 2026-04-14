## Why

The Android shell already polls `GET /api/team/notifications`, keeps a
foreground monitoring service alive, and posts native alerts, but missing
secure lock-screen delivery means approval and failure attention can still go
unseen when the app is backgrounded. Android notification behavior is split
across runtime permission, app-level enablement, channel state, and
lock-screen visibility, and channel behaviors become effectively user-owned
after creation, so treating `NotificationManager.IMPORTANCE_DEFAULT` as the
default fix is too brittle for both fresh installs and existing devices.

## What Changes

- Introduce the
  `android-lockscreen-a1-p1-investigate-and-fix-android-lock-screen-notific`
  OpenSpec change for proposal "Investigate and Fix Android Lock Screen
  Notification Delivery".
- Extend the Android notification validation path so the repository can
  reproduce approval and failure alerts on a secure device or emulator with
  explicit prerequisites instead of guessing from an unlocked test state.
- Audit the Android attention notification path in
  `projects/meow-team-apk/android/app/src/main/java/team/meow/android` for
  Android 13+ permission flow, app-level notification state, channel
  registration, lock-screen visibility, and public lock-screen content.
- Add migration-safe handling for stale or disabled attention channels,
  preserving user-owned settings and only introducing a new channel identifier
  when an immutable app-owned default must change for existing installs.
- Surface actionable recovery when Android owns the remaining block, including
  app or channel settings deep links plus documentation for permission denied,
  app notifications disabled, channel disabled, and lock-screen privacy cases.
- Keep the scope limited to Android notification delivery. Do not expand into
  browser notifications, FCM or push infrastructure, unrelated Android UI
  redesign, or heads-up escalation unless investigation proves it is required
  and the request scope changes.

## Capabilities

### New Capabilities

- `android-lockscreen-a1-p1-investigate-and-fix-android-lock-screen-notific`:
  Investigate and fix Android lock-screen attention notification delivery
  across visibility handling, public lock-screen content, permission and
  channel diagnostics, settings recovery, and migration-safe existing-install
  behavior.

### Modified Capabilities

- None.

## Conventional Title

- Canonical request/PR title:
  `fix(android/notifications): restore lock screen notifications`
- Conventional title metadata: `fix(android/notifications)`
- Slash-delimited roadmap/topic scope stays in conventional-title metadata and
  does not alter the OpenSpec change path or capability path.

## Impact

- Affected repository: `meow-team`
- Affected code and docs:
  `projects/meow-team-apk/android/app/src/main/java/team/meow/android/NotificationPoller.kt`,
  `projects/meow-team-apk/android/app/src/main/java/team/meow/android/MainActivity.kt`,
  `projects/meow-team-apk/android/app/src/main/java/team/meow/android/NotificationMonitorService.kt`,
  Android string or layout resources, `docs/android.md`, and
  `docs/notification.md`
- Affected systems: Android 13+ runtime notification permission, app-level and
  channel-level Android notification settings, secure lock-screen privacy
  behavior, and emulator or device validation for the Android shell
