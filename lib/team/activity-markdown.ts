export const formatCommitActivityReference = ({
  commitHash,
  commitUrl,
}: {
  commitHash: string;
  commitUrl?: string | null;
}): string => {
  const shortenedCommit = commitHash.slice(0, 12);

  if (!commitUrl) {
    return shortenedCommit;
  }

  return `[${shortenedCommit}](<${commitUrl}>)`;
};
