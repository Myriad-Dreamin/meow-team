import { randomUUID } from "node:crypto";
import {
  isGitHubAchievementMetric,
  isGitHubEventKind,
  isGitHubTaskStatus,
  type GitHubAchievement,
  type GitHubAchievementDefinition,
  type GitHubAchievementMetric,
  type GitHubEvent,
  type GitHubEventKind,
  type GitHubModuleState,
  type GitHubReplHistoryItem,
  type GitHubTask,
  type GitHubTaskStatus,
} from "@/lib/github-module/types";
import { readGitHubModuleState, writeGitHubModuleState } from "@/lib/github-module/store";

const MAX_EVENTS = 240;
const MAX_TASKS = 200;
const MAX_REPL_HISTORY = 80;
const MAX_REPL_OUTPUT_LINES = 30;

export class GitHubModuleValidationError extends Error {}
export class GitHubModuleNotFoundError extends Error {}

export type AddGitHubEventInput = {
  message: string;
  kind?: unknown;
};

export type AddGitHubTaskInput = {
  title: string;
  detail?: string;
};

export type UpdateGitHubTaskInput = {
  status: unknown;
};

export type AddGitHubAchievementDefinitionInput = {
  id?: string;
  title: string;
  detail: string;
  metric: unknown;
  target: unknown;
};

export type GitHubReplCompletion = {
  value: string;
  description: string;
};

export type GitHubReplCommandResult = {
  success: boolean;
  output: string[];
  state: GitHubModuleState;
};

type MutationResult<T> = {
  state: GitHubModuleState;
  result: T;
};

const commandCatalog: GitHubReplCompletion[] = [
  { value: "help", description: "Show available REPL commands." },
  { value: "state", description: "Print a compact module summary." },
  { value: "event add ", description: "Add a standard event to the stream." },
  { value: "event add --notification ", description: "Add a notification event." },
  { value: "event notify ", description: "Shortcut for notification events." },
  { value: "event list", description: "List the latest events." },
  {
    value: "task add ",
    description: "Add a GitHub issue task. Use `::` to include detail text.",
  },
  { value: "task list", description: "List issue tasks and their status." },
  { value: "task done ", description: "Mark a GitHub issue task as done by task id." },
  { value: "achievement list", description: "List achievements and progress." },
  {
    value: "achievement add events 3 ",
    description: "Create an achievement based on total events.",
  },
  {
    value: "achievement add notificationEvents 1 ",
    description: "Create an achievement based on notification events.",
  },
  {
    value: "achievement add completedTasks 2 ",
    description: "Create an achievement based on completed tasks.",
  },
];

const takeTail = <T>(list: T[], limit: number): T[] => {
  if (list.length <= limit) {
    return list;
  }

  return list.slice(list.length - limit);
};

const assertNonEmpty = (value: string, field: string): string => {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new GitHubModuleValidationError(`${field} is required.`);
  }
  return trimmed;
};

const assertMaxLength = (value: string, field: string, maxLength: number): string => {
  if (value.length > maxLength) {
    throw new GitHubModuleValidationError(`${field} exceeds max length ${maxLength}.`);
  }
  return value;
};

const buildDefinitionId = (value: string): string => {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized.slice(0, 48);
};

const collectMetricCount = (
  state: GitHubModuleState,
): Record<GitHubAchievementMetric, number> => {
  return {
    events: state.events.length,
    notificationEvents: state.events.filter((event) => event.kind === "notification").length,
    completedTasks: state.tasks.filter((task) => task.status === "done").length,
  };
};

const refreshAchievements = (state: GitHubModuleState, now: string): GitHubModuleState => {
  const metricCount = collectMetricCount(state);
  const previousUnlockMap = new Map<string, GitHubAchievement["unlockedAt"]>(
    state.achievements.map((achievement) => [achievement.id, achievement.unlockedAt]),
  );

  const achievements = state.achievementDefinitions.map((definition) => {
    const currentMetric = metricCount[definition.metric];
    const progress = Math.min(definition.target, currentMetric);
    const unlocked = currentMetric >= definition.target;
    const previousUnlockedAt = previousUnlockMap.get(definition.id) ?? null;

    return {
      ...definition,
      progress,
      unlocked,
      unlockedAt: unlocked ? previousUnlockedAt ?? now : null,
    };
  });

  return {
    ...state,
    achievements,
  };
};

const areAchievementsEqual = (
  left: GitHubAchievement[],
  right: GitHubAchievement[],
): boolean => {
  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    const a = left[index];
    const b = right[index];
    if (
      a.id !== b.id ||
      a.progress !== b.progress ||
      a.unlocked !== b.unlocked ||
      a.unlockedAt !== b.unlockedAt
    ) {
      return false;
    }
  }

  return true;
};

