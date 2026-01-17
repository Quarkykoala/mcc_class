-- Fix Invariants: Idempotency, Verification Nonce, and Committee Approval

-- 1. Add verification_token to letter_versions for unforgeable verification
ALTER TABLE letter_versions ADD COLUMN verification_token TEXT;
CREATE UNIQUE INDEX idx_letter_versions_verification_token ON letter_versions(verification_token);

-- 2. Update issue_letter RPC to handle idempotency and verification token
-- We are changing the signature, so we should drop the old one to avoid confusion or just define the new one.
-- To be safe and clean, we define the new one. The old one will stay but we won't use it (or we can drop it).
-- Let's drop the old one to ensure we don't call it by mistake.

DROP FUNCTION IF EXISTS issue_letter(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, INET, INT);

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
BEGIN
    -- 1. Check Letter Status (with lock)
    SELECT status INTO v_letter_status
    FROM letters
    WHERE id = p_letter_id
    FOR UPDATE;

    IF v_letter_status IS NULL THEN
        RAISE EXCEPTION 'Letter not found';
    END IF;

    -- Idempotency Check: If already ISSUED, return the existing issuance for the latest version
    IF v_letter_status = 'ISSUED' THEN
        SELECT jsonb_build_object(
            'version_number', lv.version_number,
            'issuance_id', i.id,
            'verification_token', lv.verification_token,
            'message', 'Letter already issued. Returning existing issuance.'
        ) INTO v_existing_issuance
        FROM letter_versions lv
        JOIN issuances i ON i.letter_version_id = lv.id
        WHERE lv.letter_id = p_letter_id
        ORDER BY lv.version_number DESC
        LIMIT 1;

        IF v_existing_issuance IS NOT NULL THEN
            RETURN v_existing_issuance;
        END IF;

        RAISE EXCEPTION 'Letter is already ISSUED but no issuance record found.';
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
        letter_id, version_number, content, content_hash, created_by, verification_token
    ) VALUES (
        p_letter_id, v_next_version, p_content, p_content_hash, p_issuer_id, p_verification_token
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
        jsonb_build_object('issued_by', p_issuer_id, 'channel', p_channel, 'content_hash', p_content_hash, 'verification_token', p_verification_token),
        p_source_ip
    );

    -- Return result
    RETURN jsonb_build_object(
        'version_number', v_next_version,
        'issuance_id', v_issuance_id,
        'verification_token', p_verification_token
    );

END;
$$;
