import { execCliCommand } from "@/lib/cli-tools/exec";

export const runGh = async (
  repositoryPath: string,
  args: string[],
): Promise<{
  stdout: string;
  stderr: string;
}> => {
  return execCliCommand({
    command: "gh",
    args,
    cwd: repositoryPath,
    failureMessage: `GitHub CLI command failed in ${repositoryPath}: gh ${args.join(" ")}`,
  });
};