const applyMutation = async <T>(
  mutate: (state: GitHubModuleState, now: string) => MutationResult<T>,
): Promise<MutationResult<T>> => {
  const now = new Date().toISOString();
  const currentState = await readGitHubModuleState();
  const { state: mutatedState, result } = mutate(currentState, now);
  const nextState = refreshAchievements(mutatedState, now);
  await writeGitHubModuleState(nextState);
  return { state: nextState, result };
};

const appendReplHistory = async (
  input: string,
  output: string[],
  success: boolean,
): Promise<GitHubModuleState> => {
  const boundedOutput = output.slice(0, MAX_REPL_OUTPUT_LINES);
  const { state } = await applyMutation<void>((currentState, now) => {
    const entry: GitHubReplHistoryItem = {
      id: randomUUID(),
      input,
      output: boundedOutput,
      success,
      createdAt: now,
    };

    return {
      state: {
        ...currentState,
        replHistory: takeTail([...currentState.replHistory, entry], MAX_REPL_HISTORY),
      },
      result: undefined,
    };
  });

  return state;
};

const parseTitleAndDetail = (value: string): { title: string; detail: string } => {
  const [titlePart, ...detailParts] = value.split("::");
  return {
    title: titlePart.trim(),
    detail: detailParts.join("::").trim(),
  };
};

const formatSummaryLines = (state: GitHubModuleState): string[] => {
  const completedTasks = state.tasks.filter((task) => task.status === "done").length;
  const unlockedAchievements = state.achievements.filter((achievement) => achievement.unlocked).length;

  return [
    `Events: ${state.events.length} (notification: ${state.events.filter((event) => event.kind === "notification").length})`,
    `Tasks: ${state.tasks.length} (completed: ${completedTasks})`,
    `Achievements: ${unlockedAchievements}/${state.achievements.length} unlocked`,
    `REPL history: ${state.replHistory.length} records`,
  ];
};

export const getGitHubModuleState = async (): Promise<GitHubModuleState> => {
  const now = new Date().toISOString();
  const state = await readGitHubModuleState();
  const refreshed = refreshAchievements(state, now);

  if (!areAchievementsEqual(state.achievements, refreshed.achievements)) {
    await writeGitHubModuleState(refreshed);
  }

  return refreshed;
};

export const addGitHubEvent = async (
  input: AddGitHubEventInput,
): Promise<{ state: GitHubModuleState; event: GitHubEvent }> => {
  const message = assertMaxLength(assertNonEmpty(input.message, "Event message"), "Event message", 240);
  const rawKind = input.kind ?? "standard";
  if (!isGitHubEventKind(rawKind)) {
    throw new GitHubModuleValidationError("Invalid event kind.");
  }
  const kind: GitHubEventKind = rawKind;

  const { state, result } = await applyMutation<GitHubEvent>((currentState, now) => {
    const event: GitHubEvent = {
      id: randomUUID(),
      message,
      kind,
      createdAt: now,
    };

    return {
      state: {
        ...currentState,
        events: takeTail([...currentState.events, event], MAX_EVENTS),
      },
      result: event,
    };
  });

  return { state, event: result };
};

export const addGitHubTask = async (
  input: AddGitHubTaskInput,
): Promise<{ state: GitHubModuleState; task: GitHubTask }> => {
  const title = assertMaxLength(assertNonEmpty(input.title, "Task title"), "Task title", 120);
  const detail = assertMaxLength((input.detail ?? "").trim(), "Task detail", 400);

  const { state, result } = await applyMutation<GitHubTask>((currentState, now) => {
    const task: GitHubTask = {
      id: randomUUID(),
      source: "github-issue",
      title,
      detail,
      status: "todo",
      createdAt: now,
      completedAt: null,
    };

    return {
      state: {
        ...currentState,
        tasks: takeTail([...currentState.tasks, task], MAX_TASKS),
      },
      result: task,
    };
  });

  return { state, task: result };
};

