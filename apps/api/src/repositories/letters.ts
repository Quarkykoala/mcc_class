import { query, queryOne } from '../db';
import { pickExistingColumns } from '../db-schema';
import { getUserDepartmentIds, loadLetterRelations, enrichLetter } from '../letters/letter-helpers';

export async function listLetters(params: {
    context?: string | null;
    status?: string | null;
    department_id?: string | null;
    search?: string | null;
    created_after?: string | null;
    created_before?: string | null;
    page?: number;
    limit?: number;
    userId?: string;
    isAdmin?: boolean;
}) {
    const optionalLetterColumns = await pickExistingColumns('letters', [
        'title',
        'job_reference',
        'letter_number',
        'rejection_reason',
        'approval_mode',
        'created_by',
        'department_id',
    ]);
    const {
        context,
        status,
        department_id,
        search,
        created_after,
        created_before,
        page = 1,
        limit = 50,
        userId,
        isAdmin = false
    } = params;
    const offset = (page - 1) * limit;
    const conditions: string[] = [];
    const qparams: unknown[] = [];
    if (context) { conditions.push('l.context = ?'); qparams.push(String(context)); }
    if (status) { conditions.push('l.status = ?'); qparams.push(String(status)); }
    if (department_id) { conditions.push('l.department_id = ?'); qparams.push(String(department_id)); }
    if (created_after) { conditions.push('l.created_at >= ?'); qparams.push(String(created_after)); }
    if (created_before) { conditions.push('l.created_at <= ?'); qparams.push(String(created_before)); }
    if (search) {
        const term = `%${String(search).toLowerCase()}%`;
        conditions.push('(LOWER(l.title) LIKE ? OR LOWER(l.job_reference) LIKE ?)');
        qparams.push(term, term);
    }
    if (!isAdmin && userId) {
        const deptIds = await getUserDepartmentIds(userId, false);
        if (deptIds && deptIds.length > 0) {
            const placeholders = deptIds.map(() => '?').join(',');
            conditions.push(`(l.created_by = ? OR l.department_id IN (${placeholders}))`);
            qparams.push(userId, ...deptIds);
        } else {
            conditions.push('l.created_by = ?');
            qparams.push(userId);
        }
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const countResult = await queryOne<{ cnt: number }>(`SELECT COUNT(*) as cnt FROM letters l ${where}`, qparams);
    const total = countResult?.cnt ?? 0;
    const letterSelect = [
        'l.id',
        'l.context',
        'l.status',
        'l.created_at',
        'l.updated_at',
        ...optionalLetterColumns.map((column) => `l.${column}`),
        'd.name as dept_name',
    ].join(', ');
    const rows = await query<any>(
        `SELECT ${letterSelect}
         FROM letters l LEFT JOIN departments d ON l.department_id = d.id ${where}
         ORDER BY l.created_at DESC LIMIT ? OFFSET ?`,
        [...qparams, limit, offset]
    );
    const ids = rows.map((r) => r.id);
    const { tagsByLetter, assignmentsByLetter } = await loadLetterRelations(ids);
    const letters = rows.map((r) => {
        const letter = { ...r, departments: { name: r.dept_name }, letter_tags: tagsByLetter.get(r.id) || [] };
        delete letter.dept_name;
        return enrichLetter(letter, assignmentsByLetter.get(r.id) || [], userId, !!isAdmin);
    });
    return { data: letters, meta: { total, page, limit, hasMore: offset + limit < total } };
}

export async function getLetterDetail(id: string, userId: string, isAdmin: boolean) {
    const optionalLetterColumns = await pickExistingColumns('letters', [
        'committee_id',
        'title',
        'job_reference',
        'letter_number',
        'rejection_reason',
        'approval_mode',
        'source_ip',
    ]);
    const letter = await queryOne<any>(
        `SELECT l.id, l.context, l.department_id, l.status, l.content, l.created_by, l.created_at, l.updated_at${
            optionalLetterColumns.length > 0 ? `, ${optionalLetterColumns.map((column) => `l.${column}`).join(', ')}` : ''
        }, d.name as dept_name
         FROM letters l LEFT JOIN departments d ON l.department_id = d.id WHERE l.id = ?`,
        [id]
    );
    if (!letter) return null;
    const { tagsByLetter, assignmentsByLetter } = await loadLetterRelations([id]);
    const enriched = { ...letter, departments: { name: letter.dept_name }, letter_tags: tagsByLetter.get(id) || [] };
    delete enriched.dept_name;
    return enrichLetter(enriched, assignmentsByLetter.get(id) || [], userId, !!isAdmin);
}

export async function listPendingApprovals(userId: string, isAdmin: boolean, context?: string | null) {
    const optionalLetterColumns = await pickExistingColumns('letters', [
        'title',
        'job_reference',
        'letter_number',
        'rejection_reason',
        'approval_mode',
        'created_by',
        'department_id',
    ]);
    const pendingAssignments = await query<{ letter_id: string }>(
        'SELECT DISTINCT letter_id FROM letter_approver_assignments WHERE approver_id = ? AND decision = ?',
        [userId, 'PENDING']
    );
    const letterIds = pendingAssignments.map((a) => a.letter_id).filter(Boolean);
    if (letterIds.length === 0) return [];
    const placeholders = letterIds.map(() => '?').join(',');
    const letterSelect = [
        'l.id',
        'l.context',
        'l.status',
        'l.created_at',
        'l.updated_at',
        ...optionalLetterColumns.map((column) => `l.${column}`),
        'd.name as dept_name',
    ].join(', ');
    let sql = `SELECT ${letterSelect}
               FROM letters l LEFT JOIN departments d ON l.department_id = d.id
               WHERE l.id IN (${placeholders}) AND l.status = 'SUBMITTED'`;
    const params: unknown[] = [...letterIds];
    if (context) { sql += ' AND l.context = ?'; params.push(context); }
    sql += ' ORDER BY l.created_at DESC';
    const rows = await query<any>(sql, params);
    const ids = rows.map((r) => r.id);
    const { tagsByLetter, assignmentsByLetter } = await loadLetterRelations(ids);
    return rows.map((r) => {
        const letter = { ...r, departments: { name: r.dept_name }, letter_tags: tagsByLetter.get(r.id) || [] };
        delete letter.dept_name;
        return enrichLetter(letter, assignmentsByLetter.get(r.id) || [], userId, !!isAdmin);
    });
}
