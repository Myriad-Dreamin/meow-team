import { readFile } from "node:fs/promises";
import path from "node:path";

type EventsSqliteModule = typeof import("../lib/github-module/events-sqlite");

const eventsSqlite = (await import(
  new URL("../lib/github-module/events-sqlite.ts", import.meta.url).href
)) as EventsSqliteModule;

const DEFAULT_USERNAME = "Myriad-Dreamin";
const DEFAULT_SYNC_INTERVAL_MINUTES = 15;
const DEFAULT_SYNC_PER_PAGE = 100;
const DEFAULT_SYNC_MAX_PAGES = 10;

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

const sleep = async (ms: number): Promise<void> => {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
};

const runSyncOnce = async (input: {
  username: string;
  token: string;
  syncIntervalMinutes: number;
  syncPerPage: number;
  syncMaxPages: number;
}) => {
  const result = await eventsSqlite.syncGitHubEventsToSqlite({
    username: input.username,
    token: input.token,
    minIntervalMs: input.syncIntervalMinutes * 60 * 1000,
    perPage: input.syncPerPage,
    maxPages: input.syncMaxPages,
  });

  console.log(
    `[${new Date().toISOString()}] sync=${result.reason} requests=${result.requestsUsed} inserted=${result.insertedCount} updated=${result.updatedCount} totalStored=${result.totalStored}`,
  );
};

const main = async (): Promise<void> => {
  await loadEnvFile();

  const token = process.env.GITHUB_PAT?.trim();
  if (!token) {
    throw new Error("Missing GITHUB_PAT. Set it in your environment or .env file.");
  }

  const username = process.env.GITHUB_EVENTS_USERNAME?.trim() || DEFAULT_USERNAME;
  const syncIntervalMinutes = parseSyncIntervalMinutes(process.env.GITHUB_EVENTS_SYNC_INTERVAL_MINUTES);
  const syncPerPage = parsePositiveInteger(process.env.GITHUB_EVENTS_SYNC_PER_PAGE, DEFAULT_SYNC_PER_PAGE);
  const syncMaxPages = parsePositiveInteger(
    process.env.GITHUB_EVENTS_SYNC_MAX_PAGES,
    DEFAULT_SYNC_MAX_PAGES,
  );
  const watchMode = process.argv.includes("--watch");

  if (!watchMode) {
    await runSyncOnce({ username, token, syncIntervalMinutes, syncPerPage, syncMaxPages });
    return;
  }

  console.log(
    `GitHub event sync worker started for ${username}. Interval=${syncIntervalMinutes} minutes.`,
  );

  while (true) {
    await runSyncOnce({ username, token, syncIntervalMinutes, syncPerPage, syncMaxPages });
    await sleep(syncIntervalMinutes * 60 * 1000);
  }
};

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown error";
  console.error(`Failed to sync GitHub events to SQLite. ${message}`);
  process.exitCode = 1;
});
