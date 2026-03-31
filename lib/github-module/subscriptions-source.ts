export type GitHubUserSubscription = {
  id: number;
  name: string;
  fullName: string;
  ownerLogin: string;
  description: string | null;
  htmlUrl: string;
  language: string | null;
  stargazersCount: number;
  watchersCount: number;
  forksCount: number;
  openIssuesCount: number;
  isPrivate: boolean;
  updatedAt: string;
  pushedAt: string | null;
};

export type FetchGitHubUserSubscriptionsInput = {
  username: string;
  token: string;
  limit?: number;
  fetchImpl?: typeof fetch;
};

export type ReadGitHubUserSubscriptionsInput = FetchGitHubUserSubscriptionsInput & {
  readImpl?: (
    input: FetchGitHubUserSubscriptionsInput,
  ) => Promise<GitHubUserSubscription[]>;
};

export type FetchGitHubUserSubscriptionsPageInput = {
  username: string;
  token: string;
  page?: number;
  perPage?: number;
  fetchImpl?: typeof fetch;
};

const DEFAULT_FETCH_LIMIT = 30;
const DEFAULT_PAGE = 1;
const MAX_PAGE_SIZE = 100;
const MAX_FETCH_LIMIT = 1000;

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

const clampPageSize = (value: number | undefined): number => {
  if (!Number.isInteger(value)) {
    return DEFAULT_FETCH_LIMIT;
  }

  const numericValue = value as number;
  if (numericValue < 1) {
    return 1;
  }

  if (numericValue > MAX_PAGE_SIZE) {
    return MAX_PAGE_SIZE;
  }

  return numericValue;
};

const clampFetchLimit = (value: number | undefined): number => {
  if (!Number.isInteger(value)) {
    return DEFAULT_FETCH_LIMIT;
  }

  const numericValue = value as number;
  if (numericValue < 1) {
    return 1;
  }

  if (numericValue > MAX_FETCH_LIMIT) {
    return MAX_FETCH_LIMIT;
  }

  return numericValue;
};

const normalizeFetchGitHubUserSubscriptionsInput = (
  input: FetchGitHubUserSubscriptionsInput,
): {
  username: string;
  token: string;
  limit: number;
  fetchImpl: typeof fetch;
} => {
  const username = assertNonEmpty(input.username, "GitHub username");
  const token = assertNonEmpty(input.token, "GitHub token");
  const limit = clampFetchLimit(input.limit);
  const fetchImpl = input.fetchImpl ?? fetch;

  return {
    username,
    token,
    limit,
    fetchImpl,
  };
};

const parseDateToIsoString = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return new Date(parsed).toISOString();
};

const toNonNegativeInteger = (value: unknown): number | null => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return Math.max(Math.trunc(value), 0);
};

const parseApiMessage = (payload: unknown): string | null => {
  if (!isRecord(payload)) {
    return null;
  }

  return typeof payload.message === "string" ? payload.message : null;
};

const parseGitHubUserSubscription = (value: unknown): GitHubUserSubscription | null => {
  if (!isRecord(value)) {
    return null;
  }

  const ownerLogin =
    isRecord(value.owner) && typeof value.owner.login === "string" ? value.owner.login : null;
  const updatedAt = parseDateToIsoString(value.updated_at);
  const pushedAtRaw = value.pushed_at;
  const pushedAt =
    pushedAtRaw === null || pushedAtRaw === undefined ? null : parseDateToIsoString(pushedAtRaw);
  const stargazersCount = toNonNegativeInteger(value.stargazers_count);
  const watchersCount = toNonNegativeInteger(value.watchers_count);
  const forksCount = toNonNegativeInteger(value.forks_count);
  const openIssuesCount = toNonNegativeInteger(value.open_issues_count);

  if (
    typeof value.id !== "number" ||
    !Number.isInteger(value.id) ||
    value.id <= 0 ||
    typeof value.name !== "string" ||
    typeof value.full_name !== "string" ||
    ownerLogin === null ||
    typeof value.html_url !== "string" ||
    typeof value.private !== "boolean" ||
    updatedAt === null ||
    (pushedAtRaw !== null && pushedAtRaw !== undefined && pushedAt === null) ||
    stargazersCount === null ||
    watchersCount === null ||
    forksCount === null ||
    openIssuesCount === null
  ) {
    return null;
  }

  return {
    id: value.id,
    name: value.name,
    fullName: value.full_name,
    ownerLogin,
    description: typeof value.description === "string" ? value.description : null,
    htmlUrl: value.html_url,
    language: typeof value.language === "string" ? value.language : null,
    stargazersCount,
    watchersCount,
    forksCount,
    openIssuesCount,
    isPrivate: value.private,
    updatedAt,
    pushedAt,
  };
};

export const fetchGitHubUserSubscriptionsPage = async (
  input: FetchGitHubUserSubscriptionsPageInput,
): Promise<GitHubUserSubscription[]> => {
  const username = assertNonEmpty(input.username, "GitHub username");
  const token = assertNonEmpty(input.token, "GitHub token");
  const perPage = clampPageSize(input.perPage);
  const page = clampPage(input.page);
  const fetchImpl = input.fetchImpl ?? fetch;

  const endpoint = `https://api.github.com/users/${encodeURIComponent(username)}/subscriptions?per_page=${perPage}&page=${page}`;
  const response = await fetchImpl(endpoint, {
    method: "GET",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "earth-online-launcher",
    },
  });

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
      `GitHub subscriptions request failed with status ${response.status} ${response.statusText}.${reason}`.trim(),
    );
  }

  if (!Array.isArray(body)) {
    throw new Error("GitHub subscriptions request returned an unexpected payload.");
  }

  return body
    .map(parseGitHubUserSubscription)
    .filter((subscription): subscription is GitHubUserSubscription => subscription !== null);
};

export const fetchGitHubUserSubscriptions = async (
  input: FetchGitHubUserSubscriptionsInput,
): Promise<GitHubUserSubscription[]> => {
  const { username, token, limit, fetchImpl } = normalizeFetchGitHubUserSubscriptionsInput(input);
  const perPage = Math.min(MAX_PAGE_SIZE, limit);

  const subscriptions: GitHubUserSubscription[] = [];
  let page = DEFAULT_PAGE;

  while (subscriptions.length < limit) {
    const currentPage = await fetchGitHubUserSubscriptionsPage({
      username,
      token,
      page,
      perPage,
      fetchImpl,
    });

    subscriptions.push(...currentPage);

    if (currentPage.length < perPage) {
      break;
    }

    page += 1;
  }

  return subscriptions.slice(0, limit);
};

// Keep this entry point stable so callers can switch to another source later.
export const readGitHubUserSubscriptions = async (
  input: ReadGitHubUserSubscriptionsInput,
): Promise<GitHubUserSubscription[]> => {
  const normalizedInput = normalizeFetchGitHubUserSubscriptionsInput(input);
  const readImpl = input.readImpl ?? fetchGitHubUserSubscriptions;
  return readImpl(normalizedInput);
};
