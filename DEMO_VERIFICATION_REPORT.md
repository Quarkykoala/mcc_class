# Demo Mode / Guest Login Verification Report

This report summarizes the findings from the end-to-end verification of the Demo Mode and Guest Login flow.

## 1. Frontend: "Login as Guest / Demo" Button

**Finding:** The "Login as Guest / Demo" button does **not** bypass Supabase auth.

*   **File:** `apps/web/src/App.tsx`
*   **Condition:** The `onClick` handler of the button.
*   **Description:** The button triggers a standard Supabase login using hardcoded credentials:
    ```typescript
    const { error } = await supabase.auth.signInWithPassword({
        email: 'demo@mcc.local',
        password: 'Demo@12345',
    });
    ```
*   **Impact:** If the goal is to "bypass Supabase auth" (i.e., work without hitting the auth service or requiring a real user account in the database), this implementation fails. It requires the auth service to be running and the user `demo@mcc.local` to exist.
*   **Correct Behavior (Implied):** The button should likely emulate the behavior of the `useEffect` block that handles `VITE_DEMO_MODE=true`, setting the session state directly in the React component without network calls to Supabase Auth.

## 2. Backend: Demo Mode RLS Violations

**Finding:** Running the backend in `DEMO_MODE=true` without a `SUPABASE_SERVICE_ROLE_KEY` (e.g., standard local dev or "non-technical" setup) will cause Row Level Security (RLS) violations.

*   **File:** `apps/api/src/auth-middleware.ts` and `apps/api/src/index.ts`
*   **Condition:** `DEMO_MODE=true` is set, and `SUPABASE_SERVICE_ROLE_KEY` is missing (falling back to `SUPABASE_ANON_KEY`).
*   **Description:**
    1.  `authMiddleware` bypasses JWT verification and injects a hardcoded user (`00000000-0000-0000-0000-000000000001`).
    2.  It initializes `req.supabase` using `createClient(supabaseUrl, supabaseKey)`.
    3.  If `supabaseKey` falls back to the Anon Key (common in non-hardened setups), the client is unauthenticated (anonymous).
    4.  When an endpoint (e.g., `POST /api/letters`) attempts to insert data with `created_by: req.user.id`, the database RLS policy checks if `auth.uid() == created_by`.
    5.  Since the client is anonymous, `auth.uid()` is `null`. The check `null == '00000000-...'` fails.
*   **Impact:** All write operations (Create Draft, Approve, Issue, etc.) fail with RLS errors.
*   **Blocker:** This blocks demo usage unless the user provides the Service Role Key, which overrides all RLS.

## 3. Backend: Fixed Demo User Injection

**Status:** Verified.
*   The middleware correctly injects the user:
    ```typescript
    req.user = {
        id: '00000000-0000-0000-0000-000000000001',
        roles: ['ADMIN', 'APPROVER', 'ISSUER']
    };
    ```

## 4. API + DB Workflows

**Status:** **Failed** (Conditional).
*   **Create draft letter:** Fails due to RLS if Service Role Key is missing.
*   **Add tags:** Fails due to RLS if Service Role Key is missing.
*   **Approve letter:** Fails due to RLS if Service Role Key is missing.
*   **Issue letter:** Fails due to RLS if Service Role Key is missing.
*   **View issued letters:** Likely succeeds (Public Read) or fails if policies require `auth.uid()` (e.g. "View own letters").

## Summary

The current Demo Mode implementation is fragile.
1.  **Frontend:** relies on a real login instead of a simulation.
2.  **Backend:** relies on the Service Role Key (Admin privileges) to function, otherwise it is blocked by the very security rules (RLS) it tries to bypass via `req.user` injection.
