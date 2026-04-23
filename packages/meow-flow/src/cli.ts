import { Command } from "commander";
import { resolveCliVersion } from "./version.js";

export function createCli(): Command {
  return new Command()
    .name("meow-flow")
    .description("Bootstrap CLI for Meow Flow")
    .version(resolveCliVersion(), "-v, --version", "output the version number");
}
