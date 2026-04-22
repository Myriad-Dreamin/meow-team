import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import {
  repoAndroidSdkRoot,
  repoDepsDirectory,
  repoGradleHome,
  repoJavaHome,
} from "./android-paths.mjs";

const CMDLINE_TOOLS_VERSION = "14742923";
const ANDROID_PLATFORM_VERSION = "35";
const ANDROID_BUILD_TOOLS_VERSION = "35.0.0";
const GRADLE_VERSION = "8.9";
const JAVA_VERSION = "17";
const DOWNLOADS_DIRECTORY = path.join(repoDepsDirectory, "downloads");
const TEMP_DIRECTORY = path.join(repoDepsDirectory, "tmp");
const androidUserHome = path.join(repoDepsDirectory, "android-user-home");
const sdkmanagerPath = path.join(
  repoAndroidSdkRoot,
  "cmdline-tools",
  "latest",
  "bin",
  "sdkmanager",
);

const runOrExit = ({ command, args, cwd = repoDepsDirectory, env = process.env, input, label }) => {
  if (label) {
    console.log(label);
  }

  const result = spawnSync(command, args, {
    cwd,
    env,
    input,
    stdio: ["pipe", "inherit", "inherit"],
  });

  if (result.status === null) {
    const message =
      result.error?.code === "ENOENT"
        ? `Unable to find "${command}". Install it and retry.`
        : (result.error?.message ?? `Unable to run ${command}.`);
    console.error(message);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status);
  }
};

const resetDirectory = (directory) => {
  rmSync(directory, {
    force: true,
    recursive: true,
  });
  mkdirSync(directory, {
    recursive: true,
  });
};

const findSingleExtractedDirectory = (directory, label) => {
  const entries = readdirSync(directory, {
    withFileTypes: true,
  }).filter((entry) => entry.isDirectory());

  if (entries.length !== 1) {
    console.error(
      `Expected one extracted ${label} directory in ${directory}, found ${entries.length}.`,
    );
    process.exit(1);
  }

  return path.join(directory, entries[0].name);
};

mkdirSync(repoDepsDirectory, { recursive: true });
mkdirSync(DOWNLOADS_DIRECTORY, { recursive: true });
mkdirSync(TEMP_DIRECTORY, { recursive: true });

const commandLineToolsZip = path.join(
  DOWNLOADS_DIRECTORY,
  `commandlinetools-linux-${CMDLINE_TOOLS_VERSION}_latest.zip`,
);

if (!existsSync(commandLineToolsZip)) {
  runOrExit({
    command: "curl",
    args: [
      "-fL",
      "-o",
      commandLineToolsZip,
      `https://dl.google.com/android/repository/commandlinetools-linux-${CMDLINE_TOOLS_VERSION}_latest.zip`,
    ],
    label: `Downloading Android command-line tools into ${commandLineToolsZip}`,
  });
}

const gradleZip = path.join(DOWNLOADS_DIRECTORY, `gradle-${GRADLE_VERSION}-bin.zip`);
if (!existsSync(gradleZip)) {
  runOrExit({
    command: "curl",
    args: [
      "-fL",
      "-o",
      gradleZip,
      `https://services.gradle.org/distributions/gradle-${GRADLE_VERSION}-bin.zip`,
    ],
    label: `Downloading Gradle ${GRADLE_VERSION} into ${gradleZip}`,
  });
}

const javaArchive = path.join(DOWNLOADS_DIRECTORY, `temurin-jdk-${JAVA_VERSION}-linux-x64.tar.gz`);
if (!existsSync(javaArchive)) {
  runOrExit({
    command: "curl",
    args: [
      "-fL",
      "-o",
      javaArchive,
      `https://api.adoptium.net/v3/binary/latest/${JAVA_VERSION}/ga/linux/x64/jdk/hotspot/normal/eclipse`,
    ],
    label: `Downloading Temurin JDK ${JAVA_VERSION} into ${javaArchive}`,
  });
}

const extractedToolsDirectory = path.join(TEMP_DIRECTORY, "cmdline-tools");
resetDirectory(extractedToolsDirectory);

runOrExit({
  command: "unzip",
  args: ["-qo", commandLineToolsZip, "-d", extractedToolsDirectory],
  label: "Extracting Android command-line tools",
});

const latestToolsDirectory = path.join(repoAndroidSdkRoot, "cmdline-tools", "latest");
rmSync(latestToolsDirectory, {
  force: true,
  recursive: true,
});
mkdirSync(path.dirname(latestToolsDirectory), {
  recursive: true,
});
renameSync(path.join(extractedToolsDirectory, "cmdline-tools"), latestToolsDirectory);

const extractedGradleDirectory = path.join(TEMP_DIRECTORY, "gradle");
resetDirectory(extractedGradleDirectory);
runOrExit({
  command: "unzip",
  args: ["-qo", gradleZip, "-d", extractedGradleDirectory],
  label: `Extracting Gradle ${GRADLE_VERSION}`,
});
rmSync(repoGradleHome, {
  force: true,
  recursive: true,
});
renameSync(findSingleExtractedDirectory(extractedGradleDirectory, "Gradle"), repoGradleHome);

const extractedJavaDirectory = path.join(TEMP_DIRECTORY, "jdk");
resetDirectory(extractedJavaDirectory);
runOrExit({
  command: "tar",
  args: ["-xzf", javaArchive, "-C", extractedJavaDirectory],
  label: `Extracting Temurin JDK ${JAVA_VERSION}`,
});
rmSync(repoJavaHome, {
  force: true,
  recursive: true,
});
renameSync(findSingleExtractedDirectory(extractedJavaDirectory, "JDK"), repoJavaHome);

mkdirSync(androidUserHome, {
  recursive: true,
});
writeFileSync(path.join(androidUserHome, "repositories.cfg"), "", {
  encoding: "utf8",
  flag: "a",
});

const androidEnv = {
  ...process.env,
  ANDROID_HOME: repoAndroidSdkRoot,
  ANDROID_SDK_ROOT: repoAndroidSdkRoot,
  ANDROID_USER_HOME: androidUserHome,
};

runOrExit({
  command: sdkmanagerPath,
  args: [`--sdk_root=${repoAndroidSdkRoot}`, "--licenses"],
  env: androidEnv,
  input: `${"y\n".repeat(40)}`,
  label: "Accepting Android SDK licenses",
});

runOrExit({
  command: sdkmanagerPath,
  args: [
    `--sdk_root=${repoAndroidSdkRoot}`,
    "platform-tools",
    `platforms;android-${ANDROID_PLATFORM_VERSION}`,
    `build-tools;${ANDROID_BUILD_TOOLS_VERSION}`,
  ],
  env: androidEnv,
  input: `${"y\n".repeat(20)}`,
  label: "Installing Android SDK platform tools, platform, and build tools",
});

rmSync(path.join(repoDepsDirectory, "android-ndk"), {
  force: true,
  recursive: true,
});
rmSync(path.join(repoAndroidSdkRoot, "ndk"), {
  force: true,
  recursive: true,
});

console.log(`Android SDK: ${repoAndroidSdkRoot}`);
console.log(`Java home: ${repoJavaHome}`);
console.log(`Gradle home: ${repoGradleHome}`);
console.log(`Android user home: ${androidUserHome}`);
