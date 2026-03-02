import type { GitHubEvent, GitHubEventKind } from "@/lib/github-module/types";

export type GitHubUserEvent = {
  id: string;
  type: string;
  repoName: string;
  actorLogin: string;
  createdAt: string;
  isPublic: boolean;
};

export type FetchGitHubUserEventsInput = {
  username: string;
  token: string;
  limit?: number;
  fetchImpl?: typeof fetch;
};

export type FetchGitHubUserEventsPageInput = {
  username: string;
  token: string;
  page?: number;
  perPage?: number;
  ifNoneMatch?: string;
  fetchImpl?: typeof fetch;
};

export type FetchGitHubUserEventsPageResult =
  | {
      status: "ok";
      events: GitHubUserEvent[];
      etag: string | null;
    }
  | {
      status: "not-modified";
      events: [];
      etag: string | null;
    };

const DEFAULT_FETCH_LIMIT = 30;
const DEFAULT_PAGE = 1;
const MAX_FETCH_LIMIT = 100;
const MAX_EVENT_MESSAGE_LENGTH = 240;

const notificationEventTypes = new Set<string>([
  "CommitCommentEvent",
  "DiscussionCommentEvent",
  "ForkEvent",
  "IssueCommentEvent",
  "IssuesEvent",
  "PullRequestEvent",
  "PullRequestReviewCommentEvent",
  "PullRequestReviewEvent",
  "ReleaseEvent",
  "WatchEvent",
]);

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null;
};

const assertNonEmpty = (value: string, field: string): string => {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${field} is required.`);
  }
  return trimmed;
};

const clampLimit = (limit: number | undefined): number => {
  if (!Number.isInteger(limit)) {
    return DEFAULT_FETCH_LIMIT;
  }

  const numericLimit = limit as number;
  if (numericLimit < 1) {
    return 1;
  }

  if (numericLimit > MAX_FETCH_LIMIT) {
    return MAX_FETCH_LIMIT;
  }

  return numericLimit;
};

const clampPage = (page: number | undefined): number => {
  if (!Number.isInteger(page)) {
    return DEFAULT_PAGE;
  }

  const numericPage = page as number;
  if (numericPage < 1) {
    return DEFAULT_PAGE;
  }

  return numericPage;
};

const parseApiMessage = (payload: unknown): string | null => {
  if (!isRecord(payload)) {
    return null;
  }

  return typeof payload.message === "string" ? payload.message : null;
};

const parseGitHubUserEvent = (value: unknown): GitHubUserEvent | null => {
  if (!isRecord(value)) {
    return null;
  }

  const repoName =
    isRecord(value.repo) && typeof value.repo.name === "string" ? value.repo.name : null;
  const actorLogin =
    isRecord(value.actor) && typeof value.actor.login === "string" ? value.actor.login : null;

  if (
    typeof value.id !== "string" ||
    typeof value.type !== "string" ||
    repoName === null ||
    actorLogin === null ||
    typeof value.public !== "boolean" ||
    typeof value.created_at !== "string"
  ) {
    return null;
  }

  const parsedCreatedAt = Date.parse(value.created_at);
  if (!Number.isFinite(parsedCreatedAt)) {
    return null;
  }

  return {
    id: value.id,
    type: value.type,
    repoName,
    actorLogin,
    createdAt: new Date(parsedCreatedAt).toISOString(),
    isPublic: value.public,
  };
};

const prettifyEventType = (eventType: string): string => {
  const withoutSuffix = eventType.endsWith("Event") ? eventType.slice(0, -5) : eventType;
  return withoutSuffix.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
};

const trimToMaxLength = (value: string, maxLength: number): string => {
  if (value.length <= maxLength) {
    return value;
  }

  if (maxLength <= 3) {
    return value.slice(0, maxLength);
  }

  return `${value.slice(0, maxLength - 3)}...`;
};

const resolveEventKind = (eventType: string): GitHubEventKind => {
  return notificationEventTypes.has(eventType) ? "notification" : "standard";
};

export const fetchGitHubUserEvents = async (
  input: FetchGitHubUserEventsInput,
): Promise<GitHubUserEvent[]> => {
  const pageResult = await fetchGitHubUserEventsPage({
    username: input.username,
    token: input.token,
    perPage: input.limit,
    page: DEFAULT_PAGE,
    fetchImpl: input.fetchImpl,
  });

  if (pageResult.status === "not-modified") {
    return [];
  }

  return pageResult.events;
};

export const fetchGitHubUserEventsPage = async (
  input: FetchGitHubUserEventsPageInput,
): Promise<FetchGitHubUserEventsPageResult> => {
  const username = assertNonEmpty(input.username, "GitHub username");
  const token = assertNonEmpty(input.token, "GitHub token");
  const perPage = clampLimit(input.perPage);
  const page = clampPage(input.page);
  const ifNoneMatch = input.ifNoneMatch?.trim();
  const fetchImpl = input.fetchImpl ?? fetch;

  const endpoint = `https://api.github.com/users/${encodeURIComponent(username)}/events/public?per_page=${perPage}&page=${page}`;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "earth-online-launcher",
  };
  if (ifNoneMatch) {
    headers["If-None-Match"] = ifNoneMatch;
  }

  const response = await fetchImpl(endpoint, {
    method: "GET",
    headers,
  });
  const etag = response.headers.get("etag");

  if (response.status === 304) {
    return {
      status: "not-modified",
      events: [],
      etag,
    };
  }

  let body: unknown = null;
  try {
    body = (await response.json()) as unknown;
  } catch {
    body = null;
  }

  if (!response.ok) {
    const apiMessage = parseApiMessage(body);
    const reason = apiMessage ? ` ${apiMessage}` : "";
    throw new Error(
      `GitHub events request failed with status ${response.status} ${response.statusText}.${reason}`.trim(),
    );
  }

  if (!Array.isArray(body)) {
    throw new Error("GitHub events request returned an unexpected payload.");
  }

  return {
    status: "ok",
    events: body
      .map(parseGitHubUserEvent)
      .filter((event): event is GitHubUserEvent => event !== null),
    etag,
  };
};

export const formatGitHubUserEventMessage = (event: GitHubUserEvent): string => {
  const eventType = prettifyEventType(event.type);
  const visibilityLabel = event.isPublic ? "public" : "private";
  return trimToMaxLength(
    `${event.actorLogin} triggered ${eventType} in ${event.repoName} (${visibilityLabel}).`,
    MAX_EVENT_MESSAGE_LENGTH,
  );
};

export const mapGitHubUserEventToMockEvent = (event: GitHubUserEvent): GitHubEvent => {
  return {
    id: `gh-${event.id}`,
    message: formatGitHubUserEventMessage(event),
    kind: resolveEventKind(event.type),
    createdAt: event.createdAt,
  };
};

export const mapGitHubUserEventsToMockEvents = (events: GitHubUserEvent[]): GitHubEvent[] => {
  return events.map(mapGitHubUserEventToMockEvent);
};
