import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { verifyApproverRole } from './auth-utils';
import { buildContentHash, normalizeTagIds, generateIssuancePdf, buildVerificationResponse } from './letter-utils';
import { handleLetterVersionUpdate } from './version-manager';
import { authMiddleware } from './auth-middleware';
import { v4 as uuidv4 } from 'uuid';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// CONFIG: Determine Mode
const isHardMode = process.env.HARD_MODE === 'true' || process.env.NODE_ENV === 'production';

if (isHardMode) {
    console.log('🔒 STARTING IN HARD MODE (Production/Strict Security)');
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
        console.error('CRITICAL: HARD_MODE requires SUPABASE_SERVICE_ROLE_KEY.');
        process.exit(1);
    }
} else {
    console.warn('⚠️  STARTING IN DEV MODE (Permissive if configured)');
}

const supabaseUrl = process.env.SUPABASE_URL;
// In Hard Mode, we MUST use Service Role Key to bypass RLS (since we dropped "Public" policies).
// In Dev Mode, we prefer Service Role but fallback to Anon (though Anon might now fail writes due to RLS).
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';

if (!supabaseUrl || !supabaseKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or AN_KEY) must be set.');
}

const supabase = createClient(supabaseUrl, supabaseKey);

app.set('trust proxy', true);

// Permissive CORS for Dev/Ngrok
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-verify-key', 'ngrok-skip-browser-warning']
}));

// Explicitly handle pre-flight for all routes just in case
app.options('*', cors());

app.use(express.json());

// Public Route
app.get('/', (req: Request, res: Response) => {
    res.send(`API is running. Use <a href="${clientUrl}">${clientUrl}</a> for the web app.`);
});

// --- Master Lists (Public) ---

