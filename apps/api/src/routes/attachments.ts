import { Router, Request, Response } from 'express';
import { execute, query, queryOne } from '../db';
import { isAdmin } from '../auth/roles';
import { canAccessLetter } from '../letters/letter-helpers';
import { uuidv4 } from '../uuid';

export const attachmentsRoutes = () => {
    const router = Router();

    router.get('/attachments/library', async (req: Request, res: Response) => {
        try {
            const userId = req.user?.id || '';
            if (!userId) return res.status(401).json({ error: 'Unauthorized' });
            const admin = isAdmin(req);
            const rows = await query<any>(
                `SELECT la.id, la.letter_id, la.file_name, la.file_path, la.file_size, la.mime_type, la.uploaded_by, la.created_at,
                        l.title as letter_title, l.department_id, l.created_by
                 FROM letter_attachments la
                 LEFT JOIN letters l ON l.id = la.letter_id
                 ORDER BY la.created_at DESC`
            );
            const visibleRows = [];
            for (const row of rows) {
                if (!row.letter_id) {
                    if (admin || row.uploaded_by === userId) visibleRows.push(row);
                    continue;
                }
                if (await canAccessLetter(userId, admin, row)) visibleRows.push(row);
            }
            res.json(visibleRows);
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

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

    router.post('/letters/:id/attachments/link', async (req: Request, res: Response) => {
        try {
            const userId = req.user?.id || '';
            if (!userId) return res.status(401).json({ error: 'Unauthorized' });
            const { id } = req.params;
            const { attachment_id } = req.body ?? {};
            if (!attachment_id) return res.status(400).json({ error: 'attachment_id is required' });
            const admin = isAdmin(req);
            const targetLetter = await queryOne<any>('SELECT department_id, created_by FROM letters WHERE id = ?', [id]);
            if (!targetLetter) return res.status(404).json({ error: 'Target letter not found' });
            if (!(await canAccessLetter(userId, admin, targetLetter))) {
                return res.status(403).json({ error: 'Not authorized for this letter.' });
            }

            const sourceAttachment = await queryOne<any>(
                `SELECT la.id, la.letter_id, la.file_name, la.file_path, la.file_size, la.mime_type, la.uploaded_by,
                        l.department_id, l.created_by
                 FROM letter_attachments la
                 LEFT JOIN letters l ON l.id = la.letter_id
                 WHERE la.id = ?`,
                [attachment_id]
            );
            if (!sourceAttachment) return res.status(404).json({ error: 'Attachment not found' });
            if (sourceAttachment.letter_id && !(await canAccessLetter(userId, admin, sourceAttachment))) {
                return res.status(403).json({ error: 'Not authorized to reuse this attachment.' });
            }

            const duplicate = await queryOne<any>(
                'SELECT id FROM letter_attachments WHERE letter_id = ? AND file_name = ? AND file_path = ?',
                [id, sourceAttachment.file_name, sourceAttachment.file_path]
            );
            if (duplicate) return res.json({ id: duplicate.id, linked: false, message: 'Attachment already linked.' });

            const newId = uuidv4();
            await execute(
                'INSERT INTO letter_attachments (id, letter_id, file_name, file_path, file_size, mime_type, uploaded_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [newId, id, sourceAttachment.file_name, sourceAttachment.file_path, sourceAttachment.file_size ?? null, sourceAttachment.mime_type ?? null, userId]
            );
            const created = await queryOne<any>('SELECT * FROM letter_attachments WHERE id = ?', [newId]);
            res.status(201).json({ ...created, linked: true });
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
