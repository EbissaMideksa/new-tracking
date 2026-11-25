#!/bin/bash
# scripts/rollback.sh — instant rollback to the previous release.
#
# The images are immutable and tagged by SHA, so a rollback means: resolve the
# SHA recorded by the last deploy, pull that exact artifact if it is no longer
# local, start the idle blue/green slot with it, and switch nginx to it.
#
# Usage:  ./scripts/rollback.sh   # or:  make rollback

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Operate on the live stack directory, not the runner's throwaway checkout:
# .env.docker.cloud, nginx/ssl and .deploy/ are gitignored and live only here.
STACK_DIR="${STACK_DIR:-$(dirname "$HERE")}"
if [ ! -d "$STACK_DIR" ]; then
  echo "[rollback] ❌ STACK_DIR '$STACK_DIR' does not exist"
  exit 1
fi
cd "$STACK_DIR"

ACTIVE_FILE=".deploy/active"
PREVIOUS_FILE=".deploy/previous-sha"
LAST_SHA_FILE=".deploy/last-sha"
NGINX="asset_tracking_nginx"
ENV_FILE=".env.docker.cloud"

read_env() {
  local key="$1"
  [ -f "$ENV_FILE" ] || return 0
  sed -n "s/^${key}=//p" "$ENV_FILE" | tail -n1
}

ACTIVE=$(cat "$ACTIVE_FILE" 2>/dev/null || echo "blue")
if [ "$ACTIVE" = "blue" ]; then PREV="green"; else PREV="blue"; fi

# The SHA currently live, i.e. the release this rollback abandons.
ABANDONED_SHA=""
if [ -f "$LAST_SHA_FILE" ]; then
  ABANDONED_SHA=$(cat "$LAST_SHA_FILE" 2>/dev/null || true)
fi

echo "── rollback: app-$ACTIVE → app-$PREV ────"

# The release to return to. previous-sha is written by deploy.sh; fall back to
# last-sha so a first rollback after an older deploy still resolves.
TARGET_SHA=""
if [ -f "$PREVIOUS_FILE" ]; then
  TARGET_SHA=$(cat "$PREVIOUS_FILE" 2>/dev/null || true)
fi
if [ -z "$TARGET_SHA" ] && [ -f "$LAST_SHA_FILE" ]; then
  TARGET_SHA=$(cat "$LAST_SHA_FILE" 2>/dev/null || true)
fi

export IMAGE_REPO="${IMAGE_REPO:-$(read_env IMAGE_REPO)}"
export MIGRATOR_IMAGE_REPO="${MIGRATOR_IMAGE_REPO:-$(read_env MIGRATOR_IMAGE_REPO)}"

if [ -z "$IMAGE_REPO" ]; then
  echo "[rollback] ❌ IMAGE_REPO missing — set it in $ENV_FILE"
  exit 1
fi

COMPOSE="docker compose \
  -f docker-compose-cloud.yml \
  -f docker-compose-monitoring.yml \
  --env-file $ENV_FILE"

if [ -n "$TARGET_SHA" ]; then
  export IMAGE_TAG="$TARGET_SHA"
  echo "[rollback] target release: $IMAGE_REPO:$TARGET_SHA"

  # shellcheck source=./registry-login.sh
  . "$HERE/registry-login.sh"

  # The rollback image may have been evicted since the last deploy.
  if ! docker image inspect "$IMAGE_REPO:$TARGET_SHA" >/dev/null 2>&1; then
    echo "[rollback] image not local — pulling..."
    docker pull "$IMAGE_REPO:$TARGET_SHA"
    docker pull "$MIGRATOR_IMAGE_REPO:$TARGET_SHA"
  else
    echo "[rollback] image already present locally"
  fi
else
  # No recorded SHA: fall back to whatever compose resolves. This preserves the
  # old behaviour for stacks that predate SHA-tagged releases.
  export IMAGE_TAG="${IMAGE_TAG:-$(read_env IMAGE_TAG)}"
  echo "[rollback] ⚠ no previous SHA recorded — falling back to IMAGE_TAG=${IMAGE_TAG:-latest}"
fi

# 1. Start the previous instance
echo "[rollback] starting app-$PREV ..."
$COMPOSE up -d --no-deps --no-build "app-$PREV"

# 2. Wait for healthy
echo "[rollback] waiting for app-$PREV health ..."
for i in $(seq 1 30); do
  status=$(docker inspect \
    --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' \
    "asset_tracking_app_$PREV" \
    2>/dev/null || echo "missing")

  if [ "$status" = "healthy" ]; then
    echo "[rollback] app-$PREV healthy after ${i}s"
    break
  fi

  if [ "$i" -eq 30 ]; then
    echo "[rollback] ❌ app-$PREV failed to start"
    exit 1
  fi

  sleep 1
done

# 3. Switch nginx (instant)
echo "[rollback] switching nginx → app-$PREV ..."
docker exec "$NGINX" sh -c \
  "echo 'set \$upstream_app app-$PREV:3000;' > /etc/nginx/conf.d/upstream.conf"
docker exec "$NGINX" nginx -s reload

# 4. Stop the current instance
echo "[rollback] stopping app-$ACTIVE ..."
$COMPOSE stop "app-$ACTIVE" 2>/dev/null || true

# 5. Update state so the next rollback goes back the other way.
#    We abandoned RELEASE; that SHA becomes the next rollback target, while the
#    SHA we rolled back to becomes the currently-live release.
echo "$PREV" > "$ACTIVE_FILE"

if [ -n "$TARGET_SHA" ]; then
  if [ -n "${ABANDONED_SHA:-}" ]; then
    echo "$ABANDONED_SHA" > "$PREVIOUS_FILE"
  else
    rm -f "$PREVIOUS_FILE"
  fi
  echo "$TARGET_SHA" > "$LAST_SHA_FILE"
fi

echo "[rollback] ✅ rolled back to app-$PREV"
[ -n "$TARGET_SHA" ] && echo "[rollback] image: $IMAGE_REPO:$TARGET_SHA"
exit 0
