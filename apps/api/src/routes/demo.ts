import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query, execute } from '../db';
import { demoCleanupSchema } from '../validation/letters';
import { isAdmin, isApprover } from '../auth/roles';

export const demoRoutes = () => {
    const router = Router();

    router.post('/demo/cleanup-drafts', async (req: Request, res: Response) => {
        try {
            const userId = req.user?.id;
            if (!userId) return res.status(401).json({ error: 'Unauthorized' });
            if (!isAdmin(req) && !isApprover(req)) return res.status(403).json({ error: 'Admin or Approver role required.' });
            const parsed = demoCleanupSchema.safeParse(req.body ?? {});
            if (!parsed.success) {
                return res.status(400).json({ error: parsed.error.errors[0]?.message || 'Invalid payload' });
            }
            const dryRun = parsed.data.dry_run === true;
            const drafts = await query<any>("SELECT id FROM letters WHERE status = 'DRAFT' ORDER BY created_at DESC");
            const keepCount = 5;
            const toDelete = drafts.slice(keepCount);
            const ids = toDelete.map((d) => d.id);

            if (dryRun) {
                return res.json({ message: 'Dry run only.', total_drafts: drafts.length, would_delete: ids, kept: keepCount });
            }

            let deleted = 0;
            for (const draft of toDelete) {
                await execute('DELETE FROM letter_tags WHERE letter_id = ?', [draft.id]);
                await execute('DELETE FROM letter_approver_assignments WHERE letter_id = ?', [draft.id]);
                await execute('DELETE FROM letter_versions WHERE letter_id = ?', [draft.id]);
                await execute('DELETE FROM letters WHERE id = ?', [draft.id]);
                deleted++;
            }
            await execute(
                'INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, metadata) VALUES (?, ?, ?, ?, ?, ?)',
                [uuidv4(), userId, 'DEMO_CLEANUP', 'LETTER', 'bulk', JSON.stringify({ deleted_count: deleted, kept: keepCount })]
            );
            res.json({ message: `Cleaned up ${deleted} drafts, kept ${keepCount}.`, deleted, kept: keepCount, deleted_ids: ids });
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    return router;
};
