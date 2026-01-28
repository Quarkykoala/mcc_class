# MCC Letter Issuance System

> **A secure platform for drafting, approving, and verifying official letters.**

The **MCC Letter Issuance System** helps organizations generate tamper-proof official documents. It uses a strict "Draft -> Approve -> Issue" workflow, enforced by digital signatures and role-based security.

---

## ⚡ How It Works

```mermaid
graph LR
    A[Draft Letter] --> B{Approval}
    B -- Manager --> C[Approved]
    B -- Committee --> C
    C --> D{Issuance}
    D -- Official --> E[Issued Letter]
    E --> F[Generate PDF + QR]
    E --> G[Immutable Record]
    F -.-> H(Public Verification)
```

---

## ✨ Key Features

-   **Role-Based Security**: Users Create, Managers Approve, and Admins Issue.
-   **Committee Mode**: Special letters require approval from specific committee members.
-   **Tamper-Proof**: Once issued, letters are "frozen" and cannot be changed.
-   **Public Verification**: Anyone can scan the QR code to verify validity.
-   **Audit Logs**: Every action (create, edit, approve) is recorded forever.

---

## 🚀 Quick Start

### 1. Prerequisites
-   Node.js (v18+)
-   Supabase Project

### 2. Install & Setup
```bash
# Clone and Install
git clone <repo-url>
npm install

# Setup Environment
cp apps/api/.env.example apps/api/.env
# Fill in your SUPABASE_URL and KEYS
```

#### Frontend Environment
Create `apps/web/.env` (or copy the example):
```bash
cp apps/web/.env.example apps/web/.env

VITE_API_URL=http://localhost:3000/api
VITE_SUPABASE_URL=<your-supabase-url>
VITE_SUPABASE_ANON_KEY=<your-supabase-anon-key>
# Optional: bypass auth for local demo/testing
VITE_DEMO_MODE=true
```

#### API Environment
Create `apps/api/.env` (or copy the example):
```bash
cp apps/api/.env.example apps/api/.env
```

### 3. Run the App
```bash
# Run everything (API + Frontend)
npm run dev
```

-   **Web App**: `http://localhost:5173`
-   **API**: `http://localhost:3000`

---

## 🌍 Deploy on Render (Demo-Friendly)

Best setup is **two services**: one API (Web Service) + one Web app (Static Site).

### API (Web Service)
**Build Command**
```bash
npm install --workspaces --include-workspace-root
```

**Start Command**
```bash
npm run -w @mcc/api dev
```

**Environment Variables**
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (recommended for demo)
- `PORT` (Render injects)
- `CLIENT_URL` = your Web app URL on Render
- `DEMO_MODE=true`

### Web (Static Site)
**Build Command**
```bash
npm run -w web build
```

**Publish Directory**
```
apps/web/dist
```

**Environment Variables**
- `VITE_API_URL` = your API URL on Render + `/api`
- `VITE_DEMO_MODE=true`

Once deployed, users can land on the site and explore immediately in demo mode.

---

## 🛠️ Tech Stack

| Component | Technology |
| :--- | :--- |
| **Frontend** | React, Tailwind, Radix UI (shadcn) |
| **Backend** | Node.js, Express, TypeScript |
| **Database** | Supabase (PostgreSQL + RLS) |
| **Security** | JWT Authentication, Row Level Security |

---
*Created for the MCC Project Class.*
