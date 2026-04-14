## 1. Reproduction and Diagnosis

- [ ] 1.1 Reproduce Android attention notifications on a secure emulator or
      device, confirm the exact prerequisites for background monitoring, and
      record whether the failure differs between fresh installs and existing
      installs
- [ ] 1.2 Audit the current Android notification path for Android 13+
      `POST_NOTIFICATIONS` state, app-level notification enablement, attention
      channel state, and lock-screen privacy settings before selecting the fix

## 2. Notification Behavior

- [ ] 2.1 Implement explicit lock-screen visibility handling and a public
      version for attention notifications in the Android shell without changing
      unrelated notification targets
- [ ] 2.2 Surface actionable Android notification diagnostics in the app when
      permission is denied, app notifications are disabled, the attention
      channel is blocked, or the remaining block is user-controlled

## 3. Migration and Recovery

- [ ] 3.1 Add migration-safe handling for stale or incompatible attention
      channels, introducing a replacement channel only when immutable app-owned
      defaults must change for existing installs
- [ ] 3.2 Add app and channel settings deep links so the owner can recover from
      platform-owned notification blocks without guesswork

## 4. Documentation and Validation

- [ ] 4.1 Document exact prerequisites and failure cases for Android
      lock-screen attention delivery, including permission denied, app
      notifications disabled, channel disabled, and lock-screen privacy states
- [ ] 4.2 Validate fresh-install and existing-channel scenarios on a secure
      device or emulator, then run the relevant repository and Android
      validation before review
