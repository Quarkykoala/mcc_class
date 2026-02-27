# Letter Commander (MCC Letter Issuance System)

A controlled letter lifecycle system for drafting, approval, issuance, printing, verification, and acknowledgement evidence.

Current focus is `COMPANY` context (BCBA paths remain in codebase but are not the primary workflow).

## What Is Built

- Single workspace for letter drafting and stage-based operations
- Lifecycle states: `DRAFT -> SUBMITTED -> APPROVED/REJECTED -> ISSUED -> REVOKED`
- Manual routing with approver assignment
- "My Pending Approvals" panel for actionable submitted letters
- Controlled issuance with verification payload generation
- Print audit trail (user, time, printer, source IP)
- Tag-based metadata and department visibility controls
- Acknowledgement capture linked to letter and optional `job_reference`
- Demo tools for generating flow data and cleaning excess drafts

## Workflow Semantics

- `Save Draft`: persist editable draft content
- `Route`: assign approver(s) and routing metadata
- `Submit`: move `DRAFT` to `SUBMITTED` for approval
- `Approve` / `Reject`: approver decision on submitted letter
- `Issue`: create issuance/version record for approved letter
- `Print`: record print event for issued letter

Only valid stage transitions are allowed by API checks.

## Project Structure

- `apps/api` - Express + TypeScript API (MySQL-backed)
- `apps/web` - React + Vite frontend
- `mysql/schema.sql` - MySQL schema
- `scripts` - smoke and helper scripts

## Prerequisites

- Node.js 18+
- npm
- MySQL 8.0+ server

## Environment Setup

### API (`apps/api/.env`)

Create `apps/api/.env`:

```env
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=
MYSQL_DATABASE=mcc
JWT_SECRET=<your-jwt-secret>
PORT=3000
CLIENT_URL=http://localhost:5173
DEMO_MODE=true
# Optional: secure verify endpoint in non-demo env
# VERIFY_ACCESS_KEY=<internal-key>
```

### Web (`apps/web/.env`)

Create `apps/web/.env`:

```env
VITE_API_URL=http://localhost:3000/api
```

## Install and Run

```bash
npm install
npm run dev
```

- Web: `http://localhost:5173`
- API: `http://localhost:3000`

## Database Setup

Apply the MySQL schema from `mysql/schema.sql`:

```bash
mysql -u root -p mcc < mysql/schema.sql
```

This creates all tables, indexes, and seed data needed for the application.

## Quality Gates

Run these before shipping:

```bash
# API
npm run typecheck -w @mcc/api
npm run test -w @mcc/api
npm run build -w @mcc/api

# Web
npm run lint -w web
npm run build -w web
npm run test:web
```

## Core API Endpoints (Current)

- Letters:
  - `GET /api/letters`
  - `GET /api/letters/:id`
  - `POST /api/letters`
- Workflow:
  - `POST /api/letters/:id/routing`
  - `POST /api/letters/:id/submit`
  - `POST /api/letters/:id/approve`
  - `POST /api/letters/:id/reject`
  - `POST /api/letters/:id/issue`
  - `POST /api/letters/:id/print`
  - `POST /api/letters/:id/revoke`
- Approvals:
  - `GET /api/approvers`
  - `GET /api/approvals/pending`
- Verification:
  - `GET /api/verify/:token` (internal access policy configurable)
- Evidence:
  - `POST /api/acknowledgements`
  - `GET /api/acknowledgements`

## Demo Operations

From the floating wand menu in the web app:

- Generate random drafts
- Approve pending drafts
- Issue approved letters
- Generate full flow dataset
- Cleanup 90% of drafts

## Notes

- COMPANY is the primary V1 workflow.
- BCBA-related code paths exist but are not the active implementation focus.
- Email-classifier integration is future scope.
