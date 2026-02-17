# AGENT.md

## Project
MCC Letter Issuance System monorepo.

- API: `apps/api` (Express + TypeScript + Supabase)
- Web: `apps/web` (React + Vite + TypeScript)
- DB migrations: `supabase/migrations`

## Primary Goal
Keep the full lifecycle reliable in local/dev environments:

`DRAFT -> SUBMITTED -> APPROVED -> ISSUED -> VERIFY`

Also keep demo helpers working even on partially migrated schemas.

## Runbook
- Install: `npm install`
- Run both services: `npm run dev`
- API only: `npm run dev -w @mcc/api`
- Web only: `npm run dev -w web`
- Build all: `npm run build`
- Lint all: `npm run lint`
- API tests: `npm run test -w @mcc/api`
- Web e2e tests: `npm run test:web`

## Required Checks Before Finishing Changes
1. `npm run typecheck -w @mcc/api`
2. `npm run test -w @mcc/api`
3. `npm run lint -w web`
4. `npm run build -w web`

## Implementation Rules
- Prefer schema-compatible API behavior (graceful fallback for missing tables/columns in demo/dev).
- Do not break existing workflow endpoints:
  - `/api/letters/:id/submit`
  - `/api/letters/:id/approve`
  - `/api/letters/:id/reject`
  - `/api/letters/:id/issue`
- Keep Stage Panel behavior consistent with backend status updates.
- If changing demo tools in `apps/web/src/components/DemoDebugMenu.tsx`, always refresh after mutations and show explicit errors.

## Data Safety
- Never run destructive global cleanup blindly.
- If deleting demo data, scope to demo/draft use-cases and report deleted counts.
- Preserve auditability wherever possible (`audit_logs` entries for admin/demo cleanup actions).

## Notes
- Local environments may miss newer DB migrations.
- API should prefer compatibility over hard failure in `DEMO_MODE=true`.