export const updateGitHubTask = async (
  taskId: string,
  input: UpdateGitHubTaskInput,
): Promise<{ state: GitHubModuleState; task: GitHubTask }> => {
  const normalizedTaskId = assertNonEmpty(taskId, "Task id");
  if (!isGitHubTaskStatus(input.status)) {
    throw new GitHubModuleValidationError("Invalid task status.");
  }
  const nextStatus: GitHubTaskStatus = input.status;

  const { state, result } = await applyMutation<GitHubTask>((currentState, now) => {
    const taskIndex = currentState.tasks.findIndex((task) => task.id === normalizedTaskId);
    if (taskIndex < 0) {
      throw new GitHubModuleNotFoundError(`Task '${normalizedTaskId}' was not found.`);
    }

    const currentTask = currentState.tasks[taskIndex];
    const completedAt = nextStatus === "done" ? currentTask.completedAt ?? now : null;

    const nextTask: GitHubTask = {
      ...currentTask,
      status: nextStatus,
      completedAt,
    };

    const nextTasks = [...currentState.tasks];
    nextTasks[taskIndex] = nextTask;

    let nextEvents = currentState.events;
    if (currentTask.status !== "done" && nextStatus === "done") {
      nextEvents = takeTail(
        [
          ...currentState.events,
          {
            id: randomUUID(),
            message: `GitHub issue task completed: ${nextTask.title}`,
            kind: "standard",
            createdAt: now,
          },
        ],
        MAX_EVENTS,
      );
    }

    return {
      state: {
        ...currentState,
        tasks: nextTasks,
        events: nextEvents,
      },
      result: nextTask,
    };
  });

  return { state, task: result };
};

export const addGitHubAchievementDefinition = async (
  input: AddGitHubAchievementDefinitionInput,
): Promise<{ state: GitHubModuleState; achievementDefinition: GitHubAchievementDefinition }> => {
  const title = assertMaxLength(
    assertNonEmpty(input.title, "Achievement title"),
    "Achievement title",
    120,
  );
  const detail = assertMaxLength(
    assertNonEmpty(input.detail, "Achievement detail"),
    "Achievement detail",
    260,
  );

  if (!isGitHubAchievementMetric(input.metric)) {
    throw new GitHubModuleValidationError("Invalid achievement metric.");
  }
  const metric: GitHubAchievementMetric = input.metric;

  if (!Number.isInteger(input.target)) {
    throw new GitHubModuleValidationError("Achievement target must be an integer greater than zero.");
  }
  const target = input.target as number;
  if (target < 1) {
    throw new GitHubModuleValidationError("Achievement target must be an integer greater than zero.");
  }

  const { state, result } = await applyMutation<GitHubAchievementDefinition>((currentState, now) => {
    const requestedId = input.id?.trim();
    const baseId = buildDefinitionId(requestedId ?? title);
    if (!baseId) {
      throw new GitHubModuleValidationError("Achievement id is invalid.");
    }

    let definitionId = baseId;
    if (requestedId) {
      const alreadyExists = currentState.achievementDefinitions.some((item) => item.id === definitionId);
      if (alreadyExists) {
        throw new GitHubModuleValidationError(`Achievement id '${definitionId}' already exists.`);
      }
    } else {
      let suffix = 2;
      while (currentState.achievementDefinitions.some((item) => item.id === definitionId)) {
        definitionId = `${baseId}-${suffix}`;
        suffix += 1;
      }
    }

    const definition: GitHubAchievementDefinition = {
      id: definitionId,
      title,
      detail,
      metric,
      target,
      createdAt: now,
    };

    return {
      state: {
        ...currentState,
        achievementDefinitions: [...currentState.achievementDefinitions, definition],
      },
      result: definition,
    };
  });

  return { state, achievementDefinition: result };
};

export const completeGitHubReplInput = async (input: string): Promise<GitHubReplCompletion[]> => {
  const query = input.trimStart();
  const state = await getGitHubModuleState();

  const taskDoneMatch = query.match(/^task\s+done(?:\s+([a-z0-9-]*))?$/i);
  if (taskDoneMatch) {
    const prefix = (taskDoneMatch[1] ?? "").toLowerCase();
    return state.tasks
      .filter((task) => task.status !== "done")
      .filter((task) => task.id.toLowerCase().startsWith(prefix))
      .slice(0, 10)
      .map((task) => ({
        value: `task done ${task.id}`,
        description: `Mark task "${task.title}" as done.`,
      }));
  }

  if (!query) {
    return commandCatalog.slice(0, 10);
  }

  const lowerQuery = query.toLowerCase();
  return commandCatalog
    .filter((command) => command.value.toLowerCase().startsWith(lowerQuery))
    .slice(0, 10);
};