app.get('/api/departments', async (req: Request, res: Response) => {
    const { context } = req.query;
    const query = supabase.from('departments').select('*');
    if (context) {
        query.eq('context', String(context));
    }
    const { data, error } = await query;

    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

app.get('/api/tags', async (req: Request, res: Response) => {
    const { context } = req.query;
    const query = supabase.from('tags').select('*');
    if (context) {
        query.eq('context', String(context));
    }
    const { data, error } = await query;

    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

app.get('/api/verify/:token', async (req: Request, res: Response) => {
    const { token } = req.params;
    const accessKey = process.env.VERIFY_ACCESS_KEY;
    const providedKey = req.header('x-verify-key');

    if (accessKey && accessKey !== providedKey) {
        return res.status(401).json({ error: 'Verification requires authorized access.' });
    }

    // Determine if we are looking up by UUID (verification_token) or Hash (legacy)
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token);

    let query = supabase
        .from('letter_versions')
        .select(`
            version_number,
            letters (
                context,
                status,
                departments (name),
                approvals (approver_id, created_at),
                committee_approvals (approver_id, committee_id, created_at),
                letter_number,
                rejected_at,
                rejected_by,
                rejection_reason
            ),
            issuances (id, issued_at, issued_by)
        `);

    if (isUuid) {
        query = query.eq('verification_token', token);
    } else {
        query = query.eq('content_hash', token);
    }

    const { data: versionRecord, error } = await query.single();

    if (error || !versionRecord) {
        return res.status(404).json({ valid: false, message: 'Invalid or unknown verification token.' });
    }

    const letter = Array.isArray(versionRecord.letters) ? versionRecord.letters[0] : versionRecord.letters;

    // REVOCATION CHECK ON VERIFY
    if (letter && letter.status === 'REVOKED') {
        return res.json({
            valid: false,
            status: 'REVOKED',
            message: 'This document has been revoked by the issuing authority.'
        });
    }

    const normalizedLetter = letter
        ? {
            ...letter,
            departments: Array.isArray(letter.departments) ? letter.departments[0] : letter.departments
        }
        : letter;

    const issuances = Array.isArray(versionRecord.issuances) ? versionRecord.issuances : (versionRecord.issuances ? [versionRecord.issuances] : []);
    const approvals = (letter?.approvals ?? []).map((approval: any) => ({
        ...approval,
        approved_at: approval.created_at
    }));
    const committeeApprovals = (letter?.committee_approvals ?? []).map((approval: any) => ({
        ...approval,
        approved_at: approval.created_at
    }));

    const response = buildVerificationResponse({
        version_number: versionRecord.version_number,
        letters: normalizedLetter,
        approvals,
        committee_approvals: committeeApprovals,
        issuances
    });

    res.json(response);
});

// --- AUTHENTICATED ROUTES ---
// Apply Auth Middleware to everything below (EXCEPT public verification)
// Moved here to ensure GET routes are also protected if they return sensitive data.
// If GET /letters is public, move it ABOVE this line.
// Assuming GET /letters contains sensitive drafts/approvals, it should be protected.
app.use(authMiddleware(supabaseUrl, supabaseKey));

// --- Letters (Read Public/Mixed, Write Protected) ---

const getUserDepartmentIds = async (req: Request) => {
    if (req.user?.roles.includes('ADMIN')) return null;
    if (!req.user?.id) return [];
    const { data: userDepts, error: deptError } = await req.supabase
        .from('user_departments')
        .select('department_id')
        .eq('user_id', req.user.id);
    if (deptError) throw new Error(deptError.message);
    return (userDepts ?? []).map((d: any) => d.department_id).filter(Boolean);
};

const canAccessLetter = async (req: Request, letter: { department_id?: string; created_by?: string }) => {
    if (req.user?.roles.includes('ADMIN')) return true;
    if (!req.user?.id) return false;
    if (letter.created_by && letter.created_by === req.user.id) return true;
    const deptIds = await getUserDepartmentIds(req);
    return Array.isArray(deptIds) && deptIds.includes(letter.department_id);
};

app.get('/api/letters', async (req: Request, res: Response) => {
    const { context } = req.query;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const isAdmin = req.user?.roles.includes('ADMIN');

    // Base Query
    let query = req.supabase.from('letters').select(`
        id, context, status, created_at, letter_number, rejection_reason, content,
        departments (name),
        letter_tags (
            tags (name)
        )
    `, { count: 'exact' });

    if (context) {
        query = query.eq('context', String(context));
    }

    if (!isAdmin && req.user?.id) {
        try {
            const deptIds = await getUserDepartmentIds(req);
            if (deptIds && deptIds.length > 0) {
                query = query.or(`created_by.eq.${req.user.id},department_id.in.(${deptIds.join(',')})`);
            } else {
                query = query.eq('created_by', req.user.id);
            }
        } catch (err: any) {
            return res.status(500).json({ error: err.message });
        }
    }

    // Pagination
    query = query.order('created_at', { ascending: false }).range(from, to);

    const { data, error, count } = await query;
    if (error) return res.status(500).json({ error: error.message });

    res.json({
        data,
        meta: {
            total: count,
            page,
            limit,
            hasMore: count ? to < count - 1 : false
        }
    });
});

app.post('/api/letters', async (req: Request, res: Response) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { id, context, tag_ids, content } = req.body;
    let { department_id, committee_id } = req.body;

    // Sanitize UUIDs: Convert empty strings to null
    if (department_id === '') department_id = null;
    if (committee_id === '') committee_id = null;

    const source_ip = req.ip || '0.0.0.0';

    if (!content) {
        return res.status(400).json({ error: 'content is required.' });
    }

    if (id) {
        // UPDATE
        const { data: currentLetter, error: letterError } = await req.supabase
            .from('letters')
            .select('id, context, department_id, status, created_by')
            .eq('id', id)
            .single();

        if (letterError || !currentLetter) {
            return res.status(404).json({ error: 'Letter not found' });
        }

        if (currentLetter.status !== 'DRAFT') {
            return res.status(400).json({ error: 'Only DRAFT letters can be edited.' });
        }

        // RBAC: Only creator or admin can edit
        const canEdit = currentLetter.created_by === userId || req.user?.roles.includes('ADMIN');
        if (!canEdit) return res.status(403).json({ error: 'Not authorized to edit this draft.' });

        // Update Content
        const { data: updateData, error: updateError } = await req.supabase
            .from('letters')
            .update({
                department_id: department_id || currentLetter.department_id,
                content: content,
                committee_id: committee_id, // Allow updating committee_id
                updated_at: new Date().toISOString()
            })
            .eq('id', id)
            .select()
            .single();

        if (updateError) return res.status(500).json({ error: updateError.message });

        await req.supabase.from('audit_logs').insert({
            action: 'UPDATE',
            entity_type: 'LETTER',
            entity_id: id,
            metadata: { context, department_id, content_length: content.length, source_ip }
        });

        // FORCE VERSION SNAPSHOT ON EVERY UPDATE
        try {
            await handleLetterVersionUpdate(req.supabase, id, content, userId);
        } catch (versionError: any) {
            console.error('Versioning failed:', versionError);
            return res.status(500).json({ error: 'Failed to create version snapshot: ' + versionError.message });
        }

        return res.json(updateData);

    } else {
        // CREATE
        const { data, error } = await req.supabase
            .from('letters')
            .insert({
                context,
                department_id,
                content,
                committee_id, // Allow setting committee_id
                created_by: userId, // Use authenticated user
                status: 'DRAFT',
                source_ip
            })
            .select()
            .single();

        if (error) return res.status(500).json({ error: error.message });

        const normalizedTags = normalizeTagIds(tag_ids);
        if (normalizedTags.length > 0) {
            const tagInserts = normalizedTags.map(tagId => ({
                letter_id: data.id,
                tag_id: tagId
            }));
            await req.supabase.from('letter_tags').insert(tagInserts);
        }

        // Initial Version Snapshot
        // Note: handleLetterVersionUpdate uses 'supabase' passed to it. We need it to use req.supabase.
        // We will update the call site to use req.supabase.
        await handleLetterVersionUpdate(req.supabase, data.id, content, userId);

        await req.supabase.from('audit_logs').insert({
            action: 'CREATE',
            entity_type: 'LETTER',
            entity_id: data.id,
            metadata: { context, department_id, tag_count: normalizedTags.length, source_ip }
        });

        res.status(201).json(data);
    }
});

app.post('/api/letters/:id/approve', async (req: Request, res: Response) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    // RBAC Check
    if (!req.user?.roles.includes('APPROVER') && !req.user?.roles.includes('ADMIN')) {
        return res.status(403).json({ error: 'User does not have permission to approve letters.' });
    }

    const { id } = req.params;
    const { comment } = req.body;
    const source_ip = req.ip || '0.0.0.0';

    const { data: letter, error: fetchError } = await req.supabase
        .from('letters')
        .select('*')
        .eq('id', id)
        .single();

    if (fetchError || !letter) return res.status(404).json({ error: 'Letter not found' });
    if (!(await canAccessLetter(req, letter))) return res.status(403).json({ error: 'Not authorized for this letter.' });
    if (letter.status !== 'DRAFT') return res.status(400).json({ error: 'Letter is not in DRAFT status' });

    // BLOCK COMMITTEE APPROVAL
    if (letter.committee_id) {
        return res.status(403).json({ error: 'Letters assigned to a committee must be approved via the Committee Approval endpoint.' });
    }

    const { error: updateError } = await req.supabase
        .from('letters')
        .update({ status: 'APPROVED' })
        .eq('id', id);

    if (updateError) return res.status(500).json({ error: updateError.message });

    await req.supabase.from('approvals').insert({
        letter_id: id,
        approver_id: userId, // Use Auth User
        comment,
        source_ip
    });

    await req.supabase.from('audit_logs').insert({
        action: 'APPROVE',
        entity_type: 'LETTER',
        entity_id: id,
        metadata: { approver_id: userId, source_ip }
    });

    res.json({ message: 'Letter approved successfully' });
});

app.post('/api/letters/:id/issue', async (req: Request, res: Response) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    // RBAC Check
    if (!req.user?.roles.includes('ISSUER') && !req.user?.roles.includes('ADMIN')) {
        return res.status(403).json({ error: 'User does not have permission to issue letters.' });
    }

    const { id } = req.params;
    const { channel, printer_id } = req.body;
    const source_ip = req.ip || '0.0.0.0';

    const { data: letter, error: fetchError } = await req.supabase
        .from('letters')
        .select('*, departments(*), letter_tags(tag_id)') // OPTIMIZED: Fetch only tag_id
        .eq('id', id)
        .single();

    if (fetchError || !letter) return res.status(404).json({ error: 'Letter not found' });
    if (!(await canAccessLetter(req, letter))) return res.status(403).json({ error: 'Not authorized for this letter.' });

    // Check if letter is APPROVED or ISSUED (idempotency handled in RPC but check here too for clarity)
    if (letter.status !== 'APPROVED' && letter.status !== 'ISSUED') {
        return res.status(400).json({ error: 'Letter must be APPROVED to issue.' });
    }

    // Determine Version logic
    // We create a NEW version snapshot at issuance to protect the exact state.
    // If a draft version exists with same content, fine, but issuance is a distinct event.

    // 1. Get next version number (Optimistic check for hash generation)
    // NOTE: The RPC will re-calculate/validate the version number atomically.
    const { data: versions } = await req.supabase
        .from('letter_versions')
        .select('version_number')
        .eq('letter_id', id)
        .order('version_number', { ascending: false })
        .limit(1);

    const nextVersion = (versions && versions.length > 0) ? versions[0].version_number + 1 : 1;

    // 2. Generate Hash (Canonical)
    const tagIds = letter.letter_tags ? letter.letter_tags.map((lt: any) => lt.tag_id).sort() : [];

    const contentHash = buildContentHash({
        letterId: letter.id,
        versionNumber: nextVersion,
        context: letter.context,
        departmentId: letter.department_id,
        tagIds,
        content: letter.content
    });

    // 3. Generate Verification Token
    const verificationToken = uuidv4();
    const verifyUrl = `${clientUrl}/verify/${verificationToken}`;

    // 4. Atomic Issuance RPC
    const { data: rpcResult, error: rpcError } = await req.supabase.rpc('issue_letter', {
        p_letter_id: id,
        p_issuer_id: userId,
        p_content_hash: contentHash,
        p_content: letter.content,
        p_channel: channel || 'PRINT',
        p_qr_payload: verifyUrl,
        p_printer_id: printer_id,
        p_source_ip: source_ip,
        p_expected_version: nextVersion,
        p_verification_token: verificationToken
    });

    if (rpcError) {
        if (rpcError.message.includes('Version Mismatch')) {
            return res.status(409).json({ error: 'Issuance conflict: Version mismatch. Please try again.' });
        }
        return res.status(500).json({ error: 'Issuance failed: ' + rpcError.message });
    }

    // 5. Generate PDF (after successful issuance)
    // If rpcResult contains a different verification token (because of idempotency), use it.
    const finalVerifyUrl = rpcResult.verification_token
        ? `${clientUrl}/verify/${rpcResult.verification_token}`
        : verifyUrl;

    let pdfOutput = '';
    try {
        pdfOutput = await generateIssuancePdf({
            context: letter.context,
            departmentName: letter.departments?.name,
            content: letter.content,
            contentHash,
            verificationUrl: finalVerifyUrl,
            issuedAt: new Date(),
            letterNumber: rpcResult.letter_number
        });

        // Update pdf_status to READY
        await req.supabase
            .from('issuances')
            .update({ pdf_status: 'READY' })
            .eq('id', rpcResult.issuance_id);

    } catch (pdfError) {
        console.error('PDF Generation Failed:', pdfError);
        // Update pdf_status to FAILED
        await req.supabase
            .from('issuances')
            .update({ pdf_status: 'FAILED' })
            .eq('id', rpcResult.issuance_id);

        // Return success for issuance but empty PDF (or error indication)
        // Since issuance is atomic and committed, we technically "issued" it.
        // We warn the user.
        return res.json({ message: 'Letter issued but PDF generation failed.', verifyUrl: finalVerifyUrl, pdf: null });
    }

    res.json({ message: 'Letter issued', pdf: pdfOutput, verifyUrl: finalVerifyUrl });
});

