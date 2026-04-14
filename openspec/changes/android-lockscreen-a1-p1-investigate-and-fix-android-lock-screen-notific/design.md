## Context

The current Android shell under `projects/meow-team-apk` already has the basic
notification plumbing: `MainActivity.kt` requests `POST_NOTIFICATIONS` on
Android 13+, `NotificationMonitorService.kt` keeps a foreground polling service
running, and `NotificationPoller.kt` creates the `meow-team-attention` channel
with `IMPORTANCE_DEFAULT` before posting notifications. The remaining problem
is that lock-screen delivery on a secure device is still missing or unverified,
and the app currently does not distinguish runtime permission denial,
app-level notification disablement, channel disablement, lock-screen privacy
settings, or stale channel defaults from one another.

Android's platform rules make the failure mode more subtle than a one-line
importance tweak. Android 13+ treats notification permission as a runtime gate
for newly installed apps, secure lock screens depend on notification
visibility plus the user's privacy settings, and notification channels become
effectively user-owned after creation because channel behaviors cannot be
mutated in place later. This change therefore needs a reproducible diagnosis
path and a migration-safe fix for both fresh installs and existing channels.

## Goals / Non-Goals

**Goals:**

- Reproduce the missing lock-screen notification path on a secure Android
  device or emulator before committing to a fix.
- Verify whether the blocking state comes from runtime permission, app-wide
  notification disablement, channel state, lock-screen visibility, or user
  privacy settings.
- Add explicit attention-notification visibility handling with a suitable
  public lock-screen representation instead of relying on platform defaults.
- Preserve user-owned notification settings for existing installs while still
  giving the app a way to recover from stale app-owned channel defaults.
- Deep-link the owner to the relevant Android settings screen when the
  remaining block is controlled by the platform or the user.
- Document exact prerequisites and failure cases for fresh-install and
  existing-channel validation.

**Non-Goals:**

- Rework browser or VS Code notification delivery.
- Introduce FCM, background push delivery, or unrelated notification transport
  changes.
- Escalate the Android attention channel to heads-up behavior by default.
- Redesign unrelated Android shell UI beyond the diagnostics and recovery
  needed for notification troubleshooting.

## Decisions

### Diagnose on a secure lock screen before changing the channel defaults

Implementation should start by validating the current path on a device or
emulator with a secure lock screen enabled, `team.config.ts` routed to
`android`, a saved backend URL, and the monitoring foreground service running.
The validation matrix should explicitly cover fresh install versus existing
install, permission granted versus denied, app notifications enabled versus
disabled, attention channel enabled versus disabled, and lock-screen privacy
settings that may redact or suppress content.

Alternative considered: assume `IMPORTANCE_DEFAULT` is the root cause and bump
the channel to `IMPORTANCE_HIGH`. This was rejected because Android's
importance setting primarily controls interruption level, while lock-screen
rendering depends on visibility and user-owned settings as well.

### Keep `IMPORTANCE_DEFAULT` as the baseline unless investigation proves the app-owned default is wrong

The design should treat channel importance as a diagnostic dimension rather
than the default remedy. The attention channel can keep its current
non-heads-up baseline unless investigation demonstrates that the app-owned
default itself prevents the requested lock-screen behavior and the approved
scope changes to justify a different interruption level.

Alternative considered: default every approval or failure notification to high
importance. This was rejected because the request is about restoring lock-screen
delivery, not changing interruption policy.

### Post explicit lock-screen visibility plus a public notification version

The attention notification builder should set explicit visibility semantics and
provide a public version that is safe to show on a secure lock screen. The
private notification can keep the full alert text for the unlocked device or a
user setting that permits private content, while the public version should make
the alert visible without requiring full private-body disclosure.

Alternative considered: keep the current behavior with no dedicated public
version and rely on `VISIBILITY_PUBLIC` or platform defaults alone. This was
rejected because it leaves privacy and lock-screen rendering behavior under-
specified and makes it harder to tell whether the platform is redacting or
blocking the alert.

### Inspect app-level and channel-level notification state before declaring delivery healthy

