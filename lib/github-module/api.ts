import { NextResponse } from "next/server";
import {
  readGitHubEventsFromSqlite,
  syncGitHubEventsToSqlite,
  type SyncGitHubEventsToSqliteResult,
} from "@/lib/github-module/events-sqlite";
import {
  addGitHubAchievementDefinition,
  addGitHubEvent,
  addGitHubTask,
  completeGitHubReplInput,
  executeGitHubReplCommand,
  getGitHubModuleState,
  GitHubModuleNotFoundError,
  GitHubModuleValidationError,
  updateGitHubTask,
} from "@/lib/github-module/service";

export type GitHubTaskRouteContext = {
  params: Promise<{ taskId: string }>;
};

type EventsRequestBody = { message?: unknown; kind?: unknown };
type TasksRequestBody = { title?: unknown; detail?: unknown };
type TaskPatchRequestBody = { status?: unknown };
type AchievementsRequestBody = {
  id?: unknown;
  title?: unknown;
  detail?: unknown;
  metric?: unknown;
  target?: unknown;
};
type ReplRequestBody = {
  action?: unknown;
  input?: unknown;
};

const DEFAULT_GITHUB_EVENTS_USERNAME = "Myriad-Dreamin";
const DEFAULT_GITHUB_EVENTS_READ_LIMIT = 240;
const DEFAULT_GITHUB_EVENTS_SYNC_INTERVAL_MINUTES = 15;
const DEFAULT_GITHUB_EVENTS_SYNC_PER_PAGE = 100;
const DEFAULT_GITHUB_EVENTS_SYNC_MAX_PAGES = 10;

const parseJsonBody = async <T extends Record<string, unknown>>(request: Request): Promise<T> => {
  try {
    return (await request.json()) as T;
  } catch {
    return {} as T;
  }
};

