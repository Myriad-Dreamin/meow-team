import "server-only";

import { readFileSync, statSync, type Stats } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

export type TeamModelReasoningEffort = "minimal" | "low" | "medium" | "high" | "xhigh";
export type TeamModelTextVerbosity = "low" | "medium" | "high";

type TeamRuntimeSource = "codex-config" | "env" | "default";

type TeamRuntimeFileReader = typeof readFileSync;
type TeamRuntimeFileStatReader = typeof statSync;

type ParsedCodexConfig = {
  model: string | null;
  modelProvider: string | null;
  baseUrl: string | null;
  reasoningEffort: TeamModelReasoningEffort | null;
  textVerbosity: TeamModelTextVerbosity | null;
};

const DEFAULT_MODEL = "gpt-5.2-codex";

export const codexUserConfigPaths = {
  config: path.join(homedir(), ".codex", "config.toml"),
  auth: path.join(homedir(), ".codex", "auth.json"),
};

export const codexUserConfigDisplayPaths = {
  config: "~/.codex/config.toml",
  auth: "~/.codex/auth.json",
};

const readOptionalFile = (filePath: string, readFile: TeamRuntimeFileReader): string | null => {
  try {
    return readFile(filePath, "utf8");
  } catch {
    return null;
  }
};

const stripTomlComment = (line: string): string => {
  let inString = false;
  let isEscaped = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];

    if (character === '"' && !isEscaped) {
      inString = !inString;
    }

    if (character === "#" && !inString) {
      return line.slice(0, index);
    }

    isEscaped = character === "\\" && !isEscaped;
    if (character !== "\\") {
      isEscaped = false;
    }
  }

  return line;
};

const splitTomlPath = (value: string): string[] => {
  const parts: string[] = [];
  let current = "";
  let inQuotes = false;
  let isEscaped = false;

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];

    if (inQuotes) {
      if (isEscaped) {
        current += character;
        isEscaped = false;
        continue;
      }

      if (character === "\\") {
        isEscaped = true;
        continue;
      }

      if (character === '"') {
        inQuotes = false;
        continue;
      }

      current += character;
      continue;
    }

    if (character === '"') {
      inQuotes = true;
      continue;
    }

    if (character === ".") {
      const normalized = current.trim();
      if (normalized) {
        parts.push(normalized);
      }
      current = "";
      continue;
    }

    current += character;
  }

  const normalized = current.trim();
  if (normalized) {
    parts.push(normalized);
  }

  return parts;
};

const parseTomlString = (value: string): string | undefined => {
  if (!value.startsWith('"') || !value.endsWith('"')) {
    return undefined;
  }

  try {
    return JSON.parse(value);
  } catch {
    return value.slice(1, -1);
  }
};

const parseTomlScalar = (value: string): string | boolean | undefined => {
  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  return parseTomlString(value);
};

const parseTomlDocument = (content: string): Map<string, string | boolean> => {
  const values = new Map<string, string | boolean>();
  let sectionPath: string[] = [];

  for (const line of content.split(/\r?\n/u)) {
    const trimmed = stripTomlComment(line).trim();
    if (!trimmed) {
      continue;
    }

    const sectionMatch = trimmed.match(/^\[(.+)\]$/u);
    if (sectionMatch) {
      sectionPath = splitTomlPath(sectionMatch[1].trim());
      continue;
    }

    const assignmentMatch = trimmed.match(/^([A-Za-z0-9_-]+)\s*=\s*(.+)$/u);
    if (!assignmentMatch) {
      continue;
    }

    const [, key, rawValue] = assignmentMatch;
    const parsedValue = parseTomlScalar(rawValue.trim());
    if (parsedValue === undefined) {
      continue;
    }

    values.set([...sectionPath, key].join("."), parsedValue);
  }

  return values;
};

const readTomlString = (values: Map<string, string | boolean>, pathKey: string): string | null => {
  const value = values.get(pathKey);
  return typeof value === "string" && value.trim() ? value : null;
};

const normalizeEnvValue = (value: string | undefined): string | null => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

const normalizeReasoningEffort = (value: string | null): TeamModelReasoningEffort | null => {
  switch (value) {
    case "minimal":
    case "low":
    case "medium":
    case "high":
    case "xhigh":
      return value;
    default:
      return null;
  }
};

const normalizeTextVerbosity = (value: string | null): TeamModelTextVerbosity | null => {
  switch (value) {
    case "low":
    case "medium":
    case "high":
      return value;
    default:
      return null;
  }
};

const readCodexConfig = ({
  configPath,
  readFile,
}: {
  configPath: string;
  readFile: TeamRuntimeFileReader;
}): ParsedCodexConfig => {
  const rawConfig = readOptionalFile(configPath, readFile);
  if (!rawConfig) {
    return {
      model: null,
      modelProvider: null,
      baseUrl: null,
      reasoningEffort: null,
      textVerbosity: null,
    };
  }

  const values = parseTomlDocument(rawConfig);
  const modelProvider = readTomlString(values, "model_provider");

  return {
    model: readTomlString(values, "model"),
    modelProvider,
    baseUrl: modelProvider
      ? readTomlString(values, `model_providers.${modelProvider}.base_url`)
      : null,
    reasoningEffort: normalizeReasoningEffort(readTomlString(values, "model_reasoning_effort")),
    textVerbosity: normalizeTextVerbosity(readTomlString(values, "model_verbosity")),
  };
};

