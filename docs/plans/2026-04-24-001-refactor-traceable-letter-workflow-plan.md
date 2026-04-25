---
title: Refactor Traceable Letter Workflow
type: refactor
status: active
date: 2026-04-24
---

# Refactor Traceable Letter Workflow

## Overview

Shape the existing letters module around the core product concept: every customs letter is handled one at a time, routed through departments/approvers, approved or rejected with traceability, then issued with a verifiable number and QR/token trail.

## Problem Frame

The current app has a strong workflow foundation, but the UI and API still expose demo/admin features that weaken the traceable-letter story. The client needs a simple customs letter system where three departments can approve, route, and reject letters, with proof of what happened and when. Bulk approval, bulk rejection, and similar shortcuts should not exist because they reduce accountability.

## Requirements Trace

- R1. Remove mass/bulk letter workflow actions from the visible product and backend API surface.
- R2. Keep the single-letter lifecycle intact: create, route, submit, approve, reject, issue, print, verify.
- R3. Make traceability more obvious through department, job/reference, status, letter number, and audit information.
- R4. Preserve existing tests and add coverage where behavior is intentionally removed.
- R5. Keep current customs-only scope; defer freight/checklist comparison and broad enterprise workflow features.

## Scope Boundaries

- Do not build the separate invoice/checklist comparison project.
- Do not introduce a new approval engine or new database tables in this pass.
- Do not redesign the whole UI; focus on removing confusing shortcuts and clarifying the workflow.
- Do not remove single-letter approve/reject/submit/issue endpoints.

## Implementation Units

- [x] **Unit 1: Remove Bulk Letter Actions**

**Goal:** Remove mass approve/submit/delete behavior from the API and Dashboard UI.

**Files:**
- Modify: `apps/api/src/app.ts`
- Delete or retire: `apps/api/src/routes/bulk.ts`
- Modify: `apps/api/src/routes.test.ts`
- Modify: `apps/web/src/components/Dashboard.tsx`

**Approach:**
- Stop mounting `bulkRoutes()` so `/api/letters/bulk` is unavailable.
- Remove Dashboard selection state, select-all checkboxes, bulk action controls, and bulk handler code.
- Keep export, filtering, deadline, attachments, and analytics behavior unchanged.
- Add or update API tests to assert the bulk endpoint is gone.

**Verification:**
- Dashboard no longer shows row checkboxes or bulk action controls.
- `POST /api/letters/bulk` returns `404`.
- API tests pass.

- [x] **Unit 2: Make Traceability Fields First-Class**

**Goal:** Make the letter list and workspace clearly show the identifiers that matter for customs tracking.

**Files:**
- Modify: `apps/web/src/components/Dashboard.tsx`
- Modify: `apps/web/src/components/MyTasks.tsx`
- Modify: `apps/web/src/components/LetterWorkspace.tsx`

**Approach:**
- Label `job_reference` as `C Number / Customs Job Reference` in visible UI.
- Show department, current status, pending approver count, and letter number where relevant.
- Prefer single-letter action buttons and audit/history views over broad management language.

**Verification:**
- A user can look at a letter row/card and understand its customs reference, department, status, and issued number if present.

- [x] **Unit 3: Tighten Department Approval Story**

**Goal:** Make the three-department approval concept clearer without inventing a new workflow engine.

**Files:**
- Modify: `apps/web/src/components/LetterWorkspace.tsx`
- Modify: `apps/web/src/components/MyTasks.tsx`
- Modify: `apps/api/src/repositories/letters.ts` if needed for returned summary fields.

**Approach:**
- Use existing `departments`, `user_departments`, and `letter_approver_assignments` data.
- Surface department and approver assignment information in task/workspace views.
- Keep routing explicit: a user routes a single draft to selected approvers/departments.

**Verification:**
- Pending tasks and workspace panels explain who needs to act next and which department owns the letter.

- [x] **Unit 4: Verify End-To-End Workflow**

**Goal:** Prove the focused workflow works after removing shortcuts.

**Files:**
- Modify: `apps/web/tests/smoke.spec.ts` or `apps/web/tests/happy-path.spec.ts` if needed.
- Modify: relevant API tests if new expectations are added.

**Approach:**
- Run API typecheck/tests and web lint/build/e2e.
- Use local MySQL-backed flow where available for the strongest signal.
- Confirm the hosted demo remains usable if redeployed later.

**Verification:**
- Required project checks pass.
- Manual/browser flow confirms create -> route -> submit -> approve/reject -> issue/verify remains available without bulk actions.

## Risks & Notes

- The repo is currently dirty from prior work; avoid reverting unrelated changes.
- Demo mode is in-memory and may not prove full multi-approver behavior.
- Removing the mounted bulk route is safer than deleting every related file immediately if tests or docs still reference it.
