import { existsSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  findRepoAndroidSdkRoot,
  findRepoGradleCommand,
  findRepoJavaHome,
  repoGradleUserHome,
} from "./android-paths.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const androidProjectDirectory = path.resolve(scriptDirectory, "..", "android");
const gradleArgs = process.argv.slice(2);
const repoAndroidSdkRoot = findRepoAndroidSdkRoot();
const repoJavaHome = findRepoJavaHome();
const repoGradleCommand = findRepoGradleCommand();
const gradleWrapperCommand = path.join(
  androidProjectDirectory,
  process.platform === "win32" ? "gradlew.bat" : "gradlew",
);
const gradleCommand =
  process.env.MEOW_TEAM_ANDROID_GRADLE?.trim() ||
  (existsSync(gradleWrapperCommand) ? gradleWrapperCommand : null) ||
  repoGradleCommand ||
  "gradle";
const javaHome = process.env.JAVA_HOME?.trim() || repoJavaHome || null;
const javaBinDirectory = javaHome ? path.join(javaHome, "bin") : null;
const gradleUserHome = process.env.GRADLE_USER_HOME?.trim() || repoGradleUserHome;

if (gradleArgs.length === 0) {
  gradleArgs.push("assembleDebug");
}

const findApkOutputs = (directory) => {
  if (!existsSync(directory)) {
    return [];
  }

  const outputs = [];
  const pending = [directory];

  while (pending.length > 0) {
    const currentDirectory = pending.pop();
    const entries = readdirSync(currentDirectory, {
      withFileTypes: true,
    });

    for (const entry of entries) {
      const nextPath = path.join(currentDirectory, entry.name);
      if (entry.isDirectory()) {
        pending.push(nextPath);
        continue;
      }

      if (entry.isFile() && entry.name.endsWith(".apk")) {
        outputs.push(nextPath);
      }
    }
  }

  return outputs.sort();
};

const result = spawnSync(gradleCommand, gradleArgs, {
  cwd: androidProjectDirectory,
  env: {
    ...process.env,
    ...(javaHome
      ? {
          JAVA_HOME: javaHome,
          PATH: javaBinDirectory
            ? `${javaBinDirectory}${path.delimiter}${process.env.PATH ?? ""}`
            : process.env.PATH,
        }
      : {}),
    ...(repoAndroidSdkRoot
      ? {
          ANDROID_HOME: process.env.ANDROID_HOME ?? repoAndroidSdkRoot,
          ANDROID_SDK_ROOT: process.env.ANDROID_SDK_ROOT ?? repoAndroidSdkRoot,
        }
      : {}),
    GRADLE_USER_HOME: gradleUserHome,
  },
  stdio: "inherit",
});

if (result.status === null) {
  const message =
    result.error?.code === "ENOENT"
      ? `Unable to find "${gradleCommand}". Run pnpm android:install-deps or set MEOW_TEAM_ANDROID_GRADLE to your Gradle command and retry.`
      : (result.error?.message ?? "Unable to run Gradle.");
  console.error(message);
  process.exit(1);
}

if ((result.status ?? 1) === 0) {
  const apkDirectory = path.join(androidProjectDirectory, "app", "build", "outputs", "apk");
  const apkOutputs = findApkOutputs(apkDirectory);
  for (const apkOutput of apkOutputs) {
    console.log(`APK: ${apkOutput}`);
  }
}

process.exit(result.status ?? 1);
