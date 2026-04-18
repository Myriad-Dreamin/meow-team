import { Builtins, Cli } from "clipanion";
import { ConfigPlatformCommand } from "./commands/config-platform.ts";

export const createCli = (): Cli => {
  const cli = new Cli({
    binaryLabel: "meow-team",
    binaryName: "meow-team",
    binaryVersion: "0.1.0",
  });

  cli.register(ConfigPlatformCommand);
  cli.register(Builtins.HelpCommand);
  cli.register(Builtins.VersionCommand);

  return cli;
};
