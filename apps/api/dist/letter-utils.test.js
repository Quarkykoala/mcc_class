"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const letter_utils_1 = require("./letter-utils");
(0, vitest_1.describe)('normalizeTagIds', () => {
    (0, vitest_1.it)('filters non-strings, removes blanks, de-duplicates, and sorts', () => {
        const result = (0, letter_utils_1.normalizeTagIds)(['beta', '', 'alpha', 'beta', '  ', null, 42]);
        (0, vitest_1.expect)(result).toEqual(['alpha', 'beta']);
    });
    (0, vitest_1.it)('returns an empty array when input is not an array', () => {
        (0, vitest_1.expect)((0, letter_utils_1.normalizeTagIds)('not-an-array')).toEqual([]);
    });
});
(0, vitest_1.describe)('buildContentHash', () => {
    (0, vitest_1.it)('produces a stable sha256 hex digest for the payload', () => {
        const hash = (0, letter_utils_1.buildContentHash)({
            letterId: 'letter-123',
            versionNumber: 2,
            context: 'COMPANY',
            departmentId: 'dept-9',
            tagIds: ['alpha', 'beta'],
            content: 'Hello world'
        });
        (0, vitest_1.expect)(hash).toBe('24c774facebb5311a69f31d2e1017df8cb07ce498f137226a47de905b9a7e7c4');
    });
    (0, vitest_1.it)('changes when content changes', () => {
        const base = {
            letterId: 'letter-123',
            versionNumber: 2,
            context: 'COMPANY',
            departmentId: 'dept-9',
            tagIds: ['alpha', 'beta']
        };
        const hashA = (0, letter_utils_1.buildContentHash)({ ...base, content: 'Hello world' });
        const hashB = (0, letter_utils_1.buildContentHash)({ ...base, content: 'Hello world!' });
        (0, vitest_1.expect)(hashA).not.toBe(hashB);
    });
});
(0, vitest_1.describe)('buildVerificationResponse', () => {
    (0, vitest_1.it)('prefers the most recent committee approval and marks issuances', () => {
        const response = (0, letter_utils_1.buildVerificationResponse)({
            version_number: 3,
            letters: { context: 'COMPANY', status: 'APPROVED', departments: { name: 'Legal' } },
            approvals: [{ approved_at: '2025-01-01T10:00:00Z', approver_id: 'approver-1' }],
            committee_approvals: [{
                    approved_at: '2025-01-02T10:00:00Z',
                    approver_id: 'approver-2',
                    committee_id: 'committee-1'
                }],
            issuances: [{ id: 'iss-1' }]
        });
        (0, vitest_1.expect)(response.valid).toBe(true);
        (0, vitest_1.expect)(response.status).toBe('valid');
        (0, vitest_1.expect)(response.document_details.approved_via).toBe('COMMITTEE');
        (0, vitest_1.expect)(response.document_details.committee_id).toBe('committee-1');
        (0, vitest_1.expect)(response.document_details.issuance_exists).toBe(true);
    });
    (0, vitest_1.it)('marks revoked letters as revoked', () => {
        const response = (0, letter_utils_1.buildVerificationResponse)({
            version_number: 1,
            letters: { context: 'BCBA', status: 'REVOKED', departments: { name: 'Ops' } },
            approvals: [],
            committee_approvals: [],
            issuances: []
        });
        (0, vitest_1.expect)(response.valid).toBe(false);
        (0, vitest_1.expect)(response.status).toBe('revoked');
    });
    (0, vitest_1.it)('records approver details when only direct approvals exist', () => {
        const response = (0, letter_utils_1.buildVerificationResponse)({
            version_number: 2,
            letters: { context: 'COMPANY', status: 'ISSUED', departments: { name: 'Finance' } },
            approvals: [{ approved_at: '2025-01-03T10:00:00Z', approver_id: 'approver-3' }],
            committee_approvals: [],
            issuances: []
        });
        (0, vitest_1.expect)(response.document_details.approved_via).toBe('APPROVER');
        (0, vitest_1.expect)(response.document_details.committee_id).toBeNull();
        (0, vitest_1.expect)(response.document_details.issuance_exists).toBe(false);
    });
});
(0, vitest_1.describe)('generateIssuancePdf', () => {
    (0, vitest_1.it)('returns a PDF data URI without requiring printer access', async () => {
        const pdf = await (0, letter_utils_1.generateIssuancePdf)({
            context: 'COMPANY',
            departmentName: 'Legal',
            content: 'Test content for PDF rendering.',
            contentHash: 'deadbeefcafebabe',
            verificationUrl: 'http://localhost:5173/verify/deadbeefcafebabe',
            issuedAt: new Date('2025-01-01T00:00:00Z')
        });
        (0, vitest_1.expect)(pdf.startsWith('data:application/pdf')).toBe(true);
        (0, vitest_1.expect)(pdf).toContain('base64,');
        (0, vitest_1.expect)(pdf.length).toBeGreaterThan(500);
    });
});
