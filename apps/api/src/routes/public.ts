import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDepartments, getTags } from '../repositories/master-lists';
import { query, queryOne, execute } from '../db';
import { buildVerificationResponse } from '../letter-utils';

export const publicRoutes = () => {
    const router = Router();

    router.get('/api/departments', async (req: Request, res: Response) => {
        try {
            const context = typeof req.query.context === 'string' ? req.query.context : null;
            const data = await getDepartments(context);
            res.set('Cache-Control', 'public, max-age=300'); // Cache for 5 minutes
            res.json(data);
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    router.get('/api/tags', async (req: Request, res: Response) => {
        try {
            const context = typeof req.query.context === 'string' ? req.query.context : null;
            const data = await getTags(context);
            res.set('Cache-Control', 'public, max-age=300'); // Cache for 5 minutes
            res.json(data);
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    router.get('/api/verify/:token', async (req: Request, res: Response) => {
        try {
            const { token } = req.params;
            const accessKey = process.env.VERIFY_ACCESS_KEY;
            const providedKey = req.header('x-verify-key');
            if (accessKey && accessKey !== providedKey) {
                console.warn(`Unauthorized verify attempt for token ${token}`);
                await execute(
                    'INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, metadata, source_ip) VALUES (?, ?, ?, ?, ?, ?, ?)',
                    [uuidv4(), null, 'VERIFY_DENIED', 'VERIFY', token, JSON.stringify({ token }), req.ip || '0.0.0.0']
                );
                return res.status(401).json({ error: 'Verification requires authorized access.' });
            }

            const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token);
            const versionRecord = isUuid
                ? await queryOne<any>('SELECT id, letter_id, version_number, verification_token FROM letter_versions WHERE verification_token = ?', [token])
                : await queryOne<any>('SELECT id, letter_id, version_number, content_hash FROM letter_versions WHERE content_hash = ?', [token]);

            if (!versionRecord) {
                return res.status(404).json({ valid: false, message: 'Invalid or unknown verification token.' });
            }

            const letter = await queryOne<any>(
                `SELECT l.context, l.status, d.name as dept_name, l.letter_number, l.rejected_at, l.rejected_by, l.rejection_reason
                 FROM letters l LEFT JOIN departments d ON l.department_id = d.id WHERE l.id = ?`,
                [versionRecord.letter_id]
            );

            if (letter && letter.status === 'REVOKED') {
                return res.json({ valid: false, status: 'REVOKED', message: 'This document has been revoked by the issuing authority.' });
            }

            const normalizedLetter = letter ? { ...letter, departments: { name: letter.dept_name } } : letter;
            const issuances = await query<any>('SELECT id, issued_at, issued_by FROM issuances WHERE letter_version_id = ?', [versionRecord.id]);
            const approvals = await query<any>('SELECT approver_id, created_at as approved_at FROM approvals WHERE letter_id = ?', [versionRecord.letter_id]);
            const committeeApprovals = await query<any>('SELECT approver_id, committee_id, created_at as approved_at FROM committee_approvals WHERE letter_id = ?', [versionRecord.letter_id]);

            const response = buildVerificationResponse({
                version_number: versionRecord.version_number,
                letters: normalizedLetter,
                approvals,
                committee_approvals: committeeApprovals,
                issuances
            });

            res.json(response);
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    return router;
};
