import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type GitHubUserSubscription = import("../lib/github-module/subscriptions-source").GitHubUserSubscription;
type ReadGitHubUserSubscriptionsInput =
  import("../lib/github-module/subscriptions-source").ReadGitHubUserSubscriptionsInput;
type SubscriptionsSourceModule = typeof import("../lib/github-module/subscriptions-source");

const subscriptionsSource = (await import(
  new URL("../lib/github-module/subscriptions-source.ts", import.meta.url).href
)) as SubscriptionsSourceModule;

const DEFAULT_USERNAME = "Myriad-Dreamin";
const DEFAULT_LIMIT = 60;
const OUTPUT_FILE_PATH = path.join(process.cwd(), "app/mocks/github-subscriptions.generated.ts");

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

const readGitHubSubscriptions = async (
  input: Pick<ReadGitHubUserSubscriptionsInput, "username" | "token" | "limit">,
): Promise<GitHubUserSubscription[]> => {
  return subscriptionsSource.readGitHubUserSubscriptions({
    username: input.username,
    token: input.token,
    limit: input.limit,
  });
};

const buildMockDataFile = (
  subscriptions: GitHubUserSubscription[],
  metadata: {
    username: string;
    fetchedAt: string;
    limit: number;
  },
): string => {
  const serializedMetadata = JSON.stringify(
    {
      source: "github-api",
      username: metadata.username,
      fetchedAt: metadata.fetchedAt,
      limit: metadata.limit,
    },
    null,
    2,
  );
  const serializedSubscriptions = JSON.stringify(subscriptions, null, 2);

  return [
    'import type { GitHubUserSubscription } from "@/lib/github-module/subscriptions-source";',
    "",
    `export const githubSubscriptionsMockMeta = ${serializedMetadata} as const;`,
    "",
    `export const githubSubscriptionsMockData: GitHubUserSubscription[] = ${serializedSubscriptions};`,
    "",
  ].join("\n");
};

const main = async (): Promise<void> => {
  await loadEnvFile();

  const token = process.env.GITHUB_PAT?.trim();
  if (!token) {
    throw new Error("Missing GITHUB_PAT. Set it in your environment or .env file.");
  }

  const username =
    process.env.GITHUB_SUBSCRIPTIONS_USERNAME?.trim() ||
    process.env.GITHUB_EVENTS_USERNAME?.trim() ||
    DEFAULT_USERNAME;
  const limit = parseLimit(process.env.GITHUB_SUBSCRIPTIONS_LIMIT);
  const subscriptions = await readGitHubSubscriptions({
    username,
    token,
    limit,
  });

  const output = buildMockDataFile(subscriptions, {
    username,
    fetchedAt: new Date().toISOString(),
    limit,
  });

  await mkdir(path.dirname(OUTPUT_FILE_PATH), { recursive: true });
  await writeFile(OUTPUT_FILE_PATH, output, "utf8");

  console.log(`Fetched ${subscriptions.length} subscriptions for ${username}.`);
  console.log(`Output file: ${OUTPUT_FILE_PATH}`);
};

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown error";
  console.error(`Failed to generate GitHub subscriptions mock data. ${message}`);
  process.exitCode = 1;
});
