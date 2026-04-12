---
title: GET /api/team/logs
outline: deep
---

# GET /api/team/logs

Returns paged Codex log activity for a thread.

## Route file

`app/api/team/logs/route.ts`

## Query parameters

### Window mode

Default mode for recent-tail polling and older-history paging.

| Name           | Type   | Required | Notes                                                                       |
| -------------- | ------ | -------- | --------------------------------------------------------------------------- |
| `threadId`     | string | Yes      | Thread whose `codex-logs/<threadId>.jsonl` file should be read.             |
| `limit`        | number | No       | Positive integer, defaults to `200`, capped at `500`.                       |
| `beforeCursor` | number | No       | Byte-offset boundary for paging older entries before an existing window.    |
| `afterCursor`  | number | No       | Byte-offset boundary for polling newer entries after an existing window.    |
| `source`       | enum   | No       | Optional `stdout`, `stderr`, or `system` filter for cursor-based log reads. |

Only one of `beforeCursor` or `afterCursor` can be supplied per request.

### `stderr-block` mode

Expands one folded stderr block to its full contiguous range.

| Name          | Type   | Required | Notes                                                            |
| ------------- | ------ | -------- | ---------------------------------------------------------------- |
| `mode`        | string | Yes      | Must be `stderr-block`.                                          |
| `threadId`    | string | Yes      | Thread whose `codex-logs/<threadId>.jsonl` file should be read.  |
| `startCursor` | number | Yes      | Byte-offset boundary for the currently known start of the block. |
| `endCursor`   | number | Yes      | Byte-offset boundary for the currently known end of the block.   |
| `scanLimit`   | number | No       | Positive integer, defaults to `200`, capped at `500`.            |

## Success response

### Window response

```json
{
  "mode": "window",
  "entries": [
    {
      "id": "entry-id",
      "threadId": "thread-id",
      "assignmentNumber": 1,
      "roleId": "planner",
      "laneId": "lane-1",
      "source": "stdout",
      "message": "Planner output",
      "createdAt": "2026-04-12T00:00:00.000Z",
      "startCursor": 0,
      "endCursor": 157
    }
  ],
  "pageInfo": {
    "beforeCursor": 0,
    "afterCursor": 157,
    "hasOlder": false,
    "hasNewer": false
  }
}
```

### `stderr-block` response

```json
{
  "mode": "stderr-block",
  "entries": [
    {
      "id": "entry-id",
      "threadId": "thread-id",
      "assignmentNumber": 1,
      "roleId": "coder",
      "laneId": "lane-1",
      "source": "stderr",
      "message": "stderr line",
      "createdAt": "2026-04-12T00:00:00.000Z",
      "startCursor": 157,
      "endCursor": 320
    }
  ],
  "block": {
    "startCursor": 157,
    "endCursor": 320
  }
}
```

## Failure modes

| Status | When                                                      |
| ------ | --------------------------------------------------------- |
| `400`  | Query parameters fail Zod validation.                     |
| `500`  | The log file could not be read or block expansion failed. |
