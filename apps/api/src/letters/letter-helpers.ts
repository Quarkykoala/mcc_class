import { query } from '../db';

export const getUserDepartmentIds = async (userId: string, isAdmin: boolean): Promise<string[] | null> => {
    if (isAdmin) return null;
    const rows = await query<{ department_id: string }>('SELECT department_id FROM user_departments WHERE user_id = ?', [userId]);
    return rows.map((r) => r.department_id).filter(Boolean);
};

export const canAccessLetter = async (
    userId: string,
    isAdmin: boolean,
    letter: { department_id?: string; created_by?: string }
) => {
    if (isAdmin) return true;
    if (letter.created_by && letter.created_by === userId) return true;
    const deptIds = await getUserDepartmentIds(userId, isAdmin);
    return Array.isArray(deptIds) && deptIds.includes(letter.department_id || '');
};

export const normalizeUuidList = (values: unknown): string[] => {
    if (!Array.isArray(values)) return [];
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return Array.from(new Set(values.filter((value): value is string => typeof value === 'string' && uuidRegex.test(value))));
};

export const enrichLetter = (letter: any, assignments: any[], currentUserId?: string, isAdmin = false) => {
    const approvedCount = assignments.filter((a: any) => a.decision === 'APPROVED').length;
    const rejectedCount = assignments.filter((a: any) => a.decision === 'REJECTED').length;
    const pendingCount = assignments.filter((a: any) => a.decision === 'PENDING').length;
    const canApproveFlag = letter.status === 'SUBMITTED' && (
        isAdmin || assignments.some((a: any) => a.approver_id === currentUserId && a.decision === 'PENDING')
    );
    return {
        ...letter,
        letter_approver_assignments: assignments,
        approval_summary: { total: assignments.length, approved: approvedCount, rejected: rejectedCount, pending: pendingCount },
        canApprove: canApproveFlag
    };
};

export const loadLetterRelations = async (letterIds: string[]) => {
    if (letterIds.length === 0) return { tagsByLetter: new Map(), assignmentsByLetter: new Map() };
    const placeholders = letterIds.map(() => '?').join(',');
    const tags = await query<any>(
        `SELECT lt.letter_id, lt.tag_id, t.name as tag_name
         FROM letter_tags lt LEFT JOIN tags t ON lt.tag_id = t.id
         WHERE lt.letter_id IN (${placeholders})`,
        letterIds
    );
    const assignments = await query<any>(
        `SELECT id, letter_id, approver_id, decision, decided_at, comment
         FROM letter_approver_assignments
         WHERE letter_id IN (${placeholders})`,
        letterIds
    );
    const tagsByLetter = new Map<string, any[]>();
    for (const tag of tags) {
        const arr = tagsByLetter.get(tag.letter_id) || [];
        arr.push({ tag_id: tag.tag_id, tags: { name: tag.tag_name } });
        tagsByLetter.set(tag.letter_id, arr);
    }
    const assignmentsByLetter = new Map<string, any[]>();
    for (const a of assignments) {
        const arr = assignmentsByLetter.get(a.letter_id) || [];
        arr.push(a);
        assignmentsByLetter.set(a.letter_id, arr);
    }
    return { tagsByLetter, assignmentsByLetter };
};
