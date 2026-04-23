import path from "node:path";

const DEFAULT_NOTIFICATION_TARGET = "browser";
const VALID_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const NOTIFICATION_TARGETS = new Set<MeowFlowNotificationTarget>(["android", "browser", "vscode"]);

export type MeowFlowNotificationTarget = "android" | "browser" | "vscode";

export type MeowFlowRepositoryRootInput =
  | string
  | {
      readonly id?: string;
      readonly label?: string;
      readonly directory: string;
      readonly worktreeParentDirectory?: string;
      readonly worktreeTheme?: string;
    };

export type MeowFlowTeamConfigInput = {
  readonly repositories: readonly MeowFlowRepositoryRootInput[];
  readonly notifications?: {
    readonly target?: MeowFlowNotificationTarget;
  };
  readonly dispatch?: {
    readonly maxConcurrentWorkers?: number;
  };
};

export type MeowFlowValidationIssue = {
  readonly path: string;
  readonly message: string;
};

export type NormalizedMeowFlowRepositoryRoot = {
  readonly id: string;
  readonly label: string;
  readonly directory: string;
  readonly worktreeParentDirectory: string;
  readonly worktreeTheme: string;
  readonly priority: number;
};

export type NormalizedMeowFlowTeamConfig = {
  readonly configPath: string;
  readonly configDirectory: string;
  readonly notifications: {
    readonly target: MeowFlowNotificationTarget;
  };
  readonly dispatch: {
    readonly maxConcurrentWorkers: number | null;
  };
  readonly repositories: readonly NormalizedMeowFlowRepositoryRoot[];
};

type RepositoryCandidate = {
  readonly requestedId: string | null;
  readonly requestedLabel: string | null;
  readonly requestedWorktreeTheme: string | null;
  readonly directory: string;
  readonly worktreeParentDirectory: string;
  readonly priority: number;
};

export class TeamConfigValidationError extends Error {
  readonly configPath: string;
  readonly issues: readonly MeowFlowValidationIssue[];

  constructor(input: { configPath: string; issues: readonly MeowFlowValidationIssue[] }) {
    super(formatValidationMessage(input.configPath, input.issues));
    this.name = "TeamConfigValidationError";
    this.configPath = input.configPath;
    this.issues = input.issues;
  }
}

export function defineTeamConfig<const T extends MeowFlowTeamConfigInput>(config: T): T {
  return config;
}

export function normalizeMeowFlowTeamConfig(
  input: unknown,
  options: { configPath: string },
): NormalizedMeowFlowTeamConfig {
  const configPath = path.resolve(options.configPath);
  const configDirectory = path.dirname(configPath);
  const issues: MeowFlowValidationIssue[] = [];

  if (!isPlainObject(input)) {
    throw new TeamConfigValidationError({
      configPath,
      issues: [{ path: "config", message: "expected the config module to export an object" }],
    });
  }

  const repositoryCandidates = readRepositories(input.repositories, configDirectory, issues);
  const notifications = readNotifications(input.notifications, issues);
  const dispatch = readDispatch(input.dispatch, issues);

  if (issues.length > 0) {
    throw new TeamConfigValidationError({ configPath, issues });
  }

  const repositories = assignRepositoryIds(repositoryCandidates, issues);

  if (issues.length > 0) {
    throw new TeamConfigValidationError({ configPath, issues });
  }

  return {
    configPath,
    configDirectory,
    notifications,
    dispatch,
    repositories,
  };
}