app.post('/api/letters/:id/revoke', async (req: Request, res: Response) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    // RBAC: Admin or Issuer
    if (!req.user?.roles.includes('ADMIN') && !req.user?.roles.includes('ISSUER')) {
        return res.status(403).json({ error: 'Not authorized to revoke letters.' });
    }

    const { id } = req.params;
    const source_ip = req.ip || '0.0.0.0';

    const { data: letter, error: fetchError } = await req.supabase
        .from('letters')
        .select('department_id, created_by')
        .eq('id', id)
        .single();

    if (fetchError || !letter) return res.status(404).json({ error: 'Letter not found' });
    if (!(await canAccessLetter(req, letter))) return res.status(403).json({ error: 'Not authorized for this letter.' });

    await req.supabase.from('letters').update({ status: 'REVOKED' }).eq('id', id);

    await req.supabase.from('audit_logs').insert({
        action: 'REVOKE',
        entity_type: 'LETTER',
        entity_id: id,
        metadata: { revoked_by: userId, source_ip }
    });

    res.json({ message: 'Letter revoked.' });
});

app.post('/api/acknowledgements', async (req: Request, res: Response) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { letter_id, job_reference, file_url } = req.body;
    const source_ip = req.ip || '0.0.0.0';

    if (!letter_id) return res.status(400).json({ error: 'letter_id is required.' });

    const { data: letter, error: letterError } = await req.supabase
        .from('letters')
        .select('department_id, created_by')
        .eq('id', letter_id)
        .single();

    if (letterError || !letter) return res.status(404).json({ error: 'Letter not found.' });
    if (!(await canAccessLetter(req, letter))) return res.status(403).json({ error: 'Not authorized for this letter.' });

    const { error } = await req.supabase.from('acknowledgements').insert({
        letter_id,
        job_reference,
        file_url,
        captured_by: userId,
        source_ip
    });

    if (error) return res.status(500).json({ error: error.message });

    await req.supabase.from('audit_logs').insert({
        action: 'ACKNOWLEDGE',
        entity_type: 'LETTER',
        entity_id: letter_id,
        metadata: { job_reference, file_url, captured_by: userId }
    });

    res.json({ message: 'Acknowledgement recorded' });
});

