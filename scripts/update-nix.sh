#!/usr/bin/env bash
# Update the Nix dependency hashes used for pnpm fetches by forcing temporary
# fake-hash builds and copying the reported values into sidecar hash files.
#
# Usage:
#   ./scripts/update-nix.sh          # update dependency hashes
#   ./scripts/update-nix.sh --check  # verify dependency hashes are current
#
# The Linux-only desktop package keeps a different filtered source tree from
# the daemon package, so it needs its own pnpm.fetchDeps hash.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

CHECK_MODE=false
if [[ "${1:-}" == "--check" ]]; then
  CHECK_MODE=true
fi

TARGETS=(
  "default:nix/package.nix:nix/npm-deps.hash"
)

if [[ "$(uname -s)" == "Linux" ]]; then
  TARGETS+=(
    "desktop:nix/desktop-package.nix:nix/desktop-npm-deps.hash"
  )
fi

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

compute_hash() {
  local attr="$1"
  local package_nix_rel="$2"
  local work_dir="$TMP_DIR/$attr"
  local repo_dir="$work_dir/repo"
  local stderr_log="$work_dir/stderr.log"

  mkdir -p "$repo_dir"
  (cd "$ROOT_DIR" && tar --exclude=.git -cf - .) | (cd "$repo_dir" && tar -xf -)

  sed -i.bak \
    's|hash = depsHash;|hash = lib.fakeHash;|' \
    "$repo_dir/$package_nix_rel"
  rm -f "$repo_dir/$package_nix_rel.bak"

  echo "Prefetching pnpm dependencies via nix build for .#$attr..." >&2
  if nix build "$repo_dir#$attr" --no-link > /dev/null 2>"$stderr_log"; then
    echo "Temporary fake-hash build for .#$attr unexpectedly succeeded." >&2
    exit 1
  fi

  local new_hash
  new_hash="$(grep -Eo 'sha256-[A-Za-z0-9+/=]+' "$stderr_log" | tail -n 1)"
  if [[ -z "$new_hash" ]]; then
    echo "ERROR: Could not extract pnpm hash for .#$attr from nix output." >&2
    tail -50 "$stderr_log" >&2
    exit 1
  fi

  printf '%s\n' "$new_hash"
}

had_stale_hash=false
updated_hash=false

for spec in "${TARGETS[@]}"; do
  IFS=: read -r attr package_nix_rel hash_rel <<< "$spec"
  hash_file="$ROOT_DIR/$hash_rel"
  current_hash="$(tr -d '[:space:]' < "$hash_file")"

  if [[ -z "$current_hash" ]]; then
    echo "ERROR: Could not find current dependency hash in $hash_rel" >&2
    exit 1
  fi

  new_hash="$(compute_hash "$attr" "$package_nix_rel")"
  echo "Computed $attr hash: $new_hash"

  if [[ "$new_hash" == "$current_hash" ]]; then
    echo "$attr hash is already up to date."
    continue
  fi

  if $CHECK_MODE; then
    echo "ERROR: $attr dependency hash is stale."
    echo "  file: $hash_rel"
    echo "  current: $current_hash"
    echo "  correct: $new_hash"
    had_stale_hash=true
    continue
  fi

  echo "Updating $hash_rel..."
  printf '%s\n' "$new_hash" > "$hash_file"
  echo "Updated $hash_rel: $current_hash -> $new_hash"
  updated_hash=true
done

if $CHECK_MODE && $had_stale_hash; then
  echo "Run ./scripts/update-nix.sh to fix."
  exit 1
fi

if ! $CHECK_MODE && ! $updated_hash; then
  echo "All dependency hashes are already up to date."
fi
