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