The Android shell should inspect whether the app's notifications are enabled at
all, whether the attention channel exists, whether the channel is disabled or
demoted, and whether remaining blocks are under platform or user control. The
shell should then surface actionable status instead of silently catching
exceptions or leaving the owner to infer failure from a missing alert.

Alternative considered: keep the current "fire and forget" path and only react
to a thrown `SecurityException`. This was rejected because most notification
failures do not throw and are instead controlled by Android settings state.

### Use migration-safe channel handling for existing installs

Because Android channels cannot have their behavior changed after creation,
re-registering the same channel ID is not enough to repair a stale channel on
existing installs. The implementation should preserve user-owned channel
choices, introduce a versioned replacement channel only when the app must
change an immutable app-owned default, and otherwise deep-link the owner to the
channel settings screen when the remaining block is user-controlled.

Alternative considered: always delete and recreate the attention channel or
always move to a new channel ID. This was rejected because it would clobber
user preferences or create unnecessary channel churn.

### Route remaining recovery through system settings deep links and documentation

When notifications are blocked by permission denial, app-wide notification
disablement, or channel-specific settings, the app should lead the user to the
correct Android settings surface instead of implying that the app can fix the
state internally. The code path should pair those settings deep links with
repository documentation that explains what the app can inspect and what still
depends on device policy or user privacy configuration.

Alternative considered: document the issue only in repository markdown. This
was rejected because the failure often occurs while the app is backgrounded or
the device is locked, where inline recovery guidance is more effective.

## Risks / Trade-offs

- [Device and OEM lock-screen behavior varies] -> Validate on a secure emulator
  first, then capture the exact prerequisites and user-controlled failure modes
  in the Android docs.
- [Migration can fragment notification channels] -> Only create a versioned
  replacement channel when immutable app-owned defaults must change, and keep
  the original channel when the remaining block is user-owned.
- [Public lock-screen content may reveal too much or too little] -> Keep the
  public version intentionally terse and reserve the full body for the private
  notification representation.
- [Permission and settings diagnostics may add UI noise] -> Limit new UI to
  concise state reporting and focused recovery actions inside the Android shell.

## Migration Plan

1. Reproduce the missing lock-screen alert path on a secure device or emulator
   and record the baseline app, permission, channel, and lock-screen states.
2. Add diagnostics for runtime permission, app notifications enabled state, and
   attention-channel state before or during alert delivery.
3. Implement explicit lock-screen visibility handling with a public version for
   attention notifications.
4. Add migration-safe channel handling for stale installs only if the
   investigation proves an immutable app-owned channel default is the blocker.
5. Add settings deep links and documentation for the remaining user-owned
   blocks, then validate fresh-install and existing-install scenarios.

## Open Questions

- Should the public lock-screen version show the full notification title plus a
  generic body, or should both title and body be partially redacted?
- Can the app reliably detect a stale app-owned attention channel on every
  supported Android version, or does some migration logic need to stay
  best-effort and doc-backed?
- Which lock-screen privacy configurations can the app observe directly, and
  which ones must remain documented prerequisites because the platform does not
  expose a stable signal?

## References

- Android notification channels:
  `https://developer.android.com/training/notify-user/channels`
- Android notification management and lock-screen visibility:
  `https://developer.android.com/training/notify-user/managing`
- Android 13+ notification permission:
  `https://developer.android.com/guide/topics/ui/notifiers/notification-permission`
- Android channel settings deep link:
  `https://developer.android.com/reference/android/provider/Settings#ACTION_CHANNEL_NOTIFICATION_SETTINGS`
- Android app notification settings deep link:
  `https://developer.android.com/reference/android/provider/Settings#ACTION_APP_NOTIFICATION_SETTINGS`

## Conventional Title

- Canonical request/PR title:
  `fix(android/notifications): restore lock screen notifications`
- Conventional title metadata: `fix(android/notifications)`
- Slash-delimited roadmap/topic scope stays in conventional-title metadata and
  does not alter the OpenSpec change path or capability path.
