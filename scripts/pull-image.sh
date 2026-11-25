#!/bin/bash
# scripts/pull-image.sh — pull the released app + migrator images from GHCR.
#
# Images are built and published by .github/workflows/ci.yml and tagged with the
# immutable short SHA. This host never builds; it only pulls.
#
# Usage:  ./scripts/pull-image.sh          # pull the tag for the current commit
#         ./scripts/pull-image.sh <sha>    # pull a specific release

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Operate on the live stack directory, not the runner's throwaway checkout:
# .env.docker.cloud and IMAGE_REPO are gitignored and live only here.
STACK_DIR="${STACK_DIR:-$(dirname "$HERE")}"
if [ ! -d "$STACK_DIR" ]; then
  echo "[pull] ❌ STACK_DIR '$STACK_DIR' does not exist"
  exit 1
fi
cd "$STACK_DIR"

ENV_FILE=".env.docker.cloud"

read_env() {
  local key="$1"
  [ -f "$ENV_FILE" ] || return 0
  sed -n "s/^${key}=//p" "$ENV_FILE" | tail -n1
}

IMAGE_REPO="${IMAGE_REPO:-$(read_env IMAGE_REPO)}"
MIGRATOR_IMAGE_REPO="${MIGRATOR_IMAGE_REPO:-$(read_env MIGRATOR_IMAGE_REPO)}"
TAG="${1:-$(git rev-parse --short HEAD 2>/dev/null || echo latest)}"

if [ -z "$IMAGE_REPO" ] || [ -z "$MIGRATOR_IMAGE_REPO" ]; then
  echo "[pull] ❌ IMAGE_REPO / MIGRATOR_IMAGE_REPO missing — set them in $ENV_FILE"
  exit 1
fi

# shellcheck source=./registry-login.sh
. "$HERE/registry-login.sh"

echo "[pull] $IMAGE_REPO:$TAG"
docker pull "$IMAGE_REPO:$TAG"

echo "[pull] $MIGRATOR_IMAGE_REPO:$TAG"
docker pull "$MIGRATOR_IMAGE_REPO:$TAG"

# Keep `latest` aligned with the tag we just pulled.
docker tag "$IMAGE_REPO:$TAG" "$IMAGE_REPO:latest"

echo "[pull] ✅ done — set IMAGE_TAG=$TAG to deploy this release"