const toCommonErrorResponse = (error: unknown, defaultMessage: string) => {
  if (error instanceof GitHubModuleValidationError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (error instanceof GitHubModuleNotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }

  return NextResponse.json({ error: defaultMessage }, { status: 500 });
};

const parsePositiveInteger = (value: string | undefined, fallback: number): number => {
  if (typeof value !== "string") {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return fallback;
  }

  return parsed;
};

const resolveGitHubEventsConfig = (): {
  username: string;
  token: string | null;
  readLimit: number;
  syncIntervalMs: number;
  syncPerPage: number;
  syncMaxPages: number;
} => {
  const envUsername = process.env.GITHUB_EVENTS_USERNAME?.trim();
  const username = envUsername || DEFAULT_GITHUB_EVENTS_USERNAME;
  const token = process.env.GITHUB_PAT?.trim() || null;

  const readLimit = parsePositiveInteger(
    process.env.GITHUB_EVENTS_RESPONSE_LIMIT,
    DEFAULT_GITHUB_EVENTS_READ_LIMIT,
  );
  const syncIntervalMinutes = parsePositiveInteger(
    process.env.GITHUB_EVENTS_SYNC_INTERVAL_MINUTES,
    DEFAULT_GITHUB_EVENTS_SYNC_INTERVAL_MINUTES,
  );
  const syncPerPage = parsePositiveInteger(
    process.env.GITHUB_EVENTS_SYNC_PER_PAGE,
    DEFAULT_GITHUB_EVENTS_SYNC_PER_PAGE,
  );
  const syncMaxPages = parsePositiveInteger(
    process.env.GITHUB_EVENTS_SYNC_MAX_PAGES,
    DEFAULT_GITHUB_EVENTS_SYNC_MAX_PAGES,
  );

  return {
    username,
    token,
    readLimit,
    syncIntervalMs: syncIntervalMinutes * 60 * 1000,
    syncPerPage,
    syncMaxPages,
  };
};

export async function handleGitHubStateGet() {
  try {
    const state = await getGitHubModuleState();
    return NextResponse.json(state);
  } catch {
    return NextResponse.json({ error: "Failed to read GitHub module state." }, { status: 500 });
  }
}

export async function handleGitHubEventsGet() {
  try {
    const config = resolveGitHubEventsConfig();

    let sync: SyncGitHubEventsToSqliteResult | null = null;
    let syncError: string | null = null;

    if (config.token) {
      try {
        sync = await syncGitHubEventsToSqlite({
          username: config.username,
          token: config.token,
          minIntervalMs: config.syncIntervalMs,
          perPage: config.syncPerPage,
          maxPages: config.syncMaxPages,
        });
      } catch (error) {
        syncError = error instanceof Error ? error.message : "GitHub sync failed.";
      }
    }

    const events = await readGitHubEventsFromSqlite({
      username: config.username,
      limit: config.readLimit,
    });

    return NextResponse.json({
      source: "sqlite",
      username: config.username,
      events,
      sync,
      syncError,
    });
  } catch {
    return NextResponse.json({ error: "Failed to read events." }, { status: 500 });
  }
}

export async function handleGitHubEventsPost(request: Request) {
  try {
    const body = await parseJsonBody<EventsRequestBody>(request);
    const message = typeof body.message === "string" ? body.message : "";
    const kind = typeof body.kind === "string" ? body.kind : undefined;

    const { event, state } = await addGitHubEvent({
      message,
      kind,
    });

    return NextResponse.json({ event, state }, { status: 201 });
  } catch (error) {
    return toCommonErrorResponse(error, "Failed to process events request.");
  }
}

export async function handleGitHubTasksGet() {
  try {
    const state = await getGitHubModuleState();
    return NextResponse.json({
      tasks: state.tasks,
      achievements: state.achievements,
    });
  } catch {
    return NextResponse.json({ error: "Failed to read tasks." }, { status: 500 });
  }
}

export async function handleGitHubTasksPost(request: Request) {
  try {
    const body = await parseJsonBody<TasksRequestBody>(request);
    const title = typeof body.title === "string" ? body.title : "";
    const detail = typeof body.detail === "string" ? body.detail : "";

    const { task, state } = await addGitHubTask({
      title,
      detail,
    });

    return NextResponse.json({ task, state }, { status: 201 });
  } catch (error) {
    return toCommonErrorResponse(error, "Failed to process tasks request.");
  }
}

export async function handleGitHubTaskPatch(request: Request, context: GitHubTaskRouteContext) {
  try {
    const body = await parseJsonBody<TaskPatchRequestBody>(request);
    const status = typeof body.status === "string" ? body.status : "";
    const { taskId } = await context.params;

    const { task, state } = await updateGitHubTask(taskId, { status });
    return NextResponse.json({ task, state });
  } catch (error) {
    return toCommonErrorResponse(error, "Failed to update task.");
  }
}

export async function handleGitHubAchievementsGet() {
  try {
    const state = await getGitHubModuleState();
    return NextResponse.json({
      achievementDefinitions: state.achievementDefinitions,
      achievements: state.achievements,
    });
  } catch {
    return NextResponse.json({ error: "Failed to read achievements." }, { status: 500 });
  }
}

export async function handleGitHubAchievementsPost(request: Request) {
  try {
    const body = await parseJsonBody<AchievementsRequestBody>(request);
    const id = typeof body.id === "string" ? body.id : undefined;
    const title = typeof body.title === "string" ? body.title : "";
    const detail = typeof body.detail === "string" ? body.detail : "";
    const metric = body.metric;
    const target =
      typeof body.target === "number"
        ? body.target
        : typeof body.target === "string"
          ? Number.parseInt(body.target, 10)
          : Number.NaN;

    const { achievementDefinition, state } = await addGitHubAchievementDefinition({
      id,
      title,
      detail,
      metric,
      target,
    });

    return NextResponse.json({ achievementDefinition, state }, { status: 201 });
  } catch (error) {
    return toCommonErrorResponse(error, "Failed to process achievements request.");
  }
}

export async function handleGitHubReplPost(request: Request) {
  try {
    const body = await parseJsonBody<ReplRequestBody>(request);
    const action = typeof body.action === "string" ? body.action : "";
    const input = typeof body.input === "string" ? body.input : "";

    if (action === "complete") {
      const completions = await completeGitHubReplInput(input);
      return NextResponse.json({ completions });
    }

    if (action === "execute") {
      const result = await executeGitHubReplCommand(input);
      return NextResponse.json(result);
    }

    return NextResponse.json(
      { error: "Invalid action. Use 'execute' or 'complete'." },
      { status: 400 },
    );
  } catch (error) {
    return toCommonErrorResponse(error, "Failed to process REPL request.");
  }
}
