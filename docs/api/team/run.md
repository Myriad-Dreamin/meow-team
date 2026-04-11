---
title: POST /api/team/run
outline: deep
---

# POST /api/team/run

Starts a team run and streams newline-delimited JSON events back to the client.

## Route file

`app/api/team/run/route.ts`

## Request body

| Field                    | Type    | Required | Notes                                    |
| ------------------------ | ------- | -------- | ---------------------------------------- |
| `input`                  | string  | Yes      | The user request to execute.             |
| `title`                  | string  | No       | Optional request title override.         |
| `threadId`               | string  | No       | Reuses an existing thread when provided. |
| `repositoryId`           | string  | No       | Selects a configured repository.         |
| `reset`                  | boolean | No       | Forces a fresh assignment flow.          |
| `deleteExistingBranches` | boolean | No       | Allows branch cleanup during the run.    |

## Success stream

The route replies with status `200` and content type
`application/x-ndjson; charset=utf-8`.

Each line is one JSON event:

| Event type               | Payload                                                           |
| ------------------------ | ----------------------------------------------------------------- |
| `accepted`               | `{ threadId, startedAt, status: "running" }`                      |
| `codex_event`            | `{ entry }`, where `entry` is a `TeamCodexLogEntry`               |
| `result`                 | `{ result }`, where `result` is the final `TeamRunSummary`        |
| `error`                  | `{ threadId, error }` when the run fails                          |
| `branch_delete_required` | `{ threadId, error, branches }` when cleanup approval is required |

## Failure modes

| Status | When                                                                         |
| ------ | ---------------------------------------------------------------------------- |
| `400`  | The request body is invalid or the selected repository ID is unknown.        |
| `409`  | The thread still has active dispatch work or the worker pool is at capacity. |
| `500`  | Runtime configuration is incomplete before the stream starts.                |
