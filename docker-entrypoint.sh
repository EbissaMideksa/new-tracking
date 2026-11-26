#!/bin/sh
set -e

# Apply the Prisma schema to the PostgreSQL database on every start
# (idempotent). The DB is the `db` service defined in docker-compose.yml and is
# already healthy before this container starts (depends_on: service_healthy).
echo "[entrypoint] syncing database schema..."
npx prisma db push

# Optional first-run demo data. Set SEED_ON_START=1 to enable.
if [ "${SEED_ON_START:-0}" = "1" ]; then
  echo "[entrypoint] seeding database..."
  npx tsx prisma/seed.ts || echo "[entrypoint] seed skipped or failed (continuing)"
fi

exec npm run start