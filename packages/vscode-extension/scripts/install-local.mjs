import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const packageDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(path.join(packageDirectory, "package.json"), "utf8"));
const vsixPath = path.join(packageDirectory, "dist", `${manifest.name}-${manifest.version}.vsix`);
const codeCommand = process.env.MEOW_TEAM_VSCODE_CLI || "code";

if (!existsSync(vsixPath)) {
  console.error(`VSIX not found at ${vsixPath}. Run \`pnpm vscode:package\` first.`);
  process.exit(1);
}

const result = spawnSync(codeCommand, ["--install-extension", vsixPath, "--force"], {
  cwd: packageDirectory,
  stdio: "inherit",
});

if (result.error) {
  if (result.error.code === "ENOENT") {
    console.error(
      `\`${codeCommand}\` was not found on PATH. Install the VS Code CLI or set MEOW_TEAM_VSCODE_CLI.`,
    );
  } else {
    console.error(result.error.message);
  }

  process.exit(1);
}

if ((result.status ?? 1) !== 0) {
  process.exit(result.status ?? 1);
}

console.log(`Installed ${manifest.displayName} from ${vsixPath}`);
