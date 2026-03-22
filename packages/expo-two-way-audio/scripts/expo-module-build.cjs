const path = require("node:path");
const { spawnSync } = require("node:child_process");

const command = process.platform === "win32" ? "npx.cmd" : "npx";
const result = spawnSync(command, ["expo-module", "build"], {
  stdio: "inherit",
  cwd: path.resolve(__dirname, ".."),
  env: {
    ...process.env,
    EXPO_NONINTERACTIVE: "1",
  },
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
