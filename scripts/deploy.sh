
#!/bin/bash
# scripts/deploy.sh — true blue/green zero-downtime deploy.
#
# GHA builds and publishes the immutable Docker artifact to GHCR; this script
# pulls that exact artifact and deploys it on the WSL2 host.
#
# This is invoked by .github/workflows/deploy.yml on the self-hosted runner.
# There is deliberately no `make deploy`: releasing is owned by CI/CD, so a
# release can only happen from a commit that actually passed CI. Redeploy a
# specific release through the Actions tab (workflow_dispatch).
#
# Usage: ./scripts/deploy.sh            # deploy IMAGE_TAG, default = git HEAD

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# The directory holding the *live* stack: .env.docker.cloud, nginx/ssl and the
# .deploy/ state are all gitignored, so they exist only in the real checkout.
# A GitHub Actions checkout lands in the runner's _work/ directory and would
# resolve those paths to nothing, so the deploy must be pointed at STACK_DIR.
STACK_DIR="${STACK_DIR:-$(dirname "$HERE")}"
if [ ! -d "$STACK_DIR" ]; then
  echo "[deploy] ❌ STACK_DIR '$STACK_DIR' does not exist"
  exit 1
fi
cd "$STACK_DIR"

ACTIVE_FILE=".deploy/active"
PREVIOUS_FILE=".deploy/previous-sha"
LAST_SHA_FILE=".deploy/last-sha"
NGINX="asset_tracking_nginx"
ENV_FILE=".env.docker.cloud"

# Registry coordinates come from the env file so this host never hard-codes them.
read_env() {
  local key="$1"
  [ -f "$ENV_FILE" ] || return 0
  sed -n "s/^${key}=//p" "$ENV_FILE" | tail -n1
}

SHA=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")

if [ "$SHA" = "unknown" ]; then
  echo "[deploy] ❌ could not determine Git SHA"
  exit 1
fi

ACTIVE=$(cat "$ACTIVE_FILE" 2>/dev/null || echo "blue")

if [ "$ACTIVE" = "blue" ]; then
  INACTIVE="green"
else
  INACTIVE="blue"
fi

echo "── deploy: git sha=$SHA (blue/green: $ACTIVE → $INACTIVE) ────"

# Compose receives the exact immutable artifact tag.
# Default to the SHA of the checked-out commit. An explicit IMAGE_TAG wins, so
# workflow_dispatch can redeploy a specific older release.
export IMAGE_REPO="${IMAGE_REPO:-$(read_env IMAGE_REPO)}"
export MIGRATOR_IMAGE_REPO="${MIGRATOR_IMAGE_REPO:-$(read_env MIGRATOR_IMAGE_REPO)}"
DEPLOY_SHA="${IMAGE_TAG:-$SHA}"
export IMAGE_TAG="$DEPLOY_SHA"

if [ "$DEPLOY_SHA" != "$SHA" ]; then
  echo "[deploy] ⚠ deploying explicit IMAGE_TAG=$DEPLOY_SHA (HEAD is $SHA)"
fi

if [ -z "$IMAGE_REPO" ] || [ -z "$MIGRATOR_IMAGE_REPO" ]; then
  echo "[deploy] ❌ IMAGE_REPO / MIGRATOR_IMAGE_REPO missing."
  echo "[deploy]    Expected $STACK_DIR/$ENV_FILE to exist and define them."
  if [ "$STACK_DIR" != "$(dirname "$HERE")" ]; then
    echo "[deploy]    STACK_DIR was set to $STACK_DIR — check it points at the live checkout."
  fi
  exit 1
fi

# Idempotency: a re-run of the same release must not flip blue/green for nothing.
# Actions can retry a job, and a manual dispatch can target an already-live SHA.
LIVE_SHA=$(cat "$LAST_SHA_FILE" 2>/dev/null || echo "")
if [ -n "$LIVE_SHA" ] && [ "$LIVE_SHA" = "$DEPLOY_SHA" ]; then
  if docker inspect --format '{{.State.Health.Status}}' "asset_tracking_app_$ACTIVE" 2>/dev/null | grep -q healthy; then
    echo "[deploy] ✅ already live and healthy at $DEPLOY_SHA — nothing to do"
    exit 0
  fi
  echo "[deploy] $DEPLOY_SHA is recorded as live but app-$ACTIVE is not healthy — redeploying"
