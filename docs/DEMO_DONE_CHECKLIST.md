# Demo Done Checklist

| Criteria | Status | Location | Notes |
| :--- | :---: | :--- | :--- |
| **Create Draft** | ✅ PASS | `api/index.ts` | Version snapshot created on save. |
| **Approve (RBAC)** | ✅ PASS | `api/index.ts` | Checks `req.user.roles`. |
| **Issue (PDF+QR)** | ✅ PASS | `api/index.ts` | Generates PDF, links QR. |
| **Verify (404/Valid)** | ✅ PASS | `api/index.ts` | **FIXED**: Corrected column name `approved_at` -> `created_at`. Smoke test passes. |
| **Revoke** | ✅ PASS | `api/index.ts` | Sets status, audit logs action. |
| **Audit Logs** | ✅ PASS | `api/index.ts` | Full lifecycle covered. |
| **No Impersonation** | ✅ PASS | `api/index.ts` | All endpoints use `req.user.id`. |
| **Prod RLS Guard** | ✅ PASS | `api/index.ts:16` | Checks `NODE_ENV` and `SERVICE_ROLE_KEY`. |

## P0 Gaps to Fix
*   ~~Verification Flakiness~~ (SOLVED)
*   ~~RLS Guard~~ (SOLVED)

**Ready for Demo.**
