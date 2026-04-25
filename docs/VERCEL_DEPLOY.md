# Vercel Deployment

This repo is best deployed to Vercel as two monorepo projects:

1. `mcc-class-api`
2. `mcc-class-web`

That matches Vercel's stable support for:
- Express backends as standalone Vercel projects
- Vite frontends as standalone Vercel projects

It avoids relying on Vercel Services, which is still private beta as of March 11, 2026.

## Project 1: API

Create a Vercel project with:
- Root Directory: `apps/api`
- Framework Preset: `Express`

Required environment variables:

```env
MYSQL_HOST=
MYSQL_PORT=
MYSQL_USER=
MYSQL_PASSWORD=
MYSQL_DATABASE=
JWT_SECRET=
JWT_EXPIRES_IN=7d
DEMO_MODE=false
CLIENT_URL=https://<your-web-project>.vercel.app
```

Notes:
- `CLIENT_URL` must point at the web deployment so verification links and issue flows build the right URL.
- The MySQL database must be reachable from Vercel.
- Do not set `VERIFY_ACCESS_KEY` for a public demo QR flow unless the web verification page is also updated to send that key.

## Project 2: Web

Create a Vercel project with:
- Root Directory: `apps/web`
- Framework Preset: `Vite`

Required environment variables:

```env
VITE_API_URL=https://<your-api-project>.vercel.app/api
```

Notes:
- `apps/web/vercel.json` rewrites all deep links to `index.html`, which is required for routes like `/verify/:token`.
- If you want preview-to-preview API pairing, configure this through Vercel's monorepo + related-project workflow in the dashboard.

## Preview Flow

For a demo branch:

1. Push the branch to GitHub.
2. Confirm both Vercel projects are connected to the same repository.
3. Open the branch preview for the API project.
4. Update the web preview environment only if you are not using related-project automation.
5. Open the web preview and test direct demo entry, draft save, route, submit, approve/reject, issue, audit trail, and verification links.

## Production / Main Merge Flow

Use this sequence when the demo branch is approved:

1. Confirm required checks are green.
2. Merge the feature branch into `main`.
3. Let Vercel create the production deployments for both projects from `main`.
4. Update `CLIENT_URL` on the API project to the production web URL if it changed.
5. Smoke test the production flow:
   - open the app and confirm the expected auth/demo mode
   - create/open a draft
   - route to approvers
   - submit / approve / issue
   - view the audit trail
   - open `/verify/:token`
