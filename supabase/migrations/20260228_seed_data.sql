-- Seed Data for Demo

-- Ensure Demo User has roles
INSERT INTO user_roles (user_id, role)
VALUES 
    ('00000000-0000-0000-0000-000000000001', 'ADMIN'),
    ('00000000-0000-0000-0000-000000000001', 'APPROVER'),
    ('00000000-0000-0000-0000-000000000001', 'ISSUER')
ON CONFLICT (user_id, role) DO NOTHING;

-- Ensure Departments exist
INSERT INTO departments (name, context)
VALUES 
    ('Human Resources', 'COMPANY'),
    ('Finance', 'COMPANY'),
    ('Clinical Ops', 'BCBA')
ON CONFLICT DO NOTHING;

-- Link Demo User to all Departments
INSERT INTO user_departments (user_id, department_id)
SELECT '00000000-0000-0000-0000-000000000001', id
FROM departments
ON CONFLICT DO NOTHING;

-- Create a Committee
INSERT INTO committees (name, context, description)
VALUES ('Ethics Committee', 'BCBA', 'Reviewing ethical violations')
ON CONFLICT DO NOTHING;
