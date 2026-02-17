-- Add optional metadata fields used by draft/create APIs.
ALTER TABLE letters
    ADD COLUMN IF NOT EXISTS title TEXT,
    ADD COLUMN IF NOT EXISTS job_reference TEXT;
