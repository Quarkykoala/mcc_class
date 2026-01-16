-- 20260116_harden_rls.sql
-- Drop permissive development policies
-- We are moving to "Hard Mode" where only the Service Role (API) can write.

-- Letters
DROP POLICY IF EXISTS "Public Read Letters" ON letters;
DROP POLICY IF EXISTS "Public Create Letters" ON letters;
DROP POLICY IF EXISTS "Public Update Letters" ON letters;
DROP POLICY IF EXISTS "Public Delete Letters" ON letters; -- If exists
-- Ensure RLS is on
ALTER TABLE letters ENABLE ROW LEVEL SECURITY;

-- Letter Versions
DROP POLICY IF EXISTS "Public Read Versions" ON letter_versions;
DROP POLICY IF EXISTS "Public Create Versions" ON letter_versions;
ALTER TABLE letter_versions ENABLE ROW LEVEL SECURITY;

-- Departments
DROP POLICY IF EXISTS "Public Read Departments" ON departments;
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;

-- Tags
DROP POLICY IF EXISTS "Public Read Tags" ON tags;
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;

-- Letter Tags
DROP POLICY IF EXISTS "Public Read LetterTags" ON letter_tags;
DROP POLICY IF EXISTS "Public Create LetterTags" ON letter_tags;
ALTER TABLE letter_tags ENABLE ROW LEVEL SECURITY;

-- Approvals
DROP POLICY IF EXISTS "Public Read Approvals" ON approvals;
DROP POLICY IF EXISTS "Public Create Approvals" ON approvals;
ALTER TABLE approvals ENABLE ROW LEVEL SECURITY;

-- Committee Approvals
DROP POLICY IF EXISTS "Public Read Committee Approvals" ON committee_approvals;
DROP POLICY IF EXISTS "Public Create Committee Approvals" ON committee_approvals;
ALTER TABLE committee_approvals ENABLE ROW LEVEL SECURITY;

-- Issuances
DROP POLICY IF EXISTS "Public Read Issuances" ON issuances;
DROP POLICY IF EXISTS "Public Create Issuances" ON issuances;
ALTER TABLE issuances ENABLE ROW LEVEL SECURITY;

-- Audit Logs
DROP POLICY IF EXISTS "Public Read AuditLogs" ON audit_logs;
DROP POLICY IF EXISTS "Public Create AuditLogs" ON audit_logs;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Acknowledgements
DROP POLICY IF EXISTS "Public Read Acknowledgements" ON acknowledgements;
DROP POLICY IF EXISTS "Public Create Acknowledgements" ON acknowledgements;
ALTER TABLE acknowledgements ENABLE ROW LEVEL SECURITY;

-- Email Links
DROP POLICY IF EXISTS "Public Read EmailLinks" ON email_links;
DROP POLICY IF EXISTS "Public Create EmailLinks" ON email_links;
ALTER TABLE email_links ENABLE ROW LEVEL SECURITY;

-- Users / Roles (If any permissive policies existed)
DROP POLICY IF EXISTS "Public Read Users" ON users;
DROP POLICY IF EXISTS "Public Read UserRoles" ON user_roles;
-- Note: users table might be managed by Supabase Auth, but if we made a public lookup table, lock it.
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

-- Print Audits
DROP POLICY IF EXISTS "Public Read Print Audits" ON print_audits;
DROP POLICY IF EXISTS "Create Print Audits" ON print_audits;
ALTER TABLE print_audits ENABLE ROW LEVEL SECURITY;

-- At this point, NO "USING (true)" policies exist.
-- Only Service Role can access these tables.
