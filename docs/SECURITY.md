# Security & Deployment Guide

## Hard Mode (Production)
The application now enforces "Hard Mode" when `NODE_ENV=production` or `HARD_MODE=true`.

### Access Control
*   **Application-Level RBAC**: All access control is enforced at the API layer via JWT authentication and role-based checks.
*   **MySQL Connection**: The API connects to MySQL using `mysql2` connection pool configured via environment variables.
*   **Custom JWT Auth**: Authentication uses `jsonwebtoken` + `bcryptjs` for user registration, login, and token verification.

### Required Environment Variables
In Hard Mode, the following are **MANDATORY**:
*   `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE`
*   `JWT_SECRET` (Required for token signing/verification)

## Impersonation Prevention
All state-changing endpoints derive the Actor ID from the authenticated request (`req.user.id`).
*   `created_by`
*   `approver_id`
*   `issued_by`
*   `revoked_by`
*   `captured_by` (Acknowledgements)
*   `classified_by` (Email Links)

The JWT `sub` claim is the **sole source of truth** for identity in the current architecture.
