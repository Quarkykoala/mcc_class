-- Create committee_members table
CREATE TABLE committee_members (
    committee_id UUID REFERENCES committees(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES auth.users(id) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (committee_id, user_id)
);

ALTER TABLE committee_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Internal Read Access" ON committee_members FOR SELECT TO authenticated USING (true);

-- Add pdf_status to issuances
ALTER TABLE issuances ADD COLUMN pdf_status TEXT DEFAULT 'PENDING';

-- Add committee_id to letters (Server-side source of truth)
ALTER TABLE letters ADD COLUMN committee_id UUID REFERENCES committees(id) ON DELETE SET NULL;

-- RPC for atomic issuance
CREATE OR REPLACE FUNCTION issue_letter(
    p_letter_id UUID,
    p_issuer_id UUID,
    p_content_hash TEXT,
    p_content TEXT,
    p_channel TEXT,
    p_qr_payload TEXT,
    p_printer_id TEXT,
    p_source_ip INET,
    p_expected_version INT
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
BEGIN
    -- 1. Check Letter Status (with lock)
    SELECT status INTO v_letter_status
    FROM letters
    WHERE id = p_letter_id
    FOR UPDATE;

    IF v_letter_status IS NULL THEN
        RAISE EXCEPTION 'Letter not found';
    END IF;

    IF v_letter_status != 'APPROVED' THEN
        RAISE EXCEPTION 'Letter must be APPROVED to issue.';
    END IF;

    -- 2. Get next version number
    SELECT COALESCE(MAX(version_number), 0) + 1 INTO v_next_version
    FROM letter_versions
    WHERE letter_id = p_letter_id;

    -- Check for race condition
    IF v_next_version != p_expected_version THEN
        RAISE EXCEPTION 'Version Mismatch: Expected %, Found %', p_expected_version, v_next_version;
    END IF;

    -- 3. Create Version Snapshot
    INSERT INTO letter_versions (
        letter_id, version_number, content, content_hash, created_by
    ) VALUES (
        p_letter_id, v_next_version, p_content, p_content_hash, p_issuer_id
    ) RETURNING id INTO v_version_id;

    -- 4. Update Status
    UPDATE letters SET status = 'ISSUED' WHERE id = p_letter_id;

    -- 5. Record Issuance
    INSERT INTO issuances (
        letter_version_id, issued_by, channel, qr_payload, content_hash, pdf_status
    ) VALUES (
        v_version_id, p_issuer_id, p_channel::issuance_channel, p_qr_payload, p_content_hash, 'PENDING'
    ) RETURNING id INTO v_issuance_id;

    -- 6. Print Audit
    IF p_channel = 'PRINT' THEN
        INSERT INTO print_audits (
            issuance_id, printer_id, status, printed_by, source_ip
        ) VALUES (
            v_issuance_id, COALESCE(p_printer_id, 'DEFAULT'), 'SUCCESS', p_issuer_id, p_source_ip
        );
    END IF;

    -- 7. Audit Log
    INSERT INTO audit_logs (
        actor_id, action, entity_type, entity_id, metadata, source_ip
    ) VALUES (
        p_issuer_id, 'ISSUE', 'LETTER', p_letter_id,
        jsonb_build_object('issued_by', p_issuer_id, 'channel', p_channel, 'content_hash', p_content_hash),
        p_source_ip
    );

    -- Return result
    RETURN jsonb_build_object(
        'version_number', v_next_version,
        'issuance_id', v_issuance_id
    );

END;
$$;
