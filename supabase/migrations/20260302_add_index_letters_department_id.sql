-- Optimize query performance for department-scoped letter filtering
CREATE INDEX IF NOT EXISTS idx_letters_department_id ON letters(department_id);
