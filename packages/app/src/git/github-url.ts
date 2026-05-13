import { parseGitHubRemoteUrl } from "@server/shared/git-remote";

// Note: SSH host aliases (e.g. `git@github-work:acme/repo.git` resolved via ~/.ssh/config)
// are not detected here, so the GitHub action will silently not appear for those remotes.
function trimNonEmpty(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function parseGitHubRepoFromRemote(remoteUrl: string | null | undefined): string | null {
  const normalizedRemote = trimNonEmpty(remoteUrl);
  if (!normalizedRemote) {
    return null;
  }
  return parseGitHubRemoteUrl(normalizedRemote)?.repo ?? null;
}

export function buildGitHubBranchTreeUrl(input: {
  remoteUrl: string | null | undefined;
  branch: string | null | undefined;
}): string | null {
  const repo = parseGitHubRepoFromRemote(input.remoteUrl);
  const branch = trimNonEmpty(input.branch);
  if (!repo || !branch || branch === "HEAD") {
    return null;
  }

  const encodedBranch = branch.split("/").map(encodeURIComponent).join("/");
  return `https://github.com/${repo}/tree/${encodedBranch}`;
}
