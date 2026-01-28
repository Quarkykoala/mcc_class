-- 1. Letter Numbering
CREATE SEQUENCE IF NOT EXISTS letter_number_seq START 10001;

ALTER TABLE letters ADD COLUMN IF NOT EXISTS letter_number BIGINT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_letters_number ON letters(letter_number);

-- 2. Rejection Tracking
ALTER TABLE letters ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ;
ALTER TABLE letters ADD COLUMN IF NOT EXISTS rejected_by UUID REFERENCES auth.users(id);
ALTER TABLE letters ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- 3. Printing Control
ALTER TABLE issuances ADD COLUMN IF NOT EXISTS print_count INT DEFAULT 0;
ALTER TABLE issuances ADD COLUMN IF NOT EXISTS max_prints INT DEFAULT 1;

CREATE TABLE IF NOT EXISTS print_requests (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    issuance_id UUID REFERENCES issuances(id) NOT NULL,
    requester_id UUID REFERENCES auth.users(id) NOT NULL,
    reason TEXT NOT NULL,
    status TEXT DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    reviewed_by UUID REFERENCES auth.users(id),
    reviewed_at TIMESTAMPTZ
);

ALTER TABLE print_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own print requests" ON print_requests FOR SELECT TO authenticated USING (requester_id = auth.uid());
CREATE POLICY "Admins read all print requests" ON print_requests FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('ADMIN', 'APPROVER'))
);
CREATE POLICY "Users create print requests" ON print_requests FOR INSERT TO authenticated WITH CHECK (requester_id = auth.uid());
CREATE POLICY "Admins update print requests" ON print_requests FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('ADMIN', 'APPROVER'))
);

-- 4. User Departments (Visibility)
CREATE TABLE IF NOT EXISTS user_departments (
    user_id UUID REFERENCES auth.users(id) NOT NULL,
    department_id UUID REFERENCES departments(id) NOT NULL,
    PRIMARY KEY (user_id, department_id)
);

ALTER TABLE user_departments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage user depts" ON user_departments FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'ADMIN')
);

CREATE POLICY "Users read own depts" ON user_departments FOR SELECT TO authenticated USING (
    user_id = auth.uid()
);

-- 5. Update Letters RLS
-- Drop permissive policy
DROP POLICY IF EXISTS "Internal Read Access" ON letters;

-- Create restrictive policy
CREATE POLICY "Letters Visibility" ON letters FOR SELECT TO authenticated USING (
    -- Admin sees all
    (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'ADMIN'))
    OR
    -- Creator sees their own
    (created_by = auth.uid())
    OR
    -- User sees letters in their departments
    (department_id IN (SELECT department_id FROM user_departments WHERE user_id = auth.uid()))
);

-- 6. Update issue_letter RPC to handle Numbering
CREATE OR REPLACE FUNCTION issue_letter(
    p_letter_id UUID,
    p_issuer_id UUID,
    p_content_hash TEXT,
    p_content TEXT,
    p_channel TEXT,
    p_qr_payload TEXT,
    p_printer_id TEXT,
    p_source_ip INET,
    p_expected_version INT,
    p_verification_token TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_letter_status TEXT;
    v_next_version INT;
    v_version_id UUID;
    v_issuance_id UUID;
    v_existing_issuance JSONB;
    v_letter_number BIGINT;
BEGIN
    -- 1. Check Letter Status (with lock)
    SELECT status INTO v_letter_status
    FROM letters
    WHERE id = p_letter_id
    FOR UPDATE;

    IF v_letter_status IS NULL THEN
        RAISE EXCEPTION 'Letter not found';
    END IF;

    -- Idempotency Check
    IF v_letter_status = 'ISSUED' THEN
        SELECT jsonb_build_object(
            'version_number', lv.version_number,
            'issuance_id', i.id,
            'verification_token', lv.verification_token,
            'letter_number', l.letter_number,
            'message', 'Letter already issued. Returning existing issuance.'
        ) INTO v_existing_issuance
        FROM letter_versions lv
        JOIN issuances i ON i.letter_version_id = lv.id
        JOIN letters l ON l.id = lv.letter_id
        WHERE lv.letter_id = p_letter_id
        ORDER BY lv.version_number DESC
        LIMIT 1;

        IF v_existing_issuance IS NOT NULL THEN
            RETURN v_existing_issuance;
        END IF;
    END IF;

    IF v_letter_status != 'APPROVED' THEN
        RAISE EXCEPTION 'Letter must be APPROVED to issue.';
    END IF;

    -- 2. Get next version number
    SELECT COALESCE(MAX(version_number), 0) + 1 INTO v_next_version
    FROM letter_versions
    WHERE letter_id = p_letter_id;

    IF v_next_version != p_expected_version THEN
        RAISE EXCEPTION 'Version Mismatch: Expected %, Found %', p_expected_version, v_next_version;
    END IF;

    -- 3. Assign Letter Number (Sequence)
    SELECT nextval('letter_number_seq') INTO v_letter_number;

    -- 4. Create Version Snapshot
    INSERT INTO letter_versions (
        letter_id, version_number, content, content_hash, created_by, verification_token
    ) VALUES (
        p_letter_id, v_next_version, p_content, p_content_hash, p_issuer_id, p_verification_token
    ) RETURNING id INTO v_version_id;

    -- 5. Update Status and Number
    UPDATE letters 
    SET status = 'ISSUED', 
        letter_number = v_letter_number 
    WHERE id = p_letter_id;

    -- 6. Record Issuance
    INSERT INTO issuances (
        letter_version_id, issued_by, channel, qr_payload, content_hash, pdf_status, print_count, max_prints
    ) VALUES (
        v_version_id, p_issuer_id, p_channel::issuance_channel, p_qr_payload, p_content_hash, 'PENDING', 0, 1
    ) RETURNING id INTO v_issuance_id;

    -- 7. Audit Log
    INSERT INTO audit_logs (
        actor_id, action, entity_type, entity_id, metadata, source_ip
    ) VALUES (
        p_issuer_id, 'ISSUE', 'LETTER', p_letter_id,
        jsonb_build_object(
            'issued_by', p_issuer_id, 
            'channel', p_channel, 
            'content_hash', p_content_hash, 
            'verification_token', p_verification_token,
            'letter_number', v_letter_number
        ),
        p_source_ip
    );

    RETURN jsonb_build_object(
        'version_number', v_next_version,
        'issuance_id', v_issuance_id,
        'verification_token', p_verification_token,
        'letter_number', v_letter_number
    );

END;
$$;
