import "server-only";

import { readFileSync, statSync, type Stats } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import ts from "typescript";
import { defineTeamConfig, type TeamConfig, type TeamConfigInput } from "@/lib/config/team";

type TeamConfigFileReader = typeof readFileSync;
type TeamConfigFileStatReader = typeof statSync;

type TeamConfigFileState = {
  exists: boolean;
  mtimeMs: number | null;
};

type TeamConfigCacheEntry = {
  configPath: string;
  fileState: TeamConfigFileState;
  value: TeamConfig;
};

type TeamConfigErrorCacheEntry = {
  configPath: string;
  fileState: TeamConfigFileState;
  error: Error;
};

type TeamConfigModuleLoader = ({
  configPath,
  projectRoot,
  readFile,
  statFile,
}: {
  configPath: string;
  projectRoot: string;
  readFile: TeamConfigFileReader;
  statFile: TeamConfigFileStatReader;
}) => TeamConfigInput;

type TeamConfigLoaderTestOverrides = {
  config?: TeamConfig | null;
  cwd?: string;
  envConfigPath?: string | null;
  moduleLoader?: TeamConfigModuleLoader;
  projectRoot?: string;
  readFile?: TeamConfigFileReader;
  statFile?: TeamConfigFileStatReader;
};

type LocalModuleRecord = {
  exports: unknown;
};

type LocalModuleContext = {
  moduleCache: Map<string, LocalModuleRecord>;
  projectRoot: string;
  readFile: TeamConfigFileReader;
  statFile: TeamConfigFileStatReader;
};

const DEFAULT_TEAM_CONFIG_FILENAME = "team.config.ts";
const LOCAL_MODULE_EXTENSIONS = [
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".json",
] as const;
const projectRequire = createRequire(import.meta.url);

let cachedTeamConfigEntry: TeamConfigCacheEntry | null = null;
let cachedTeamConfigErrorEntry: TeamConfigErrorCacheEntry | null = null;
let teamConfigLoaderTestOverrides: TeamConfigLoaderTestOverrides = {};

const clearTeamConfigCache = (): void => {
  cachedTeamConfigEntry = null;
  cachedTeamConfigErrorEntry = null;
};

const toError = (error: unknown): Error => {
  return error instanceof Error ? error : new Error(String(error));
};

const isMissingPathError = (error: unknown): boolean => {
  const nodeError = error as NodeJS.ErrnoException;
  return nodeError?.code === "ENOENT" || nodeError?.code === "ENOTDIR";
};

const normalizeResolvedPath = ({
  baseDirectory,
  value,
}: {
  baseDirectory: string;
  value: string | null | undefined;
}): string | null => {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  return path.isAbsolute(trimmed) ? trimmed : path.resolve(baseDirectory, trimmed);
};

export const resolveTeamConfigPath = ({
  cwd = teamConfigLoaderTestOverrides.cwd ?? process.cwd(),
  env = process.env,
  envConfigPath = teamConfigLoaderTestOverrides.envConfigPath,
}: {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  envConfigPath?: string | null;
} = {}): string => {
  const overridePath = normalizeResolvedPath({
    baseDirectory: cwd,
    value: envConfigPath ?? env.REVIVAL_TEAM_CONFIG_PATH,
  });

  return overridePath ?? path.join(cwd, DEFAULT_TEAM_CONFIG_FILENAME);
};

const readTeamConfigFileState = ({
  configPath,
  statFile,
}: {
  configPath: string;
  statFile: TeamConfigFileStatReader;
}): TeamConfigFileState => {
  try {
    const stats = statFile(configPath) as Stats;
    return {
      exists: true,
      mtimeMs: stats.mtimeMs,
    };
  } catch (error) {
    if (isMissingPathError(error)) {
      return {
        exists: false,
        mtimeMs: null,
      };
    }

    throw error;
  }
};

const isSameTeamConfigFileState = (
  left: TeamConfigFileState,
  right: TeamConfigFileState,
): boolean => {
  return left.exists === right.exists && left.mtimeMs === right.mtimeMs;
};

const isSameCacheTarget = (
  entry:
    | Pick<TeamConfigCacheEntry, "configPath" | "fileState">
    | Pick<TeamConfigErrorCacheEntry, "configPath" | "fileState">,
  configPath: string,
  fileState: TeamConfigFileState,
): boolean => {
  return entry.configPath === configPath && isSameTeamConfigFileState(entry.fileState, fileState);
};

