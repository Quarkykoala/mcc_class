import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { verifyApproverRole } from './auth-utils';
import { buildContentHash, normalizeTagIds, generateIssuancePdf, buildVerificationResponse } from './letter-utils';
import { handleLetterVersionUpdate } from './version-manager';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY for dev) must be set.');
}

const supabase = createClient(supabaseUrl, supabaseKey);

app.set('trust proxy', true);
app.use(cors());
app.use(express.json());


// --- Master Lists ---

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

// --- Letters ---

app.post('/api/letters', async (req: Request, res: Response) => {
    const { id, context, department_id, tag_ids, content, created_by } = req.body;
    const source_ip = req.ip || '0.0.0.0';

    if (!content || !created_by) {
        return res.status(400).json({ error: 'content and created_by are required.' });
    }

    if (id) {
        const { data: currentLetter, error: letterError } = await supabase
            .from('letters')
            .select('id, context, department_id, status')
            .eq('id', id)
            .single();

        if (letterError || !currentLetter) {
            return res.status(404).json({ error: 'Letter not found' });
        }

        if (currentLetter.status !== 'DRAFT') {
            return res.status(400).json({ error: 'Only DRAFT letters can be edited.' });
        }

        const { data: updateData, error: updateError } = await supabase
            .from('letters')
            .update({
                department_id: department_id || currentLetter.department_id,
                content: content,
                updated_at: new Date().toISOString()
            })
            .eq('id', id)
            .select()
            .single();

        if (updateError) return res.status(500).json({ error: updateError.message });

        await supabase.from('audit_logs').insert({
            action: 'UPDATE',
            entity_type: 'LETTER',
            entity_id: id,
            metadata: { context, department_id, content_length: content.length, source_ip }
        });

        // Handle versioning
        try {
            await handleLetterVersionUpdate(supabase, id, content, created_by);
        } catch (versionError: any) {
            console.error('Versioning failed:', versionError);
            // Versioning failure is critical for audit, so we block the response.
            return res.status(500).json({ error: 'Failed to create version snapshot: ' + versionError.message });
        }

        return res.json(updateData);

    } else {
        const { data, error } = await supabase
            .from('letters')
            .insert({
                context,
                department_id,
                content,
                created_by,
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
            await supabase.from('letter_tags').insert(tagInserts);
        }

        await supabase.from('audit_logs').insert({
            action: 'CREATE',
            entity_type: 'LETTER',
            entity_id: data.id,
            metadata: { context, department_id, tag_count: normalizedTags.length, source_ip }
        });

        res.status(201).json(data);
    }
});

app.get('/api/letters', async (req: Request, res: Response) => {
    const { context } = req.query;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabase.from('letters').select(`
        id, context, status, created_at,
        departments (name),
        letter_tags (
            tags (name)
        )
    `).order('created_at', { ascending: false })
      .range(from, to);

    if (context) {
        query = query.eq('context', String(context));
    }

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

app.post('/api/letters/:id/approve', async (req: Request, res: Response) => {
    const { id } = req.params;
    const { approver_id, comment } = req.body;
    const source_ip = req.ip || '0.0.0.0';

    // Future Security Note: In a production environment, approver_id should be derived
    // from the authenticated session (e.g., req.user.id) rather than the request body
    // to prevent IDOR attacks. For now, we validate the role of the provided ID.

    const { data: letter, error: fetchError } = await supabase
        .from('letters')
        .select('*')
        .eq('id', id)
        .single();

    if (fetchError || !letter) return res.status(404).json({ error: 'Letter not found' });
    if (letter.status !== 'DRAFT') return res.status(400).json({ error: 'Letter is not in DRAFT status' });

    const isApprover = await verifyApproverRole(supabase, approver_id);
    if (!isApprover) {
        return res.status(403).json({ error: 'User does not have permission to approve letters.' });
    }

    const { error: updateError } = await supabase
        .from('letters')
        .update({ status: 'APPROVED' })
        .eq('id', id);

    if (updateError) return res.status(500).json({ error: updateError.message });

    await supabase.from('approvals').insert({
        letter_id: id,
        approver_id,
        comment,
        source_ip
    });

    await supabase.from('audit_logs').insert({
        action: 'APPROVE',
        entity_type: 'LETTER',
        entity_id: id,
        metadata: { approver_id, source_ip }
    });

    res.json({ message: 'Letter approved successfully' });
});

app.post('/api/letters/:id/issue', async (req: Request, res: Response) => {
    const { id } = req.params;
    const { issued_by, channel, printer_id } = req.body;
    const source_ip = req.ip || '0.0.0.0';

    const { data: letter, error: fetchError } = await supabase
        .from('letters')
        .select('*, departments(*), letter_tags(tags(*))')
        .eq('id', id)
        .single();

    if (fetchError || !letter) return res.status(404).json({ error: 'Letter not found' });
    if (letter.status !== 'APPROVED') return res.status(400).json({ error: 'Letter must be APPROVED to issue.' });

    // Determine Version
    const { data: versions, error: versionFetchError } = await supabase
        .from('letter_versions')
        .select('version_number')
        .eq('letter_id', id)
        .order('version_number', { ascending: false })
        .limit(1);

    if (versionFetchError) return res.status(500).json({ error: versionFetchError.message });

    const nextVersion = (versions && versions.length > 0) ? versions[0].version_number + 1 : 1;

    // Generate Content Hash
    const tagIds = letter.letter_tags.map((lt: any) => lt.tags.id).sort();
    const contentHash = buildContentHash({
        letterId: letter.id,
        versionNumber: nextVersion,
        context: letter.context,
        departmentId: letter.department_id,
        tagIds,
        content: letter.content
    });

    // Create Version Snapshot
    const { data: newVersion, error: createVersionError } = await supabase
        .from('letter_versions')
        .insert({
            letter_id: id,
            version_number: nextVersion,
            content: letter.content,
            content_hash: contentHash,
            created_by: issued_by
        })
        .select()
        .single();

    if (createVersionError) return res.status(500).json({ error: createVersionError.message });

    // Generate PDF
    const verifyUrl = `https://mcc-letter-system.web.app/verify/${contentHash}`;
    const pdfOutput = await generateIssuancePdf({
        context: letter.context,
        departmentName: letter.departments?.name,
        content: letter.content,
        contentHash,
        verificationUrl: verifyUrl,
        issuedAt: new Date()
    });

    // Update Status
    await supabase.from('letters').update({ status: 'ISSUED' }).eq('id', id);

    // Record Issuance
    const { data: issuanceData, error: issuanceError } = await supabase.from('issuances').insert({
        letter_version_id: newVersion.id,
        issued_by,
        channel: channel || 'PRINT',
        qr_payload: verifyUrl,
        content_hash: contentHash
    }).select().single();

    if (issuanceError) {
        return res.status(500).json({ error: issuanceError.message });
    }

    // Print Audit
    if (channel === 'PRINT') {
        await supabase.from('print_audits').insert({
            issuance_id: issuanceData.id,
            printer_id: printer_id || 'DEFAULT',
            status: 'SUCCESS', // Mock success
            printed_by: issued_by,
            source_ip
        });
    }

    await supabase.from('audit_logs').insert({
        action: 'ISSUE',
        entity_type: 'LETTER',
        entity_id: id,
        metadata: { issued_by, channel, content_hash: contentHash }
    });

    res.json({ message: 'Letter issued', pdf: pdfOutput, verifyUrl });
});

app.get('/api/verify/:hash', async (req: Request, res: Response) => {
    const { hash } = req.params;
    const accessKey = process.env.VERIFY_ACCESS_KEY;
    const providedKey = req.header('x-verify-key');

    if (accessKey && accessKey !== providedKey) {
        return res.status(401).json({ error: 'Verification requires authorized access.' });
    }

    const { data: versionRecord, error } = await supabase
        .from('letter_versions')
        .select(`
            version_number,
            letters (
                context,
                status,
                departments (name),
                approvals (approver_id, approved_at),
                committee_approvals (approver_id, committee_id, created_at)
            ),
            issuances (id)
        `)
        .eq('content_hash', hash)
        .single();

    if (error || !versionRecord) {
        return res.status(404).json({ valid: false, message: 'Invalid or unknown document hash.' });
    }

    const letter = Array.isArray(versionRecord.letters)
        ? versionRecord.letters[0]
        : versionRecord.letters;
    const normalizedLetter = letter
        ? {
            ...letter,
            departments: Array.isArray(letter.departments) ? letter.departments[0] : letter.departments
        }
        : letter;
    const issuances = Array.isArray(versionRecord.issuances)
        ? versionRecord.issuances
        : versionRecord.issuances
            ? [versionRecord.issuances]
            : [];

    const approvals = letter?.approvals ?? [];
    const committeeApprovals = (letter?.committee_approvals ?? []).map((approval: any) => ({
        ...approval,
        approved_at: approval.approved_at || approval.created_at
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

app.post('/api/acknowledgements', async (req: Request, res: Response) => {
    const { letter_id, job_reference, file_url, captured_by } = req.body;
    const source_ip = req.ip || '0.0.0.0';

    const { error } = await supabase.from('acknowledgements').insert({
        letter_id,
        job_reference,
        file_url,
        captured_by,
        source_ip
    });

    if (error) return res.status(500).json({ error: error.message });

    await supabase.from('audit_logs').insert({
        action: 'ACKNOWLEDGE',
        entity_type: 'LETTER',
        entity_id: letter_id,
        metadata: { job_reference, file_url, captured_by }
    });

    res.json({ message: 'Acknowledgement recorded' });
});

// --- Email Classifier Linkage ---

app.get('/api/email-links', async (req: Request, res: Response) => {
    const { letter_id, job_reference } = req.query;
    let query = supabase.from('email_links').select('*').order('created_at', { ascending: false });

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
    const { letter_id, job_reference, sender, subject, body_excerpt, received_at, classified_by } = req.body;
    const source_ip = req.ip || '0.0.0.0';

    if (!letter_id && !job_reference) {
        return res.status(400).json({ error: 'letter_id or job_reference is required.' });
    }

    const { data, error } = await supabase
        .from('email_links')
        .insert({
            letter_id,
            job_reference,
            sender,
            subject,
            body_excerpt,
            received_at,
            classified_by,
            source_ip
        })
        .select()
        .single();

    if (error) return res.status(500).json({ error: error.message });

    await supabase.from('audit_logs').insert({
        action: 'EMAIL_LINK',
        entity_type: 'LETTER',
        entity_id: letter_id || data.letter_id,
        metadata: { job_reference, sender, subject },
        source_ip
    });

    res.status(201).json(data);
});

app.get('/api/audit-logs', async (req: Request, res: Response) => {
    const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

app.get('/api/committees', async (req: Request, res: Response) => {
    const { context } = req.query;
    // Assuming committees table has a context column, or we just return all
    const query = supabase.from('committees').select('*');
    if (context) {
        query.eq('context', String(context));
    }
    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

app.post('/api/letters/:id/committee-approve', async (req: Request, res: Response) => {
    const { id } = req.params;
    const { committee_id, approver_id, comment } = req.body;
    const source_ip = req.ip || '0.0.0.0';

    const { data: letter, error: fetchError } = await supabase
        .from('letters')
        .select('*')
        .eq('id', id)
        .single();

    if (fetchError || !letter) return res.status(404).json({ error: 'Letter not found' });
    if (letter.status !== 'DRAFT') return res.status(400).json({ error: 'Letter is not in DRAFT status' });

    const { error: updateError } = await supabase
        .from('letters')
        .update({ status: 'APPROVED' })
        .eq('id', id);

    if (updateError) return res.status(500).json({ error: updateError.message });

    await supabase.from('committee_approvals').insert({
        letter_id: id,
        committee_id,
        approver_id, // Chair or authorized member
        metadata: { comment, source_ip }
    });

    await supabase.from('audit_logs').insert({
        action: 'COMMITTEE_APPROVE',
        entity_type: 'LETTER',
        entity_id: id,
        metadata: { committee_id, approver_id, source_ip }
    });

    res.json({ message: 'Letter approved by Committee successfully' });
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
