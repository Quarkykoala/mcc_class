-- Demo phase: multi-approver routing and tag default approvers

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'approval_mode') THEN
        CREATE TYPE approval_mode AS ENUM ('ALL', 'ANY');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'assignment_decision') THEN
        CREATE TYPE assignment_decision AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
    END IF;
END $$;

ALTER TABLE letters
    ADD COLUMN IF NOT EXISTS approval_mode approval_mode NOT NULL DEFAULT 'ALL';

CREATE TABLE IF NOT EXISTS letter_approver_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    letter_id UUID NOT NULL REFERENCES letters(id) ON DELETE CASCADE,
    approver_id UUID NOT NULL,
    decision assignment_decision NOT NULL DEFAULT 'PENDING',
    decided_at TIMESTAMPTZ,
    comment TEXT,
    source_ip INET,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(letter_id, approver_id)
);

CREATE TABLE IF NOT EXISTS tag_default_approvers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    approver_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(tag_id, approver_id)
);

CREATE INDEX IF NOT EXISTS idx_letter_assignments_letter ON letter_approver_assignments(letter_id);
CREATE INDEX IF NOT EXISTS idx_letter_assignments_approver ON letter_approver_assignments(approver_id);
CREATE INDEX IF NOT EXISTS idx_tag_default_approvers_tag ON tag_default_approvers(tag_id);

ALTER TABLE letter_approver_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE tag_default_approvers ENABLE ROW LEVEL SECURITY;