// --- Email Classifier Linkage ---

app.get('/api/email-links', async (req: Request, res: Response) => {
    const { letter_id, job_reference } = req.query;
    let query = req.supabase.from('email_links').select('*').order('created_at', { ascending: false });

    const isAdmin = req.user?.roles.includes('ADMIN');
    if (!isAdmin) {
        if (!letter_id) {
            return res.status(400).json({ error: 'letter_id is required for non-admin users.' });
        }
        const { data: letter, error: letterError } = await req.supabase
            .from('letters')
            .select('department_id, created_by')
            .eq('id', String(letter_id))
            .single();
        if (letterError || !letter) return res.status(404).json({ error: 'Letter not found.' });
        if (!(await canAccessLetter(req, letter))) return res.status(403).json({ error: 'Not authorized for this letter.' });
    }

    if (letter_id) {
        query = query.eq('letter_id', String(letter_id));
    }
    if (job_reference) {
        query = query.eq('job_reference', String(job_reference));
    }

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

app.post('/api/email-links', async (req: Request, res: Response) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { letter_id, job_reference, sender, subject, body_excerpt, received_at } = req.body;
    const source_ip = req.ip || '0.0.0.0';

    if (!letter_id && !job_reference) {
        return res.status(400).json({ error: 'letter_id or job_reference is required.' });
    }

    const isAdmin = req.user?.roles.includes('ADMIN');
    if (!isAdmin) {
        if (!letter_id) return res.status(400).json({ error: 'letter_id is required for non-admin users.' });
        const { data: letter, error: letterError } = await req.supabase
            .from('letters')
            .select('department_id, created_by')
            .eq('id', letter_id)
            .single();
        if (letterError || !letter) return res.status(404).json({ error: 'Letter not found.' });
        if (!(await canAccessLetter(req, letter))) return res.status(403).json({ error: 'Not authorized for this letter.' });
    }

    const { data, error } = await req.supabase
        .from('email_links')
        .insert({
            letter_id,
            job_reference,
            sender,
            subject,
            body_excerpt,
            received_at,
            classified_by: userId,
            source_ip
        })
        .select()
        .single();

    if (error) return res.status(500).json({ error: error.message });

    await req.supabase.from('audit_logs').insert({
        action: 'EMAIL_LINK',
        entity_type: 'LETTER',
        entity_id: letter_id || data.letter_id,
        metadata: { job_reference, sender, subject },
        source_ip
    });

    res.status(201).json(data);
});

app.get('/api/audit-logs', async (req: Request, res: Response) => {
    const { data, error } = await req.supabase
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

app.get('/api/committees', async (req: Request, res: Response) => {
    const { context } = req.query;
    const query = req.supabase.from('committees').select('*');
    if (context) {
        query.eq('context', String(context));
    }
    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

app.post('/api/letters/:id/committee-approve', async (req: Request, res: Response) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { id } = req.params;
    const { comment } = req.body;
    const source_ip = req.ip || '0.0.0.0';

    // 1. Fetch Letter first to get the authoritative committee_id
    const { data: letter, error: fetchError } = await req.supabase
        .from('letters')
        .select('*')
        .eq('id', id)
        .single();

    if (fetchError || !letter) return res.status(404).json({ error: 'Letter not found' });
    if (!(await canAccessLetter(req, letter))) return res.status(403).json({ error: 'Not authorized for this letter.' });
    if (letter.status !== 'DRAFT') return res.status(400).json({ error: 'Letter is not in DRAFT status' });

    const committee_id = letter.committee_id;

    if (!committee_id) {
        return res.status(400).json({ error: 'This letter is not assigned to a committee.' });
    }

    // RBAC: Check if user is Committee Member
    // Admin can always approve. Otherwise, check committee membership.
    const isAdmin = req.user?.roles.includes('ADMIN');
    if (!isAdmin) {
        const { data: member, error: memberError } = await req.supabase
            .from('committee_members')
            .select('user_id')
            .eq('committee_id', committee_id)
            .eq('user_id', userId)
            .single();

        if (memberError || !member) {
            return res.status(403).json({ error: 'User is not a member of the assigned committee.' });
        }
    }

    // Approve
    const { error: updateError } = await req.supabase
        .from('letters')
        .update({ status: 'APPROVED' })
        .eq('id', id);

    if (updateError) return res.status(500).json({ error: updateError.message });

    await req.supabase.from('committee_approvals').insert({
        letter_id: id,
        committee_id,
        approver_id: userId,
        metadata: { comment, source_ip }
    });

    await req.supabase.from('audit_logs').insert({
        action: 'COMMITTEE_APPROVE',
        entity_type: 'LETTER',
        entity_id: id,
        metadata: {
            committee_id,
            approver_id: userId,
            approval_role: isAdmin ? 'ADMIN' : 'MEMBER',
            source_ip
        }
    });

    res.json({ message: 'Letter approved by Committee successfully' });
});


app.post('/api/letters/:id/reject', async (req: Request, res: Response) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    if (!req.user?.roles.includes('APPROVER') && !req.user?.roles.includes('ADMIN')) {
        return res.status(403).json({ error: 'User does not have permission to reject letters.' });
    }

    const { id } = req.params;
    const { reason } = req.body;
    const source_ip = req.ip || '0.0.0.0';

    if (!reason) return res.status(400).json({ error: 'Rejection reason is required.' });

    const { data: letter, error: fetchError } = await req.supabase
        .from('letters')
        .select('status, department_id, created_by')
        .eq('id', id)
        .single();

    if (fetchError || !letter) return res.status(404).json({ error: 'Letter not found' });
    if (!(await canAccessLetter(req, letter))) return res.status(403).json({ error: 'Not authorized for this letter.' });
    if (letter.status !== 'DRAFT' && letter.status !== 'APPROVED') {
        return res.status(400).json({ error: 'Only DRAFT or APPROVED letters can be rejected.' });
    }

    const { error: updateError } = await req.supabase
        .from('letters')
        .update({
            status: 'REJECTED',
            rejected_at: new Date().toISOString(),
            rejected_by: userId,
            rejection_reason: reason
        })
        .eq('id', id);

    if (updateError) return res.status(500).json({ error: updateError.message });

    await req.supabase.from('audit_logs').insert({
        action: 'REJECT',
        entity_type: 'LETTER',
        entity_id: id,
        metadata: { rejected_by: userId, reason, source_ip }
    });

    res.json({ message: 'Letter rejected.' });
});

app.post('/api/letters/:id/print', async (req: Request, res: Response) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    if (!req.user?.roles.includes('ISSUER') && !req.user?.roles.includes('ADMIN')) {
        return res.status(403).json({ error: 'User does not have permission to print letters.' });
    }

    const { id } = req.params;
    const { printer_id } = req.body;
    const source_ip = req.ip || '0.0.0.0';

    const { data: issuance, error: fetchError } = await req.supabase
        .from('issuances')
        .select('id, print_count, max_prints, letter_versions!inner(letter_id)')
        .eq('letter_versions.letter_id', id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

    if (fetchError || !issuance) return res.status(404).json({ error: 'No issuance found for this letter.' });

    const { data: letter, error: letterError } = await req.supabase
        .from('letters')
        .select('department_id, created_by')
        .eq('id', id)
        .single();

    if (letterError || !letter) return res.status(404).json({ error: 'Letter not found.' });
    if (!(await canAccessLetter(req, letter))) return res.status(403).json({ error: 'Not authorized for this letter.' });

    if (issuance.print_count >= issuance.max_prints) {
        return res.status(403).json({ error: 'Print limit reached. Request a reprint.' });
    }

    const { error: updateError } = await req.supabase
        .from('issuances')
        .update({ print_count: issuance.print_count + 1 })
        .eq('id', issuance.id);

    if (updateError) return res.status(500).json({ error: updateError.message });

    await req.supabase.from('print_audits').insert({
        issuance_id: issuance.id,
        printer_id: printer_id || 'DEFAULT',
        status: 'SUCCESS',
        printed_by: userId,
        source_ip
    });

    await req.supabase.from('audit_logs').insert({
        action: 'PRINT',
        entity_type: 'ISSUANCE',
        entity_id: issuance.id,
        metadata: { printed_by: userId, printer_id: printer_id || 'DEFAULT' },
        source_ip
    });

    res.json({ message: 'Print recorded successfully.', print_count: issuance.print_count + 1 });
});

app.post('/api/letters/:id/reprint-request', async (req: Request, res: Response) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { id } = req.params;
    const { reason } = req.body;

    const { data: issuance, error: fetchError } = await req.supabase
        .from('issuances')
        .select('id, letter_versions!inner(letter_id)')
        .eq('letter_versions.letter_id', id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

    if (fetchError || !issuance) return res.status(404).json({ error: 'No issuance found.' });

    const { error: insertError } = await req.supabase.from('print_requests').insert({
        issuance_id: issuance.id,
        requester_id: userId,
        reason,
        status: 'PENDING'
    });

    if (insertError) return res.status(500).json({ error: insertError.message });

    await req.supabase.from('audit_logs').insert({
        action: 'REPRINT_REQUEST',
        entity_type: 'ISSUANCE',
        entity_id: issuance.id,
        metadata: { requester_id: userId, reason }
    });

    res.json({ message: 'Reprint request submitted.' });
});

app.get('/api/reprints/requests', async (req: Request, res: Response) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    if (!req.user?.roles.includes('ADMIN') && !req.user?.roles.includes('APPROVER')) {
        return res.status(403).json({ error: 'Unauthorized' });
    }

    const { data, error } = await req.supabase
        .from('print_requests')
        .select('*, issuances(letter_versions(letters(context, departments(name))))')
        .eq('status', 'PENDING')
        .order('created_at', { ascending: false });

    if (error) {
        if (String(process.env.DEMO_MODE).toLowerCase() === 'true') {
            // Demo environments may not have the print_requests table/RLS configured.
            return res.json([]);
        }
        return res.status(500).json({ error: error.message });
    }
    res.json(data);
});

app.post('/api/reprints/:id/approve', async (req: Request, res: Response) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    if (!req.user?.roles.includes('ADMIN') && !req.user?.roles.includes('APPROVER')) {
        return res.status(403).json({ error: 'Unauthorized' });
    }

    const { id } = req.params;

    const { data: request, error: fetchError } = await req.supabase
        .from('print_requests')
        .select('*, issuances(*)')
        .eq('id', id)
        .single();

    if (fetchError || !request) return res.status(404).json({ error: 'Request not found' });
    if (request.status !== 'PENDING') return res.status(400).json({ error: 'Request already processed' });

    const { error: updateRequestError } = await req.supabase
        .from('print_requests')
        .update({ status: 'APPROVED', reviewed_by: userId, reviewed_at: new Date().toISOString() })
        .eq('id', id);

    if (updateRequestError) return res.status(500).json({ error: updateRequestError.message });

    const { error: updateIssuanceError } = await req.supabase
        .from('issuances')
        .update({ max_prints: request.issuances.max_prints + 1 })
        .eq('id', request.issuance_id);

    if (updateIssuanceError) return res.status(500).json({ error: updateIssuanceError.message });

    await req.supabase.from('audit_logs').insert({
        action: 'REPRINT_APPROVE',
        entity_type: 'ISSUANCE',
        entity_id: request.issuance_id,
        metadata: { approved_by: userId, request_id: id }
    });

    res.json({ message: 'Reprint approved.' });
});

// Create Tag
app.post('/api/tags', async (req: Request, res: Response) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { name, context } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    // Check existing
    const { data: existing } = await req.supabase
        .from('tags')
        .select('*')
        .eq('name', name)
        .eq('context', context)
        .single();

    if (existing) return res.json(existing);

    const { data, error } = await req.supabase
        .from('tags')
        .insert({ name, context })
        .select()
        .single();

    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

// Health Check
app.get('/health', (req: Request, res: Response) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        service: 'mcc-issuance-api'
    });
});

if (require.main === module) {
    app.listen(port, () => {
        console.log(`API server running on http://localhost:${port}`);
    });
}

export { app };

// Force restart
