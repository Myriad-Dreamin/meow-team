const trimGitSuffix = (value: string): string => {
  return value.replace(/\.git$/iu, "");
};

const trimPathSlashes = (value: string): string => {
  return value.replace(/^\/+/u, "").replace(/\/+$/u, "");
};

const splitPathSegments = (value: string): string[] => {
  return value
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);
};

export const normalizeHostedRepositoryUrl = (remoteUrl: string): string | null => {
  const trimmedRemoteUrl = remoteUrl.trim();
  if (!trimmedRemoteUrl) {
    return null;
  }

  const sshRemoteMatch = /^git@([^:]+):(.+)$/u.exec(trimmedRemoteUrl);
  if (sshRemoteMatch) {
    const host = sshRemoteMatch[1];
    const repositoryPath = trimPathSlashes(trimGitSuffix(sshRemoteMatch[2] ?? ""));
    const pathSegments = splitPathSegments(repositoryPath);
    if (pathSegments.length !== 2) {
      return null;
    }

    return `https://${host}/${pathSegments.join("/")}`;
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(trimmedRemoteUrl);
  } catch {
    return null;
  }

  if (
    parsedUrl.protocol !== "https:" &&
    parsedUrl.protocol !== "http:" &&
    parsedUrl.protocol !== "ssh:"
  ) {
    return null;
  }

  const repositoryPath = trimPathSlashes(trimGitSuffix(decodeURIComponent(parsedUrl.pathname)));
  const pathSegments = splitPathSegments(repositoryPath);
  if (pathSegments.length !== 2) {
    return null;
  }

  return `https://${parsedUrl.host}/${pathSegments.join("/")}`;
};

export const normalizeHostedRepositorySlug = (remoteUrl: string): string | null => {
  const repositoryUrl = normalizeHostedRepositoryUrl(remoteUrl);
  if (!repositoryUrl) {
    return null;
  }

  try {
    return trimPathSlashes(new URL(repositoryUrl).pathname);
  } catch {
    return null;
  }
};

export const joinBrowserRepositoryUrl = (baseUrl: string, ...pathSegments: string[]): string => {
  const url = new URL(baseUrl);
  const normalizedPathSegments = [url.pathname, ...pathSegments]
    .flatMap((segment) => segment.split("/"))
    .map((segment) => segment.trim())
    .filter(Boolean);

  url.pathname = normalizedPathSegments.length > 0 ? `/${normalizedPathSegments.join("/")}` : "/";

  return url.toString().replace(/\/+$/u, "");
};
