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

const normalizeUuidList = (values: unknown): string[] => {
    if (!Array.isArray(values)) return [];
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return Array.from(new Set(values.filter((value): value is string => typeof value === 'string' && uuidRegex.test(value))));
};

const enrichLetter = (letter: any, currentUserId?: string, isAdmin = false) => {
    const assignments = Array.isArray(letter.letter_approver_assignments) ? letter.letter_approver_assignments : [];
    const approvedCount = assignments.filter((item: any) => item.decision === 'APPROVED').length;
    const rejectedCount = assignments.filter((item: any) => item.decision === 'REJECTED').length;
    const pendingCount = assignments.filter((item: any) => item.decision === 'PENDING').length;
    const canApprove = letter.status === 'SUBMITTED' && (
        isAdmin || assignments.some((item: any) => item.approver_id === currentUserId && item.decision === 'PENDING')
    );

    return {
        ...letter,
        approval_summary: {
            total: assignments.length,
            approved: approvedCount,
            rejected: rejectedCount,
            pending: pendingCount
        },
        canApprove
    };
};

const LETTERS_BASE_SELECT = `
        id, context, status, created_at, updated_at, title, job_reference, letter_number, rejection_reason, approval_mode, created_by, department_id,
        departments (name),
        letter_tags (
            tag_id,
            tags (name)
        ),
        letter_approver_assignments (id, approver_id, decision, decided_at, comment)
    `;

const LETTERS_BASE_SELECT_FALLBACK = `
        id, context, status, created_at, updated_at, title, job_reference, letter_number, rejection_reason, approval_mode, created_by, department_id,
        departments (name),
        letter_tags (
            tag_id,
            tags (name)
        )
    `;

const LETTERS_BASE_SELECT_LEGACY_FALLBACK = `
        id, context, status, created_at, updated_at, created_by, department_id,
        departments (name),
        letter_tags (
            tag_id,
            tags (name)
        )
    `;

const LETTER_DETAIL_SELECT = `
            id, context, status, created_at, updated_at, title, job_reference, letter_number, rejection_reason, content, approval_mode, created_by, department_id,
            departments (name),
            letter_tags (
                tag_id,
                tags (name)
            ),
            letter_approver_assignments (id, approver_id, decision, decided_at, comment)
        `;

const LETTER_DETAIL_SELECT_FALLBACK = `
            id, context, status, created_at, updated_at, title, job_reference, letter_number, rejection_reason, content, approval_mode, created_by, department_id,
            departments (name),
            letter_tags (
                tag_id,
                tags (name)
            )
        `;

const LETTER_DETAIL_SELECT_LEGACY_FALLBACK = `
            id, context, status, created_at, updated_at, content, created_by, department_id,
            departments (name),
            letter_tags (
                tag_id,
                tags (name)
            )
        `;

