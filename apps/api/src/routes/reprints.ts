import { Router, Request, Response } from 'express';
import { queryOne, query, execute } from '../db';
import { reprintSchema } from '../validation/letters';
import { isAdmin, isApprover } from '../auth/roles';
import { uuidv4 } from '../uuid';
import { canAccessLetter } from '../letters/letter-helpers';

export const reprintsRoutes = () => {
    const router = Router();

    router.post('/letters/:id/reprint-request', async (req: Request, res: Response) => {
        try {
            const userId = req.user?.id;
            if (!userId) return res.status(401).json({ error: 'Unauthorized' });
            const parsed = reprintSchema.safeParse(req.body ?? {});
            if (!parsed.success) {
                return res.status(400).json({ error: parsed.error.errors[0]?.message || 'Invalid payload' });
            }
            const { id } = req.params;
            const { reason } = parsed.data;
            const letter = await queryOne<any>('SELECT department_id, created_by FROM letters WHERE id = ?', [id]);
            if (!letter) return res.status(404).json({ error: 'Letter not found.' });
            if (!(await canAccessLetter(userId, isAdmin(req), letter))) {
                return res.status(403).json({ error: 'Not authorized for this letter.' });
            }
            const issuance = await queryOne<any>(
                `SELECT i.id FROM issuances i INNER JOIN letter_versions lv ON i.letter_version_id = lv.id
                 WHERE lv.letter_id = ? ORDER BY i.issued_at DESC LIMIT 1`,
                [id]
            );
            if (!issuance) return res.status(404).json({ error: 'No issuance found.' });
            await execute(
                'INSERT INTO print_requests (id, issuance_id, requester_id, reason, status) VALUES (?, ?, ?, ?, ?)',
                [uuidv4(), issuance.id, userId, reason, 'PENDING']
            );
            await execute(
                'INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, metadata) VALUES (?, ?, ?, ?, ?, ?)',
                [uuidv4(), userId, 'REPRINT_REQUEST', 'ISSUANCE', issuance.id, JSON.stringify({ requester_id: userId, reason })]
            );
            res.json({ message: 'Reprint request submitted.' });
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    router.get('/reprints/requests', async (req: Request, res: Response) => {
        try {
            const userId = req.user?.id;
            if (!userId) return res.status(401).json({ error: 'Unauthorized' });
            if (!isAdmin(req)) {
                return res.status(403).json({ error: 'Admin role required.' });
            }
            const data = await query('SELECT * FROM print_requests ORDER BY created_at DESC');
            res.json(data);
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    router.post('/reprints/:id/approve', async (req: Request, res: Response) => {
        try {
            const userId = req.user?.id;
            if (!userId) return res.status(401).json({ error: 'Unauthorized' });
            if (!isAdmin(req) && !isApprover(req)) return res.status(403).json({ error: 'Admin role required.' });
            const { id } = req.params;
            const printReq = await queryOne<any>('SELECT issuance_id FROM print_requests WHERE id = ?', [id]);
            if (!printReq) return res.status(404).json({ error: 'Print request not found.' });
            await execute('UPDATE print_requests SET status = ?, reviewed_by = ?, reviewed_at = NOW() WHERE id = ?', ['APPROVED', userId, id]);
            await execute('UPDATE issuances SET max_prints = max_prints + 1 WHERE id = ?', [printReq.issuance_id]);
            res.json({ message: 'Reprint approved.' });
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    return router;
};
