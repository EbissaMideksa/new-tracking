# syntax=docker/dockerfile:1

# ── base ─────────────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS base
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
# Prisma needs OpenSSL at runtime (engine detection).
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

# ── deps ─────────────────────────────────────────────────────────────────────
# postinstall runs `prisma generate`, so the schema must exist before npm ci.
# NODE_ENV is intentionally NOT production here so devDependencies (prisma,
# typescript, tsx…) are installed for the build.
FROM base AS deps
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

# ── builder ──────────────────────────────────────────────────────────────────
FROM base AS builder
# prisma.config.ts resolves DATABASE_URL at generate/build time; provide a build
# placeholder (the real DB is created at runtime on the volume).
ENV DATABASE_URL=file:/app/data/dev.db
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN mkdir -p /app/data && npx prisma generate && npm run build

# ── runner ───────────────────────────────────────────────────────────────────
FROM base AS runner
ENV NODE_ENV=production \
    PORT=3000 \
    DATABASE_URL=file:/app/data/dev.db
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/proxy.ts ./proxy.ts
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/app/generated ./app/generated
COPY --from=builder /app/lib ./lib
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh && mkdir -p /app/data
EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]