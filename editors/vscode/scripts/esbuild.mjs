import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const packageDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDirectory = path.join(packageDirectory, "out");

mkdirSync(outDirectory, { recursive: true });
writeFileSync(path.join(outDirectory, "extension.web.js"), "", "utf8");

try {
  await build({
    entryPoints: [path.join(packageDirectory, "src", "extension.ts")],
    bundle: true,
    external: ["vscode"],
    format: "cjs",
    outfile: path.join(outDirectory, "extension.js"),
    platform: "node",
    sourcemap: true,
    target: "node22",
  });
} catch {
  process.exit(1);
}
