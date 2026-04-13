---
title: GET /api/team/notifications
outline: deep
---

# GET /api/team/notifications

Returns the backend-owned attention-notification snapshot for living threads.

## Route file

`app/api/team/notifications/route.ts`

## Request

This route does not accept a body or query parameters. Responses are sent with
`Cache-Control: no-store`.

## Success response

| Field                         | Type                                    | Notes                                                                          |
| ----------------------------- | --------------------------------------- | ------------------------------------------------------------------------------ |
| `generatedAt`                 | string                                  | ISO timestamp for the snapshot.                                                |
| `target`                      | `"browser"`, `"vscode"`, or `"android"` | Backend-owned delivery target from `team.config.ts`.                           |
| `notifications`               | array                                   | Active approval and failure alerts for living threads only.                    |
| `notifications[].title`       | string                                  | Short alert headline.                                                          |
| `notifications[].body`        | string                                  | Human-readable detail text.                                                    |
| `notifications[].reason`      | string                                  | One of `awaiting_human_approval`, `lane_failed`, or `thread_failed`.           |
| `notifications[].tag`         | string                                  | Stable client tag for the alert instance.                                      |
| `notifications[].laneId`      | string or `null`                        | Lane identifier when the alert belongs to a worker lane.                       |
| `notifications[].threadId`    | string                                  | Thread identifier for the alert.                                               |
| `notifications[].fingerprint` | string                                  | Dedupe key that changes when the underlying approval or failure state changes. |

## Notes

- The backend computes this snapshot in `lib/team/notifications.ts`.
- `target === "vscode"` means the browser UI should stay silent and the VS Code
  extension becomes the only alerting client.
- `target === "android"` means the browser UI and VS Code extension should stay
  silent and the Android app becomes the only alerting client.
- `GET /api/team/threads` embeds the same snapshot for the web workspace.

## Failure modes

| Status | When                                           |
| ------ | ---------------------------------------------- |
| `500`  | The notification snapshot could not be loaded. |
