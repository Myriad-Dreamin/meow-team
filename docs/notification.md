title: Attention Notifications
outline: deep

---

# Attention notifications

The repository routes attention-needed alerts through a backend-owned target.
This guide documents the exact prerequisites, trigger rules, dedupe behavior,
and how browser, VS Code, and Android delivery differ.

## Notification target

`team.config.ts` owns `notifications.target`:

- `browser`: the web UI can raise browser desktop notifications.
- `vscode`: the VS Code extension polls `GET /api/team/notifications` and the
  browser stays silent.
- `android`: the Android app polls `GET /api/team/notifications` and both the
  browser plus the VS Code extension stay silent.

The backend classifies approval and failure attention states in
`lib/team/notifications.ts` and publishes the active snapshot through both
`GET /api/team/threads` and `GET /api/team/notifications`.

## Prerequisites

Browser desktop alerts only fire when all of the following are true:

- The current browser exposes the `Notification` API.
- The user grants browser notification permission for this site.
- The workspace "Desktop Alerts" setting is turned on.
- `team.config.ts` keeps `notifications.target === "browser"`.
- The workspace page is open so the client can keep polling
  `GET /api/team/threads`.

VS Code alerts require the extension to be installed and activated. The
extension starts polling on editor startup and uses the same backend snapshot,
so approval and failure alerts can continue without the browser page open.

Android alerts require the Android app to be open and connected to the same
backend base URL. The app polls the same snapshot and raises native Android
system notifications when `team.config.ts` keeps `notifications.target === "android"`.

## Exact trigger rules

The backend evaluates `lib/team/notifications.ts` on every snapshot refresh and
creates an alert candidate for each active attention-needed state:

- Approval wait: a worker lane has `status === "awaiting_human_approval"`.
- Final approval wait: a worker lane has `status === "approved"`,
  `pullRequest.status === "awaiting_human_approval"`, and no
  `pullRequest.humanApprovedAt`.
- Lane failure: a worker lane has `status === "failed"` or
  `pullRequest.status === "failed"`.
- Thread failure fallback: the thread has `status === "failed"` and no worker
  lane is already reporting a lane failure.

## Dedupe behavior

Each alert is deduped by a fingerprint. The fingerprint includes the thread or
lane identifier, the attention reason, and the state marker that shows the
current approval or failure instance:

- Approval waits use `approvalRequestedAt`, `queuedAt`, or `updatedAt`.
- Final approval waits prefer `pullRequest.humanApprovalRequestedAt`.
- Lane failures use `finishedAt` or `updatedAt`.
- Thread failures use `finishedAt` or `updatedAt` plus the thread assignment
  number.
- Lane fingerprints also include `runCount` and `revisionCount`.

Each client dedupes by fingerprint inside its own local storage:

- The browser stores delivered fingerprints in local storage.
- The VS Code extension stores delivered fingerprints in extension state.
- The Android app stores delivered fingerprints in shared preferences.

A new alert is eligible when the underlying state changes enough to produce a
new fingerprint, for example after a requeue, a new approval request, or a new
failure.

## When alerts should not fire

Alerts should not fire in these cases:

- The browser does not support notifications.
- Permission is blocked or has not been granted yet.
- The workspace toggle is off.
- The backend target is `vscode`, which reserves delivery for the extension.
- The backend target is `android`, which reserves delivery for the Android app.
- The thread is not in one of the approval or failure states listed above.
- The same fingerprint was already delivered in this browser profile.
- An attention state disappeared before notifications became available again.

If notifications are unavailable when an attention state becomes active, the
state stays pending for the active delivery target. It will notify once that
client can deliver alerts again, as long as the state is still active.

## Current behavior

The browser now stores only fingerprints that were actually delivered by
`window.Notification`, and only when the backend target is `browser`. The VS
Code extension follows the same backend snapshot but stores its own delivered
fingerprints in extension state and shows warning or error messages when the
target is `vscode`. The Android app follows the same snapshot, persists its own
delivered fingerprints in shared preferences, and raises native system
notifications when the target is `android`.
