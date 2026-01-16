-- Create App Role Enum
CREATE TYPE app_role AS ENUM ('ADMIN', 'APPROVER', 'USER');

-- Create User Roles Table
CREATE TABLE user_roles (
    user_id UUID REFERENCES auth.users(id) NOT NULL,
    role app_role NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (user_id, role)
);

-- RLS for User Roles
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read roles (e.g. to check their own permissions or others if needed)
CREATE POLICY "Internal Read Access" ON user_roles FOR SELECT TO authenticated USING (true);
