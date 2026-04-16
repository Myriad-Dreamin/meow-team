import { execCliCommand } from "@/lib/cli-tools/exec";
import { buildGitProcessEnv } from "@/lib/git/process";

export const runGit = async (
  repositoryPath: string,
  args: string[],
): Promise<{
  stdout: string;
  stderr: string;
}> => {
  return execCliCommand({
    command: "git",
    args: ["-C", repositoryPath, ...args],
    env: buildGitProcessEnv(),
    failureMessage: `Git command failed in ${repositoryPath}: git ${args.join(" ")}`,
  });
};
