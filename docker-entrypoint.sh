#!/bin/sh
set -e

# Apply the Prisma schema to the SQLite database on every start (idempotent).
# The DB lives on a persistent volume at /app/data (see docker-compose.yml).
mkdir -p /app/data
echo "[entrypoint] syncing database schema..."
npx prisma db push

# Optional first-run demo data. Set SEED_ON_START=1 to enable.
if [ "${SEED_ON_START:-0}" = "1" ]; then
  echo "[entrypoint] seeding database..."
  npx tsx prisma/seed.ts || echo "[entrypoint] seed skipped or failed (continuing)"
fi

exec npm run start