const shouldUseLegacyFallback = (message?: string | null) =>
    !!message && (
        message.includes("Could not find a relationship between 'letters' and 'letter_approver_assignments'")
        || /Could not find the ['"]?[a-z_]+['"]? column of ['"]?letters['"]? in the schema cache/i.test(message)
        || /column letters\.[a-z_]+ does not exist/i.test(message)
    );

const isMissingLetterMetadataColumns = (message?: string | null) =>
    !!message && (
        /Could not find the ['"]?(title|job_reference)['"]? column of ['"]?letters['"]? in the schema cache/i.test(message)
        || /column ["']?(title|job_reference)["']? of relation ["']?letters["']? does not exist/i.test(message)
        || /column letters\.(title|job_reference) does not exist/i.test(message)
    );

const isMissingApproverAssignmentsSchema = (message?: string | null) =>
    !!message && (
        /Could not find the table ['"]public\.letter_approver_assignments['"] in the schema cache/i.test(message)
        || /Could not find the table ['"]?letter_approver_assignments['"]? in the schema cache/i.test(message)
        || /relation ["']?letter_approver_assignments["']? does not exist/i.test(message)
        || message.includes("Could not find a relationship between 'letters' and 'letter_approver_assignments'")
        || /column letter_approver_assignments\.[a-z_]+ does not exist/i.test(message)
    );

const isMissingUserRolesSchema = (message?: string | null) =>
    !!message && (
        /Could not find the table ['"]public\.user_roles['"] in the schema cache/i.test(message)
        || /Could not find the table ['"]?user_roles['"]? in the schema cache/i.test(message)
        || /relation ["']?user_roles["']? does not exist/i.test(message)
        || /column user_roles\.[a-z_]+ does not exist/i.test(message)
    );

const isMissingVerificationTokenColumn = (message?: string | null) =>
    !!message && (
        /column ["']?verification_token["']? of relation ["']?letter_versions["']? does not exist/i.test(message)
        || /column letter_versions\.verification_token does not exist/i.test(message)
    );

const isMissingTableOrColumnError = (message?: string | null) =>
    !!message && (
        /does not exist/i.test(message)
        || /schema cache/i.test(message)
    );

const fetchLetterWithLegacyFallback = async (
    req: Request,
    id: string,
    primarySelect: string,
    fallbackSelect: string
) => {
    const primaryResult = await req.supabase
        .from('letters')
        .select(primarySelect)
        .eq('id', id)
        .single();

    let letter: any = primaryResult.data;
    let fetchError = primaryResult.error;

    if (fetchError && shouldUseLegacyFallback(fetchError.message)) {
        const fallbackResult = await req.supabase
            .from('letters')
            .select(fallbackSelect)
            .eq('id', id)
            .single();
        letter = fallbackResult.data;
        fetchError = fallbackResult.error;
    }

    return { letter, fetchError };
};

app.get('/api/approvers', async (req: Request, res: Response) => {
    const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';

    const { data, error } = await req.supabase
        .from('user_roles')
        .select('user_id, role')
        .in('role', ['APPROVER', 'ADMIN']);

    if (error) {
        if (isMissingUserRolesSchema(error.message)) {
            return res.json([]);
        }
        return res.status(500).json({ error: error.message });
    }

    const grouped = new Map<string, Set<string>>();
    for (const row of data ?? []) {
        if (!row?.user_id || !row?.role) continue;
        const roles = grouped.get(row.user_id) ?? new Set<string>();
        roles.add(String(row.role));
        grouped.set(row.user_id, roles);
    }

    let approvers = Array.from(grouped.entries())
        .map(([id, roles]) => ({
            id,
            label: id,
            roles: Array.from(roles).sort()
        }))
        .sort((a, b) => a.label.localeCompare(b.label));

    if (search) {
        approvers = approvers.filter((item) =>
            item.id.toLowerCase().includes(search) || item.label.toLowerCase().includes(search)
        );
    }

    res.json(approvers);
});

app.get('/api/approvals/pending', async (req: Request, res: Response) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const isAdmin = req.user?.roles.includes('ADMIN');
    const context = typeof req.query.context === 'string' ? req.query.context : null;

    const { data: pendingAssignments, error: assignmentError } = await req.supabase
        .from('letter_approver_assignments')
        .select('letter_id')
        .eq('approver_id', userId)
        .eq('decision', 'PENDING');

    if (assignmentError) {
        if (isMissingApproverAssignmentsSchema(assignmentError.message)) {
            return res.json([]);
        }
        return res.status(500).json({ error: assignmentError.message });
    }

    const letterIds = Array.from(new Set((pendingAssignments ?? [])
        .map((item: any) => item.letter_id)
        .filter(Boolean)));

    if (letterIds.length === 0) return res.json([]);

    let primaryQuery = req.supabase
        .from('letters')
        .select(LETTERS_BASE_SELECT)
        .in('id', letterIds)
        .eq('status', 'SUBMITTED');
    if (context) primaryQuery = primaryQuery.eq('context', context);
    const primaryResult = await primaryQuery.order('created_at', { ascending: false });

    let data: any[] | null = primaryResult.data as any[] | null;
    let error = primaryResult.error;

    if (error && shouldUseLegacyFallback(error.message)) {
        let fallbackQuery = req.supabase
            .from('letters')
            .select(LETTERS_BASE_SELECT_FALLBACK)
            .in('id', letterIds)
            .eq('status', 'SUBMITTED');
        if (context) fallbackQuery = fallbackQuery.eq('context', context);
        const fallbackResult = await fallbackQuery.order('created_at', { ascending: false });
        data = fallbackResult.data as any[] | null;
        error = fallbackResult.error;

        if (error && shouldUseLegacyFallback(error.message)) {
            let legacyFallbackQuery = req.supabase
                .from('letters')
                .select(LETTERS_BASE_SELECT_LEGACY_FALLBACK)
                .in('id', letterIds)
                .eq('status', 'SUBMITTED');
            if (context) legacyFallbackQuery = legacyFallbackQuery.eq('context', context);
            const legacyFallbackResult = await legacyFallbackQuery.order('created_at', { ascending: false });
            data = legacyFallbackResult.data as any[] | null;
            error = legacyFallbackResult.error;
        }
    }

    if (error) return res.status(500).json({ error: error.message });

    const letters = (data ?? []).map((item: any) => enrichLetter(item, req.user?.id, !!isAdmin));
    res.json(letters);
});

app.get('/api/letters', async (req: Request, res: Response) => {
    const { context } = req.query;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const isAdmin = req.user?.roles.includes('ADMIN');

    // Base Query
    let query = req.supabase.from('letters').select(LETTERS_BASE_SELECT, { count: 'exact' });

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

    const primaryResult = await query;
    let data: any[] | null = primaryResult.data as any[] | null;
    let error = primaryResult.error;
    let count: number | null = primaryResult.count ?? null;
    if (error && shouldUseLegacyFallback(error.message)) {
        let fallbackQuery = req.supabase.from('letters').select(LETTERS_BASE_SELECT_FALLBACK, { count: 'exact' });

        if (context) {
            fallbackQuery = fallbackQuery.eq('context', String(context));
        }

        if (!isAdmin && req.user?.id) {
            try {
                const deptIds = await getUserDepartmentIds(req);
                if (deptIds && deptIds.length > 0) {
                    fallbackQuery = fallbackQuery.or(`created_by.eq.${req.user.id},department_id.in.(${deptIds.join(',')})`);
                } else {
                    fallbackQuery = fallbackQuery.eq('created_by', req.user.id);
                }
            } catch (err: any) {
                return res.status(500).json({ error: err.message });
            }
        }

        fallbackQuery = fallbackQuery.order('created_at', { ascending: false }).range(from, to);
        const fallbackResult = await fallbackQuery;
        data = fallbackResult.data as any[] | null;
        error = fallbackResult.error;
        count = fallbackResult.count ?? null;

        if (error && shouldUseLegacyFallback(error.message)) {
            let legacyFallbackQuery = req.supabase.from('letters').select(LETTERS_BASE_SELECT_LEGACY_FALLBACK, { count: 'exact' });

            if (context) {
                legacyFallbackQuery = legacyFallbackQuery.eq('context', String(context));
            }

            if (!isAdmin && req.user?.id) {
                try {
                    const deptIds = await getUserDepartmentIds(req);
                    if (deptIds && deptIds.length > 0) {
                        legacyFallbackQuery = legacyFallbackQuery.or(`created_by.eq.${req.user.id},department_id.in.(${deptIds.join(',')})`);
                    } else {
                        legacyFallbackQuery = legacyFallbackQuery.eq('created_by', req.user.id);
                    }
                } catch (err: any) {
                    return res.status(500).json({ error: err.message });
                }
            }

            legacyFallbackQuery = legacyFallbackQuery.order('created_at', { ascending: false }).range(from, to);
            const legacyFallbackResult = await legacyFallbackQuery;
            data = legacyFallbackResult.data as any[] | null;
            error = legacyFallbackResult.error;
            count = legacyFallbackResult.count ?? null;
        }
    }

    if (error) return res.status(500).json({ error: error.message });

    const letters = (data ?? []).map((item: any) => enrichLetter(item, req.user?.id, !!isAdmin));

    res.json({
        data: letters,
        meta: {
            total: count,
            page,
            limit,
            hasMore: count ? to < count - 1 : false
        }
    });
});

app.get('/api/letters/:id', async (req: Request, res: Response) => {
    const { id } = req.params;
    const isAdmin = req.user?.roles.includes('ADMIN');

    const primaryDetailResult = await req.supabase
        .from('letters')
        .select(LETTER_DETAIL_SELECT)
        .eq('id', id)
        .single();
    let letter: any = primaryDetailResult.data;
    let fetchError = primaryDetailResult.error;

    if (fetchError && shouldUseLegacyFallback(fetchError.message)) {
        const fallbackResult = await req.supabase
            .from('letters')
            .select(LETTER_DETAIL_SELECT_FALLBACK)
            .eq('id', id)
            .single();
        letter = fallbackResult.data;
        fetchError = fallbackResult.error;

        if (fetchError && shouldUseLegacyFallback(fetchError.message)) {
            const legacyFallbackResult = await req.supabase
                .from('letters')
                .select(LETTER_DETAIL_SELECT_LEGACY_FALLBACK)
                .eq('id', id)
                .single();
            letter = legacyFallbackResult.data;
            fetchError = legacyFallbackResult.error;
        }
    }

    if (fetchError || !letter) return res.status(404).json({ error: 'Letter not found' });
    if (!(await canAccessLetter(req, letter))) return res.status(403).json({ error: 'Not authorized for this letter.' });

    res.json(enrichLetter(letter, req.user?.id, !!isAdmin));
});

app.post('/api/letters', async (req: Request, res: Response) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { id, context, tag_ids, content, title, job_reference } = req.body;
    const hasTitle = Object.prototype.hasOwnProperty.call(req.body, 'title');
    const hasJobReference = Object.prototype.hasOwnProperty.call(req.body, 'job_reference');
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
        const updatePayload: Record<string, any> = {
            department_id: department_id || currentLetter.department_id,
            content: content,
            committee_id: committee_id, // Allow updating committee_id
            updated_at: new Date().toISOString()
        };
        if (hasTitle) updatePayload.title = title;
        if (hasJobReference) updatePayload.job_reference = job_reference;

        let updateResult = await req.supabase
            .from('letters')
            .update(updatePayload)
            .eq('id', id)
            .select()
            .single();

        if (updateResult.error && isMissingLetterMetadataColumns(updateResult.error.message)) {
            const { title: _title, job_reference: _jobReference, ...legacyUpdatePayload } = updatePayload;
            updateResult = await req.supabase
                .from('letters')
                .update(legacyUpdatePayload)
                .eq('id', id)
                .select()
                .single();
        }

        const updateData = updateResult.data;
        const updateError = updateResult.error;

        if (updateError) return res.status(500).json({ error: updateError.message });

        const normalizedTags = normalizeTagIds(tag_ids);
        const { error: deleteTagsError } = await req.supabase
            .from('letter_tags')
            .delete()
            .eq('letter_id', id);
        if (deleteTagsError) return res.status(500).json({ error: deleteTagsError.message });

        if (normalizedTags.length > 0) {
            const tagInserts = normalizedTags.map((tagId) => ({
                letter_id: id,
                tag_id: tagId
            }));
            const { error: insertTagsError } = await req.supabase.from('letter_tags').insert(tagInserts);
            if (insertTagsError) return res.status(500).json({ error: insertTagsError.message });
        }

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
        const createPayload: Record<string, any> = {
            context,
            department_id,
            content,
            committee_id, // Allow setting committee_id
            created_by: userId, // Use authenticated user
            status: 'DRAFT',
            source_ip
        };
        if (hasTitle) createPayload.title = title;
        if (hasJobReference) createPayload.job_reference = job_reference;

        let createResult = await req.supabase
            .from('letters')
            .insert(createPayload)
            .select()
            .single();

        if (createResult.error && isMissingLetterMetadataColumns(createResult.error.message)) {
            const { title: _title, job_reference: _jobReference, ...legacyCreatePayload } = createPayload;
            createResult = await req.supabase
                .from('letters')
                .insert(legacyCreatePayload)
                .select()
                .single();
        }

        const data = createResult.data;
        const error = createResult.error;

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

app.post('/api/letters/:id/routing', async (req: Request, res: Response) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { id } = req.params;
    const source_ip = req.ip || '0.0.0.0';
    const tagIds = normalizeTagIds(req.body.tag_ids);
    const ccApproverIds = normalizeUuidList(req.body.cc_approver_ids);
    const approvalMode = req.body.approval_mode === 'ANY' ? 'ANY' : 'ALL';

    const { letter, fetchError: letterError } = await fetchLetterWithLegacyFallback(
        req,
        id,
        'id, status, committee_id, department_id, created_by',
        'id, status, department_id, created_by'
    );

    if (letterError || !letter) return res.status(404).json({ error: 'Letter not found' });
    const letterWithDefaults = { ...letter, committee_id: letter.committee_id ?? null };
    if (!(await canAccessLetter(req, letterWithDefaults))) return res.status(403).json({ error: 'Not authorized for this letter.' });
    if (letterWithDefaults.status !== 'DRAFT') return res.status(400).json({ error: 'Routing is allowed only for DRAFT letters.' });
    if (letterWithDefaults.committee_id) return res.status(400).json({ error: 'Committee letters use the committee workflow.' });

    const { data: defaults, error: defaultsError } = await req.supabase
        .from('tag_default_approvers')
        .select('approver_id')
        .in('tag_id', tagIds.length > 0 ? tagIds : ['00000000-0000-0000-0000-000000000000']);
    if (defaultsError) return res.status(500).json({ error: defaultsError.message });

    const autoApprovers = normalizeUuidList((defaults ?? []).map((item: any) => item.approver_id));
    const finalApprovers = normalizeUuidList([...autoApprovers, ...ccApproverIds]);

    await req.supabase.from('letter_tags').delete().eq('letter_id', id);
    if (tagIds.length > 0) {
        await req.supabase.from('letter_tags').insert(tagIds.map((tag_id) => ({ letter_id: id, tag_id })));
    }

    await req.supabase.from('letter_approver_assignments').delete().eq('letter_id', id);
    if (finalApprovers.length > 0) {
        await req.supabase.from('letter_approver_assignments').insert(finalApprovers.map((approver_id) => ({
            letter_id: id,
            approver_id,
            decision: 'PENDING'
        })));
    }

    const { error: updateError } = await req.supabase
        .from('letters')
        .update({ approval_mode: approvalMode, updated_at: new Date().toISOString() })
        .eq('id', id);
    if (updateError) return res.status(500).json({ error: updateError.message });

    await req.supabase.from('audit_logs').insert({
        action: 'ROUTE_APPROVAL',
        entity_type: 'LETTER',
        entity_id: id,
        metadata: {
            tag_ids: tagIds,
            auto_approver_count: autoApprovers.length,
            manual_approver_count: ccApproverIds.length,
            total_approver_count: finalApprovers.length,
            approval_mode: approvalMode,
            source_ip
        }
    });

    res.json({
        message: 'Approval routing updated.',
        assignments_count: finalApprovers.length,
        approval_mode: approvalMode
    });
});

app.post('/api/letters/:id/submit', async (req: Request, res: Response) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { id } = req.params;
    const source_ip = req.ip || '0.0.0.0';

    const { letter, fetchError: letterError } = await fetchLetterWithLegacyFallback(
        req,
        id,
        'id, status, committee_id, department_id, created_by',
        'id, status, department_id, created_by'
    );

    if (letterError || !letter) return res.status(404).json({ error: 'Letter not found' });
    const letterWithDefaults = { ...letter, committee_id: letter.committee_id ?? null };
    if (!(await canAccessLetter(req, letterWithDefaults))) return res.status(403).json({ error: 'Not authorized for this letter.' });
    if (letterWithDefaults.status !== 'DRAFT') return res.status(400).json({ error: 'Only DRAFT letters can be submitted.' });

    if (!letterWithDefaults.committee_id) {
        const { data: assignments, error: assignmentError } = await req.supabase
            .from('letter_approver_assignments')
            .select('id')
            .eq('letter_id', id);
        if (assignmentError && !isMissingApproverAssignmentsSchema(assignmentError.message)) {
            return res.status(500).json({ error: assignmentError.message });
        }

        const hasAssignments = Array.isArray(assignments) && assignments.length > 0;
        const assignmentSchemaMissing = !!assignmentError && isMissingApproverAssignmentsSchema(assignmentError.message);
        if (!hasAssignments) {
            const canAutoAssign = !!(req.user?.roles.includes('ADMIN') || req.user?.roles.includes('APPROVER'));
            if (!canAutoAssign && !assignmentSchemaMissing) {
                return res.status(400).json({ error: 'At least one approver assignment is required before submission.' });
            }

            const { error: autoAssignError } = await req.supabase
                .from('letter_approver_assignments')
                .insert({
                    letter_id: id,
                    approver_id: userId,
                    decision: 'PENDING'
                });
            if (autoAssignError && !isMissingApproverAssignmentsSchema(autoAssignError.message)) {
                return res.status(500).json({ error: autoAssignError.message });
            }
        }
    }

    const { error: updateError } = await req.supabase
        .from('letters')
        .update({ status: 'SUBMITTED', updated_at: new Date().toISOString() })
        .eq('id', id);
    if (updateError) return res.status(500).json({ error: updateError.message });

    await req.supabase.from('audit_logs').insert({
        action: 'SUBMIT_FOR_APPROVAL',
        entity_type: 'LETTER',
        entity_id: id,
        metadata: { submitted_by: userId, source_ip }
    });

    res.json({ message: 'Letter submitted for approval.' });
});

app.post('/api/letters/:id/approve', async (req: Request, res: Response) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    if (!req.user?.roles.includes('APPROVER') && !req.user?.roles.includes('ADMIN')) {
        return res.status(403).json({ error: 'User does not have permission to approve letters.' });
    }

    const { id } = req.params;
    const { comment } = req.body;
    const source_ip = req.ip || '0.0.0.0';
    const isAdmin = !!req.user?.roles.includes('ADMIN');

    const { data: letter, error: fetchError } = await req.supabase
        .from('letters')
        .select('*')
        .eq('id', id)
        .single();

    if (fetchError || !letter) return res.status(404).json({ error: 'Letter not found' });
    if (!(await canAccessLetter(req, letter))) return res.status(403).json({ error: 'Not authorized for this letter.' });

    if (letter.committee_id) {
        return res.status(403).json({ error: 'Letters assigned to a committee must be approved via the Committee Approval endpoint.' });
    }
    if (letter.status !== 'SUBMITTED') return res.status(400).json({ error: 'Letter must be SUBMITTED before approval.' });

    if (!isAdmin) {
        const { data: assignment, error: assignmentError } = await req.supabase
            .from('letter_approver_assignments')
            .select('id, decision')
            .eq('letter_id', id)
            .eq('approver_id', userId)
            .single();
        const assignmentSchemaMissing = isMissingApproverAssignmentsSchema(assignmentError?.message);
        if (assignmentError && !assignmentSchemaMissing) return res.status(403).json({ error: 'User is not assigned as an approver for this letter.' });
        if (!assignmentSchemaMissing && !assignment) return res.status(403).json({ error: 'User is not assigned as an approver for this letter.' });
        if (assignment && assignment.decision === 'APPROVED') return res.status(400).json({ error: 'Approval already recorded.' });
    }

    const { error: assignmentUpdateError } = await req.supabase
        .from('letter_approver_assignments')
        .update({ decision: 'APPROVED', decided_at: new Date().toISOString(), comment: comment ?? null, source_ip, updated_at: new Date().toISOString() })
        .eq('letter_id', id)
        .eq('approver_id', userId);
    if (!isAdmin && assignmentUpdateError && !isMissingApproverAssignmentsSchema(assignmentUpdateError.message)) {
        return res.status(500).json({ error: assignmentUpdateError.message });
    }

    await req.supabase.from('approvals').insert({ letter_id: id, approver_id: userId, comment, source_ip });

    let approved = 0;
    let total = 0;
    let quorumReached = false;

    if (isAdmin) {
        quorumReached = true;
    } else {
        const { data: assignments, error: assignmentsError } = await req.supabase
            .from('letter_approver_assignments')
            .select('decision')
            .eq('letter_id', id);
        if (assignmentsError && !isMissingApproverAssignmentsSchema(assignmentsError.message)) {
            return res.status(500).json({ error: assignmentsError.message });
        }

        const items = assignments ?? [];
        approved = items.filter((item: any) => item.decision === 'APPROVED').length;
        total = items.length;
        quorumReached = total > 0 && approved === total;
    }

    if (quorumReached) {
        await req.supabase.from('letters').update({ status: 'APPROVED', updated_at: new Date().toISOString() }).eq('id', id);
    }

    await req.supabase.from('audit_logs').insert({
        action: quorumReached ? 'APPROVE_QUORUM_SATISFIED' : 'APPROVE_PARTIAL',
        entity_type: 'LETTER',
        entity_id: id,
        metadata: { approver_id: userId, approved_count: approved, total_assignments: total, source_ip }
    });

    res.json({ message: quorumReached ? 'Letter approved successfully.' : 'Approval recorded; waiting for additional approvers.', approved_count: approved, total_assignments: total, status: quorumReached ? 'APPROVED' : 'SUBMITTED' });
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

    const primaryIssueResult = await req.supabase
        .from('letters')
        .select('*, departments(*), letter_tags(tag_id)') // OPTIMIZED: Fetch only tag_id
        .eq('id', id)
        .single();
    let letter: any = primaryIssueResult.data;
    let fetchError = primaryIssueResult.error;

    if (fetchError && shouldUseLegacyFallback(fetchError.message)) {
        const fallbackIssueResult = await req.supabase
            .from('letters')
            .select('id, context, status, content, department_id, created_by')
            .eq('id', id)
            .single();
        letter = fallbackIssueResult.data;
        fetchError = fallbackIssueResult.error;
    }

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

        if (isMissingVerificationTokenColumn(rpcError.message)) {
            // Legacy schema compatibility: no verification_token column on letter_versions.
            // We still complete issuance by persisting a new version (without verification_token)
            // and transitioning the letter status to ISSUED.
            const { error: legacyVersionError } = await req.supabase
                .from('letter_versions')
                .insert({
                    letter_id: id,
                    version_number: nextVersion,
                    content: letter.content,
                    content_hash: contentHash,
                    created_by: userId
                });

            if (legacyVersionError && !legacyVersionError.message.toLowerCase().includes('duplicate key')) {
                return res.status(500).json({ error: 'Legacy issuance versioning failed: ' + legacyVersionError.message });
            }

            const { error: legacyStatusError } = await req.supabase
                .from('letters')
                .update({ status: 'ISSUED', updated_at: new Date().toISOString() })
                .eq('id', id);
            if (legacyStatusError) {
                return res.status(500).json({ error: 'Legacy issuance status update failed: ' + legacyStatusError.message });
            }

            await req.supabase.from('audit_logs').insert({
                action: 'ISSUE',
                entity_type: 'LETTER',
                entity_id: id,
                metadata: {
                    issued_by: userId,
                    channel: channel || 'PRINT',
                    content_hash: contentHash,
                    compatibility_mode: 'legacy_no_verification_token',
                    source_ip
                }
            });

            const legacyVerifyUrl = `${clientUrl}/verify/${contentHash}`;
            return res.json({
                message: 'Letter issued (legacy compatibility mode).',
                verifyUrl: legacyVerifyUrl,
                pdf: null
            });
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
    const isAdmin = !!req.user?.roles.includes('ADMIN');

    if (!reason) return res.status(400).json({ error: 'Rejection reason is required.' });

    const { letter, fetchError } = await fetchLetterWithLegacyFallback(
        req,
        id,
        'status, committee_id, department_id, created_by',
        'status, department_id, created_by'
    );

    if (fetchError || !letter) return res.status(404).json({ error: 'Letter not found' });
    const letterWithDefaults = { ...letter, committee_id: letter.committee_id ?? null };
    if (!(await canAccessLetter(req, letterWithDefaults))) return res.status(403).json({ error: 'Not authorized for this letter.' });

    if (!letterWithDefaults.committee_id) {
        if (letterWithDefaults.status !== 'SUBMITTED') {
            return res.status(400).json({ error: 'Only SUBMITTED non-committee letters can be rejected.' });
        }
        if (!isAdmin) {
            const { data: assignment, error: assignmentError } = await req.supabase
                .from('letter_approver_assignments')
                .select('id')
                .eq('letter_id', id)
                .eq('approver_id', userId)
                .single();
            const assignmentSchemaMissing = isMissingApproverAssignmentsSchema(assignmentError?.message);
            if (assignmentError && !assignmentSchemaMissing) return res.status(403).json({ error: 'User is not assigned as an approver for this letter.' });
            if (!assignmentSchemaMissing && !assignment) return res.status(403).json({ error: 'User is not assigned as an approver for this letter.' });
        }

        const { error: assignmentUpdateError } = await req.supabase
            .from('letter_approver_assignments')
            .update({ decision: 'REJECTED', decided_at: new Date().toISOString(), comment: reason, source_ip, updated_at: new Date().toISOString() })
            .eq('letter_id', id)
            .eq('approver_id', userId);
        if (assignmentUpdateError && !isMissingApproverAssignmentsSchema(assignmentUpdateError.message)) {
            return res.status(500).json({ error: assignmentUpdateError.message });
        }
    }

    const { error: updateError } = await req.supabase
        .from('letters')
        .update({
            status: 'REJECTED',
            rejected_at: new Date().toISOString(),
            rejected_by: userId,
            rejection_reason: reason,
            updated_at: new Date().toISOString()
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


app.post('/api/tag-default-approvers', async (req: Request, res: Response) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    if (!req.user?.roles.includes('ADMIN')) {
        return res.status(403).json({ error: 'Admin role required.' });
    }

    const tagId = typeof req.body.tag_id === 'string' ? req.body.tag_id : '';
    const approverIds = normalizeUuidList(req.body.approver_ids);

    if (!tagId) return res.status(400).json({ error: 'tag_id is required.' });

    await req.supabase.from('tag_default_approvers').delete().eq('tag_id', tagId);
    if (approverIds.length > 0) {
        await req.supabase.from('tag_default_approvers').insert(
            approverIds.map((approver_id) => ({ tag_id: tagId, approver_id }))
        );
    }

    await req.supabase.from('audit_logs').insert({
        action: 'TAG_DEFAULT_APPROVER_SET',
        entity_type: 'TAG',
        entity_id: tagId,
        metadata: { approver_count: approverIds.length, updated_by: userId }
    });

    res.json({ message: 'Default approvers updated.', count: approverIds.length });
});

app.post('/api/demo/cleanup-drafts', async (req: Request, res: Response) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    if (!req.user?.roles.includes('ADMIN') && !req.user?.roles.includes('APPROVER')) {
        return res.status(403).json({ error: 'Unauthorized' });
    }

    const keepRatio = 0.1; // Keep ~10%, delete ~90%

    const { data: drafts, error: draftsError } = await req.supabase
        .from('letters')
        .select('id, created_at')
        .eq('status', 'DRAFT')
        .order('created_at', { ascending: false });

    if (draftsError) return res.status(500).json({ error: draftsError.message });

    const items = drafts ?? [];
    if (items.length <= 1) {
        return res.json({ message: 'Not enough draft letters to prune.', total_drafts: items.length, deleted: 0, kept: items.length });
    }

    const keepCount = Math.max(1, Math.ceil(items.length * keepRatio));
    const toDelete = items.slice(keepCount);
    const letterIds = toDelete.map((item: any) => item.id);

    if (letterIds.length === 0) {
        return res.json({ message: 'No draft letters selected for deletion.', total_drafts: items.length, deleted: 0, kept: keepCount });
    }

    const deleteIn = async (table: string, column: string, ids: string[]) => {
        if (ids.length === 0) return null;
        const result = await req.supabase.from(table).delete().in(column, ids);
        return result.error;
    };

    // Best-effort dependent cleanup for schema variants
    const { data: versions, error: versionsError } = await req.supabase
        .from('letter_versions')
        .select('id, letter_id')
        .in('letter_id', letterIds);
    if (versionsError && !isMissingTableOrColumnError(versionsError.message)) {
        return res.status(500).json({ error: versionsError.message });
    }
    const versionIds = (versions ?? []).map((v: any) => v.id);

    const { data: issuances, error: issuancesFetchError } = versionIds.length > 0
        ? await req.supabase.from('issuances').select('id').in('letter_version_id', versionIds)
        : { data: [], error: null };
    if (issuancesFetchError && !isMissingTableOrColumnError(issuancesFetchError.message)) {
        return res.status(500).json({ error: issuancesFetchError.message });
    }
    const issuanceIds = (issuances ?? []).map((i: any) => i.id);

    const ignoreOrFail = (err: any) => {
        if (!err) return null;
        if (isMissingTableOrColumnError(err.message)) return null;
        return err;
    };

    let err: any;
    err = ignoreOrFail(await deleteIn('letter_tags', 'letter_id', letterIds)); if (err) return res.status(500).json({ error: err.message });
    err = ignoreOrFail(await deleteIn('letter_approver_assignments', 'letter_id', letterIds)); if (err) return res.status(500).json({ error: err.message });
    err = ignoreOrFail(await deleteIn('acknowledgements', 'letter_id', letterIds)); if (err) return res.status(500).json({ error: err.message });
    err = ignoreOrFail(await deleteIn('email_links', 'letter_id', letterIds)); if (err) return res.status(500).json({ error: err.message });
    err = ignoreOrFail(await deleteIn('approvals', 'letter_id', letterIds)); if (err) return res.status(500).json({ error: err.message });
    err = ignoreOrFail(await deleteIn('approvals', 'letter_version_id', versionIds)); if (err) return res.status(500).json({ error: err.message });
    err = ignoreOrFail(await deleteIn('print_requests', 'issuance_id', issuanceIds)); if (err) return res.status(500).json({ error: err.message });
    err = ignoreOrFail(await deleteIn('print_audits', 'issuance_id', issuanceIds)); if (err) return res.status(500).json({ error: err.message });
    err = ignoreOrFail(await deleteIn('issuances', 'id', issuanceIds)); if (err) return res.status(500).json({ error: err.message });
    err = ignoreOrFail(await deleteIn('letter_versions', 'id', versionIds)); if (err) return res.status(500).json({ error: err.message });
    err = ignoreOrFail(await deleteIn('audit_logs', 'entity_id', letterIds)); if (err) return res.status(500).json({ error: err.message });
    err = ignoreOrFail(await deleteIn('letters', 'id', letterIds)); if (err) return res.status(500).json({ error: err.message });

    await req.supabase.from('audit_logs').insert({
        action: 'DEMO_CLEANUP_DRAFTS',
        entity_type: 'LETTER',
        entity_id: letterIds[0],
        metadata: { deleted_count: letterIds.length, kept_count: keepCount, triggered_by: userId }
    });

    res.json({
        message: `Deleted ${letterIds.length} draft letters (kept ${keepCount}).`,
        total_drafts: items.length,
        deleted: letterIds.length,
        kept: keepCount
    });
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