function readRepositories(
  value: unknown,
  configDirectory: string,
  issues: MeowFlowValidationIssue[],
): RepositoryCandidate[] {
  if (!Array.isArray(value) || value.length === 0) {
    issues.push({
      path: "repositories",
      message: "expected a non-empty array of repository roots",
    });
    return [];
  }

  return value.flatMap((entry, index) => {
    const entryPath = `repositories[${index}]`;

    if (typeof entry === "string") {
      const directory = readNonEmptyString(entry, `${entryPath}.directory`, issues);
      if (directory === null) {
        return [];
      }

      const resolvedDirectory = path.resolve(configDirectory, directory);
      return [
        {
          requestedId: null,
          requestedLabel: null,
          requestedWorktreeTheme: null,
          directory: resolvedDirectory,
          worktreeParentDirectory: defaultWorktreeParentDirectory(resolvedDirectory),
          priority: index,
        },
      ];
    }

    if (!isPlainObject(entry)) {
      issues.push({
        path: entryPath,
        message: "expected each repository entry to be a string or object",
      });
      return [];
    }

    const directory = readNonEmptyString(entry.directory, `${entryPath}.directory`, issues);
    const id = readOptionalId(entry.id, `${entryPath}.id`, issues);
    const label = readOptionalString(entry.label, `${entryPath}.label`, issues);
    const worktreeTheme = readOptionalId(entry.worktreeTheme, `${entryPath}.worktreeTheme`, issues);
    const worktreeParentDirectory = readOptionalString(
      entry.worktreeParentDirectory,
      `${entryPath}.worktreeParentDirectory`,
      issues,
    );

    if (directory === null) {
      return [];
    }

    const resolvedDirectory = path.resolve(configDirectory, directory);
    const resolvedWorktreeParentDirectory =
      worktreeParentDirectory === null
        ? defaultWorktreeParentDirectory(resolvedDirectory)
        : path.resolve(resolvedDirectory, worktreeParentDirectory);

    return [
      {
        requestedId: id,
        requestedLabel: label,
        requestedWorktreeTheme: worktreeTheme,
        directory: resolvedDirectory,
        worktreeParentDirectory: resolvedWorktreeParentDirectory,
        priority: index,
      },
    ];
  });
}

function readNotifications(
  value: unknown,
  issues: MeowFlowValidationIssue[],
): NormalizedMeowFlowTeamConfig["notifications"] {
  if (value === undefined) {
    return { target: DEFAULT_NOTIFICATION_TARGET };
  }

  if (!isPlainObject(value)) {
    issues.push({
      path: "notifications",
      message: "expected notifications to be an object",
    });
    return { target: DEFAULT_NOTIFICATION_TARGET };
  }

  if (value.target === undefined) {
    return { target: DEFAULT_NOTIFICATION_TARGET };
  }

  if (!isNotificationTarget(value.target)) {
    issues.push({
      path: "notifications.target",
      message: 'expected one of "android", "browser", or "vscode"',
    });
    return { target: DEFAULT_NOTIFICATION_TARGET };
  }

  return { target: value.target };
}

function readDispatch(
  value: unknown,
  issues: MeowFlowValidationIssue[],
): NormalizedMeowFlowTeamConfig["dispatch"] {
  if (value === undefined) {
    return { maxConcurrentWorkers: null };
  }

  if (!isPlainObject(value)) {
    issues.push({
      path: "dispatch",
      message: "expected dispatch to be an object",
    });
    return { maxConcurrentWorkers: null };
  }

  if (value.maxConcurrentWorkers === undefined) {
    return { maxConcurrentWorkers: null };
  }

  const maxConcurrentWorkers = value.maxConcurrentWorkers;

  if (
    typeof maxConcurrentWorkers !== "number" ||
    !Number.isInteger(maxConcurrentWorkers) ||
    maxConcurrentWorkers <= 0
  ) {
    issues.push({
      path: "dispatch.maxConcurrentWorkers",
      message: "expected a positive integer",
    });
    return { maxConcurrentWorkers: null };
  }

  return { maxConcurrentWorkers };
}

