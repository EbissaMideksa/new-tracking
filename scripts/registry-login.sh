#!/bin/bash
# scripts/registry-login.sh — authenticate to GHCR so `docker pull` works.
#
# Public packages need no login; private ones need a read:packages PAT.
# Credentials live in .env.docker.cloud (gitignored) as GHCR_USERNAME/GHCR_TOKEN.
#
# Sourced by deploy.sh and rollback.sh; also usable directly: make login

set -euo pipefail

ENV_FILE="${ENV_FILE:-.env.docker.cloud}"
REGISTRY="${REGISTRY:-ghcr.io}"

# Read a single key from the env file without sourcing it (values may contain
# characters that would break a blind `source`).
read_env() {
  local key="$1"
  [ -f "$ENV_FILE" ] || return 0
  sed -n "s/^${key}=//p" "$ENV_FILE" | tail -n1
}

GHCR_USERNAME="${GHCR_USERNAME:-$(read_env GHCR_USERNAME)}"
GHCR_TOKEN="${GHCR_TOKEN:-$(read_env GHCR_TOKEN)}"

if [ -z "$GHCR_TOKEN" ]; then
  echo "[registry] GHCR_TOKEN not set in $ENV_FILE — attempting an anonymous pull."
  echo "[registry] Set GHCR_USERNAME/GHCR_TOKEN if the package is private."
  return 0 2>/dev/null || exit 0
fi

echo "[registry] logging in to $REGISTRY as ${GHCR_USERNAME:-<unset>}"
printf '%s' "$GHCR_TOKEN" | docker login "$REGISTRY" \
  --username "${GHCR_USERNAME:-<token>}" --password-stdin >/dev/null

echo "[registry] ok"
