{
  lib,
  stdenv,
  nodejs_22,
  pnpm_10,
  python3,
  makeWrapper,
  # node-pty needs libuv headers on Linux
  libuv,
}:

let
  pnpm = pnpm_10;
in
stdenv.mkDerivation rec {
  pname = "paseo";
  version = (builtins.fromJSON (builtins.readFile ../package.json)).version;

  src = lib.cleanSourceWith {
    src = ./..;
    filter = path: type:
      let
        baseName = builtins.baseNameOf path;
        relPath = lib.removePrefix (toString ./..) path;
      in
      # Exclude non-daemon workspace contents (keep package.json for workspace resolution)
      !(lib.hasPrefix "/packages/app/src" relPath)
      && !(lib.hasPrefix "/packages/app/assets" relPath)
      && !(lib.hasPrefix "/packages/app/android" relPath)
      && !(lib.hasPrefix "/packages/app/ios" relPath)
      && !(lib.hasPrefix "/packages/website/src" relPath)
      && !(lib.hasPrefix "/packages/website/public" relPath)
      && !(lib.hasPrefix "/packages/desktop/src" relPath)
      && !(lib.hasPrefix "/packages/desktop/src-tauri" relPath)
      # Exclude test fixtures and debug files
      && !(lib.hasSuffix ".test.ts" baseName)
      && !(lib.hasSuffix ".e2e.test.ts" baseName)
      && baseName != "node_modules"
      && baseName != ".git"
      && baseName != ".paseo"
      && baseName != ".DS_Store";
  };

  nodejs = nodejs_22;
  pnpmDeps = pnpm.fetchDeps {
    inherit pname src version;
    fetcherVersion = 2;
    hash = "sha256-78mUJDRNb2J9MUF5faMGrIedWGT1ytLbtIIi2GKERys=";
  };

  # nixpkgs may provide a newer pnpm 10.x than the repo's pinned packageManager.
  # Without this, pnpm tries to install the pinned version into ~/.local/share
  # during sandboxed builds and fails with EACCES under /homeless-shelter.
  npm_config_manage_package_manager_versions = "false";

  nativeBuildInputs = [
    nodejs
    pnpm.configHook
    python3 # for node-gyp (node-pty compilation)
    makeWrapper
  ];

  buildInputs = lib.optionals stdenv.hostPlatform.isLinux [
    libuv
  ];

  buildPhase = ''
    runHook preBuild

    # Rebuild only node-pty (native addon for terminal emulation).
    # Speech-related native modules (sherpa-onnx, onnxruntime-node) are
    # intentionally left unbuilt — they're lazily loaded and gracefully
    # degrade when unavailable.
    pnpm --config.manage-package-manager-versions=false rebuild node-pty

    # Build daemon packages without routing back through root scripts that
    # invoke pnpm again. Nested pnpm calls re-trigger the packageManager check
    # and try to install the pinned CLI version inside the Nix sandbox.
    pnpm --config.manage-package-manager-versions=false --filter @getpaseo/highlight run build
    pnpm --config.manage-package-manager-versions=false --filter @getpaseo/relay run build
    pnpm --config.manage-package-manager-versions=false --filter @getpaseo/server exec \
      node -e "require('node:fs').rmSync('dist',{ recursive: true, force: true })"
    pnpm --config.manage-package-manager-versions=false --filter @getpaseo/server run build:lib
    pnpm --config.manage-package-manager-versions=false --filter @getpaseo/server run build:scripts
    pnpm --config.manage-package-manager-versions=false --filter @getpaseo/cli run build

    runHook postBuild
  '';

  installPhase = ''
    runHook preInstall

    mkdir -p $out/lib/paseo

    # Copy root package metadata
    cp package.json $out/lib/paseo/

    # Copy node_modules (preserving workspace symlinks)
    cp -a node_modules $out/lib/paseo/

    # Copy the daemon workspace packages we built and recreate the workspace
    # symlinks that runtime resolution expects under node_modules/@getpaseo.
    mkdir -p "$out/lib/paseo/node_modules/@getpaseo"
    for name in highlight relay server cli; do
      mkdir -p "$out/lib/paseo/packages/$name"
      cp "packages/$name/package.json" "$out/lib/paseo/packages/$name/"
      cp -a "packages/$name/dist" "$out/lib/paseo/packages/$name/"
      if [ -d "packages/$name/node_modules" ]; then
        cp -a "packages/$name/node_modules" "$out/lib/paseo/packages/$name/"
      fi
      rm -f "$out/lib/paseo/node_modules/@getpaseo/$name"
      ln -s "../../packages/$name" "$out/lib/paseo/node_modules/@getpaseo/$name"
    done

    # Prune leftover pnpm hoist links for workspace packages we do not ship in
    # the daemon build. Keeping these broken links fails Nix's
    # noBrokenSymlinks check during fixup.
    if [ -d "$out/lib/paseo/node_modules/.pnpm/node_modules" ]; then
      find "$out/lib/paseo/node_modules/.pnpm/node_modules" -type l -exec bash -c '
        for link do
          if [ ! -e "$link" ]; then
            rm -f "$link"
          fi
        done
      ' bash {} +
    fi

    # Copy CLI bin entry
    mkdir -p $out/lib/paseo/packages/cli/bin
    cp packages/cli/bin/paseo $out/lib/paseo/packages/cli/bin/

    # Copy extra server files referenced at runtime
    for f in agent-prompt.md .env.example; do
      if [ -f packages/server/$f ]; then
        cp packages/server/$f $out/lib/paseo/packages/server/
      fi
    done

    # Copy server scripts (including supervisor-entrypoint) needed by CLI
    if [ -d packages/server/dist/scripts ]; then
      mkdir -p $out/lib/paseo/packages/server/dist/scripts
      cp -a packages/server/dist/scripts/* $out/lib/paseo/packages/server/dist/scripts/
    fi

    # Create wrapper for the server entry point (for systemd / direct use)
    mkdir -p $out/bin
    makeWrapper ${nodejs}/bin/node $out/bin/paseo-server \
      --add-flags "$out/lib/paseo/packages/server/dist/server/server/index.js" \
      --set NODE_ENV production

    # Create wrapper for the CLI
    makeWrapper ${nodejs}/bin/node $out/bin/paseo \
      --add-flags "$out/lib/paseo/packages/cli/dist/index.js" \
      --set NODE_PATH "$out/lib/paseo/node_modules"

    runHook postInstall
  '';

  meta = {
    description = "Self-hosted daemon for Claude Code, Codex, and OpenCode";
    homepage = "https://github.com/getpaseo/paseo";
    license = lib.licenses.agpl3Plus;
    mainProgram = "paseo";
    platforms = lib.platforms.linux ++ lib.platforms.darwin;
  };
}