const tryResolveLocalModulePath = ({
  candidatePath,
  statFile,
}: {
  candidatePath: string;
  statFile: TeamConfigFileStatReader;
}): string | null => {
  const candidatePaths = [
    candidatePath,
    ...LOCAL_MODULE_EXTENSIONS.map((extension) => `${candidatePath}${extension}`),
    ...LOCAL_MODULE_EXTENSIONS.map((extension) => path.join(candidatePath, `index${extension}`)),
  ];

  for (const resolvedPath of new Set(candidatePaths)) {
    try {
      const stats = statFile(resolvedPath) as Stats;
      if (stats.isFile()) {
        return resolvedPath;
      }
    } catch (error) {
      if (isMissingPathError(error)) {
        continue;
      }

      throw error;
    }
  }

  return null;
};

const resolveLocalImportPath = ({
  importingFile,
  projectRoot,
  specifier,
  statFile,
}: {
  importingFile: string;
  projectRoot: string;
  specifier: string;
  statFile: TeamConfigFileStatReader;
}): string | null => {
  if (specifier.startsWith("@/")) {
    return tryResolveLocalModulePath({
      candidatePath: path.join(projectRoot, specifier.slice(2)),
      statFile,
    });
  }

  if (specifier.startsWith("./") || specifier.startsWith("../")) {
    return tryResolveLocalModulePath({
      candidatePath: path.resolve(path.dirname(importingFile), specifier),
      statFile,
    });
  }

  if (path.isAbsolute(specifier)) {
    return tryResolveLocalModulePath({
      candidatePath: specifier,
      statFile,
    });
  }

  return null;
};

const loadLocalModule = ({
  filePath,
  context,
}: {
  filePath: string;
  context: LocalModuleContext;
}): unknown => {
  const cachedModule = context.moduleCache.get(filePath);
  if (cachedModule) {
    return cachedModule.exports;
  }

  if (path.extname(filePath) === ".json") {
    const parsedJson = JSON.parse(context.readFile(filePath, "utf8")) as unknown;
    context.moduleCache.set(filePath, {
      exports: parsedJson,
    });
    return parsedJson;
  }

  const source = context.readFile(filePath, "utf8");
  const moduleRecord: LocalModuleRecord = {
    exports: {},
  };
  context.moduleCache.set(filePath, moduleRecord);

  const baseRequire = projectRequire;
  const localRequire = ((specifier: string): unknown => {
    if (specifier === "server-only") {
      return {};
    }

    const resolvedLocalImportPath = resolveLocalImportPath({
      importingFile: filePath,
      projectRoot: context.projectRoot,
      specifier,
      statFile: context.statFile,
    });

    if (resolvedLocalImportPath) {
      return loadLocalModule({
        filePath: resolvedLocalImportPath,
        context,
      });
    }

    return baseRequire(specifier);
  }) as NodeJS.Require;

  const resolve = ((specifier: string): string => {
    if (specifier === "server-only") {
      return "server-only";
    }

    const resolvedLocalImportPath = resolveLocalImportPath({
      importingFile: filePath,
      projectRoot: context.projectRoot,
      specifier,
      statFile: context.statFile,
    });

    return resolvedLocalImportPath ?? baseRequire.resolve(specifier);
  }) as NodeJS.RequireResolve;
  resolve.paths = (request: string) => {
    return baseRequire.resolve.paths?.(request) ?? null;
  };
  localRequire.resolve = resolve;

  // Transpile the config file and any local repo imports on demand so the
  // loader can execute TypeScript from an arbitrary runtime path.
  const transpiled = ts.transpileModule(source, {
    fileName: filePath,
    compilerOptions: {
      allowJs: true,
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      moduleResolution: ts.ModuleResolutionKind.NodeJs,
      resolveJsonModule: true,
      target: ts.ScriptTarget.ES2022,
    },
  });

  const execute = new Function(
    "exports",
    "require",
    "module",
    "__filename",
    "__dirname",
    transpiled.outputText,
  ) as (
    exports: unknown,
    require: NodeJS.Require,
    module: LocalModuleRecord,
    __filename: string,
    __dirname: string,
  ) => void;

  execute(moduleRecord.exports, localRequire, moduleRecord, filePath, path.dirname(filePath));

  return moduleRecord.exports;
};

