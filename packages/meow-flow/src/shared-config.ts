import { homedir } from "node:os";
import path from "node:path";

export const SHARED_MEOW_FLOW_CONFIG_DISPLAY_PATH = "~/.local/shared/meow-flow/config.js";
export const SHARED_MEOW_FLOW_DATABASE_DISPLAY_PATH = "~/.local/shared/meow-flow/meow-flow.sqlite";
export const SUPPORTED_TEAM_CONFIG_SOURCE_EXTENSIONS = [".js", ".ts"] as const;

const SHARED_MEOW_FLOW_DIRECTORY_PATH_SEGMENTS = [".local", "shared", "meow-flow"] as const;
const SHARED_CONFIG_PATH_SEGMENTS = [
  ...SHARED_MEOW_FLOW_DIRECTORY_PATH_SEGMENTS,
  "config.js",
] as const;
const SHARED_DATABASE_FILE_NAME = "meow-flow.sqlite";
const SUPPORTED_EXTENSION_SET = new Set<string>(SUPPORTED_TEAM_CONFIG_SOURCE_EXTENSIONS);

export class SharedTeamConfigNotFoundError extends Error {
  constructor(sharedConfigPath = getSharedMeowFlowConfigPath()) {
    super(
      `No shared Meow Flow config is installed at ${sharedConfigPath}. Run mfl config install <path> or pass --config <path>.`,
    );
    this.name = "SharedTeamConfigNotFoundError";
  }
}

export class UnsupportedTeamConfigSourceExtensionError extends Error {
  constructor(sourceConfigPath: string) {
    super(
      `Unsupported config file type for ${sourceConfigPath}. Supported config file types: ${formatSupportedTeamConfigSourceExtensions()}.`,
    );
    this.name = "UnsupportedTeamConfigSourceExtensionError";
  }
}

export function getSharedMeowFlowConfigPath(homeDirectory = homedir()): string {
  return path.join(homeDirectory, ...SHARED_CONFIG_PATH_SEGMENTS);
}

export function getSharedMeowFlowDirectoryPath(homeDirectory = homedir()): string {
  return path.join(homeDirectory, ...SHARED_MEOW_FLOW_DIRECTORY_PATH_SEGMENTS);
}

export function getSharedMeowFlowDatabasePath(homeDirectory = homedir()): string {
  return path.join(getSharedMeowFlowDirectoryPath(homeDirectory), SHARED_DATABASE_FILE_NAME);
}

export function assertSupportedTeamConfigSourcePath(sourceConfigPath: string): void {
  const extension = path.extname(sourceConfigPath);

  if (!SUPPORTED_EXTENSION_SET.has(extension)) {
    throw new UnsupportedTeamConfigSourceExtensionError(sourceConfigPath);
  }
}

export function formatSupportedTeamConfigSourceExtensions(): string {
  return SUPPORTED_TEAM_CONFIG_SOURCE_EXTENSIONS.join(", ");
}
