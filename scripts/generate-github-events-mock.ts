import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type GitHubEvent = import("../lib/github-module/types").GitHubEvent;
type EventsSqliteModule = typeof import("../lib/github-module/events-sqlite");

const eventsSqlite = (await import(
  new URL("../lib/github-module/events-sqlite.ts", import.meta.url).href
)) as EventsSqliteModule;

const DEFAULT_USERNAME = "Myriad-Dreamin";
const DEFAULT_LIMIT = 30;
const DEFAULT_SYNC_INTERVAL_MINUTES = 15;
const DEFAULT_SYNC_PER_PAGE = 100;
const DEFAULT_SYNC_MAX_PAGES = 10;
const OUTPUT_FILE_PATH = path.join(process.cwd(), "app/mocks/github-events.generated.ts");

const isValidEnvKey = (key: string): boolean => {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(key);
};

const parseDotEnv = (raw: string): Record<string, string> => {
  const entries: Record<string, string> = {};

  for (const line of raw.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const splitIndex = trimmed.indexOf("=");
    if (splitIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, splitIndex).trim();
    if (!isValidEnvKey(key)) {
      continue;
    }

    let value = trimmed.slice(splitIndex + 1).trim();
    const isDoubleQuoted = value.startsWith('"') && value.endsWith('"');
    const isSingleQuoted = value.startsWith("'") && value.endsWith("'");

    if (isDoubleQuoted || isSingleQuoted) {
      value = value.slice(1, -1);
    }

    entries[key] = value;
  }

  return entries;
};

const loadEnvFile = async (): Promise<void> => {
  const envPath = path.join(process.cwd(), ".env");

  try {
    const raw = await readFile(envPath, "utf8");
    const parsed = parseDotEnv(raw);

    for (const [key, value] of Object.entries(parsed)) {
      if (typeof process.env[key] !== "string" || process.env[key]?.length === 0) {
        process.env[key] = value;
      }
    }
  } catch {
    // Ignore missing local env file. CI can pass variables directly.
  }
};

const parseLimit = (rawLimit: string | undefined): number => {
  if (typeof rawLimit !== "string") {
    return DEFAULT_LIMIT;
  }

  const parsed = Number.parseInt(rawLimit, 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return DEFAULT_LIMIT;
  }

  return parsed;
};

const parseSyncIntervalMinutes = (rawValue: string | undefined): number => {
  if (typeof rawValue !== "string") {
    return DEFAULT_SYNC_INTERVAL_MINUTES;
  }

  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return DEFAULT_SYNC_INTERVAL_MINUTES;
  }

  return parsed;
};

const parsePositiveInteger = (rawValue: string | undefined, fallback: number): number => {
  if (typeof rawValue !== "string") {
    return fallback;
  }

  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return fallback;
  }

  return parsed;
};

const buildMockDataFile = (
  events: GitHubEvent[],
  metadata: {
    username: string;
    fetchedAt: string;
    syncReason: string;
    syncRequestsUsed: number;
    syncedAt: string | null;
  },
): string => {
  const serializedMetadata = JSON.stringify(
    {
      source: "sqlite-cache",
      username: metadata.username,
      fetchedAt: metadata.fetchedAt,
      syncReason: metadata.syncReason,
      syncRequestsUsed: metadata.syncRequestsUsed,
      syncedAt: metadata.syncedAt,
    },
    null,
    2,
  );
  const serializedEvents = JSON.stringify(events, null, 2);

  return [
    'import type { GitHubEvent } from "@/lib/github-module/types";',
    "",
    `export const githubEventsMockMeta = ${serializedMetadata} as const;`,
    "",
    `export const githubEventsMockData: GitHubEvent[] = ${serializedEvents};`,
    "",
  ].join("\n");
};

const main = async (): Promise<void> => {
  await loadEnvFile();

  const token = process.env.GITHUB_PAT?.trim();
  if (!token) {
    throw new Error("Missing GITHUB_PAT. Set it in your environment or .env file.");
  }

  const username = process.env.GITHUB_EVENTS_USERNAME?.trim() || DEFAULT_USERNAME;
  const limit = parseLimit(process.env.GITHUB_EVENTS_LIMIT);
  const syncIntervalMinutes = parseSyncIntervalMinutes(process.env.GITHUB_EVENTS_SYNC_INTERVAL_MINUTES);
  const syncPerPage = parsePositiveInteger(process.env.GITHUB_EVENTS_SYNC_PER_PAGE, DEFAULT_SYNC_PER_PAGE);
  const syncMaxPages = parsePositiveInteger(
    process.env.GITHUB_EVENTS_SYNC_MAX_PAGES,
    DEFAULT_SYNC_MAX_PAGES,
  );

  const syncResult = await eventsSqlite.syncGitHubEventsToSqlite({
    username,
    token,
    minIntervalMs: syncIntervalMinutes * 60 * 1000,
    perPage: syncPerPage,
    maxPages: syncMaxPages,
  });
  const mockEvents = await eventsSqlite.readGitHubEventsFromSqlite({
    username,
    limit,
  });

  const output = buildMockDataFile(mockEvents, {
    username,
    fetchedAt: new Date().toISOString(),
    syncReason: syncResult.reason,
    syncRequestsUsed: syncResult.requestsUsed,
    syncedAt: syncResult.lastSuccessfulSyncAt,
  });

  await mkdir(path.dirname(OUTPUT_FILE_PATH), { recursive: true });
  await writeFile(OUTPUT_FILE_PATH, output, "utf8");

  console.log(
    `Sync result: ${syncResult.reason}, requests=${syncResult.requestsUsed}, inserted=${syncResult.insertedCount}, updated=${syncResult.updatedCount}.`,
  );
  console.log(`Generated ${mockEvents.length} mock events for ${username} from SQLite cache.`);
  console.log(`Output file: ${OUTPUT_FILE_PATH}`);
};

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown error";
  console.error(`Failed to generate GitHub event mock data. ${message}`);
  process.exitCode = 1;
});