export type TeamRuntimeConfig = {
  ownerName: string;
  model: string;
  modelProvider: string | null;
  reasoningEffort: TeamModelReasoningEffort;
  textVerbosity: TeamModelTextVerbosity;
  baseUrl: string | undefined;
  sources: {
    baseUrl: TeamRuntimeSource;
    model: TeamRuntimeSource;
  };
};

type TeamRuntimeConfigFileState = {
  exists: boolean;
  mtimeMs: number | null;
};

type TeamRuntimeConfigCacheEntry = {
  configFileState: TeamRuntimeConfigFileState;
  value: TeamRuntimeConfig;
};

const readConfigFileState = ({
  configPath,
  statFile,
}: {
  configPath: string;
  statFile: TeamRuntimeFileStatReader;
}): TeamRuntimeConfigFileState => {
  try {
    const stats = statFile(configPath) as Stats;
    return {
      exists: true,
      mtimeMs: stats.mtimeMs,
    };
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === "ENOENT") {
      return {
        exists: false,
        mtimeMs: null,
      };
    }

    throw error;
  }
};

const isSameConfigFileState = (
  left: TeamRuntimeConfigFileState,
  right: TeamRuntimeConfigFileState,
): boolean => {
  return left.exists === right.exists && left.mtimeMs === right.mtimeMs;
};

export const readTeamRuntimeConfig = ({
  env = process.env,
  readFile = readFileSync,
  configPaths = codexUserConfigPaths,
}: {
  env?: NodeJS.ProcessEnv;
  readFile?: TeamRuntimeFileReader;
  configPaths?: typeof codexUserConfigPaths;
} = {}): TeamRuntimeConfig => {
  const codexConfig = readCodexConfig({
    configPath: configPaths.config,
    readFile,
  });
  const envBaseUrl = normalizeEnvValue(env.OPENAI_BASE_URL);
  const envModel = normalizeEnvValue(env.OPENAI_MODEL);
  const envOwnerName = normalizeEnvValue(env.TEAM_OWNER_NAME);

  return {
    ownerName: envOwnerName ?? "Your Team",
    model: codexConfig.model ?? envModel ?? DEFAULT_MODEL,
    modelProvider: codexConfig.modelProvider,
    reasoningEffort: codexConfig.reasoningEffort ?? "medium",
    textVerbosity: codexConfig.textVerbosity ?? "medium",
    baseUrl: codexConfig.baseUrl ?? envBaseUrl ?? undefined,
    sources: {
      baseUrl: (codexConfig.baseUrl
        ? "codex-config"
        : envBaseUrl
          ? "env"
          : "default") satisfies TeamRuntimeSource,
      model: (codexConfig.model
        ? "codex-config"
        : envModel
          ? "env"
          : "default") satisfies TeamRuntimeSource,
    },
  };
};

export const createTeamRuntimeConfigAccessor = ({
  env = process.env,
  readFile = readFileSync,
  statFile = statSync,
  configPaths = codexUserConfigPaths,
}: {
  env?: NodeJS.ProcessEnv;
  readFile?: TeamRuntimeFileReader;
  statFile?: TeamRuntimeFileStatReader;
  configPaths?: typeof codexUserConfigPaths;
} = {}): (() => TeamRuntimeConfig) => {
  let cacheEntry: TeamRuntimeConfigCacheEntry | null = null;

  return () => {
    const configFileState = readConfigFileState({
      configPath: configPaths.config,
      statFile,
    });

    if (cacheEntry && isSameConfigFileState(cacheEntry.configFileState, configFileState)) {
      return cacheEntry.value;
    }

    const value = readTeamRuntimeConfig({
      env,
      readFile,
      configPaths,
    });

    cacheEntry = {
      configFileState,
      value,
    };

    return value;
  };
};

const getCachedTeamRuntimeConfig = createTeamRuntimeConfigAccessor();

export const getTeamRuntimeConfig = (): TeamRuntimeConfig => {
  return getCachedTeamRuntimeConfig();
};

export const missingCodexAuthMessage = [
  "Codex credentials are required to run the Codex CLI harness.",
  `The backend expects a Codex auth file at ${codexUserConfigDisplayPaths.auth}.`,
  `Model settings continue to load from ${codexUserConfigDisplayPaths.config}, and OPENAI_MODEL plus OPENAI_BASE_URL remain optional backend overrides.`,
].join(" ");

export const assertTeamCodexAuthFileExists = ({
  readFile = readFileSync,
  configPaths = codexUserConfigPaths,
}: {
  readFile?: TeamRuntimeFileReader;
  configPaths?: typeof codexUserConfigPaths;
} = {}): void => {
  try {
    readFile(configPaths.auth, "utf8");
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === "ENOENT") {
      throw new Error(missingCodexAuthMessage);
    }

    throw error;
  }
};
