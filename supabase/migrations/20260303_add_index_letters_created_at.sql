-- Add index on letters.created_at for faster sorting
CREATE INDEX IF NOT EXISTS idx_letters_created_at ON letters (created_at DESC);
