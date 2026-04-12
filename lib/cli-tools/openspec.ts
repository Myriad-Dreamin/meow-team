import { execCliCommand } from "@/lib/cli-tools/exec";

export const runOpenSpec = async (
  workingDirectory: string,
  args: string[],
): Promise<{
  stdout: string;
  stderr: string;
}> => {
  return execCliCommand({
    command: "openspec",
    args,
    cwd: workingDirectory,
    env: {
      ...process.env,
      OPENSPEC_TELEMETRY: "0",
    },
    failureMessage: `OpenSpec command failed in ${workingDirectory}.`,
  });
};
