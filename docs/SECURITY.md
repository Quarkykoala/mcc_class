# Security & Deployment Guide

## Hard Mode (Production)
The application now enforces "Hard Mode" when `NODE_ENV=production` or `HARD_MODE=true`.

### RLS Posture
*   **Permissive Policies Dropped**: "Public Write" policies have been removed from the database.
*   **Strict Access**: The Database denies all direct access via Anon Key for write operations.
*   **API Privileges**: The API Server acts as the **Service Role** (`SUPABASE_SERVICE_ROLE_KEY`) to bypass RLS and strictly enforce RBAC via the `x-user-id` middleware.

### Required Environment Variables
In Hard Mode, the following are **MANDATORY**:
*   `SUPABASE_URL`
*   `SUPABASE_SERVICE_ROLE_KEY` (Required for API to write to DB)

If `SUPABASE_SERVICE_ROLE_KEY` is missing in Hard Mode, the API will refuse to start.

## Impersonation Prevention
All state-changing endpoints derive the Actor ID from the authenticated request (`req.user.id`).
*   `created_by`
*   `approver_id`
*   `issued_by`
*   `revoked_by`
*   `captured_by` (Acknowledgements)
*   `classified_by` (Email Links)

The `x-user-id` header is the **sole source of truth** for identity in the current architecture.
