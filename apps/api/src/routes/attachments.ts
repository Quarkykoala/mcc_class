import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { execute, query, queryOne } from '../db';
import { isAdmin } from '../auth/roles';
import { canAccessLetter } from '../letters/letter-helpers';

export const attachmentsRoutes = () => {
    const router = Router();

    router.get('/letters/:id/attachments', async (req: Request, res: Response) => {
        try {
            const userId = req.user?.id || '';
            const { id } = req.params;
            const letter = await queryOne<any>('SELECT department_id, created_by FROM letters WHERE id = ?', [id]);
            if (!letter) return res.status(404).json({ error: 'Letter not found' });
            const admin = isAdmin(req);
            if (!(await canAccessLetter(userId, admin, letter))) {
                return res.status(403).json({ error: 'Not authorized for this letter.' });
            }
            const data = await query('SELECT * FROM letter_attachments WHERE letter_id = ? ORDER BY created_at DESC', [id]);
            res.json(data);
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    router.post('/attachments', async (req: Request, res: Response) => {
        try {
            const userId = req.user?.id;
            if (!userId) return res.status(401).json({ error: 'Unauthorized' });
            const { letter_id, file_name, file_path, file_size, mime_type } = req.body ?? {};
            if (!letter_id || !file_name || !file_path) {
                return res.status(400).json({ error: 'letter_id, file_name, and file_path are required' });
            }
            const letter = await queryOne<any>('SELECT department_id, created_by FROM letters WHERE id = ?', [letter_id]);
            if (!letter) return res.status(404).json({ error: 'Letter not found' });
            const admin = isAdmin(req);
            if (!(await canAccessLetter(userId, admin, letter))) {
                return res.status(403).json({ error: 'Not authorized for this letter.' });
            }
            const newId = uuidv4();
            await execute(
                'INSERT INTO letter_attachments (id, letter_id, file_name, file_path, file_size, mime_type, uploaded_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [newId, letter_id, file_name, file_path, file_size ?? null, mime_type ?? null, userId]
            );
            const created = await queryOne<any>('SELECT * FROM letter_attachments WHERE id = ?', [newId]);
            res.status(201).json(created);
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    router.delete('/attachments/:id', async (req: Request, res: Response) => {
        try {
            const userId = req.user?.id;
            if (!userId) return res.status(401).json({ error: 'Unauthorized' });
            const { id } = req.params;
            const attachment = await queryOne<any>('SELECT letter_id, uploaded_by FROM letter_attachments WHERE id = ?', [id]);
            if (!attachment) return res.status(404).json({ error: 'Attachment not found' });
            const admin = isAdmin(req);
            if (!admin && attachment.uploaded_by !== userId) return res.status(403).json({ error: 'Not authorized' });
            await execute('DELETE FROM letter_attachments WHERE id = ?', [id]);
            res.json({ message: 'Attachment deleted' });
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    return router;
};
