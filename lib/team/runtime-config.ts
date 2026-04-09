import "server-only";

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

export type TeamModelReasoningEffort = "minimal" | "low" | "medium" | "high" | "xhigh";
export type TeamModelTextVerbosity = "low" | "medium" | "high";

type TeamRuntimeSource = "codex-config" | "codex-auth" | "env" | "default" | "missing";

type ParsedCodexConfig = {
  model: string | null;
  modelProvider: string | null;
  baseUrl: string | null;
  reasoningEffort: TeamModelReasoningEffort | null;
  textVerbosity: TeamModelTextVerbosity | null;
};

type ParsedCodexAuth = {
  apiKey: string | null;
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

const readOptionalFile = (filePath: string): string | null => {
  try {
    return readFileSync(filePath, "utf8");
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

const readCodexConfig = (): ParsedCodexConfig => {
  const rawConfig = readOptionalFile(codexUserConfigPaths.config);
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
    baseUrl: modelProvider ? readTomlString(values, `model_providers.${modelProvider}.base_url`) : null,
    reasoningEffort: normalizeReasoningEffort(readTomlString(values, "model_reasoning_effort")),
    textVerbosity: normalizeTextVerbosity(readTomlString(values, "model_verbosity")),
  };
};

const readCodexAuth = (): ParsedCodexAuth => {
  const rawAuth = readOptionalFile(codexUserConfigPaths.auth);
  if (!rawAuth) {
    return {
      apiKey: null,
    };
  }

  try {
    const parsedAuth = JSON.parse(rawAuth) as { OPENAI_API_KEY?: unknown };
    const apiKey = typeof parsedAuth.OPENAI_API_KEY === "string" ? parsedAuth.OPENAI_API_KEY.trim() : "";

    return {
      apiKey: apiKey || null,
    };
  } catch {
    return {
      apiKey: null,
    };
  }
};

const codexConfig = readCodexConfig();
const codexAuth = readCodexAuth();
const envApiKey = normalizeEnvValue(process.env.OPENAI_API_KEY);
const envBaseUrl = normalizeEnvValue(process.env.OPENAI_BASE_URL);
const envModel = normalizeEnvValue(process.env.OPENAI_MODEL);
const envOwnerName = normalizeEnvValue(process.env.TEAM_OWNER_NAME);

export const teamRuntimeConfig = {
  ownerName: envOwnerName ?? "Your Team",
  model: codexConfig.model ?? envModel ?? DEFAULT_MODEL,
  modelProvider: codexConfig.modelProvider,
  reasoningEffort: codexConfig.reasoningEffort ?? "medium",
  textVerbosity: codexConfig.textVerbosity ?? "medium",
  apiKey: codexAuth.apiKey ?? envApiKey,
  baseUrl: codexConfig.baseUrl ?? envBaseUrl ?? undefined,
  hasApiKey: Boolean(codexAuth.apiKey ?? envApiKey),
  sources: {
    apiKey: (codexAuth.apiKey ? "codex-auth" : envApiKey ? "env" : "missing") satisfies TeamRuntimeSource,
    baseUrl: (codexConfig.baseUrl ? "codex-config" : envBaseUrl ? "env" : "default") satisfies TeamRuntimeSource,
    model: (codexConfig.model ? "codex-config" : envModel ? "env" : "default") satisfies TeamRuntimeSource,
  },
} as const;

export const missingOpenAiConfigMessage = [
  "OpenAI-compatible credentials are required to run the AgentKit network.",
  `The app first looks for model settings in ${codexUserConfigDisplayPaths.config} and credentials in ${codexUserConfigDisplayPaths.auth}.`,
  "You can still provide OPENAI_API_KEY and OPENAI_BASE_URL as environment fallbacks when needed.",
].join(" ");
