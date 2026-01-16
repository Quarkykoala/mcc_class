-- Align schema with issuance API and add email classifier linkage

-- Letters: add content and source IP capture
ALTER TABLE letters
    ADD COLUMN content TEXT NOT NULL DEFAULT '',
    ADD COLUMN source_ip INET;

-- Approvals: link directly to letters and capture source IP
ALTER TABLE approvals
    ADD COLUMN letter_id UUID;

UPDATE approvals
SET letter_id = letter_versions.letter_id
FROM letter_versions
WHERE approvals.letter_version_id = letter_versions.id;

ALTER TABLE approvals
    ALTER COLUMN letter_id SET NOT NULL;

ALTER TABLE approvals
    DROP COLUMN letter_version_id,
    ADD COLUMN source_ip INET;

-- Issuances: persist content hash for verification lookup
ALTER TABLE issuances
    ADD COLUMN content_hash TEXT;

UPDATE issuances
SET content_hash = letter_versions.content_hash
FROM letter_versions
WHERE issuances.letter_version_id = letter_versions.id;

ALTER TABLE issuances
    ALTER COLUMN content_hash SET NOT NULL;

-- Print audits: add status for tracking
ALTER TABLE print_audits
    ADD COLUMN status TEXT DEFAULT 'SUCCESS';

-- Acknowledgements: store source IP
ALTER TABLE acknowledgements
    ADD COLUMN source_ip INET;

-- Email classifier linkage table
CREATE TABLE email_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    letter_id UUID REFERENCES letters(id) ON DELETE SET NULL,
    job_reference TEXT,
    sender TEXT,
    subject TEXT,
    body_excerpt TEXT,
    received_at TIMESTAMPTZ,
    classified_by UUID REFERENCES auth.users(id),
    source_ip INET,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE email_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Internal Read Access" ON email_links FOR SELECT TO authenticated USING (true);
CREATE POLICY "Internal Insert Access" ON email_links FOR INSERT TO authenticated WITH CHECK (true);
