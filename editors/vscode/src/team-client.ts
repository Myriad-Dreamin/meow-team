import {
  isAcceptedStreamEvent,
  isBranchDeleteRequiredStreamEvent,
  isCodexEventStreamEvent,
  isErrorStreamEvent,
  isNotificationsResponse,
  isResultStreamEvent,
  isThreadDetailResponse,
  isWorkspaceResponse,
  readErrorMessage,
  type TeamApprovalRequest,
  type TeamFeedbackRequest,
  type TeamRunRequest,
  type TeamRunSummary,
  type TeamNotificationsResponse,
  type TeamThreadDetail,
  type TeamWorkspaceResponse,
} from "./models";

export class TeamApiError extends Error {
  readonly status: number | null;
  readonly guidance: string | null;
  readonly threadId: string | null;
  readonly branches: string[] | null;

  constructor(
    message: string,
    options: {
      status?: number | null;
      guidance?: string | null;
      threadId?: string | null;
      branches?: string[] | null;
    } = {},
  ) {
    super(message);
    this.name = "TeamApiError";
    this.status = options.status ?? null;
    this.guidance = options.guidance ?? null;
    this.threadId = options.threadId ?? null;
    this.branches = options.branches ?? null;
  }
}

export type TeamRunProgressEvent =
  | {
      type: "accepted";
      threadId: string;
      detail: string;
    }
  | {
      type: "log";
      threadId: string;
      detail: string;
    }
  | {
      type: "result";
      threadId: string | null;
      detail: string;
    };

export type TeamRunResult = {
  acceptedThreadId: string | null;
  result: TeamRunSummary;
};

const tryParseJson = (value: string): unknown => {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
};

const normalizeUnknownError = (error: unknown, baseUrl: string): TeamApiError => {
  if (error instanceof TeamApiError) {
    return error;
  }

  const message = error instanceof Error ? error.message : "Unable to reach the meow-team backend.";
  return new TeamApiError(message, {
    guidance: buildConnectionGuidance(baseUrl),
  });
};

export const normalizeBackendBaseUrl = (value: string): string => {
  const trimmed = value.trim();

  if (!trimmed) {
    throw new TeamApiError("The meow-team backend URL is empty.", {
      guidance: "Set `meowTeam.backendBaseUrl` to the Next.js app root and refresh the workspace.",
    });
  }

  let normalized: URL;
  try {
    normalized = new URL(trimmed);
  } catch {
    throw new TeamApiError(`"${trimmed}" is not a valid HTTP base URL.`, {
      guidance: "Use a full URL such as http://127.0.0.1:3000 and refresh the workspace.",
    });
  }

  if (normalized.protocol !== "http:" && normalized.protocol !== "https:") {
    throw new TeamApiError(`"${trimmed}" must use http or https.`, {
      guidance: "Use a full URL such as http://127.0.0.1:3000 and refresh the workspace.",
    });
  }

  const pathname = normalized.pathname.endsWith("/")
    ? normalized.pathname
    : `${normalized.pathname}/`;
  normalized.pathname = pathname;
  normalized.search = "";
  normalized.hash = "";

  return normalized.toString().replace(/\/$/, "");
};

