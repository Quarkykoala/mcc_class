-- Phase 1: Full-text Search Index
-- Create GIN index for efficient text search on letters content, title, job_reference
CREATE INDEX IF NOT EXISTS idx_letters_fts ON letters USING gin(to_tsvector('english', COALESCE(title, '') || ' ' || COALESCE(job_reference, '') || ' ' || COALESCE(content, '')));

-- Phase 2: Auto-routing Rules Table
CREATE TABLE IF NOT EXISTS auto_routing_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    department_id UUID REFERENCES departments(id),
    tag_id UUID REFERENCES tags(id),
    approver_id UUID NOT NULL,
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Phase 3: Letter Attachments Table
CREATE TABLE IF NOT EXISTS letter_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    letter_id UUID REFERENCES letters(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_size INTEGER,
    mime_type TEXT,
    uploaded_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Phase 4: Approval Deadlines Table
CREATE TABLE IF NOT EXISTS approval_deadlines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    letter_id UUID REFERENCES letters(id) ON DELETE CASCADE,
    approver_id UUID NOT NULL,
    due_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(letter_id, approver_id)
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_auto_routing_rules_dept ON auto_routing_rules(department_id);
CREATE INDEX IF NOT EXISTS idx_auto_routing_rules_tag ON auto_routing_rules(tag_id);
CREATE INDEX IF NOT EXISTS idx_letter_attachments_letter ON letter_attachments(letter_id);
CREATE INDEX IF NOT EXISTS idx_approval_deadlines_letter ON approval_deadlines(letter_id);
CREATE INDEX IF NOT EXISTS idx_approval_deadlines_due ON approval_deadlines(due_at);

-- Enable RLS on new tables
ALTER TABLE auto_routing_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE letter_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_deadlines ENABLE ROW LEVEL SECURITY;

-- RLS Policies for new tables
CREATE POLICY "Internal Full Access" ON auto_routing_rules FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Internal Full Access" ON letter_attachments FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Internal Full Access" ON approval_deadlines FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Add content column to letters if not exists (for full-text search)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'letters' AND column_name = 'content') THEN
        ALTER TABLE letters ADD COLUMN content TEXT;
    END IF;
END $$;

-- Add column for AES_WAITING status if needed
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'letter_status') THEN
        CREATE TYPE letter_status AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'ISSUED', 'REVOKED', 'AES_WAITING');
    END IF;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
