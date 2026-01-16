-- Add Committees table
CREATE TABLE committees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    context app_context NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Add Committee Approvals table
CREATE TABLE committee_approvals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    letter_id UUID REFERENCES letters(id) ON DELETE CASCADE NOT NULL,
    committee_id UUID REFERENCES committees(id) ON DELETE CASCADE NOT NULL,
    approver_id UUID REFERENCES auth.users(id) NOT NULL,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS Policies
ALTER TABLE committees ENABLE ROW LEVEL SECURITY;
ALTER TABLE committee_approvals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Internal Read Access" ON committees FOR SELECT TO authenticated USING (true);
CREATE POLICY "Internal Read Access" ON committee_approvals FOR SELECT TO authenticated USING (true);
