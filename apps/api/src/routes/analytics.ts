import { Router, Request, Response } from 'express';
import { query } from '../db';

export const analyticsRoutes = () => {
    const router = Router();

    router.get('/analytics/summary', async (req: Request, res: Response) => {
        try {
            const { context, department_id } = req.query;
            const conditions: string[] = [];
            const params: unknown[] = [];
            if (context) { conditions.push('context = ?'); params.push(String(context)); }
            if (department_id) { conditions.push('department_id = ?'); params.push(String(department_id)); }
            const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
            const letters = await query<any>(`SELECT status, department_id, created_at, context FROM letters ${where}`, params);
            const statusCounts: Record<string, number> = {};
            const deptCounts: Record<string, number> = {};
            for (const l of letters) {
                statusCounts[l.status] = (statusCounts[l.status] || 0) + 1;
                if (l.department_id) deptCounts[l.department_id] = (deptCounts[l.department_id] || 0) + 1;
            }
            const departments = await query<any>('SELECT id, name FROM departments');
            const deptMap = new Map(departments.map((d: any) => [d.id, d.name]));
            const deptSummary = Object.entries(deptCounts).map(([id, count]) => ({
                department_id: id,
                department_name: deptMap.get(id) || 'Unknown',
                count
            }));
            res.json({ total_letters: letters.length, by_status: statusCounts, by_department: deptSummary, avg_approval_time_hours: 0 });
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    return router;
};
