---
title: Desktop Notifications
outline: deep
---

# Desktop notifications

`TeamWorkspace` can raise browser desktop notifications for attention-needed
threads. This guide documents the exact prerequisites, trigger rules, dedupe
behavior, and the client bug that previously prevented alerts from firing.

## Prerequisites

Desktop alerts only fire when all of the following are true:

- The current browser exposes the `Notification` API.
- The user grants browser notification permission for this site.
- The workspace "Desktop Alerts" setting is turned on.
- The workspace page is open so the client can keep polling
  `GET /api/team/threads`.

There is no background push channel in this repository. If the page is closed,
the client cannot emit desktop alerts.

## Exact trigger rules

The client evaluates `components/thread-attention-utils.ts` on every thread
refresh and creates a desktop alert candidate for each active attention-needed
state:

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

The browser should show one desktop alert per fingerprint. A new alert is
eligible when the underlying state changes enough to produce a new fingerprint,
for example after a requeue, a new approval request, or a new failure.

## When alerts should not fire

Alerts should not fire in these cases:

- The browser does not support notifications.
- Permission is blocked or has not been granted yet.
- The workspace toggle is off.
- The thread is not in one of the approval or failure states listed above.
- The same fingerprint was already delivered in this browser profile.
- An attention state disappeared before notifications became available again.

If notifications are unavailable when an attention state becomes active, the
state stays pending. It will notify once the browser can deliver alerts again,
as long as the state is still active.

## Why notifications were not firing

The previous `components/team-workspace.tsx` effect wrote every active
attention fingerprint into local storage before calling `window.Notification`.
That meant approval and failure states were marked as "seen" even when:

- The user had not enabled desktop alerts yet.
- The browser permission prompt had not been approved yet.
- The page was hydrating its initial thread list.

Once the fingerprint was stored, later refreshes treated the notification as
already handled and suppressed the actual browser alert.

## Current fix

The client now stores only fingerprints that were actually delivered by
`window.Notification`, under a fresh local-storage key dedicated to delivered
alerts. This keeps approval and failure states pending until the browser can
show them, while still deduping alerts that were already sent successfully.
