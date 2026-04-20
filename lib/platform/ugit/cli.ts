import "server-only";

import { execCliCommand } from "@/lib/cli-tools/exec";

export const runUgit = async (
  repositoryPath: string,
  args: string[],
): Promise<{
  stdout: string;
  stderr: string;
}> => {
  return execCliCommand({
    command: "ugit",
    args,
    cwd: repositoryPath,
    failureMessage: `ugit command failed in ${repositoryPath}: ugit ${args.join(" ")}`,
  });
};
