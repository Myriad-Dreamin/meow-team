---
title: GET /api/team/status
outline: deep
---

# GET /api/team/status

Returns a point-in-time snapshot of workspace activity and host resource usage.

## Route file

`app/api/team/status/route.ts`

## Request

This route does not accept a body or query parameters. Responses are sent with
`Cache-Control: no-store`.

## Success response

| Field                           | Type             | Notes                                          |
| ------------------------------- | ---------------- | ---------------------------------------------- |
| `sampledAt`                     | string           | ISO timestamp for the snapshot.                |
| `workspace.activeThreadCount`   | number           | Unarchived threads that are still in progress. |
| `workspace.livingThreadCount`   | number           | Unarchived threads in the store.               |
| `workspace.archivedThreadCount` | number           | Archived threads in the store.                 |
| `workspace.laneCounts`          | object           | Aggregated worker lane counts by status.       |
| `host.cpuPercent`               | number or `null` | CPU usage from the latest sample pair.         |
| `host.memoryPercent`            | number           | Used memory percentage.                        |
| `host.usedMemoryBytes`          | number           | Host memory currently in use.                  |
| `host.freeMemoryBytes`          | number           | Host memory currently free.                    |
| `host.totalMemoryBytes`         | number           | Host memory capacity.                          |

## Failure modes

| Status | When                                                |
| ------ | --------------------------------------------------- |
| `500`  | The workspace or host snapshot could not be loaded. |
