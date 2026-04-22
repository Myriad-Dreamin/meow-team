import { accessSync, constants } from "node:fs";
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import path from "node:path";
import process from "node:process";
import {
  findRepoAndroidSdkRoot,
  findRepoGradleCommand,
  findRepoJavaHome,
  repoAndroidSdkRoot,
  repoGradleHome,
  repoGradleUserHome,
  repoJavaHome,
} from "./android-paths.mjs";

const runCheck = ({ command, args, env = process.env }) =>
  spawnSync(command, args, {
    encoding: "utf8",
    env,
  });

const firstNonEmptyLine = (value) =>
  value
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .find((line) => /[A-Za-z0-9]/u.test(line)) ?? "";

const extractFailureMessage = (result) =>
  result.stderr?.trim() || result.stdout?.trim() || "Unknown failure.";

const parseJavaMajorVersion = (value) => {
  const versionMatch =
    value.match(/version "(?<version>[^"]+)"/u) ??
    value.match(/(?:openjdk|java|javac) (?<version>\d+(?:[._+-]\d+)*)/u);
  const version = versionMatch?.groups?.version;

  if (!version) {
    return null;
  }

  if (version.startsWith("1.")) {
    return Number.parseInt(version.split(".")[1] ?? "", 10);
  }

  return Number.parseInt(version.split(/[._+-]/u)[0] ?? "", 10);
};

const detectJavaHome = () => {
  const candidates = [process.env.JAVA_HOME, findRepoJavaHome()].filter(
    (value) => typeof value === "string" && value.trim().length > 0,
  );

  for (const candidate of candidates) {
    try {
      accessSync(path.join(candidate, "bin", "java"), constants.X_OK);
      accessSync(path.join(candidate, "bin", "javac"), constants.X_OK);
      return candidate;
    } catch {
      // Continue trying configured Java homes.
    }
  }

  return null;
};

const detectAndroidSdkPath = () => {
  const candidates = [
    process.env.ANDROID_SDK_ROOT,
    process.env.ANDROID_HOME,
    findRepoAndroidSdkRoot(),
    path.join(homedir(), "Android", "Sdk"),
  ].filter((value) => typeof value === "string" && value.trim().length > 0);

  for (const candidate of candidates) {
    try {
      accessSync(candidate, constants.R_OK);
      return candidate;
    } catch {
      // Continue trying known locations.
    }
  }

  return null;
};

const configuredJavaHome = detectJavaHome();
const javaBinDirectory = configuredJavaHome ? path.join(configuredJavaHome, "bin") : null;
const toolEnv = configuredJavaHome
  ? {
      ...process.env,
      JAVA_HOME: configuredJavaHome,
      PATH: `${javaBinDirectory}${path.delimiter}${process.env.PATH ?? ""}`,
      GRADLE_USER_HOME: process.env.GRADLE_USER_HOME?.trim() || repoGradleUserHome,
    }
  : {
      ...process.env,
      GRADLE_USER_HOME: process.env.GRADLE_USER_HOME?.trim() || repoGradleUserHome,
    };
const javaCommand = configuredJavaHome ? path.join(javaBinDirectory, "java") : "java";
const javacCommand = configuredJavaHome ? path.join(javaBinDirectory, "javac") : "javac";
const gradleCommand =
  process.env.MEOW_TEAM_ANDROID_GRADLE?.trim() || findRepoGradleCommand() || "gradle";

let hasFailure = false;

const javaVersionResult = runCheck({
  command: javaCommand,
  args: ["-version"],
  env: toolEnv,
});
if (javaVersionResult.status !== 0) {
  hasFailure = true;
  console.error("Missing Java runtime for Android packaging.");
  if (javaVersionResult.status === null && javaVersionResult.error?.code === "ENOENT") {
    console.error(`  Command not found: ${javaCommand}`);
  } else {
    console.error(`  ${extractFailureMessage(javaVersionResult)}`);
  }
  console.error(
    `  Install repo-local deps under ${repoJavaHome}, set JAVA_HOME to a JDK 17+ installation, or install Java 17 globally.`,
  );
} else {
  const javaOutput = `${javaVersionResult.stdout}\n${javaVersionResult.stderr}`.trim();
  const majorVersion = parseJavaMajorVersion(javaOutput);

  if (majorVersion === null || majorVersion < 17) {
    hasFailure = true;
    console.error(`Java 17 or newer is required. Found: ${firstNonEmptyLine(javaOutput)}`);
  } else {
    const locationSuffix = configuredJavaHome ? ` (${configuredJavaHome})` : "";
    console.log(`Java: ${firstNonEmptyLine(javaOutput)}${locationSuffix}`);
  }
}

const javacVersionResult = runCheck({
  command: javacCommand,
  args: ["-version"],
  env: toolEnv,
});
if (javacVersionResult.status !== 0) {
  hasFailure = true;
  console.error("Missing javac for Android packaging.");
  if (javacVersionResult.status === null && javacVersionResult.error?.code === "ENOENT") {
    console.error(`  Command not found: ${javacCommand}`);
  } else {
    console.error(`  ${extractFailureMessage(javacVersionResult)}`);
  }
} else {
  const javacOutput = `${javacVersionResult.stdout}\n${javacVersionResult.stderr}`.trim();
  const majorVersion = parseJavaMajorVersion(javacOutput);

  if (majorVersion === null || majorVersion < 17) {
    hasFailure = true;
    console.error(`javac 17 or newer is required. Found: ${firstNonEmptyLine(javacOutput)}`);
  } else {
    console.log(`javac: ${firstNonEmptyLine(javacOutput)}`);
  }
}

const gradleResult = runCheck({
  command: gradleCommand,
  args: ["--version"],
  env: toolEnv,
});
if (gradleResult.status !== 0) {
  hasFailure = true;
  console.error("Missing Gradle.");
  if (gradleResult.status === null && gradleResult.error?.code === "ENOENT") {
    console.error(`  Command not found: ${gradleCommand}`);
  } else {
    console.error(`  ${extractFailureMessage(gradleResult)}`);
  }
  console.error(
    `  Install repo-local deps under ${repoGradleHome}, set MEOW_TEAM_ANDROID_GRADLE, or install Gradle globally.`,
  );
} else {
  const gradleOutput = `${gradleResult.stdout}\n${gradleResult.stderr}`.trim();
  console.log(`Gradle: ${firstNonEmptyLine(gradleOutput)}`);
}

const androidSdkPath = detectAndroidSdkPath();
if (!androidSdkPath) {
  hasFailure = true;
  console.error(
    `Missing Android SDK path. Set ANDROID_SDK_ROOT or ANDROID_HOME, install Android Studio to the default ~/Android/Sdk location, or install repo-local deps under ${repoAndroidSdkRoot}.`,
  );
} else {
  try {
    accessSync(androidSdkPath, constants.R_OK);
    console.log(`Android SDK: ${androidSdkPath}`);
  } catch {
    hasFailure = true;
    console.error(`Android SDK path is not readable: ${androidSdkPath}`);
  }
}

if (hasFailure) {
  process.exit(1);
}
