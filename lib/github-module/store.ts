import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  createDefaultGitHubModuleState,
  isGitHubAchievementMetric,
  isGitHubEventKind,
  isGitHubTaskSource,
  isGitHubTaskStatus,
  type GitHubAchievement,
  type GitHubAchievementDefinition,
  type GitHubEvent,
  type GitHubModuleState,
  type GitHubReplHistoryItem,
  type GitHubTask,
} from "@/lib/github-module/types";

const dataDirectory = path.join(process.cwd(), "data");
const storePath = path.join(dataDirectory, "github-module.json");

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null;
};

const isIsoDate = (value: unknown): value is string => {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
};

const parseGitHubEvent = (value: unknown): GitHubEvent | null => {
  if (!isRecord(value)) {
    return null;
  }

  if (
    typeof value.id !== "string" ||
    typeof value.message !== "string" ||
    !isGitHubEventKind(value.kind) ||
    !isIsoDate(value.createdAt)
  ) {
    return null;
  }

  return {
    id: value.id,
    message: value.message,
    kind: value.kind,
    createdAt: value.createdAt,
  };
};

const parseGitHubTask = (value: unknown): GitHubTask | null => {
  if (!isRecord(value)) {
    return null;
  }

  const taskSource = value.source ?? "github-issue";

  if (
    typeof value.id !== "string" ||
    !isGitHubTaskSource(taskSource) ||
    typeof value.title !== "string" ||
    typeof value.detail !== "string" ||
    !isGitHubTaskStatus(value.status) ||
    !isIsoDate(value.createdAt)
  ) {
    return null;
  }

  if (!(value.completedAt === null || isIsoDate(value.completedAt))) {
    return null;
  }

  return {
    id: value.id,
    source: taskSource,
    title: value.title,
    detail: value.detail,
    status: value.status,
    createdAt: value.createdAt,
    completedAt: value.completedAt,
  };
};

const parseAchievementDefinition = (value: unknown): GitHubAchievementDefinition | null => {
  if (!isRecord(value)) {
    return null;
  }

  if (
    typeof value.id !== "string" ||
    typeof value.title !== "string" ||
    typeof value.detail !== "string" ||
    !isGitHubAchievementMetric(value.metric) ||
    typeof value.target !== "number" ||
    !Number.isInteger(value.target) ||
    value.target < 1 ||
    !isIsoDate(value.createdAt)
  ) {
    return null;
  }

  return {
    id: value.id,
    title: value.title,
    detail: value.detail,
    metric: value.metric,
    target: value.target,
    createdAt: value.createdAt,
  };
};

const parseAchievement = (value: unknown): GitHubAchievement | null => {
  if (!isRecord(value)) {
    return null;
  }

  const definition = parseAchievementDefinition(value);
  if (!definition) {
    return null;
  }

  if (
    typeof value.progress !== "number" ||
    !Number.isInteger(value.progress) ||
    value.progress < 0 ||
    typeof value.unlocked !== "boolean" ||
    !(value.unlockedAt === null || isIsoDate(value.unlockedAt))
  ) {
    return null;
  }

  return {
    ...definition,
    progress: value.progress,
    unlocked: value.unlocked,
    unlockedAt: value.unlockedAt,
  };
};

const parseReplHistoryItem = (value: unknown): GitHubReplHistoryItem | null => {
  if (!isRecord(value)) {
    return null;
  }

  if (
    typeof value.id !== "string" ||
    typeof value.input !== "string" ||
    !Array.isArray(value.output) ||
    !value.output.every((line) => typeof line === "string") ||
    typeof value.success !== "boolean" ||
    !isIsoDate(value.createdAt)
  ) {
    return null;
  }

  return {
    id: value.id,
    input: value.input,
    output: value.output,
    success: value.success,
    createdAt: value.createdAt,
  };
};

const parseList = <T>(value: unknown, parser: (item: unknown) => T | null): T[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map(parser).filter((item): item is T => item !== null);
};

const normalizeGitHubModuleState = (value: unknown): GitHubModuleState => {
  const fallback = createDefaultGitHubModuleState();
  if (!isRecord(value)) {
    return fallback;
  }

  const events = parseList(value.events, parseGitHubEvent);
  const tasks = parseList(value.tasks, parseGitHubTask);
  const achievementDefinitions = parseList(
    value.achievementDefinitions,
    parseAchievementDefinition,
  );
  const achievements = parseList(value.achievements, parseAchievement);
  const replHistory = parseList(value.replHistory, parseReplHistoryItem);

  return {
    events,
    tasks,
    achievementDefinitions:
      achievementDefinitions.length > 0 ? achievementDefinitions : fallback.achievementDefinitions,
    achievements,
    replHistory,
  };
};

export const readGitHubModuleState = async (): Promise<GitHubModuleState> => {
  try {
    const raw = await readFile(storePath, "utf8");
    return normalizeGitHubModuleState(JSON.parse(raw) as unknown);
  } catch {
    return createDefaultGitHubModuleState();
  }
};

export const writeGitHubModuleState = async (
  state: GitHubModuleState,
): Promise<GitHubModuleState> => {
  await mkdir(dataDirectory, { recursive: true });
  await writeFile(storePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  return state;
};
