import { Router, Request, Response } from 'express';
import { execute, query, queryOne } from '../db';
import { canAccessLetter } from '../letters/letter-helpers';
import { emailLinkSchema } from '../validation/letters';
import { isAdmin } from '../auth/roles';
import { uuidv4 } from '../uuid';

export const emailLinksRoutes = () => {
    const router = Router();

    router.get('/email-links', async (req: Request, res: Response) => {
        try {
            const { letter_id, job_reference } = req.query;
            const admin = isAdmin(req);
            const userId = req.user?.id || '';
            if (!admin) {
                if (!letter_id) return res.status(400).json({ error: 'letter_id is required for non-admin users.' });
                const letter = await queryOne<any>('SELECT department_id, created_by FROM letters WHERE id = ?', [String(letter_id)]);
                if (!letter) return res.status(404).json({ error: 'Letter not found.' });
                if (!(await canAccessLetter(userId, admin, letter))) return res.status(403).json({ error: 'Not authorized for this letter.' });
            }
            const conditions: string[] = [];
            const params: unknown[] = [];
            if (letter_id) { conditions.push('letter_id = ?'); params.push(String(letter_id)); }
            if (job_reference) { conditions.push('job_reference = ?'); params.push(String(job_reference)); }
            const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
            const data = await query(`SELECT * FROM email_links ${where} ORDER BY created_at DESC`, params);
            res.json(data);
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    router.post('/email-links', async (req: Request, res: Response) => {
        try {
            const userId = req.user?.id;
            if (!userId) return res.status(401).json({ error: 'Unauthorized' });
            const parsed = emailLinkSchema.safeParse(req.body ?? {});
            if (!parsed.success) {
                return res.status(400).json({ error: parsed.error.errors[0]?.message || 'Invalid payload' });
            }
            const { letter_id, job_reference, sender, subject, body_excerpt, received_at } = parsed.data;
            const source_ip = req.ip || '0.0.0.0';
            if (!letter_id && !job_reference) {
                return res.status(400).json({ error: 'letter_id or job_reference is required.' });
            }
            const admin = isAdmin(req);
            if (!admin) {
                if (!letter_id) return res.status(400).json({ error: 'letter_id is required for non-admin users.' });
                const letter = await queryOne<any>('SELECT department_id, created_by FROM letters WHERE id = ?', [letter_id]);
                if (!letter) return res.status(404).json({ error: 'Letter not found.' });
                if (!(await canAccessLetter(userId, admin, letter))) return res.status(403).json({ error: 'Not authorized for this letter.' });
            }
            const newId = uuidv4();
            await execute(
                'INSERT INTO email_links (id, letter_id, job_reference, sender, subject, body_excerpt, received_at, classified_by, source_ip) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [newId, letter_id ?? null, job_reference ?? null, sender ?? null, subject ?? null, body_excerpt ?? null, received_at ?? null, userId, source_ip]
            );
            const created = await queryOne<any>('SELECT * FROM email_links WHERE id = ?', [newId]);
            await execute(
                'INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, metadata, source_ip) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [uuidv4(), userId, 'EMAIL_LINK', 'LETTER', letter_id || created?.letter_id, JSON.stringify({ job_reference, sender, subject }), source_ip]
            );
            res.status(201).json(created);
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    return router;
};
