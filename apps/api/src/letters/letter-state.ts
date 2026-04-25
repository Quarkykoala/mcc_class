import { LetterStatus } from '../shared-constants';

const transitions: Record<LetterStatus, LetterStatus[]> = {
    DRAFT: ['SUBMITTED'],
    SUBMITTED: ['APPROVED', 'REJECTED'],
    APPROVED: ['ISSUED'],
    REJECTED: [],
    ISSUED: ['REVOKED'],
    REVOKED: [],
};

export const canTransition = (from: LetterStatus, to: LetterStatus) => {
    return transitions[from]?.includes(to) ?? false;
};
