---
title: Storage Guide
outline: deep
---

# Storage guide

The owner harness team now persists thread history in a server-only SQLite
store backed by the mature [`better-sqlite3`](https://www.npmjs.com/package/better-sqlite3)
package. The project runtime floor remains Node `22.13.0`, but storage no
longer depends on Node's experimental builtin SQLite module.

## Default location

- Primary store: `data/meow-team.sqlite`
- Legacy source: `data/team-threads.json`
- Log files: `data/codex-logs/<thread-id>.jsonl`

The `storage.threadFile` config value now points at the SQLite database by
default. For compatibility, callers can still pass a `.json` path. In that
case the runtime writes to a sibling `.sqlite` database and only reads the JSON
file as a one-time import source.

## Stored metadata

The storage layer keeps two schema-management structures:

- `schema_migrations`
  Stores the ordered migration version, name, and timestamp for each applied
  migration.
- `storage_metadata`
  Stores runtime metadata such as:
  - `storage_engine=better-sqlite3`
  - `schema_version=<latest applied migration>`
  - `created_at=<first bootstrap timestamp>`
  - `legacy_import_source=<path>` when a JSON import runs
  - `legacy_imported_at=<timestamp>` when a JSON import runs

Thread history itself lives in `team_threads`, one row per thread, with:

- `thread_id`
- `payload_json`
- `created_at`
- `updated_at`

The payload remains a full serialized thread record so the existing history API
can stay stable while persistence moves off the JSON file.

## Migrations

Migrations are handwritten, ordered, and idempotent:

1. Create `storage_metadata`
2. Create `team_threads`
3. Add the `updated_at` index used by thread summary reads

The migration runner first bootstraps `schema_migrations`, then applies each
missing migration inside an `IMMEDIATE` transaction and records the applied
version. SQLite migration behavior is covered by `:memory:` tests in
`lib/storage/thread.test.ts`.

## Legacy JSON import

Existing JSON stores are preserved through a pragmatic import path:

1. Open or create the SQLite database.
2. Apply pending migrations.
3. If `team_threads` is empty and a legacy JSON store exists, import every
   thread into SQLite.
4. Record the import source and timestamp in `storage_metadata`.

The importer does not delete the JSON file. After the first successful import,
subsequent reads and writes use SQLite only.

## SQL safety

- All dynamic values are bound through parameterized statements.
- Schema DDL is static and checked into the repo.
- The module never concatenates user input into executable SQL.
- The storage code is server-only and is not bundled into client components.

## Performance notes

- The server runtime keeps a shared `better-sqlite3` connection per SQLite path
  in server-only state so the Next.js APIs do not reopen the same database on
  every request.
- SQLite runs in WAL mode for file-backed databases so reads do not block on the
  common write path.
- `busy_timeout` is enabled to smooth short lock contention.
- Writes are serialized in-process per database path to preserve the existing
  single-writer semantics from the former JSON store.
- Thread summaries use an `updated_at` index; richer normalization can be added
  later if the single-row JSON payload becomes a bottleneck.

## Testing

- Use `new Database(":memory:")` from `better-sqlite3` for migration tests.
- Use a temporary `.json` path when you need to exercise the legacy import path.
- Use a temporary `.sqlite` path when you want the production storage layout
  directly.