function assignRepositoryIds(
  entries: readonly RepositoryCandidate[],
  issues: MeowFlowValidationIssue[],
): NormalizedMeowFlowRepositoryRoot[] {
  const usedIds = new Set<string>();

  return entries.map((entry, index) => {
    const inferredLabel = entry.requestedLabel ?? inferRepositoryLabel(entry.directory, index);
    const fallbackId = slugify(inferredLabel) || `repository-${index + 1}`;
    const finalId =
      entry.requestedId === null
        ? assignGeneratedId(fallbackId, usedIds)
        : assignExplicitId(entry.requestedId, usedIds, index, issues);

    const worktreeTheme = entry.requestedWorktreeTheme ?? finalId;

    return {
      id: finalId,
      label: inferredLabel,
      directory: entry.directory,
      worktreeParentDirectory: entry.worktreeParentDirectory,
      worktreeTheme,
      priority: entry.priority,
    };
  });
}

function assignExplicitId(
  id: string,
  usedIds: Set<string>,
  index: number,
  issues: MeowFlowValidationIssue[],
): string {
  if (usedIds.has(id)) {
    issues.push({
      path: `repositories[${index}].id`,
      message: `duplicate repository id "${id}"`,
    });
    return id;
  }

  usedIds.add(id);
  return id;
}

function assignGeneratedId(baseId: string, usedIds: Set<string>): string {
  if (!usedIds.has(baseId)) {
    usedIds.add(baseId);
    return baseId;
  }

  let suffix = 2;
  let nextId = `${baseId}-${suffix}`;
  while (usedIds.has(nextId)) {
    suffix += 1;
    nextId = `${baseId}-${suffix}`;
  }

  usedIds.add(nextId);
  return nextId;
}

function inferRepositoryLabel(directory: string, index: number): string {
  const basename = path.basename(directory);
  return basename.length > 0 ? basename : `repository-${index + 1}`;
}

function defaultWorktreeParentDirectory(directory: string): string {
  return path.join(directory, ".paseo", "worktrees");
}

function readOptionalString(
  value: unknown,
  fieldPath: string,
  issues: MeowFlowValidationIssue[],
): string | null {
  if (value === undefined) {
    return null;
  }

  if (typeof value !== "string" || value.trim().length === 0) {
    issues.push({
      path: fieldPath,
      message: "expected a non-empty string",
    });
    return null;
  }

  return value.trim();
}

function readNonEmptyString(
  value: unknown,
  fieldPath: string,
  issues: MeowFlowValidationIssue[],
): string | null {
  if (typeof value !== "string" || value.trim().length === 0) {
    issues.push({
      path: fieldPath,
      message: "expected a non-empty string",
    });
    return null;
  }

  return value.trim();
}

function readOptionalId(
  value: unknown,
  fieldPath: string,
  issues: MeowFlowValidationIssue[],
): string | null {
  const normalized = readOptionalString(value, fieldPath, issues);
  if (normalized === null) {
    return null;
  }

  if (!VALID_ID_PATTERN.test(normalized)) {
    issues.push({
      path: fieldPath,
      message: "expected a lowercase slug containing letters, numbers, and hyphens",
    });
    return null;
  }

  return normalized;
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function isPlainObject(value: unknown): value is Record<string, unknown> & {
  repositories?: unknown;
  notifications?: unknown;
  dispatch?: unknown;
  directory?: unknown;
  id?: unknown;
  label?: unknown;
  worktreeParentDirectory?: unknown;
  worktreeTheme?: unknown;
  target?: unknown;
  maxConcurrentWorkers?: unknown;
} {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNotificationTarget(value: unknown): value is MeowFlowNotificationTarget {
  return typeof value === "string" && NOTIFICATION_TARGETS.has(value as MeowFlowNotificationTarget);
}

function formatValidationMessage(
  configPath: string,
  issues: readonly MeowFlowValidationIssue[],
): string {
  const issueLines = issues.map((issue) => `- ${issue.path}: ${issue.message}`);
  return [`Invalid Meow Flow team config at ${configPath}.`, ...issueLines].join("\n");
}
