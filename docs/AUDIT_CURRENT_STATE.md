# Audit Current State (Truth Map)

## 1. Letter Lifecycle
*   **Draft**: Created via `POST /api/letters`. Editable by Creator or Admin.
*   **Approved**: Transition via `POST /api/letters/:id/approve`. Requires `APPROVER` or `ADMIN` role. Locked from editing.
*   **Issued**: Transition via `POST /api/letters/:id/issue`. Requires `ISSUER` or `ADMIN`. Generates PDF + QR.
*   **Revoked**: Transition via `POST /api/letters/:id/revoke`. Requires `ISSUER` or `ADMIN`.

## 2. Hashing Logic
The system uses **SHA-256** checksums, but the input payload differs by stage:
*   **Draft Updates** (`version-manager.ts`):
    *   Input: `content` string (Body only).
    *   Purpose: Tracking content changes during drafting.
*   **Issuance** (`index.ts` -> `letter-utils.ts`):
    *   Input: JSON Payload `{ letter_id, version, context, department_id, tag_ids, content }`.
    *   Purpose: Binding the full context and metadata to the document.
    *   **Implication**: A draft hash will NOT match an issuance hash even if content is identical. Verification relies on the Issuance hash.

## 3. Versioning
*   **Source**: `letter_versions` table.
*   **Increment Logic**: `SELECT MAX(version_number) + 1` WHERE `letter_id = ?`.
*   **Triggers**:
    1.  `POST /letters` (Update): Creates a version snapshot.
    2.  `POST /issue`: Creates a *new* version snapshot to lock the state at issuance.

## 4. Verification Flow
1.  **QR Code**: Contains URL `CLIENT_URL/verify/<CONTENT_HASH>`.
2.  **API Call**: `GET /api/verify/<CONTENT_HASH>`.
3.  **Resolution**:
    *   Query `letter_versions` by `content_hash`.
    *   Fetch related `letters`, `approvals`, `issuances`.
    *   Check `letters.status`. If `REVOKED`, return specific revoked payload.
    *   Return `valid: true` and document details.

## 5. Security & Auth
*   **Authentication**:
    *   Mechanism: `x-user-id` header (Custom Middleware).
    *   Implementation: `auth-middleware.ts` fetches `user_roles` from DB.
*   **Authorization**:
    *   Endpoints: Manually check `req.user.roles.includes(...)`.
    *   Roles: `APPROVER`, `ISSUER`, `ADMIN`.
*   **Impersonation Risk**:
    *   Current: **Low** (Middleware enforces `x-user-id` check, body-based IDs removed/ignored in protected routes).
    *   Guard: Application crashes if `x-user-id` is missing on protected routes.

## 6. Known Oddities
*   **Verification 404**: Smoke tests show random 404s on verify. Likely due to RLS propagation or `x-verify-key` logic on the public endpoint.
*   **RLS**: Currently set to **Permissive (Public Write)** for Dev/Demo speed.