fi

COMPOSE="docker compose \
  -f docker-compose-cloud.yml \
  -f docker-compose-monitoring.yml \
  --env-file $ENV_FILE"

# 0. Authenticate to GHCR (no-op for a public package).
# shellcheck source=./registry-login.sh
. "$HERE/registry-login.sh"

# 1. Pull the exact artifact produced by GitHub Actions.
echo "[deploy] pulling application image $IMAGE_REPO:$DEPLOY_SHA ..."
docker pull "$IMAGE_REPO:$DEPLOY_SHA"

echo "[deploy] pulling migrator image $MIGRATOR_IMAGE_REPO:$DEPLOY_SHA ..."
docker pull "$MIGRATOR_IMAGE_REPO:$DEPLOY_SHA"

# Point the floating `latest` tag at this release so a plain `docker compose up`
# outside a deploy still resolves to the release that is currently live.
docker tag "$IMAGE_REPO:$DEPLOY_SHA" "$IMAGE_REPO:latest"

# 2. Apply pending migrations before the new instance serves traffic.
echo "[deploy] applying pending migrations..."
$COMPOSE run --rm --no-deps migrate

# 3. Start inactive instance.
#    --no-build guarantees that production never builds from source.
echo "[deploy] starting app-$INACTIVE..."
$COMPOSE up -d --no-deps --no-build "app-$INACTIVE"

# 4. Wait for health.
echo "[deploy] waiting for app-$INACTIVE health..."

for i in $(seq 1 30); do
  status=$(docker inspect \
    --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' \
    "asset_tracking_app_$INACTIVE" \
    2>/dev/null || echo "missing")

  if [ "$status" = "healthy" ]; then
    echo "[deploy] app-$INACTIVE healthy after ${i}s"
    break
  fi

  if [ "$i" -eq 30 ]; then
    echo "[deploy] ❌ app-$INACTIVE failed — app-$ACTIVE still serving"
    $COMPOSE stop "app-$INACTIVE" 2>/dev/null || true
    exit 1
  fi

  sleep 1
done

# 5. Switch nginx.
echo "[deploy] switching nginx → app-$INACTIVE..."

docker exec "$NGINX" sh -c \
  "echo 'set \$upstream_app app-$INACTIVE:3000;' > /etc/nginx/conf.d/upstream.conf"

docker exec "$NGINX" nginx -s reload

# 6. Stop old active instance.
echo "[deploy] stopping app-$ACTIVE..."

$COMPOSE stop "app-$ACTIVE" 2>/dev/null || true

# 7. Record active instance and deployed SHA.
#    previous-sha is what `make rollback` pins to, so capture the outgoing
#    release *before* overwriting last-sha.
echo "$INACTIVE" > "$ACTIVE_FILE"
if [ -f "$LAST_SHA_FILE" ]; then
  cp "$LAST_SHA_FILE" "$PREVIOUS_FILE"
fi
echo "$DEPLOY_SHA" > "$LAST_SHA_FILE"

# `image prune` only removes *dangling* (untagged) layers, so the SHA-tagged
# releases — including the one we may need to roll back to — are left intact.
echo "[deploy] pruning dangling images..."
docker image prune -f >/dev/null 2>&1 || true

echo "[deploy] ✅ zero-downtime deploy complete"
echo "[deploy] active: app-$INACTIVE"
echo "[deploy] image: $IMAGE_REPO:$DEPLOY_SHA"
if [ -f "$PREVIOUS_FILE" ]; then
  echo "[deploy] rollback target: $IMAGE_REPO:$(cat "$PREVIOUS_FILE")"
fi
echo "[deploy] rollback: make rollback"
