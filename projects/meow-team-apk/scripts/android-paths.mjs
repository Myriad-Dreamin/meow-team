import { accessSync, constants, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
export const projectDirectory = path.resolve(scriptDirectory, "..");
export const repoRoot = path.resolve(projectDirectory, "..", "..");
export const repoDepsDirectory = path.join(repoRoot, "build", "deps");
export const repoAndroidSdkRoot = path.join(repoDepsDirectory, "android-sdk");
export const repoJavaHome = path.join(repoDepsDirectory, "jdk-17");
export const repoGradleHome = path.join(repoDepsDirectory, "gradle-8.9");
export const repoGradleUserHome = path.join(repoDepsDirectory, "gradle-user-home");

const hasAccess = (value, mode = constants.R_OK) => {
  try {
    accessSync(value, mode);
    return true;
  } catch {
    return false;
  }
};

const pathExists = (value) => hasAccess(value, constants.R_OK);

const commandExists = (value) => hasAccess(value, constants.X_OK);

const sortByVersionLikeName = (left, right) =>
  left.localeCompare(right, undefined, {
    numeric: true,
    sensitivity: "base",
  });

const findLatestMatchingDirectory = (pattern) => {
  if (!existsSync(repoDepsDirectory)) {
    return null;
  }

  try {
    const matches = readdirSync(repoDepsDirectory, {
      withFileTypes: true,
    })
      .filter((entry) => entry.isDirectory() && pattern.test(entry.name))
      .map((entry) => entry.name)
      .sort(sortByVersionLikeName);

    if (matches.length === 0) {
      return null;
    }

    return path.join(repoDepsDirectory, matches.at(-1));
  } catch {
    return null;
  }
};

export const findRepoAndroidSdkRoot = () => {
  return pathExists(repoAndroidSdkRoot) ? repoAndroidSdkRoot : null;
};

export const findRepoJavaHome = () => {
  if (pathExists(repoJavaHome)) {
    return repoJavaHome;
  }

  return findLatestMatchingDirectory(/^jdk(?:-|$)/u);
};

export const findRepoGradleHome = () => {
  if (pathExists(repoGradleHome)) {
    return repoGradleHome;
  }

  return findLatestMatchingDirectory(/^gradle-\d/u);
};

export const findRepoGradleCommand = () => {
  const gradleHome = findRepoGradleHome();
  if (!gradleHome) {
    return null;
  }

  const command = path.join(
    gradleHome,
    "bin",
    process.platform === "win32" ? "gradle.bat" : "gradle",
  );
  return commandExists(command) ? command : null;
};
