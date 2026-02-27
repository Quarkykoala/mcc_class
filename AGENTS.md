# AGENTS.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Project overview
- Monorepo with npm workspaces (`apps/*`).
- `apps/api`: Express + TypeScript API backed by MySQL.
- `apps/web`: React + Vite frontend.
- Database schema and seed data live in `mysql/schema.sql`.

## Common commands
### Install
- `npm install`
- `npm run setup` (installs deps and initializes DB)

### Run (dev)
- `npm run dev` (API + web concurrently)
- `npm run dev -w @mcc/api` (API only)
- `npm run dev -w web` (web only)

### Build / lint / typecheck
- `npm run build` (API + web)
- `npm run lint` (API + web)
- `npm run typecheck -w @mcc/api`

### Tests
- `npm run test -w @mcc/api` (API tests)
- `npm run test -w @mcc/api -- <test-file-or-pattern>` (single API test via Vitest)
- `npm run test:web` (web e2e tests via Playwright)
- `npm run test:e2e -w web -- <spec-or-path>` (single web e2e spec)
- `npm run test:e2e -w web -- --grep "<text>"` (filter Playwright tests)
### Required checks before finishing changes (project expectation)
- `npm run typecheck -w @mcc/api`
- `npm run test -w @mcc/api`
- `npm run lint -w web`
- `npm run build -w web`

### Database and scripts
- `mysql -u root -p mcc < mysql/schema.sql` (apply schema)
- `npm run db:init` (initialize DB via API script)
- `npm run db:smoke` (smoke test scripts)
- `npm run cleanup` (demo data cleanup)

## Architecture and code flow
### API (`apps/api`)
- Entry point is `apps/api/src/index.ts`, which defines all routes and mounts `auth-routes` before `authMiddleware`. After auth, most endpoints rely on role checks and the letter lifecycle state machine.
- MySQL access is centralized in `apps/api/src/db.ts` (pool, query helpers, and transaction wrapper). Most endpoints use these helpers directly with raw SQL.
- Letter lifecycle enforcement lives in route handlers (`DRAFT -> SUBMITTED -> APPROVED/REJECTED -> ISSUED -> REVOKED`), with issuance happening inside a transaction that creates `letter_versions`, increments `letter_number_seq`, and writes `issuances` plus `audit_logs`.
- Verification is served by `/api/verify/:token`, accepting either a UUID token or content hash and returning a normalized verification payload.
- Auth is custom JWT-based; see `apps/api/src/auth-routes.ts` and `apps/api/src/auth-middleware.ts`. Roles gate routes (APPROVER, ISSUER, ADMIN).
- API uses mysql2 raw SQL via helpers in `apps/api/src/db.ts`. Keep endpoint behavior compatible, especially workflow routes: `/api/letters/:id/submit`, `/api/letters/:id/approve`, `/api/letters/:id/reject`, `/api/letters/:id/issue`.
- In `DEMO_MODE=true`, prefer compatibility over hard failure.
- Demo cleanup must be scoped (drafts/demo) and should record `audit_logs` entries with deleted counts.

### Web (`apps/web`)
- App entry is `apps/web/src/App.tsx` which handles session, data fetches, and switching between `LetterWorkspace` and `Dashboard`. It also supports a `/verify/:token` read-only view.
- Frontend auth lives in `apps/web/src/lib/auth.ts` (localStorage session + `/auth/login` and `/auth/me` endpoints).
- The main workflow UI is in `apps/web/src/components/LetterWorkspace.tsx` with demo tooling in `DemoDebugMenu.tsx`.
- API base URL is `VITE_API_URL` (fallbacks to `/api`).
