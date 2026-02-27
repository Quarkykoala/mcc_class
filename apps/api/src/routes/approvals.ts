import { Router, Request, Response } from 'express';
import { listPendingApprovals } from '../repositories/letters';
import { query } from '../db';
import { isAdmin } from '../auth/roles';

export const approvalsRoutes = () => {
    const router = Router();

    router.get('/approvers', async (req: Request, res: Response) => {
        try {
            const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';
            const data = await query<{ user_id: string; role: string }>(
                "SELECT user_id, role FROM user_roles WHERE role IN ('APPROVER', 'ADMIN')"
            );
            const grouped = new Map<string, Set<string>>();
            for (const row of data) {
                if (!row.user_id || !row.role) continue;
                const roles = grouped.get(row.user_id) ?? new Set<string>();
                roles.add(row.role);
                grouped.set(row.user_id, roles);
            }
            let approvers = Array.from(grouped.entries())
                .map(([id, roles]) => ({ id, label: id, roles: Array.from(roles).sort() }))
                .sort((a, b) => a.label.localeCompare(b.label));
            if (search) {
                approvers = approvers.filter((item) =>
                    item.id.toLowerCase().includes(search) || item.label.toLowerCase().includes(search)
                );
            }
            res.json(approvers);
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    router.get('/approvals/pending', async (req: Request, res: Response) => {
        try {
            const userId = req.user?.id;
            if (!userId) return res.status(401).json({ error: 'Unauthorized' });
            const context = typeof req.query.context === 'string' ? req.query.context : null;
            const pending = await listPendingApprovals(userId, isAdmin(req), context);
            res.json(pending);
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    return router;
};
