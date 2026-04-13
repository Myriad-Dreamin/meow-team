import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const packageDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(path.join(packageDirectory, "package.json"), "utf8"));
const distDirectory = path.join(packageDirectory, "dist");
const vsixPath = path.join(distDirectory, `${manifest.name}-${manifest.version}.vsix`);

mkdirSync(distDirectory, { recursive: true });

const result = spawnSync(
  "vsce",
  ["package", "--no-dependencies", "--allow-missing-repository", "--out", vsixPath],
  {
    cwd: packageDirectory,
    stdio: "inherit",
  },
);

if (result.error) {
  if (result.error.code === "ENOENT") {
    console.error(
      "`vsce` was not found on PATH. Install it or make sure the global CLI is available.",
    );
  } else {
    console.error(result.error.message);
  }

  process.exit(1);
}

if ((result.status ?? 1) !== 0) {
  process.exit(result.status ?? 1);
}

console.log(`Packaged VSIX: ${vsixPath}`);
