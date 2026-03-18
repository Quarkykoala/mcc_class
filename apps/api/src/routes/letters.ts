import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { buildContentHash, normalizeTagIds, generateIssuancePdf } from '../letter-utils';
import { handleLetterVersionUpdate } from '../version-manager';
import { execute, query, queryOne, transaction, queryOneWithConn, queryWithConn, executeWithConn } from '../db';
import { pickExistingColumns, tableHasColumn } from '../db-schema';
import { canAccessLetter, normalizeUuidList } from '../letters/letter-helpers';
import { listLetters, getLetterDetail } from '../repositories/letters';
import { isAdmin, isApprover, isIssuer } from '../auth/roles';
import { canTransition } from '../letters/letter-state';
import {
    createOrUpdateLetterSchema,
    routingSchema,
    approveSchema,
    rejectSchema,
    issueSchema,
    printSchema,
    deadlineSchema,
} from '../validation/letters';

export const lettersRoutes = () => {
    const router = Router();

    router.get('/letters', async (req: Request, res: Response) => {
        try {
            const result = await listLetters({
                context: typeof req.query.context === 'string' ? req.query.context : null,
                status: typeof req.query.status === 'string' ? req.query.status : null,
                department_id: typeof req.query.department_id === 'string' ? req.query.department_id : null,
                search: typeof req.query.search === 'string' ? req.query.search : null,
                created_after: typeof req.query.created_after === 'string' ? req.query.created_after : null,
                created_before: typeof req.query.created_before === 'string' ? req.query.created_before : null,
                page: parseInt(req.query.page as string) || 1,
                limit: parseInt(req.query.limit as string) || 50,
                userId: req.user?.id,
                isAdmin: isAdmin(req),
            });
            res.json(result);
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    router.post('/letters/:id/deadline', async (req: Request, res: Response) => {
        try {
            const userId = req.user?.id;
            if (!userId) return res.status(401).json({ error: 'Unauthorized' });
            if (!isAdmin(req)) return res.status(403).json({ error: 'Admin role required.' });
            const parsed = deadlineSchema.safeParse(req.body ?? {});
            if (!parsed.success) {
                return res.status(400).json({ error: parsed.error.errors[0]?.message || 'Invalid payload' });
            }
            const { id } = req.params;
            const { approver_ids, due_at } = parsed.data;
            const admin = isAdmin(req);
            const letter = await queryOne<any>('SELECT department_id, created_by FROM letters WHERE id = ?', [id]);
            if (!letter) return res.status(404).json({ error: 'Letter not found.' });
            if (!(await canAccessLetter(userId, admin, letter))) return res.status(403).json({ error: 'Not authorized for this letter.' });
            for (const approverId of approver_ids) {
                await execute(
                    'INSERT INTO approval_deadlines (id, letter_id, approver_id, due_at) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE due_at = VALUES(due_at), completed_at = NULL',
                    [uuidv4(), id, approverId, due_at]
                );
            }
            await execute(
                'INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, metadata) VALUES (?, ?, ?, ?, ?, ?)',
                [uuidv4(), userId, 'SET_DEADLINE', 'LETTER', id, JSON.stringify({ approver_ids, due_at })]
            );
            res.json({ message: 'Deadline set successfully.' });
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    router.get('/letters/:id', async (req: Request, res: Response) => {
        try {
            const { id } = req.params;
            const userId = req.user?.id || '';
            const admin = isAdmin(req);
            const optionalLetterColumns = await pickExistingColumns('letters', [
                'committee_id',
                'title',
                'job_reference',
                'letter_number',
                'rejection_reason',
                'approval_mode',
                'source_ip',
            ]);
            const letter = await queryOne<any>(
                `SELECT l.id, l.context, l.department_id, l.status, l.content, l.created_by, l.created_at, l.updated_at${
                    optionalLetterColumns.length > 0 ? `, ${optionalLetterColumns.map((column) => `l.${column}`).join(', ')}` : ''
                }, d.name as dept_name
                 FROM letters l LEFT JOIN departments d ON l.department_id = d.id WHERE l.id = ?`,
                [id]
            );
            if (!letter) return res.status(404).json({ error: 'Letter not found' });
            if (!(await canAccessLetter(userId, admin, letter))) return res.status(403).json({ error: 'Not authorized for this letter.' });
            const enriched = await getLetterDetail(id, userId, admin);
            res.json(enriched);
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    router.post('/letters', async (req: Request, res: Response) => {
        try {
            const userId = req.user?.id;
            if (!userId) return res.status(401).json({ error: 'Unauthorized' });
            if (typeof req.body?.content !== 'string' || req.body.content.trim().length === 0) {
                return res.status(400).json({ error: 'content is required.' });
            }
            const parsed = createOrUpdateLetterSchema.safeParse(req.body);
            if (!parsed.success) {
                return res.status(400).json({ error: parsed.error.errors[0]?.message || 'Invalid payload' });
            }
            const { id, context, tag_ids, content, title, job_reference, department_id, committee_id } = parsed.data;
            if (!id && !context) {
                return res.status(400).json({ error: 'context is required for new letters.' });
            }
            const createContext = context ?? 'COMPANY';
            const hasTitle = Object.prototype.hasOwnProperty.call(req.body, 'title');
            const hasJobReference = Object.prototype.hasOwnProperty.call(req.body, 'job_reference');
            const deptId = department_id === '' ? null : department_id ?? null;
            const committeeId = committee_id === '' ? null : committee_id ?? null;
            const source_ip = req.ip || '0.0.0.0';
            const letterColumns = await pickExistingColumns('letters', [
                'committee_id',
                'title',
                'job_reference',
                'source_ip',
            ]);
            const hasCommitteeColumn = letterColumns.includes('committee_id');
            const hasTitleColumn = letterColumns.includes('title');
            const hasJobReferenceColumn = letterColumns.includes('job_reference');
            const hasSourceIpColumn = letterColumns.includes('source_ip');
            const hasUpdatedAtColumn = await tableHasColumn('letters', 'updated_at');
            const auditHasSourceIpColumn = await tableHasColumn('audit_logs', 'source_ip');

            if (id) {
                const currentLetter = await queryOne<any>('SELECT id, context, department_id, status, created_by FROM letters WHERE id = ?', [id]);
                if (!currentLetter) return res.status(404).json({ error: 'Letter not found' });
                if (currentLetter.status !== 'DRAFT') return res.status(400).json({ error: 'Only DRAFT letters can be edited.' });
                const canEdit = currentLetter.created_by === userId || isAdmin(req);
                if (!canEdit) return res.status(403).json({ error: 'Not authorized to edit this draft.' });

                const setClauses: string[] = ['department_id = ?', 'content = ?'];
                const updateParams: unknown[] = [deptId || currentLetter.department_id, content];
                if (hasCommitteeColumn) { setClauses.push('committee_id = ?'); updateParams.push(committeeId); }
                if (hasUpdatedAtColumn) { setClauses.push('updated_at = NOW()'); }
                if (hasTitle && hasTitleColumn) { setClauses.push('title = ?'); updateParams.push(title ?? null); }
                if (hasJobReference && hasJobReferenceColumn) { setClauses.push('job_reference = ?'); updateParams.push(job_reference ?? null); }
                updateParams.push(id);
                await execute(`UPDATE letters SET ${setClauses.join(', ')} WHERE id = ?`, updateParams);

                const normalizedTags = normalizeTagIds(tag_ids);
                await execute('DELETE FROM letter_tags WHERE letter_id = ?', [id]);
                for (const tagId of normalizedTags) {
                    await execute('INSERT INTO letter_tags (letter_id, tag_id) VALUES (?, ?)', [id, tagId]);
                }

                const auditContext = context ?? currentLetter.context;
                if (auditHasSourceIpColumn) {
                    await execute(
                        'INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, metadata, source_ip) VALUES (?, ?, ?, ?, ?, ?, ?)',
                        [uuidv4(), userId, 'UPDATE', 'LETTER', id, JSON.stringify({ context: auditContext, department_id: deptId, content_length: content.length, source_ip }), source_ip]
                    );
                } else {
                    await execute(
                        'INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, metadata) VALUES (?, ?, ?, ?, ?, ?)',
                        [uuidv4(), userId, 'UPDATE', 'LETTER', id, JSON.stringify({ context: auditContext, department_id: deptId, content_length: content.length, source_ip })]
                    );
                }

                await handleLetterVersionUpdate(id, content, userId);
                const updated = await queryOne<any>('SELECT * FROM letters WHERE id = ?', [id]);
                return res.json(updated);
            } else {
                let resolvedDeptId = deptId;
                if (!resolvedDeptId) {
                    const deptRow = await queryOne<any>(
                        'SELECT id FROM departments WHERE context = ? ORDER BY created_at ASC LIMIT 1',
                        [createContext]
                    );
                    resolvedDeptId = deptRow?.id ?? null;
                }
                if (!resolvedDeptId) {
                    return res.status(400).json({ error: 'department_id is required (no default department found).' });
                }
                const newId = uuidv4();
                const cols = ['id', 'context', 'department_id', 'content', 'created_by', 'status'];
                const vals: unknown[] = [newId, createContext, resolvedDeptId, content, userId, 'DRAFT'];
                if (hasCommitteeColumn) { cols.push('committee_id'); vals.push(committeeId); }
                if (hasSourceIpColumn) { cols.push('source_ip'); vals.push(source_ip); }
                if (hasTitle && hasTitleColumn) { cols.push('title'); vals.push(title ?? null); }
                if (hasJobReference && hasJobReferenceColumn) { cols.push('job_reference'); vals.push(job_reference ?? null); }
                const placeholders = cols.map(() => '?').join(', ');
                await execute(`INSERT INTO letters (${cols.join(', ')}) VALUES (${placeholders})`, vals);

                const normalizedTags = normalizeTagIds(tag_ids);
                for (const tagId of normalizedTags) {
                    await execute('INSERT INTO letter_tags (letter_id, tag_id) VALUES (?, ?)', [newId, tagId]);
                }

                await handleLetterVersionUpdate(newId, content, userId);
                if (auditHasSourceIpColumn) {
                    await execute(
                        'INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, metadata, source_ip) VALUES (?, ?, ?, ?, ?, ?, ?)',
                        [uuidv4(), userId, 'CREATE', 'LETTER', newId, JSON.stringify({ context: createContext, department_id: resolvedDeptId, tag_count: normalizedTags.length, source_ip }), source_ip]
                    );
                } else {
                    await execute(
                        'INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, metadata) VALUES (?, ?, ?, ?, ?, ?)',
                        [uuidv4(), userId, 'CREATE', 'LETTER', newId, JSON.stringify({ context: createContext, department_id: resolvedDeptId, tag_count: normalizedTags.length, source_ip })]
                    );
                }
                const created = await queryOne<any>('SELECT * FROM letters WHERE id = ?', [newId]);
                res.status(201).json(created);
            }
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    router.post('/letters/:id/routing', async (req: Request, res: Response) => {
        try {
            const userId = req.user?.id;
            if (!userId) return res.status(401).json({ error: 'Unauthorized' });
            const parsed = routingSchema.safeParse(req.body);
            if (!parsed.success) {
                return res.status(400).json({ error: parsed.error.errors[0]?.message || 'Invalid payload' });
            }
            const { id } = req.params;
            const source_ip = req.ip || '0.0.0.0';
            const tagIds = normalizeTagIds(parsed.data.tag_ids);
            const ccApproverIds = normalizeUuidList(parsed.data.cc_approver_ids);
            const approvalMode = parsed.data.approval_mode === 'ANY' ? 'ANY' : 'ALL';
            const admin = isAdmin(req);

            const letter = await queryOne<any>('SELECT id, status, committee_id, department_id, created_by FROM letters WHERE id = ?', [id]);
            if (!letter) return res.status(404).json({ error: 'Letter not found' });
            if (!(await canAccessLetter(userId, admin, letter))) return res.status(403).json({ error: 'Not authorized for this letter.' });
            if (letter.status !== 'DRAFT') return res.status(400).json({ error: 'Routing is allowed only for DRAFT letters.' });
            if (letter.committee_id) return res.status(400).json({ error: 'Committee letters use the committee workflow.' });

            let autoApprovers: string[] = [];
            if (tagIds.length > 0) {
                const ph = tagIds.map(() => '?').join(',');
                const defaults = await query<{ approver_id: string }>(
                    `SELECT approver_id FROM tag_default_approvers WHERE tag_id IN (${ph})`,
                    tagIds
                );
                autoApprovers = normalizeUuidList(defaults.map((d) => d.approver_id));
            }
            const finalApprovers = normalizeUuidList([...autoApprovers, ...ccApproverIds]);

            await execute('DELETE FROM letter_tags WHERE letter_id = ?', [id]);
            for (const tagId of tagIds) {
                await execute('INSERT INTO letter_tags (letter_id, tag_id) VALUES (?, ?)', [id, tagId]);
            }
            await execute('DELETE FROM letter_approver_assignments WHERE letter_id = ?', [id]);
            for (const approverId of finalApprovers) {
                await execute(
                    'INSERT INTO letter_approver_assignments (id, letter_id, approver_id, decision) VALUES (?, ?, ?, ?)',
                    [uuidv4(), id, approverId, 'PENDING']
                );
            }
            await execute('UPDATE letters SET approval_mode = ?, updated_at = NOW() WHERE id = ?', [approvalMode, id]);

            await execute(
                'INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, metadata, source_ip) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [uuidv4(), userId, 'ROUTE_APPROVAL', 'LETTER', id, JSON.stringify({
                    tag_ids: tagIds,
                    auto_approver_count: autoApprovers.length,
                    manual_approver_count: ccApproverIds.length,
                    total_approver_count: finalApprovers.length,
                    approval_mode: approvalMode,
                    source_ip
                }), source_ip]
            );
            res.json({ message: 'Approval routing updated.', assignments_count: finalApprovers.length, approval_mode: approvalMode });
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    router.post('/letters/:id/submit', async (req: Request, res: Response) => {
        try {
            const userId = req.user?.id;
            if (!userId) return res.status(401).json({ error: 'Unauthorized' });
            const { id } = req.params;
            const source_ip = req.ip || '0.0.0.0';
            const admin = isAdmin(req);

            const letter = await queryOne<any>('SELECT id, status, committee_id, department_id, created_by FROM letters WHERE id = ?', [id]);
            if (!letter) return res.status(404).json({ error: 'Letter not found' });
            if (!(await canAccessLetter(userId, admin, letter))) return res.status(403).json({ error: 'Not authorized for this letter.' });
            if (!canTransition(letter.status, 'SUBMITTED')) return res.status(400).json({ error: 'Only DRAFT letters can be submitted.' });

            if (!letter.committee_id) {
                const assignments = await query<any>('SELECT id FROM letter_approver_assignments WHERE letter_id = ?', [id]);
                if (assignments.length === 0) return res.status(400).json({ error: 'Cannot submit: no approvers assigned. Use routing first.' });
            }

            await execute('UPDATE letters SET status = ?, updated_at = NOW() WHERE id = ?', ['SUBMITTED', id]);
            await execute(
                'INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, metadata, source_ip) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [uuidv4(), userId, 'SUBMIT', 'LETTER', id, JSON.stringify({ submitted_by: userId, source_ip }), source_ip]
            );
            res.json({ message: 'Letter submitted for approval.' });
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    router.post('/letters/:id/approve', async (req: Request, res: Response) => {
        try {
            const userId = req.user?.id;
            if (!userId) return res.status(401).json({ error: 'Unauthorized' });
            if (!isApprover(req) && !isAdmin(req)) {
                return res.status(403).json({ error: 'User does not have permission to approve letters.' });
            }
            const parsed = approveSchema.safeParse(req.body ?? {});
            if (!parsed.success) {
                return res.status(400).json({ error: parsed.error.errors[0]?.message || 'Invalid payload' });
            }
            const { id } = req.params;
            const { comment } = parsed.data;
            const source_ip = req.ip || '0.0.0.0';
            const admin = isAdmin(req);

            const letter = await queryOne<any>('SELECT * FROM letters WHERE id = ?', [id]);
            if (!letter) return res.status(404).json({ error: 'Letter not found' });
            if (!(await canAccessLetter(userId, admin, letter))) return res.status(403).json({ error: 'Not authorized for this letter.' });
            if (letter.committee_id) return res.status(403).json({ error: 'Letters assigned to a committee must be approved via the Committee Approval endpoint.' });
            if (!canTransition(letter.status, 'APPROVED')) return res.status(400).json({ error: 'Letter must be SUBMITTED before approval.' });

            if (!admin) {
                const assignment = await queryOne<any>(
                    'SELECT id, decision FROM letter_approver_assignments WHERE letter_id = ? AND approver_id = ?',
                    [id, userId]
                );
                if (!assignment) return res.status(403).json({ error: 'User is not assigned as an approver for this letter.' });
                if (assignment.decision === 'APPROVED') return res.status(400).json({ error: 'Approval already recorded.' });
            }

            await execute(
                'UPDATE letter_approver_assignments SET decision = ?, decided_at = NOW(), comment = ?, source_ip = ?, updated_at = NOW() WHERE letter_id = ? AND approver_id = ?',
                ['APPROVED', comment ?? null, source_ip, id, userId]
            );

            await execute('INSERT INTO approvals (id, letter_id, approver_id, comment, source_ip) VALUES (?, ?, ?, ?, ?)',
                [uuidv4(), id, userId, comment ?? null, source_ip]);

            let approved = 0;
            let total = 0;
            let quorumReached = false;
            if (admin) {
                quorumReached = true;
            } else {
                const assignments = await query<any>('SELECT decision FROM letter_approver_assignments WHERE letter_id = ?', [id]);
                approved = assignments.filter((a: any) => a.decision === 'APPROVED').length;
                total = assignments.length;
                quorumReached = total > 0 && approved === total;
            }

            if (quorumReached) {
                await execute('UPDATE letters SET status = ?, updated_at = NOW() WHERE id = ?', ['APPROVED', id]);
            }

            await execute(
                'INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, metadata, source_ip) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [uuidv4(), userId, quorumReached ? 'APPROVE_QUORUM_SATISFIED' : 'APPROVE_PARTIAL', 'LETTER', id,
                    JSON.stringify({ approver_id: userId, approved_count: approved, total_assignments: total, source_ip }), source_ip]
            );

            res.json({ message: quorumReached ? 'Letter approved successfully.' : 'Approval recorded; waiting for additional approvers.', approved_count: approved, total_assignments: total, status: quorumReached ? 'APPROVED' : 'SUBMITTED' });
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    router.post('/letters/:id/issue', async (req: Request, res: Response) => {
        try {
            const userId = req.user?.id;
            if (!userId) return res.status(401).json({ error: 'Unauthorized' });
            if (!isIssuer(req) && !isAdmin(req)) {
                return res.status(403).json({ error: 'User does not have permission to issue letters.' });
            }
            const parsed = issueSchema.safeParse(req.body ?? {});
            if (!parsed.success) {
                return res.status(400).json({ error: parsed.error.errors[0]?.message || 'Invalid payload' });
            }
            const { id } = req.params;
            const { channel, printer_id } = parsed.data;
            const source_ip = req.ip || '0.0.0.0';
            const admin = isAdmin(req);

            const letter = await queryOne<any>('SELECT l.*, d.name as dept_name FROM letters l LEFT JOIN departments d ON l.department_id = d.id WHERE l.id = ?', [id]);
            if (!letter) return res.status(404).json({ error: 'Letter not found' });
            if (!(await canAccessLetter(userId, admin, letter))) return res.status(403).json({ error: 'Not authorized for this letter.' });
            if (letter.status !== 'APPROVED' && letter.status !== 'ISSUED') return res.status(400).json({ error: 'Letter must be APPROVED to issue.' });

            const tagRows = await query<any>('SELECT tag_id FROM letter_tags WHERE letter_id = ?', [id]);
            const tagIds = tagRows.map((t: any) => t.tag_id).sort();

            const result = await transaction(async (conn) => {
                const lockedLetter = await queryOneWithConn<any>(conn, 'SELECT id, status, content FROM letters WHERE id = ? FOR UPDATE', [id]);
                if (!lockedLetter) throw new Error('Letter not found');
                if (lockedLetter.status !== 'APPROVED' && lockedLetter.status !== 'ISSUED') throw new Error('Letter must be APPROVED to issue.');

                const versions = await queryWithConn<any>(conn, 'SELECT version_number FROM letter_versions WHERE letter_id = ? ORDER BY version_number DESC LIMIT 1', [id]);
                const nextVersion = (versions.length > 0) ? versions[0].version_number + 1 : 1;

                const contentHash = buildContentHash({
                    letterId: id,
                    versionNumber: nextVersion,
                    context: letter.context,
                    departmentId: letter.department_id,
                    tagIds,
                    content: lockedLetter.content
                });
                const verificationToken = uuidv4();
                const versionId = uuidv4();

                await executeWithConn(conn,
                    'INSERT INTO letter_versions (id, letter_id, version_number, content, content_hash, verification_token, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
                    [versionId, id, nextVersion, lockedLetter.content, contentHash, verificationToken, userId]
                );

                const seqRow = await queryOneWithConn<any>(conn, 'SELECT next_val FROM letter_number_seq FOR UPDATE', []);
                const letterNumber = seqRow?.next_val || 10001;
                await executeWithConn(conn, 'UPDATE letter_number_seq SET next_val = next_val + 1', []);

                await executeWithConn(conn, 'UPDATE letters SET status = ?, letter_number = ?, updated_at = NOW() WHERE id = ?', ['ISSUED', letterNumber, id]);

                const issuanceId = uuidv4();
                const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
                const verifyUrl = `${clientUrl}/verify/${verificationToken}`;
                await executeWithConn(conn,
                    'INSERT INTO issuances (id, letter_version_id, issued_by, channel, qr_payload, content_hash, pdf_status, print_count, max_prints, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                    [issuanceId, versionId, userId, channel || 'PRINT', verifyUrl, contentHash, 'PENDING', 0, 1, 'ACTIVE']
                );

                if (printer_id) {
                    await executeWithConn(conn,
                        'INSERT INTO print_audits (id, issuance_id, printed_by, printer_id, status, source_ip) VALUES (?, ?, ?, ?, ?, ?)',
                        [uuidv4(), issuanceId, userId, printer_id, 'SUCCESS', source_ip]
                    );
                }

                await executeWithConn(conn,
                    'INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, metadata, source_ip) VALUES (?, ?, ?, ?, ?, ?, ?)',
                    [uuidv4(), userId, 'ISSUE', 'LETTER', id,
                        JSON.stringify({ issued_by: userId, channel: channel || 'PRINT', content_hash: contentHash, letter_number: letterNumber, source_ip }), source_ip]
                );

                return { issuanceId, verificationToken, contentHash, letterNumber, verifyUrl, content: lockedLetter.content };
            });

            let pdfOutput = '';
            try {
                pdfOutput = await generateIssuancePdf({
                    context: letter.context,
                    departmentName: letter.dept_name,
                    content: result.content,
                    contentHash: result.contentHash,
                    verificationUrl: result.verifyUrl,
                    issuedAt: new Date(),
                    letterNumber: result.letterNumber
                });
                await execute('UPDATE issuances SET pdf_status = ? WHERE id = ?', ['READY', result.issuanceId]);
            } catch (pdfErr) {
                console.error('PDF generation failed:', pdfErr);
            }

            res.json({
                message: 'Letter issued successfully.',
                issuance_id: result.issuanceId,
                verification_token: result.verificationToken,
                content_hash: result.contentHash,
                letter_number: result.letterNumber,
                pdf: pdfOutput || undefined
            });
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    router.post('/letters/:id/revoke', async (req: Request, res: Response) => {
        try {
            const userId = req.user?.id;
            if (!userId) return res.status(401).json({ error: 'Unauthorized' });
            if (!isAdmin(req)) return res.status(403).json({ error: 'Admin role required to revoke.' });
            const { id } = req.params;
            const { reason } = req.body ?? {};
            const source_ip = req.ip || '0.0.0.0';
            const letter = await queryOne<any>('SELECT status, department_id, created_by FROM letters WHERE id = ?', [id]);
            if (!letter) return res.status(404).json({ error: 'Letter not found' });
            if (letter.status !== 'ISSUED') return res.status(400).json({ error: 'Only ISSUED letters can be revoked.' });
            await execute(
                'UPDATE letters SET status = ?, revoked_at = NOW(), revoked_by = ?, revocation_reason = ?, updated_at = NOW() WHERE id = ?',
                ['REVOKED', userId, reason, id]
            );
            await execute(
                'INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, metadata, source_ip) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [uuidv4(), userId, 'REVOKE', 'LETTER', id, JSON.stringify({ revoked_by: userId, reason, source_ip }), source_ip]
            );
            res.json({ message: 'Letter revoked.' });
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    router.post('/letters/:id/committee-approve', async (req: Request, res: Response) => {
        try {
            const userId = req.user?.id;
            if (!userId) return res.status(401).json({ error: 'Unauthorized' });
            const { id } = req.params;
            const { comment } = req.body ?? {};
            const source_ip = req.ip || '0.0.0.0';
            const admin = isAdmin(req);
            const letter = await queryOne<any>('SELECT * FROM letters WHERE id = ?', [id]);
            if (!letter) return res.status(404).json({ error: 'Letter not found' });
            if (!(await canAccessLetter(userId, admin, letter))) return res.status(403).json({ error: 'Not authorized for this letter.' });
            if (letter.status !== 'DRAFT') return res.status(400).json({ error: 'Letter is not in DRAFT status' });
            if (!letter.committee_id) return res.status(400).json({ error: 'This letter is not assigned to a committee.' });
            if (!admin) {
                const member = await queryOne<any>(
                    'SELECT user_id FROM committee_members WHERE committee_id = ? AND user_id = ?',
                    [letter.committee_id, userId]
                );
                if (!member) return res.status(403).json({ error: 'User is not a member of the assigned committee.' });
            }
            await execute('UPDATE letters SET status = ? WHERE id = ?', ['APPROVED', id]);
            await execute(
                'INSERT INTO committee_approvals (id, letter_id, committee_id, approver_id, metadata) VALUES (?, ?, ?, ?, ?)',
                [uuidv4(), id, letter.committee_id, userId, JSON.stringify({ comment, source_ip })]
            );
            await execute(
                'INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, metadata, source_ip) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [uuidv4(), userId, 'COMMITTEE_APPROVE', 'LETTER', id, JSON.stringify({ committee_id: letter.committee_id, approver_id: userId, approval_role: admin ? 'ADMIN' : 'MEMBER', source_ip }), source_ip]
            );
            res.json({ message: 'Letter approved by Committee successfully' });
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    router.post('/letters/:id/reject', async (req: Request, res: Response) => {
        try {
            const userId = req.user?.id;
            if (!userId) return res.status(401).json({ error: 'Unauthorized' });
            if (!isApprover(req) && !isAdmin(req)) {
                return res.status(403).json({ error: 'User does not have permission to reject letters.' });
            }
            const parsed = rejectSchema.safeParse(req.body ?? {});
            if (!parsed.success) {
                return res.status(400).json({ error: parsed.error.errors[0]?.message || 'Invalid payload' });
            }
            const { id } = req.params;
            const { reason } = parsed.data;
            const source_ip = req.ip || '0.0.0.0';
            const admin = isAdmin(req);
            const letter = await queryOne<any>('SELECT status, committee_id, department_id, created_by FROM letters WHERE id = ?', [id]);
            if (!letter) return res.status(404).json({ error: 'Letter not found' });
            if (!(await canAccessLetter(userId, admin, letter))) return res.status(403).json({ error: 'Not authorized for this letter.' });
            if (!letter.committee_id) {
                if (!canTransition(letter.status, 'REJECTED')) return res.status(400).json({ error: 'Only SUBMITTED non-committee letters can be rejected.' });
                if (!admin) {
                    const assignment = await queryOne<any>(
                        'SELECT id FROM letter_approver_assignments WHERE letter_id = ? AND approver_id = ?',
                        [id, userId]
                    );
                    if (!assignment) return res.status(403).json({ error: 'User is not assigned as an approver for this letter.' });
                }
                await execute(
                    'UPDATE letter_approver_assignments SET decision = ?, decided_at = NOW(), comment = ?, source_ip = ?, updated_at = NOW() WHERE letter_id = ? AND approver_id = ?',
                    ['REJECTED', reason, source_ip, id, userId]
                );
            }
            await execute(
                'UPDATE letters SET status = ?, rejected_at = NOW(), rejected_by = ?, rejection_reason = ?, updated_at = NOW() WHERE id = ?',
                ['REJECTED', userId, reason, id]
            );
            await execute(
                'INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, metadata, source_ip) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [uuidv4(), userId, 'REJECT', 'LETTER', id, JSON.stringify({ rejected_by: userId, reason, source_ip }), source_ip]
            );
            res.json({ message: 'Letter rejected.' });
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    router.post('/letters/:id/print', async (req: Request, res: Response) => {
        try {
            const userId = req.user?.id;
            if (!userId) return res.status(401).json({ error: 'Unauthorized' });
            if (!isIssuer(req) && !isAdmin(req)) {
                return res.status(403).json({ error: 'User does not have permission to print letters.' });
            }
            const parsed = printSchema.safeParse(req.body ?? {});
            if (!parsed.success) {
                return res.status(400).json({ error: parsed.error.errors[0]?.message || 'Invalid payload' });
            }
            const { id } = req.params;
            const { printer_id } = parsed.data;
            const source_ip = req.ip || '0.0.0.0';
            const admin = isAdmin(req);

            const issuance = await queryOne<any>(
                `SELECT i.id, i.print_count, i.max_prints FROM issuances i
                 INNER JOIN letter_versions lv ON i.letter_version_id = lv.id
                 WHERE lv.letter_id = ? ORDER BY i.issued_at DESC LIMIT 1`,
                [id]
            );
            if (!issuance) return res.status(404).json({ error: 'No issuance found for this letter.' });
            const letter = await queryOne<any>('SELECT department_id, created_by FROM letters WHERE id = ?', [id]);
            if (!letter) return res.status(404).json({ error: 'Letter not found.' });
            if (!(await canAccessLetter(userId, admin, letter))) return res.status(403).json({ error: 'Not authorized for this letter.' });
            if (issuance.print_count >= issuance.max_prints) return res.status(403).json({ error: 'Print limit reached. Request a reprint.' });
            await execute('UPDATE issuances SET print_count = print_count + 1 WHERE id = ?', [issuance.id]);
            await execute(
                'INSERT INTO print_audits (id, issuance_id, printed_by, printer_id, status, source_ip) VALUES (?, ?, ?, ?, ?, ?)',
                [uuidv4(), issuance.id, userId, printer_id || 'DEFAULT', 'SUCCESS', source_ip]
            );
            await execute(
                'INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, metadata, source_ip) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [uuidv4(), userId, 'PRINT', 'ISSUANCE', issuance.id, JSON.stringify({ printed_by: userId, printer_id: printer_id || 'DEFAULT' }), source_ip]
            );
            res.json({ message: 'Print recorded successfully.', print_count: issuance.print_count + 1 });
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    router.get('/letters/export', async (req: Request, res: Response) => {
        try {
            const { status, department_id, context } = req.query;
            const admin = isAdmin(req);
            const userId = req.user?.id || '';
            const conditions: string[] = [];
            const params: unknown[] = [];
            if (context) { conditions.push('l.context = ?'); params.push(String(context)); }
            if (status) { conditions.push('l.status = ?'); params.push(String(status)); }
            if (department_id) { conditions.push('l.department_id = ?'); params.push(String(department_id)); }
            if (!admin && userId) {
                const deptIds = await query<{ department_id: string }>('SELECT department_id FROM user_departments WHERE user_id = ?', [userId]);
                if (deptIds.length > 0) {
                    const dph = deptIds.map(() => '?').join(',');
                    conditions.push(`(l.created_by = ? OR l.department_id IN (${dph}))`);
                    params.push(userId, ...deptIds.map((d) => d.department_id));
                } else { conditions.push('l.created_by = ?'); params.push(userId); }
            }
            const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
            const data = await query<any>(
                `SELECT l.id, l.context, l.status, l.title, l.job_reference, l.letter_number, l.created_at, l.updated_at, d.name as dept_name
                 FROM letters l LEFT JOIN departments d ON l.department_id = d.id ${where} ORDER BY l.created_at DESC`,
                params
            );
            const headers = ['ID', 'Context', 'Status', 'Title', 'Job Reference', 'Letter Number', 'Department', 'Created At'];
            const rows = data.map((l: any) => [l.id, l.context, l.status, l.title || '', l.job_reference || '', l.letter_number || '', l.dept_name || '', l.created_at]);
            const csv = [headers.join(','), ...rows.map((r: any) => r.map((c: any) => `"${String(c).replace(/"/g, '""')}"`).join(','))].join('\n');
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename=letters_export_${Date.now()}.csv`);
            res.send(csv);
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    return router;
};
