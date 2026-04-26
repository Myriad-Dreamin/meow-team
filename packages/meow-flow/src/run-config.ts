import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

const CONFIG_PATH_ENV_NAME = "MFL_CONFIG_PATH";
const CONFIG_DIRECTORY_PATH = [".local", "share", "meow-flow"] as const;
const CONFIG_FILE_NAME = "config.json";
const PROVIDER_DISCOVERY_HINT = 'Run "paseo provider ls" to list providers.';

export const DEFAULT_RUN_PROVIDER = "claude";

export type RunProviderSource = "option" | "config" | "default";

export type ResolvedRunProvider = {
  readonly provider: string;
  readonly source: RunProviderSource;
  readonly configPath: string;
};

export type UpdatedRunProviderConfig = {
  readonly provider: string;
  readonly configPath: string;
};

type UnknownRecord = Record<string, unknown>;

export function getMeowFlowConfigPath(): string {
  const override = process.env[CONFIG_PATH_ENV_NAME]?.trim();

  if (override) {
    return path.resolve(override);
  }

  return path.join(resolveHomeDirectory(), ...CONFIG_DIRECTORY_PATH, CONFIG_FILE_NAME);
}

export function resolveRunProvider(explicitProvider: string | undefined): ResolvedRunProvider {
  const configPath = getMeowFlowConfigPath();

  if (explicitProvider !== undefined) {
    return {
      provider: readProviderValue(explicitProvider, "--provider"),
      source: "option",
      configPath,
    };
  }

  const configuredProvider = readConfiguredRunProvider(configPath);
  if (configuredProvider !== null) {
    return {
      provider: configuredProvider,
      source: "config",
      configPath,
    };
  }

  return {
    provider: DEFAULT_RUN_PROVIDER,
    source: "default",
    configPath,
  };
}

export function setConfiguredRunProvider(provider: string): UpdatedRunProviderConfig {
  const configPath = getMeowFlowConfigPath();
  const resolvedProvider = readProviderValue(provider, "provider");
  const config = readConfigObject(configPath);

  mkdirSync(path.dirname(configPath), { recursive: true });
  writeFileSync(
    configPath,
    `${JSON.stringify(
      {
        ...config,
        provider: resolvedProvider,
      },
      null,
      2,
    )}\n`,
  );

  return {
    provider: resolvedProvider,
    configPath,
  };
}

function readConfiguredRunProvider(configPath: string): string | null {
  const parsed = readConfigObject(configPath);

  if (!Object.prototype.hasOwnProperty.call(parsed, "provider")) {
    return null;
  }

  return readProviderValue(parsed.provider, "provider", configPath);
}

function readConfigObject(configPath: string): UnknownRecord {
  if (!existsSync(configPath)) {
    return {};
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(configPath, "utf8"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Invalid MeowFlow config at ${configPath}: ${message}. ${PROVIDER_DISCOVERY_HINT}`,
    );
  }

  if (!isPlainObject(parsed)) {
    throw new Error(
      `Invalid MeowFlow config at ${configPath}: expected a JSON object. ${PROVIDER_DISCOVERY_HINT}`,
    );
  }

  return parsed;
}

function readProviderValue(value: unknown, fieldName: string, configPath?: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    const prefix =
      configPath === undefined
        ? `${fieldName} must be a non-empty string.`
        : `Invalid MeowFlow config at ${configPath}: ${fieldName} must be a non-empty string.`;
    throw new Error(`${prefix} ${PROVIDER_DISCOVERY_HINT}`);
  }

  return value.trim();
}

function isPlainObject(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function resolveHomeDirectory(): string {
  const homeFromEnv = process.env.HOME?.trim() || process.env.USERPROFILE?.trim();

  if (homeFromEnv) {
    return homeFromEnv;
  }

  return homedir();
}
