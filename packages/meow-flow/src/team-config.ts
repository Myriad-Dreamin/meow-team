import { spawnSync } from "node:child_process";
import { closeSync, existsSync, mkdtempSync, openSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  normalizeMeowFlowTeamConfig,
  type NormalizedMeowFlowTeamConfig,
} from "@myriaddreamin/meow-flow-core";
import { getSharedMeowFlowConfigPath, SharedTeamConfigNotFoundError } from "./shared-config.js";

const require = createRequire(import.meta.url);
const DEFAULT_TSCONFIG_FILE_NAME = "tsconfig.json";
const SOURCE_FILE_PATH = fileURLToPath(import.meta.url);
const SOURCE_DIRECTORY = path.dirname(SOURCE_FILE_PATH);
const SOURCE_EXTENSION = path.extname(SOURCE_FILE_PATH);
const EVALUATOR_ENTRY_PATH = path.join(SOURCE_DIRECTORY, `evaluate-team-config${SOURCE_EXTENSION}`);
const TSX_LOADER_PATH = require.resolve("tsx");

export type LoadedMeowFlowTeamConfig = {
  readonly configPath: string;
  readonly tsconfigPath: string | null;
  readonly config: NormalizedMeowFlowTeamConfig;
};

export class TeamConfigLoadError extends Error {
  readonly configPath: string;
  readonly tsconfigPath: string | null;

  constructor(input: { configPath: string; tsconfigPath: string | null; detail: string }) {
    const tsconfigDetail =
      input.tsconfigPath === null ? "" : ` using ${path.basename(input.tsconfigPath)}`;
    super(`Unable to load ${input.configPath}${tsconfigDetail}.\n${input.detail}`.trimEnd());
    this.name = "TeamConfigLoadError";
    this.configPath = input.configPath;
    this.tsconfigPath = input.tsconfigPath;
  }
}

export function loadMeowFlowTeamConfig(input: {
  cwd: string;
  configPath?: string;
}): LoadedMeowFlowTeamConfig {
  const cwd = path.resolve(input.cwd);
  const configPath = resolveTeamConfigPath(cwd, input.configPath);
  const tsconfigPath = discoverAncestorFile(path.dirname(configPath), DEFAULT_TSCONFIG_FILE_NAME);
  const rawConfig = evaluateTeamConfigModule({
    configPath,
    tsconfigPath,
    cwd,
  });

  return {
    configPath,
    tsconfigPath,
    config: normalizeMeowFlowTeamConfig(rawConfig, { configPath }),
  };
}

function resolveTeamConfigPath(cwd: string, explicitConfigPath: string | undefined): string {
  if (explicitConfigPath) {
    const resolvedPath = path.resolve(cwd, explicitConfigPath);
    if (!existsSync(resolvedPath)) {
      throw new TeamConfigLoadError({
        configPath: resolvedPath,
        tsconfigPath: discoverAncestorFile(path.dirname(resolvedPath), DEFAULT_TSCONFIG_FILE_NAME),
        detail: "The requested config path does not exist.",
      });
    }

    return resolvedPath;
  }

  const sharedConfigPath = getSharedMeowFlowConfigPath();
  if (!existsSync(sharedConfigPath)) {
    throw new SharedTeamConfigNotFoundError(sharedConfigPath);
  }

  return sharedConfigPath;
}

function discoverAncestorFile(startDirectory: string, fileName: string): string | null {
  let currentDirectory = path.resolve(startDirectory);

  while (true) {
    const candidatePath = path.join(currentDirectory, fileName);
    if (existsSync(candidatePath)) {
      return candidatePath;
    }

    const parentDirectory = path.dirname(currentDirectory);
    if (parentDirectory === currentDirectory) {
      return null;
    }

    currentDirectory = parentDirectory;
  }
}

function evaluateTeamConfigModule(input: {
  configPath: string;
  tsconfigPath: string | null;
  cwd: string;
}): unknown {
  const outputDirectory = mkdtempSync(path.join(tmpdir(), "meow-flow-config-loader-"));
  const stdoutPath = path.join(outputDirectory, "stdout.txt");
  const stderrPath = path.join(outputDirectory, "stderr.txt");
  const stdoutFd = openSync(stdoutPath, "w");
  const stderrFd = openSync(stderrPath, "w");
  const env = { ...process.env };

  if (input.tsconfigPath === null) {
    delete env.TSX_TSCONFIG_PATH;
  } else {
    env.TSX_TSCONFIG_PATH = input.tsconfigPath;
  }

  const result = spawnSync(
    process.execPath,
    ["--import", TSX_LOADER_PATH, EVALUATOR_ENTRY_PATH, input.configPath],
    {
      cwd: input.cwd,
      env,
      stdio: ["ignore", stdoutFd, stderrFd],
    },
  );

  closeSync(stdoutFd);
  closeSync(stderrFd);

  const stdout = readFileSync(stdoutPath, "utf8");
  const stderr = readFileSync(stderrPath, "utf8");

  rmSync(outputDirectory, { recursive: true, force: true });

  if (result.error) {
    throw new TeamConfigLoadError({
      configPath: input.configPath,
      tsconfigPath: input.tsconfigPath,
      detail:
        result.error instanceof Error ? result.error.message : "Config loader failed to start.",
    });
  }

  if (result.status !== 0) {
    throw new TeamConfigLoadError({
      configPath: input.configPath,
      tsconfigPath: input.tsconfigPath,
      detail: formatChildProcessFailure(stderr),
    });
  }

  const trimmedStdout = stdout.trim();

  try {
    return JSON.parse(trimmedStdout);
  } catch {
    throw new TeamConfigLoadError({
      configPath: input.configPath,
      tsconfigPath: input.tsconfigPath,
      detail: trimmedStdout.length === 0 ? "Config loader returned no output." : trimmedStdout,
    });
  }
}

function formatChildProcessFailure(stderr: string): string {
  const trimmedOutput = stderr.trim();
  return trimmedOutput.length === 0
    ? "Config loader exited without an error message."
    : trimmedOutput;
}