export const executeGitHubReplCommand = async (
  rawInput: string,
): Promise<GitHubReplCommandResult> => {
  const input = rawInput.trim();

  if (!input) {
    const state = await appendReplHistory(rawInput, ["Command is empty."], false);
    return {
      success: false,
      output: ["Command is empty."],
      state,
    };
  }

  try {
    const lowerInput = input.toLowerCase();
    let output: string[] = [];
    let success = true;
    let state = await getGitHubModuleState();

    if (lowerInput === "help") {
      output = commandCatalog.map((command) => `${command.value} - ${command.description}`);
    } else if (lowerInput === "state") {
      output = formatSummaryLines(state);
    } else if (lowerInput === "task list") {
      output =
        state.tasks.length === 0
          ? ["No GitHub issue tasks available."]
          : state.tasks.map((task) => {
              const detailPart = task.detail ? ` | ${task.detail}` : "";
              return `${task.id} | ${task.source} | ${task.status.toUpperCase()} | ${task.title}${detailPart}`;
            });
    } else if (lowerInput === "achievement list") {
      output = state.achievements.map((achievement) => {
        const status = achievement.unlocked ? "Unlocked" : "Locked";
        return `${achievement.id} | ${status} | ${achievement.progress}/${achievement.target} | ${achievement.title}`;
      });
    } else if (lowerInput === "event list" || /^event\s+list\s+\d+$/i.test(input)) {
      const countMatch = input.match(/^event\s+list\s+(\d+)$/i);
      const count = countMatch ? Number.parseInt(countMatch[1], 10) : 10;
      const safeCount = Math.min(Math.max(count, 1), 50);
      const events = state.events.slice(-safeCount);
      output =
        events.length === 0
          ? ["No events available."]
          : events.map((event) => `${event.createdAt} | ${event.kind} | ${event.message}`);
    } else {
      const eventAddMatch = input.match(/^event\s+add\s+(--notification\s+)?(.+)$/i);
      const eventNotifyMatch = input.match(/^event\s+notify\s+(.+)$/i);
      const taskAddMatch = input.match(/^task\s+add\s+(.+)$/i);
      const taskDoneMatch = input.match(/^task\s+done\s+([a-z0-9-]+)$/i);
      const achievementAddMatch = input.match(
        /^achievement\s+add\s+(events|notificationEvents|completedTasks)\s+(\d+)\s+(.+)$/i,
      );

      if (eventAddMatch) {
        const eventKind: GitHubEventKind = eventAddMatch[1] ? "notification" : "standard";
        const { event, state: nextState } = await addGitHubEvent({
          message: eventAddMatch[2],
          kind: eventKind,
        });
        state = nextState;
        output = [`Event created: ${event.id}`, `Kind: ${event.kind}`, `Message: ${event.message}`];
      } else if (eventNotifyMatch) {
        const { event, state: nextState } = await addGitHubEvent({
          message: eventNotifyMatch[1],
          kind: "notification",
        });
        state = nextState;
        output = [`Event created: ${event.id}`, `Kind: ${event.kind}`, `Message: ${event.message}`];
      } else if (taskAddMatch) {
        const { title, detail } = parseTitleAndDetail(taskAddMatch[1]);
        const { task, state: nextState } = await addGitHubTask({ title, detail });
        state = nextState;
        output = [`Task created: ${task.id}`, `Title: ${task.title}`];
      } else if (taskDoneMatch) {
        const { task, state: nextState } = await updateGitHubTask(taskDoneMatch[1], {
          status: "done",
        });
        state = nextState;
        output = [`Task completed: ${task.id}`, `Title: ${task.title}`];
      } else if (achievementAddMatch) {
        const metricValue = achievementAddMatch[1];
        const target = Number.parseInt(achievementAddMatch[2], 10);
        const { title, detail } = parseTitleAndDetail(achievementAddMatch[3]);
        const metricMap: Record<string, GitHubAchievementMetric> = {
          events: "events",
          notificationevents: "notificationEvents",
          completedtasks: "completedTasks",
        };
        const metric = metricMap[metricValue.toLowerCase()];
        if (!metric || !isGitHubAchievementMetric(metric)) {
          throw new GitHubModuleValidationError("Invalid achievement metric.");
        }

        const { achievementDefinition, state: nextState } = await addGitHubAchievementDefinition({
          title,
          detail: detail || "Custom achievement from REPL.",
          metric,
          target,
        });
        state = nextState;
        output = [
          `Achievement definition created: ${achievementDefinition.id}`,
          `Metric: ${achievementDefinition.metric}`,
          `Target: ${achievementDefinition.target}`,
        ];
      } else {
        success = false;
        output = ["Unknown command. Run `help` to see available commands."];
      }
    }

    const stateWithHistory = await appendReplHistory(input, output, success);
    return {
      success,
      output,
      state: stateWithHistory,
    };
  } catch (error) {
    const output = [error instanceof Error ? error.message : "Command execution failed."];
    const state = await appendReplHistory(input, output, false);
    return {
      success: false,
      output,
      state,
    };
  }
};
