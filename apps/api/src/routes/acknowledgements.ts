import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { execute, query, queryOne } from '../db';
import { canAccessLetter } from '../letters/letter-helpers';
import { acknowledgeSchema } from '../validation/letters';
import { isAdmin } from '../auth/roles';

export const acknowledgementsRoutes = () => {
    const router = Router();

    router.post('/acknowledgements', async (req: Request, res: Response) => {
        try {
            const userId = req.user?.id;
            if (!userId) return res.status(401).json({ error: 'Unauthorized' });
            const parsed = acknowledgeSchema.safeParse(req.body ?? {});
            if (!parsed.success) {
                return res.status(400).json({ error: parsed.error.errors[0]?.message || 'Invalid payload' });
            }
            const { letter_id, job_reference, file_url } = parsed.data;
            const source_ip = req.ip || '0.0.0.0';
            const admin = isAdmin(req);
            const letter = await queryOne<any>('SELECT department_id, created_by FROM letters WHERE id = ?', [letter_id]);
            if (!letter) return res.status(404).json({ error: 'Letter not found.' });
            if (!(await canAccessLetter(userId, admin, letter))) return res.status(403).json({ error: 'Not authorized for this letter.' });
            const ackId = uuidv4();
            await execute(
                'INSERT INTO acknowledgements (id, letter_id, job_reference, file_url, captured_by, source_ip) VALUES (?, ?, ?, ?, ?, ?)',
                [ackId, letter_id, job_reference ?? null, file_url, userId, source_ip]
            );
            await execute(
                'INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, metadata) VALUES (?, ?, ?, ?, ?, ?)',
                [uuidv4(), userId, 'ACKNOWLEDGE', 'LETTER', letter_id, JSON.stringify({ job_reference, file_url, captured_by: userId })]
            );
            res.json({ message: 'Acknowledgement recorded' });
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    router.get('/acknowledgements', async (_req: Request, res: Response) => {
        try {
            const data = await query('SELECT * FROM acknowledgements ORDER BY captured_at DESC');
            res.json(data);
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    return router;
};
