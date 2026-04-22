import { createCli } from "../packages/meow-flow/src/cli.js";

function normalizeArgv(argv = process.argv) {
  if (argv[2] !== "--") {
    return argv;
  }

  return [...argv.slice(0, 2), ...argv.slice(3)];
}

createCli().parse(normalizeArgv(), { from: "node" });
