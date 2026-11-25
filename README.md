# Asset Tracking

A full-stack asset-tracking application built with Next.js (App Router), Prisma
and SQLite. It is a self-contained copy of the previously developed tracking
system, stripped of external infrastructure (no Redis, S3/MinIO, Prometheus or
Docker) so it runs with **zero external services** — just Node.js and a local
SQLite file.

## Features

- **Assets** — register, search, bulk upload (Excel), custom fields, hierarchy,
  checkout/checkin, retire/reactivate, photo upload, per-asset transaction log.
- **Work orders** — create, assign, check-in/out, start, complete, time logging,
  cost tracking, comments, calendar and monitoring views.
- **Organization** — interactive org structure (corporate → divisions →
  departments → sections/groups → zones/regions → local units), geographies,
  operational directors and workforce.
- **Admin** — users, roles, permission matrices (admin + work-order grants),
  per-user overrides, API keys, system settings, audit log.
- **Live updates** — server-sent events (in-process pub/sub).
- **Auth** — JWT cookie sessions, forced password change, rate limiting.

## Tech

- Next.js 16 (App Router), React 19, Tailwind CSS v4
- Prisma 7 with the libSQL adapter over a local SQLite database (`./dev.db`)
- `jsonwebtoken` for auth, `bcryptjs` for password hashing
- Local filesystem storage for avatars (`public/uploads/avatars`)

## Getting started

```bash
npm install
cp .env.example .env      # or edit .env (DATABASE_URL, JWT_SECRET)
npm run db:push           # create the SQLite schema
npm run db:seed           # optional: seed demo data (admin@track.com / Test@123)
npm run dev               # http://localhost:3000
```

Production:

```bash
npm run build
npm run start
```

## Configuration (`.env`)

| Variable            | Default            | Purpose                                  |
| ------------------- | ------------------ | ---------------------------------------- |
| `DATABASE_URL`      | `file:./dev.db`    | SQLite file (relative to project root).  |
| `JWT_SECRET`        | (set a value)      | JWT signing secret, min 32 chars.        |
| `LOG_LEVEL`         | `info`             | pino log level.                          |
| `PHOTO_STORAGE`     | `local`            | Photo storage backend (local only).      |

## Default accounts (after seeding)

| Role        | Email               | Password   |
| ----------- | ------------------- | ---------- |
| SUPER_ADMIN | `super@track.com`   | `Test@123` |
| ADMIN       | `admin@track.com`   | `Test@123` |

Change `DEFAULT_USER_PASSWORD` / `SEED_ADMIN_PASSWORD` before seeding for
anything beyond local use.

## Notes

- This edition uses SQLite: enum-like columns are stored as strings and JSON
  payloads as text. The canonical enum values live in `lib/enums.ts`.
- Redis, S3/MinIO, Prometheus metrics and Docker have been replaced with
  in-process/local equivalents (`lib/redis.ts`, `lib/broadcast.ts`,
  `lib/storage.ts`, `lib/metrics.ts`).
- The Prisma client is generated into `app/generated/prisma` (git-ignored).# new-tracking