export const buildEndpointUrl = (baseUrl: string, path: string): string => {
  const normalizedBaseUrl = normalizeBackendBaseUrl(baseUrl);
  const relativePath = path.replace(/^\//, "");
  return new URL(relativePath, `${normalizedBaseUrl}/`).toString();
};

export const buildConnectionGuidance = (baseUrl: string): string => {
  return `Make sure the Next.js app is running and that meowTeam.backendBaseUrl points to ${baseUrl}.`;
};

const buildHttpError = async (response: Response, baseUrl: string): Promise<TeamApiError> => {
  const rawPayload = await response.text();
  const payload = tryParseJson(rawPayload);
  const parsedError = readErrorMessage(payload);

  if (parsedError) {
    return new TeamApiError(parsedError, {
      status: response.status,
      guidance: buildConnectionGuidance(baseUrl),
    });
  }

  const trimmedBody = rawPayload.trim();
  if (trimmedBody.startsWith("<!DOCTYPE") || trimmedBody.startsWith("<html")) {
    return new TeamApiError(
      `The backend returned HTML instead of JSON (HTTP ${response.status}).`,
      {
        status: response.status,
        guidance:
          "The Next.js request likely crashed or timed out. Check the backend terminal output and try again.",
      },
    );
  }

  return new TeamApiError(`The backend request failed with HTTP ${response.status}.`, {
    status: response.status,
    guidance: buildConnectionGuidance(baseUrl),
  });
};

const fetchJson = async <T>(
  baseUrl: string,
  path: string,
  init: RequestInit,
  validate: (value: unknown) => value is T,
): Promise<T> => {
  let response: Response;
  try {
    response = await fetch(buildEndpointUrl(baseUrl, path), init);
  } catch (error) {
    throw normalizeUnknownError(error, baseUrl);
  }

  if (!response.ok) {
    throw await buildHttpError(response, baseUrl);
  }

  const rawPayload = await response.text();
  const payload = tryParseJson(rawPayload);

  if (!validate(payload)) {
    throw new TeamApiError(`Unexpected response from ${path}.`, {
      status: response.status,
      guidance: buildConnectionGuidance(baseUrl),
    });
  }

  return payload;
};

const fetchOk = async (baseUrl: string, path: string, init: RequestInit): Promise<void> => {
  let response: Response;
  try {
    response = await fetch(buildEndpointUrl(baseUrl, path), init);
  } catch (error) {
    throw normalizeUnknownError(error, baseUrl);
  }

  if (!response.ok) {
    throw await buildHttpError(response, baseUrl);
  }
};

export const getWorkspace = async (baseUrl: string): Promise<TeamWorkspaceResponse> => {
  return fetchJson(baseUrl, "/api/team/threads", { cache: "no-store" }, isWorkspaceResponse);
};

export const getNotifications = async (baseUrl: string): Promise<TeamNotificationsResponse> => {
  return fetchJson(
    baseUrl,
    "/api/team/notifications",
    { cache: "no-store" },
    isNotificationsResponse,
  );
};

export const getThreadDetail = async (
  baseUrl: string,
  threadId: string,
): Promise<TeamThreadDetail> => {
  const response = await fetchJson(
    baseUrl,
    `/api/team/threads/${encodeURIComponent(threadId)}`,
    {
      cache: "no-store",
    },
    isThreadDetailResponse,
  );

  return response.thread;
};

const parseRunStream = async (
  baseUrl: string,
  response: Response,
  onProgress?: (event: TeamRunProgressEvent) => void,
): Promise<TeamRunResult> => {
  if (!response.body) {
    throw new TeamApiError("The backend did not return a readable stream.", {
      status: response.status,
      guidance: buildConnectionGuidance(baseUrl),
    });
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let acceptedThreadId: string | null = null;
  let result: TeamRunSummary | null = null;
  let buffer = "";

  const handlePayload = (payload: unknown) => {
    if (isAcceptedStreamEvent(payload)) {
      acceptedThreadId = payload.threadId;
      onProgress?.({
        type: "accepted",
        threadId: payload.threadId,
        detail: `Planner accepted the request at ${payload.startedAt}.`,
      });
      return;
    }

    if (isCodexEventStreamEvent(payload)) {
      onProgress?.({
        type: "log",
        threadId: payload.entry.threadId,
        detail: payload.entry.message,
      });
      return;
    }

    if (isResultStreamEvent(payload)) {
      result = payload.result;
      onProgress?.({
        type: "result",
        threadId: payload.result.threadId,
        detail: `Assignment ${payload.result.assignmentNumber} finished.`,
      });
      return;
    }

    if (isBranchDeleteRequiredStreamEvent(payload)) {
      throw new TeamApiError(payload.error, {
        status: response.status,
        guidance:
          payload.branches.length > 0
            ? `Retry with "Delete existing branches" enabled or remove these branches first: ${payload.branches.join(", ")}`
            : buildConnectionGuidance(baseUrl),
        threadId: payload.threadId,
        branches: payload.branches,
      });
    }

    if (isErrorStreamEvent(payload)) {
      throw new TeamApiError(payload.error, {
        status: response.status,
        guidance: buildConnectionGuidance(baseUrl),
        threadId: payload.threadId,
      });
    }
  };

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      buffer += decoder.decode();
      break;
    }

    buffer += decoder.decode(value, { stream: true });

    let newlineIndex = buffer.indexOf("\n");
    while (newlineIndex >= 0) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);

      if (line) {
        handlePayload(tryParseJson(line));
      }

      newlineIndex = buffer.indexOf("\n");
    }
  }

  const trailingLine = buffer.trim();
  if (trailingLine) {
    handlePayload(tryParseJson(trailingLine));
  }

  if (!result) {
    throw new TeamApiError("The team run stream ended before a final result arrived.", {
      status: response.status,
      guidance: buildConnectionGuidance(baseUrl),
      threadId: acceptedThreadId,
    });
  }

  return {
    acceptedThreadId,
    result,
  };
};

export const runTeam = async (
  baseUrl: string,
  payload: TeamRunRequest,
  onProgress?: (event: TeamRunProgressEvent) => void,
): Promise<TeamRunResult> => {
  let response: Response;
  try {
    response = await fetch(buildEndpointUrl(baseUrl, "/api/team/run"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    throw normalizeUnknownError(error, baseUrl);
  }

  if (!response.ok) {
    throw await buildHttpError(response, baseUrl);
  }

  return parseRunStream(baseUrl, response, onProgress);
};

export const approveLane = async (baseUrl: string, payload: TeamApprovalRequest): Promise<void> => {
  await fetchOk(baseUrl, "/api/team/approval", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
};

export const submitFeedback = async (
  baseUrl: string,
  payload: TeamFeedbackRequest,
): Promise<void> => {
  await fetchOk(baseUrl, "/api/team/feedback", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
};
