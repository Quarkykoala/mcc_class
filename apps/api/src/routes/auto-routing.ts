import { Router, Request, Response } from 'express';
import { query } from '../db';
import { isAdmin } from '../auth/roles';

export const autoRoutingRoutes = () => {
    const router = Router();

    router.get('/auto-routing-rules', async (req: Request, res: Response) => {
        try {
            if (!isAdmin(req)) return res.status(403).json({ error: 'Admin role required.' });
            const rows = await query<any>(
                `SELECT r.*, d.name as dept_name, t.name as tag_name
                 FROM auto_routing_rules r
                 LEFT JOIN departments d ON r.department_id = d.id
                 LEFT JOIN tags t ON r.tag_id = t.id
                 ORDER BY r.created_at DESC`
            );
            const data = rows.map((r) => ({
                ...r,
                departments: r.dept_name ? { name: r.dept_name } : null,
                tags: r.tag_name ? { name: r.tag_name } : null,
            }));
            res.json(data);
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    return router;
};
