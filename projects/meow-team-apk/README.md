# Meow Team Android Shell

This directory hosts the Android delivery surface for meow-team. The Android
app is kept intentionally thin:

- the UI shell is a native Android app with a `WebView` that opens the existing
  Next.js workspace
- approval and failure alerts are still computed by the backend and are turned
  into Android system notifications only when `team.config.ts` sets
  `notifications.target` to `"android"`
- APK packaging uses the Android SDK, JDK 17, and Gradle only; it does not
  require the Android NDK or a Rust bridge

## Local workflow

1. Run `pnpm android:install-deps` to install repo-local Android SDK, JDK 17,
   and Gradle dependencies under `build/deps`, following the same local
   installer shape as the referenced SDK/NDK gist but without writing into
   `/opt`.
2. Run `pnpm android:doctor` to confirm Java 17+, the Android SDK, and Gradle
   are all available.
3. Start the Next.js backend with `pnpm dev`.
4. Set the backend URL in the app before loading the workspace.
5. For the Android emulator, use `http://10.0.2.2:3000` as the backend URL.
6. On a physical device, use your computer's LAN IP and port instead.
7. Run `pnpm android:assemble` to package the debug APK.
8. Run `pnpm android:install` to install that APK onto a connected device or
   emulator.

The helper scripts automatically detect repo-local Android dependencies in
`build/deps/android-sdk`, `build/deps/jdk-17`, and `build/deps/gradle-8.9`
before falling back to environment variables or the default Android Studio
locations.

## Gradle command override

The repo scripts prefer the repo-local Gradle install first. If your setup uses
another command, set `MEOW_TEAM_ANDROID_GRADLE`, for example:

```bash
MEOW_TEAM_ANDROID_GRADLE=./gradlew pnpm android:assemble
```

Successful `pnpm android:assemble` runs print the generated APK path, which is
typically `android/app/build/outputs/apk/debug/meow-team.apk`.

You can also preconfigure the app at launch time with an intent extra:

```bash
adb shell am start \
  -n team.meow.android/.MainActivity \
  --es backend_url http://192.168.1.10:3000
```
