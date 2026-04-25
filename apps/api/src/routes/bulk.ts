import { Router, Request, Response } from 'express';
import { execute, queryOne, query } from '../db';
import { isAdmin, isApprover } from '../auth/roles';
import { uuidv4 } from '../uuid';

export const bulkRoutes = () => {
    const router = Router();

    router.post('/letters/bulk', async (req: Request, res: Response) => {
        try {
            const userId = req.user?.id;
            if (!userId) return res.status(401).json({ error: 'Unauthorized' });
            const { action, letter_ids } = req.body;
            if (!letter_ids || !Array.isArray(letter_ids) || letter_ids.length === 0) {
                return res.status(400).json({ error: 'letter_ids array is required' });
            }
            if (!['approve', 'delete', 'submit'].includes(action)) {
                return res.status(400).json({ error: 'Invalid action. Use: approve, delete, or submit' });
            }
            const admin = isAdmin(req);
            const canApproveRole = isApprover(req) || admin;
            const results: any[] = [];
            const errors: string[] = [];
            for (const letterId of letter_ids) {
                try {
                    if (action === 'delete') {
                        const letter = await queryOne<any>('SELECT created_by, status FROM letters WHERE id = ?', [letterId]);
                        if (!letter) { errors.push(`Letter ${letterId}: Not found`); continue; }
                        if (!admin && letter.created_by !== userId) { errors.push(`Letter ${letterId}: Not authorized`); continue; }
                        if (letter.status !== 'DRAFT') { errors.push(`Letter ${letterId}: Only DRAFT letters can be deleted`); continue; }
                        await execute('DELETE FROM letter_tags WHERE letter_id = ?', [letterId]);
                        await execute('DELETE FROM letter_approver_assignments WHERE letter_id = ?', [letterId]);
                        await execute('DELETE FROM letter_versions WHERE letter_id = ?', [letterId]);
                        await execute('DELETE FROM letters WHERE id = ?', [letterId]);
                        results.push({ id: letterId, status: 'deleted' });
                    } else if (action === 'approve') {
                        if (!canApproveRole) { errors.push(`Letter ${letterId}: Not authorized to approve`); continue; }
                        const letter = await queryOne<any>('SELECT status FROM letters WHERE id = ?', [letterId]);
                        if (!letter || letter.status !== 'SUBMITTED') { errors.push(`Letter ${letterId}: Must be SUBMITTED to approve`); continue; }
                        await execute('UPDATE letter_approver_assignments SET decision = ?, decided_at = NOW() WHERE letter_id = ? AND approver_id = ?', ['APPROVED', letterId, userId]);
                        await execute('INSERT INTO approvals (id, letter_id, approver_id) VALUES (?, ?, ?)', [uuidv4(), letterId, userId]);
                        const assignments = await query<any>('SELECT decision FROM letter_approver_assignments WHERE letter_id = ?', [letterId]);
                        const allApproved = assignments.every((a: any) => a.decision === 'APPROVED');
                        if (allApproved) await execute('UPDATE letters SET status = ? WHERE id = ?', ['APPROVED', letterId]);
                        results.push({ id: letterId, status: 'approved' });
                    } else if (action === 'submit') {
                        const letter = await queryOne<any>('SELECT status, created_by FROM letters WHERE id = ?', [letterId]);
                        if (!letter) { errors.push(`Letter ${letterId}: Not found`); continue; }
                        if (!admin && letter.created_by !== userId) { errors.push(`Letter ${letterId}: Not authorized`); continue; }
                        if (letter.status !== 'DRAFT') { errors.push(`Letter ${letterId}: Must be DRAFT to submit`); continue; }
                        await execute('UPDATE letters SET status = ? WHERE id = ?', ['SUBMITTED', letterId]);
                        results.push({ id: letterId, status: 'submitted' });
                    }
                } catch (err: any) {
                    errors.push(`Letter ${letterId}: ${err.message}`);
                }
            }
            res.json({ results, errors, success: results.length, failed: errors.length });
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    return router;
};
