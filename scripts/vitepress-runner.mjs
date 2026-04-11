import { access, mkdir, mkdtemp, realpath, rm, rmdir, symlink } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const command = process.argv[2];
const extraArgs = process.argv.slice(3);
const supportedCommands = new Set(["dev", "build", "preview"]);

if (!supportedCommands.has(command)) {
  console.error("Usage: node scripts/vitepress-runner.mjs <dev|build|preview> [...args]");
  process.exit(1);
}

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const docsDirectory = path.join(rootDirectory, "docs");
const localBinary = path.join(
  rootDirectory,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "vitepress.cmd" : "vitepress",
);

const isExecutable = async (filePath) => {
  try {
    await access(filePath, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
};

const pathExists = async (filePath) => {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
};

const findExecutableInPath = async (binaryName) => {
  const pathEntries = (process.env.PATH ?? "")
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean);

  for (const directory of pathEntries) {
    const candidatePath = path.join(directory, binaryName);
    if (await isExecutable(candidatePath)) {
      return candidatePath;
    }
  }

  return null;
};

const resolveBinaryPath = async () => {
  if (await isExecutable(localBinary)) {
    return localBinary;
  }

  const pathBinary = await findExecutableInPath(
    process.platform === "win32" ? "vitepress.cmd" : "vitepress",
  );

  if (!pathBinary) {
    throw new Error("Unable to find a `vitepress` binary. Install VitePress or add it to PATH.");
  }

  return pathBinary;
};

const cleanupDirectory = async (directoryPath) => {
  await rm(directoryPath, { force: true, recursive: true });
};

const binaryPath = await resolveBinaryPath();
const realBinaryPath = await realpath(binaryPath);
const vitepressPackageRoot = path.resolve(path.dirname(realBinaryPath), "..");
const vuePackagePath = path.join(vitepressPackageRoot, "node_modules", "vue");

await access(vuePackagePath);

const tempRoot = await mkdtemp(path.join(os.tmpdir(), "meow-team-vitepress-"));
const docsNodeModulesDirectory = path.join(docsDirectory, "node_modules");
const docsVueLinkPath = path.join(docsNodeModulesDirectory, "vue");
let createdDocsNodeModulesDirectory = false;
let createdDocsVueLink = false;

if (!(await pathExists(docsNodeModulesDirectory))) {
  await mkdir(docsNodeModulesDirectory, { recursive: true });
  createdDocsNodeModulesDirectory = true;
}

if (!(await pathExists(docsVueLinkPath))) {
  await symlink(vuePackagePath, docsVueLinkPath, "dir");
  createdDocsVueLink = true;
}

const child = spawn(process.execPath, [realBinaryPath, command, docsDirectory, ...extraArgs], {
  cwd: tempRoot,
  stdio: "inherit",
});

const finish = async (exitCode, signal) => {
  if (createdDocsVueLink) {
    await rm(docsVueLinkPath, { force: true });
  }

  if (createdDocsNodeModulesDirectory) {
    await rmdir(docsNodeModulesDirectory);
  }

  await cleanupDirectory(tempRoot);

  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(exitCode ?? 1);
};

child.on("error", async (error) => {
  console.error(error instanceof Error ? error.message : String(error));
  await finish(1, null);
});

child.on("exit", async (exitCode, signal) => {
  await finish(exitCode, signal);
});
