import { execCliCommand } from "@/lib/cli-tools/exec";

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
    failureMessage: `Git command failed in ${repositoryPath}: git ${args.join(" ")}`,
  });
};
