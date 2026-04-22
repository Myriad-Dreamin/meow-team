import { createCli } from "./cli.js";

export function run(argv = process.argv): void {
  createCli().parse(argv, { from: "node" });
}

run();
