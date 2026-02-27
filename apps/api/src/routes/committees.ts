import { Router, Request, Response } from 'express';
import { query } from '../db';

export const committeesRoutes = () => {
    const router = Router();

    router.get('/committees', async (req: Request, res: Response) => {
        try {
            const context = typeof req.query.context === 'string' ? req.query.context : null;
            const conditions: string[] = [];
            const params: unknown[] = [];
            if (context) { conditions.push('context = ?'); params.push(String(context)); }
            const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
            const data = await query(`SELECT * FROM committees ${where}`, params);
            res.json(data);
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    return router;
};
