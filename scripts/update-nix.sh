#!/usr/bin/env bash
# Update the Nix pnpm dependency hash by forcing a temporary fake-hash build
# and copying the reported value back into nix/package.nix.
#
# Usage:
#   ./scripts/update-nix.sh          # update pnpmDeps hash
#   ./scripts/update-nix.sh --check  # verify pnpmDeps hash is current
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PACKAGE_NIX="$ROOT_DIR/nix/package.nix"

CHECK_MODE=false
if [[ "${1:-}" == "--check" ]]; then
  CHECK_MODE=true
fi

CURRENT_HASH="$(grep 'hash = "sha256-' "$PACKAGE_NIX" | head -n 1 | sed 's/.*"\(sha256-[^"]*\)".*/\1/')"
if [[ -z "$CURRENT_HASH" ]]; then
  echo "ERROR: Could not find current pnpm hash in nix/package.nix" >&2
  exit 1
fi

TMP_DIR="$(mktemp -d)"
STDERR_LOG="$(mktemp)"
trap 'rm -rf "$TMP_DIR" "$STDERR_LOG"' EXIT

mkdir -p "$TMP_DIR/repo"
(cd "$ROOT_DIR" && tar --exclude=.git -cf - .) | (cd "$TMP_DIR/repo" && tar -xf -)

sed -i.bak \
  's|hash = "sha256-[^"]*";|hash = lib.fakeHash;|' \
  "$TMP_DIR/repo/nix/package.nix"
rm -f "$TMP_DIR/repo/nix/package.nix.bak"

echo "Prefetching pnpm dependencies via nix build..."
if nix build "$TMP_DIR/repo#default" --no-link > /dev/null 2>"$STDERR_LOG"; then
  echo "Temporary fake-hash build unexpectedly succeeded." >&2
  exit 1
fi

NEW_HASH="$(grep -Eo 'sha256-[A-Za-z0-9+/=]+' "$STDERR_LOG" | tail -n 1)"
if [[ -z "$NEW_HASH" ]]; then
  echo "ERROR: Could not extract pnpm hash from nix output." >&2
  tail -50 "$STDERR_LOG" >&2
  exit 1
fi

echo "Computed hash: $NEW_HASH"

if [[ "$NEW_HASH" == "$CURRENT_HASH" ]]; then
  echo "Hash is already up to date."
  exit 0
fi

if $CHECK_MODE; then
  echo "ERROR: pnpmDeps hash is stale."
  echo "  current: $CURRENT_HASH"
  echo "  correct: $NEW_HASH"
  echo "Run ./scripts/update-nix.sh to fix."
  exit 1
fi

echo "Updating pnpmDeps hash in nix/package.nix..."
sed -i.bak \
  "0,/hash = \"sha256-[^\"]*\";/s||hash = \"$NEW_HASH\";|" \
  "$PACKAGE_NIX"
rm -f "$PACKAGE_NIX.bak"
echo "Updated: $CURRENT_HASH -> $NEW_HASH"
