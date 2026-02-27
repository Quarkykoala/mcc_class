-- MCC Letter Issuance System - MySQL Schema
-- Converted from PostgreSQL/Supabase migrations

-- 1. Users (replaces Supabase auth.users)
CREATE TABLE IF NOT EXISTS users (
    id CHAR(36) PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 2. User Roles
CREATE TABLE IF NOT EXISTS user_roles (
    user_id CHAR(36) NOT NULL,
    role VARCHAR(20) NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, role),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 3. Departments
CREATE TABLE IF NOT EXISTS departments (
    id CHAR(36) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    context VARCHAR(20) NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_departments_context ON departments(context);

-- 4. Tags
CREATE TABLE IF NOT EXISTS tags (
    id CHAR(36) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    context VARCHAR(20) NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_tags_context ON tags(context);

-- 5. Committees
CREATE TABLE IF NOT EXISTS committees (
    id CHAR(36) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    context VARCHAR(20) NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 6. Committee Members
CREATE TABLE IF NOT EXISTS committee_members (
    committee_id CHAR(36) NOT NULL,
    user_id CHAR(36) NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (committee_id, user_id),
    FOREIGN KEY (committee_id) REFERENCES committees(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 7. Letters
CREATE TABLE IF NOT EXISTS letters (
    id CHAR(36) PRIMARY KEY,
    context VARCHAR(20) NOT NULL,
    department_id CHAR(36) NOT NULL,
    committee_id CHAR(36) DEFAULT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    content TEXT,
    title VARCHAR(500),
    job_reference VARCHAR(255),
    letter_number BIGINT UNIQUE DEFAULT NULL,
    approval_mode VARCHAR(10) NOT NULL DEFAULT 'ALL',
    rejected_at DATETIME DEFAULT NULL,
    rejected_by CHAR(36) DEFAULT NULL,
    rejection_reason TEXT,
    source_ip VARCHAR(45),
    created_by CHAR(36) NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (department_id) REFERENCES departments(id),
    FOREIGN KEY (committee_id) REFERENCES committees(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES users(id),
    FOREIGN KEY (rejected_by) REFERENCES users(id)
);

CREATE INDEX idx_letters_department_id ON letters(department_id);
CREATE INDEX idx_letters_created_at ON letters(created_at DESC);
CREATE INDEX idx_letters_status ON letters(status);
CREATE INDEX idx_letters_created_by ON letters(created_by);
CREATE INDEX idx_letters_status_department ON letters(status, department_id);

-- 8. Letter Tags (Many-to-Many)
CREATE TABLE IF NOT EXISTS letter_tags (
    letter_id CHAR(36) NOT NULL,
    tag_id CHAR(36) NOT NULL,
    PRIMARY KEY (letter_id, tag_id),
    FOREIGN KEY (letter_id) REFERENCES letters(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

-- 9. Letter Versions (Immutable snapshots)
CREATE TABLE IF NOT EXISTS letter_versions (
    id CHAR(36) PRIMARY KEY,
    letter_id CHAR(36) NOT NULL,
    version_number INT NOT NULL,
    content TEXT NOT NULL,
    content_hash VARCHAR(64) NOT NULL,
    verification_token VARCHAR(255),
    created_by CHAR(36) NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_letter_version (letter_id, version_number),
    UNIQUE KEY uq_verification_token (verification_token),
    FOREIGN KEY (letter_id) REFERENCES letters(id),
    FOREIGN KEY (created_by) REFERENCES users(id)
);
CREATE INDEX idx_letter_versions_letter ON letter_versions(letter_id);

-- 10. Letter Approver Assignments
CREATE TABLE IF NOT EXISTS letter_approver_assignments (
    id CHAR(36) PRIMARY KEY,
    letter_id CHAR(36) NOT NULL,
    approver_id CHAR(36) NOT NULL,
    decision VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    decided_at DATETIME DEFAULT NULL,
    comment TEXT,
    source_ip VARCHAR(45),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_letter_approver (letter_id, approver_id),
    FOREIGN KEY (letter_id) REFERENCES letters(id) ON DELETE CASCADE
);

CREATE INDEX idx_letter_assignments_letter ON letter_approver_assignments(letter_id);
CREATE INDEX idx_letter_assignments_approver ON letter_approver_assignments(approver_id);
CREATE INDEX idx_letter_assignments_approver_decision ON letter_approver_assignments(approver_id, decision);

-- 11. Tag Default Approvers
CREATE TABLE IF NOT EXISTS tag_default_approvers (
    id CHAR(36) PRIMARY KEY,
    tag_id CHAR(36) NOT NULL,
    approver_id CHAR(36) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_tag_approver (tag_id, approver_id),
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

CREATE INDEX idx_tag_default_approvers_tag ON tag_default_approvers(tag_id);

-- 12. Approvals
CREATE TABLE IF NOT EXISTS approvals (
    id CHAR(36) PRIMARY KEY,
    letter_id CHAR(36) NOT NULL,
    approver_id CHAR(36) NOT NULL,
    comment TEXT,
    source_ip VARCHAR(45),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (letter_id) REFERENCES letters(id),
    FOREIGN KEY (approver_id) REFERENCES users(id)
);
CREATE INDEX idx_committee_approvals_letter ON committee_approvals(letter_id);
CREATE INDEX idx_approvals_letter ON approvals(letter_id);
CREATE INDEX idx_approvals_created_at ON approvals(created_at DESC);

-- 13. Committee Approvals
CREATE TABLE IF NOT EXISTS committee_approvals (
    id CHAR(36) PRIMARY KEY,
    letter_id CHAR(36) NOT NULL,
    committee_id CHAR(36) NOT NULL,
    approver_id CHAR(36) NOT NULL,
    metadata JSON,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (letter_id) REFERENCES letters(id) ON DELETE CASCADE,
    FOREIGN KEY (committee_id) REFERENCES committees(id) ON DELETE CASCADE,
    FOREIGN KEY (approver_id) REFERENCES users(id)
);

-- 14. Issuances
CREATE TABLE IF NOT EXISTS issuances (
    id CHAR(36) PRIMARY KEY,
    letter_version_id CHAR(36) NOT NULL,
    issued_by CHAR(36) NOT NULL,
    issued_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    channel VARCHAR(20) NOT NULL,
    qr_payload TEXT NOT NULL,
    content_hash VARCHAR(64) NOT NULL,
    pdf_status VARCHAR(20) DEFAULT 'PENDING',
    print_count INT DEFAULT 0,
    max_prints INT DEFAULT 1,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    FOREIGN KEY (letter_version_id) REFERENCES letter_versions(id),
    FOREIGN KEY (issued_by) REFERENCES users(id)
);
CREATE INDEX idx_issuances_letter_version ON issuances(letter_version_id);

-- 15. Print Audits
CREATE TABLE IF NOT EXISTS print_audits (
    id CHAR(36) PRIMARY KEY,
    issuance_id CHAR(36) NOT NULL,
    printed_by CHAR(36) NOT NULL,
    printed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    printer_id VARCHAR(255) DEFAULT 'unknown',
    status VARCHAR(20) DEFAULT 'SUCCESS',
    source_ip VARCHAR(45),
    FOREIGN KEY (issuance_id) REFERENCES issuances(id),
    FOREIGN KEY (printed_by) REFERENCES users(id)
);

-- 16. Print Requests
CREATE TABLE IF NOT EXISTS print_requests (
    id CHAR(36) PRIMARY KEY,
    issuance_id CHAR(36) NOT NULL,
    requester_id CHAR(36) NOT NULL,
    reason TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'PENDING',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    reviewed_by CHAR(36) DEFAULT NULL,
    reviewed_at DATETIME DEFAULT NULL,
    FOREIGN KEY (issuance_id) REFERENCES issuances(id),
    FOREIGN KEY (requester_id) REFERENCES users(id),
    FOREIGN KEY (reviewed_by) REFERENCES users(id)
);
CREATE INDEX idx_print_requests_status ON print_requests(status);
CREATE INDEX idx_print_requests_requester ON print_requests(requester_id);

-- 17. Acknowledgements
CREATE TABLE IF NOT EXISTS acknowledgements (
    id CHAR(36) PRIMARY KEY,
    letter_id CHAR(36) NOT NULL,
    job_reference VARCHAR(255),
    file_url TEXT NOT NULL,
    captured_by CHAR(36) NOT NULL,
    source_ip VARCHAR(45),
    captured_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (letter_id) REFERENCES letters(id),
    FOREIGN KEY (captured_by) REFERENCES users(id)
);

-- 18. Email Links
CREATE TABLE IF NOT EXISTS email_links (
    id CHAR(36) PRIMARY KEY,
    letter_id CHAR(36) DEFAULT NULL,
    job_reference VARCHAR(255),
    sender VARCHAR(500),
    subject VARCHAR(500),
    body_excerpt TEXT,
    received_at DATETIME,
    classified_by CHAR(36),
    source_ip VARCHAR(45),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (letter_id) REFERENCES letters(id) ON DELETE SET NULL,
    FOREIGN KEY (classified_by) REFERENCES users(id)
);
CREATE INDEX idx_email_links_letter ON email_links(letter_id);
CREATE INDEX idx_email_links_job_reference ON email_links(job_reference);

-- 19. Audit Logs (Append-Only)
CREATE TABLE IF NOT EXISTS audit_logs (
    id CHAR(36) PRIMARY KEY,
    actor_id CHAR(36),
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(100) NOT NULL,
    entity_id CHAR(36) NOT NULL,
    metadata JSON,
    source_ip VARCHAR(45),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (actor_id) REFERENCES users(id)
);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);

-- 20. User Departments (Visibility)
CREATE TABLE IF NOT EXISTS user_departments (
    user_id CHAR(36) NOT NULL,
    department_id CHAR(36) NOT NULL,
    PRIMARY KEY (user_id, department_id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (department_id) REFERENCES departments(id)
);

-- 21. Auto-routing Rules
CREATE TABLE IF NOT EXISTS auto_routing_rules (
    id CHAR(36) PRIMARY KEY,
    department_id CHAR(36),
    tag_id CHAR(36),
    approver_id CHAR(36) NOT NULL,
    enabled BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (department_id) REFERENCES departments(id),
    FOREIGN KEY (tag_id) REFERENCES tags(id)
);

CREATE INDEX idx_auto_routing_rules_dept ON auto_routing_rules(department_id);
CREATE INDEX idx_auto_routing_rules_tag ON auto_routing_rules(tag_id);

-- 22. Letter Attachments
CREATE TABLE IF NOT EXISTS letter_attachments (
    id CHAR(36) PRIMARY KEY,
    letter_id CHAR(36),
    file_name VARCHAR(500) NOT NULL,
    file_path TEXT NOT NULL,
    file_size INT,
    mime_type VARCHAR(255),
    uploaded_by CHAR(36),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (letter_id) REFERENCES letters(id) ON DELETE CASCADE,
    FOREIGN KEY (uploaded_by) REFERENCES users(id)
);

CREATE INDEX idx_letter_attachments_letter ON letter_attachments(letter_id);

-- 23. Approval Deadlines
CREATE TABLE IF NOT EXISTS approval_deadlines (
    id CHAR(36) PRIMARY KEY,
    letter_id CHAR(36),
    approver_id CHAR(36) NOT NULL,
    due_at DATETIME NOT NULL,
    completed_at DATETIME DEFAULT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_deadline_letter_approver (letter_id, approver_id),
    FOREIGN KEY (letter_id) REFERENCES letters(id) ON DELETE CASCADE
);

CREATE INDEX idx_approval_deadlines_letter ON approval_deadlines(letter_id);
CREATE INDEX idx_approval_deadlines_due ON approval_deadlines(due_at);

-- Letter number auto-increment helper (replaces PostgreSQL sequence)
-- We use a separate counter table since MySQL AUTO_INCREMENT only works on the PK
CREATE TABLE IF NOT EXISTS letter_number_seq (
    next_val BIGINT NOT NULL DEFAULT 10001
);
INSERT INTO letter_number_seq (next_val) VALUES (10001);
