import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { execute, queryOne } from '../db';
import { normalizeUuidList } from '../letters/letter-helpers';
import { isAdmin } from '../auth/roles';
import { clearMasterListCache } from '../repositories/master-lists';

export const tagsAdminRoutes = () => {
    const router = Router();

    router.post('/tag-default-approvers', async (req: Request, res: Response) => {
        try {
            const userId = req.user?.id;
            if (!userId) return res.status(401).json({ error: 'Unauthorized' });
            if (!isAdmin(req)) return res.status(403).json({ error: 'Admin role required.' });
            const tagId = typeof req.body.tag_id === 'string' ? req.body.tag_id : '';
            const approverIds = normalizeUuidList(req.body.approver_ids);
            if (!tagId) return res.status(400).json({ error: 'tag_id is required.' });
            await execute('DELETE FROM tag_default_approvers WHERE tag_id = ?', [tagId]);
            for (const approverId of approverIds) {
                await execute('INSERT INTO tag_default_approvers (id, tag_id, approver_id) VALUES (?, ?, ?)', [uuidv4(), tagId, approverId]);
            }
            await execute(
                'INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, metadata) VALUES (?, ?, ?, ?, ?, ?)',
                [uuidv4(), userId, 'TAG_DEFAULT_APPROVER_SET', 'TAG', tagId, JSON.stringify({ approver_count: approverIds.length, updated_by: userId })]
            );
            res.json({ message: 'Default approvers updated.', count: approverIds.length });
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    router.post('/tags', async (req: Request, res: Response) => {
        try {
            const userId = req.user?.id;
            if (!userId) return res.status(401).json({ error: 'Unauthorized' });
            const { name, context } = req.body;
            if (!name) return res.status(400).json({ error: 'Name is required' });
            const existing = await queryOne<any>('SELECT * FROM tags WHERE name = ? AND context = ?', [name, context]);
            if (existing) return res.json(existing);
            const newId = uuidv4();
            await execute('INSERT INTO tags (id, name, context) VALUES (?, ?, ?)', [newId, name, context]);
            const created = await queryOne<any>('SELECT * FROM tags WHERE id = ?', [newId]);
            clearMasterListCache();
            res.json(created);
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    return router;
};
