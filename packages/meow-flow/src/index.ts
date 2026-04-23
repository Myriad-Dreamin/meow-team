import { createCli } from "./cli.js";

export async function run(argv = process.argv): Promise<void> {
  await createCli().parseAsync(argv, { from: "node" });
}

void run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