const resolveExportedTeamConfigInput = (moduleExports: unknown): TeamConfigInput => {
  if (moduleExports && typeof moduleExports === "object") {
    const exportsRecord = moduleExports as {
      default?: TeamConfigInput;
      teamConfig?: TeamConfigInput;
    };

    if (exportsRecord.teamConfig !== undefined) {
      return exportsRecord.teamConfig;
    }

    if (exportsRecord.default !== undefined) {
      return exportsRecord.default;
    }
  }

  if (moduleExports !== undefined) {
    return moduleExports as TeamConfigInput;
  }

  throw new Error(
    "Team config modules must export `teamConfig`, a default config object, or `module.exports`.",
  );
};

const loadTeamConfigModule: TeamConfigModuleLoader = ({
  configPath,
  projectRoot,
  readFile,
  statFile,
}) => {
  const moduleExports = loadLocalModule({
    filePath: configPath,
    context: {
      moduleCache: new Map(),
      projectRoot,
      readFile,
      statFile,
    },
  });

  return resolveExportedTeamConfigInput(moduleExports);
};

const readCurrentTeamConfig = (): TeamConfig => {
  const configOverride = teamConfigLoaderTestOverrides.config;
  if (configOverride) {
    return configOverride;
  }

  const cwd = teamConfigLoaderTestOverrides.cwd ?? process.cwd();
  const configPath = resolveTeamConfigPath({
    cwd,
  });
  const projectRoot = teamConfigLoaderTestOverrides.projectRoot ?? process.cwd();
  const readFile = teamConfigLoaderTestOverrides.readFile ?? readFileSync;
  const statFile = teamConfigLoaderTestOverrides.statFile ?? statSync;
  const fileState = readTeamConfigFileState({
    configPath,
    statFile,
  });

  if (cachedTeamConfigEntry && isSameCacheTarget(cachedTeamConfigEntry, configPath, fileState)) {
    return cachedTeamConfigEntry.value;
  }

  if (
    cachedTeamConfigErrorEntry &&
    isSameCacheTarget(cachedTeamConfigErrorEntry, configPath, fileState)
  ) {
    throw cachedTeamConfigErrorEntry.error;
  }

  try {
    if (!fileState.exists) {
      throw new Error(`Team config file was not found at ${configPath}.`);
    }

    const loader = teamConfigLoaderTestOverrides.moduleLoader ?? loadTeamConfigModule;
    const value = defineTeamConfig(
      loader({
        configPath,
        projectRoot,
        readFile,
        statFile,
      }),
    );

    cachedTeamConfigEntry = {
      configPath,
      fileState,
      value,
    };
    cachedTeamConfigErrorEntry = null;
    return value;
  } catch (error) {
    const normalizedError = toError(error);
    cachedTeamConfigEntry = null;
    cachedTeamConfigErrorEntry = {
      configPath,
      fileState,
      error: normalizedError,
    };
    throw normalizedError;
  }
};

export const getTeamConfig = (): TeamConfig => {
  return readCurrentTeamConfig();
};

export const getTeamThreadFile = (): string => {
  return getTeamConfig().storage.threadFile;
};

export const resolveTeamDispatchWorktreeRoot = (repositoryPath: string): string => {
  const worktreeRoot = getTeamConfig().dispatch.worktreeRoot;
  return path.isAbsolute(worktreeRoot) ? worktreeRoot : path.join(repositoryPath, worktreeRoot);
};

export const setTeamConfigLoaderOverridesForTests = (
  overrides: Partial<Omit<TeamConfigLoaderTestOverrides, "config">>,
): void => {
  teamConfigLoaderTestOverrides = {
    ...teamConfigLoaderTestOverrides,
    ...overrides,
  };
  clearTeamConfigCache();
};

export const setTeamConfigOverrideForTests = (config: TeamConfig | null): void => {
  teamConfigLoaderTestOverrides = {
    ...teamConfigLoaderTestOverrides,
    config,
  };
  clearTeamConfigCache();
};

export const resetTeamConfigLoaderForTests = (): void => {
  teamConfigLoaderTestOverrides = {};
  clearTeamConfigCache();
};
