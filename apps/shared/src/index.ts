export const LETTER_STATUSES = [
    'DRAFT',
    'SUBMITTED',
    'APPROVED',
    'REJECTED',
    'ISSUED',
    'REVOKED',
] as const;

export type LetterStatus = typeof LETTER_STATUSES[number];

export const APPROVAL_MODES = ['ALL', 'ANY'] as const;

export type ApprovalMode = typeof APPROVAL_MODES[number];

export const APPROVAL_DECISIONS = ['PENDING', 'APPROVED', 'REJECTED'] as const;

export type ApprovalDecision = typeof APPROVAL_DECISIONS[number];
