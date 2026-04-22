---
title: Android Setup
outline: deep
---

# Android setup

This repo also supports a repo-local Android dependency install under
`build/deps`, adapted from the local-install shape in the referenced gist while
keeping everything inside the workspace instead of writing to `/opt`. The
Android app now ships as a pure Kotlin/WebView client, so APK packaging does
not require the Android NDK or `cargo-ndk`.

## Install repo-local Android build dependencies

Run:

```bash
pnpm android:install-deps
```

That installer downloads Android command-line tools, Gradle, and Temurin JDK 17
into `build/deps`, installs:

- `platform-tools`
- `platforms;android-35`
- `build-tools;35.0.0`

and creates these repo-local tool paths:

- `build/deps/android-sdk`
- `build/deps/jdk-17`
- `build/deps/gradle-8.9`

It also keeps package-manager state inside the repo with:

- `build/deps/android-user-home`
- `build/deps/gradle-user-home`

The helper scripts prefer those repo-local paths automatically when you run the
Android commands from the project root.

The repo doctor also recognizes:

- `ANDROID_SDK_ROOT`
- `ANDROID_HOME`
- repo-local path `build/deps/android-sdk`
- default Linux SDK location `~/Android/Sdk`

For Java and Gradle packaging tools, the repo prefers:

- `JAVA_HOME`
- repo-local path `build/deps/jdk-17`
- `MEOW_TEAM_ANDROID_GRADLE`
- repo-local path `build/deps/gradle-8.9/bin/gradle`
- `gradle` on `PATH`

## Verify the toolchain

Run:

```bash
pnpm android:doctor
```

The doctor checks:

- Java 17+ runtime and compiler
- Android SDK discovery
- Gradle availability for APK packaging

## Build and install the APK

Build the Android app with:

```bash
pnpm android:assemble
```

The build script prefers the repo-local JDK 17 and Gradle install automatically
and prints the generated APK path when the build succeeds. The default debug APK
is written under:

- `projects/meow-team-apk/android/app/build/outputs/apk/debug/meow-team.apk`

Install it onto a connected device or emulator with:

```bash
pnpm android:install
```

## Local backend URL

The app now stays on the configuration screen on first launch until a backend
URL is saved.

Saving a backend URL also starts Android background monitoring. The app keeps a
low-priority ongoing system notification visible while that monitoring service
is active, which lets approval and failure alerts continue while the app is
backgrounded or the device is locked. You can stop that monitoring from the
ongoing notification and restart it the next time you save a backend URL.

For the Android emulator, use `http://10.0.2.2:3000` as the backend URL when
the Next.js app is running locally with `pnpm dev`.

For a physical device, use your computer's LAN IP and port instead, for
example `http://192.168.1.10:3000`.

You can also preconfigure the backend URL when launching the app from `adb`:

```bash
adb shell am start \
  -n team.meow.android/.MainActivity \
  --es backend_url http://192.168.1.10:3000
```
