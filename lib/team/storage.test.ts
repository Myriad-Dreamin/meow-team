import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import {
  applyTeamThreadStorageMigrations,
  getTeamThreadStorageState,
  readTeamThreadStorageMetadata,
  resetTeamThreadStorageStateCacheForTests,
  TEAM_THREAD_STORAGE_LATEST_SCHEMA_VERSION,
} from "@/lib/team/storage";

const FIXED_TIMESTAMP = "2026-04-11T08:00:00.000Z";
const databases: DatabaseSync[] = [];
const temporaryDirectories = new Set<string>();

const registerDatabase = (database: DatabaseSync): DatabaseSync => {
  databases.push(database);
  return database;
};

afterEach(() => {
  while (databases.length > 0) {
    databases.pop()?.close();
  }
});

afterEach(async () => {
  await resetTeamThreadStorageStateCacheForTests();

  for (const directory of temporaryDirectories) {
    await rm(directory, {
      force: true,
      recursive: true,
    });
  }

  temporaryDirectories.clear();
});

describe("applyTeamThreadStorageMigrations", () => {
  it("applies ordered migrations and keeps reruns idempotent in memory", () => {
    const database = registerDatabase(new DatabaseSync(":memory:"));

    applyTeamThreadStorageMigrations({
      database,
      now: FIXED_TIMESTAMP,
      targetVersion: 1,
    });

    expect(readTeamThreadStorageMetadata(database)).toEqual({
      migrations: [
        {
          version: 1,
          name: "create-storage-metadata",
          appliedAt: FIXED_TIMESTAMP,
        },
      ],
      metadata: {
        created_at: FIXED_TIMESTAMP,
        schema_version: "1",
        storage_engine: "node:sqlite",
      },
    });
    expect(
      database
        .prepare(
          `
            SELECT name
            FROM sqlite_master
            WHERE type = 'table'
              AND name = 'team_threads'
          `,
        )
        .get(),
    ).toBeUndefined();

    applyTeamThreadStorageMigrations({
      database,
      now: FIXED_TIMESTAMP,
      targetVersion: TEAM_THREAD_STORAGE_LATEST_SCHEMA_VERSION,
    });
    applyTeamThreadStorageMigrations({
      database,
      now: FIXED_TIMESTAMP,
      targetVersion: TEAM_THREAD_STORAGE_LATEST_SCHEMA_VERSION,
    });

    expect(readTeamThreadStorageMetadata(database)).toEqual({
      migrations: [
        {
          version: 1,
          name: "create-storage-metadata",
          appliedAt: FIXED_TIMESTAMP,
        },
        {
          version: 2,
          name: "create-team-threads",
          appliedAt: FIXED_TIMESTAMP,
        },
        {
          version: 3,
          name: "index-team-threads-updated-at",
          appliedAt: FIXED_TIMESTAMP,
        },
      ],
      metadata: {
        created_at: FIXED_TIMESTAMP,
        schema_version: String(TEAM_THREAD_STORAGE_LATEST_SCHEMA_VERSION),
        storage_engine: "node:sqlite",
      },
    });
    expect(
      database
        .prepare(
          `
            SELECT name
            FROM sqlite_master
            WHERE type = 'table'
              AND name = 'team_threads'
          `,
        )
        .get(),
    ).toEqual({
      name: "team_threads",
    });
    expect(
      database
        .prepare(
          `
            SELECT name
            FROM sqlite_master
            WHERE type = 'index'
              AND name = 'idx_team_threads_updated_at'
          `,
        )
        .get(),
    ).toEqual({
      name: "idx_team_threads_updated_at",
    });
  });
});

describe("getTeamThreadStorageState", () => {
  it("reuses the same SQLite connection for equivalent storage paths", async () => {
    const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "team-storage-state-"));
    temporaryDirectories.add(temporaryDirectory);
    const jsonPath = path.join(temporaryDirectory, "threads.json");

    const first = await getTeamThreadStorageState(jsonPath);
    const second = await getTeamThreadStorageState(jsonPath);
    const third = await getTeamThreadStorageState(path.join(temporaryDirectory, "threads.sqlite"));

    expect(second.database).toBe(first.database);
    expect(third.database).toBe(first.database);
    expect(first.location.sqlitePath).toBe(path.join(temporaryDirectory, "threads.sqlite"));
  });
});
