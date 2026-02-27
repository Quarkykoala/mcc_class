import { Router, Request, Response } from 'express';
import { query } from '../db';

export const auditRoutes = () => {
    const router = Router();

    router.get('/audit-logs', async (_req: Request, res: Response) => {
        try {
            const data = await query('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 50');
            res.json(data);
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    return router;
};
