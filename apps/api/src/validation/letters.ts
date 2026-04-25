import { z } from 'zod';
import { APPROVAL_MODES } from '../shared-constants';

const uuid = z.string().uuid();
const uuidOrEmpty = z.union([uuid, z.literal('')]).optional().nullable();

export const createOrUpdateLetterSchema = z.object({
    id: uuid.optional(),
    context: z.string().min(1).optional(),
    tag_ids: z.array(z.string()).optional(),
    content: z.string().min(1),
    title: z.string().optional().nullable(),
    job_reference: z.string().optional().nullable(),
    to_text: z.string().optional().nullable(),
    cc_text: z.string().optional().nullable(),
    subject: z.string().optional().nullable(),
    signature_name: z.string().optional().nullable(),
    signature_title: z.string().optional().nullable(),
    template_key: z.string().optional().nullable(),
    department_id: uuidOrEmpty,
    committee_id: uuidOrEmpty,
});

export const routingSchema = z.object({
    tag_ids: z.array(z.string()).optional(),
    cc_approver_ids: z.array(z.string()).optional(),
    approval_mode: z.enum(APPROVAL_MODES).optional(),
});

export const approveSchema = z.object({
    comment: z.string().optional().nullable(),
});

export const rejectSchema = z.object({
    reason: z.string().min(1),
});

export const issueSchema = z.object({
    channel: z.string().optional(),
    printer_id: z.string().optional(),
});

export const printSchema = z.object({
    printer_id: z.string().optional(),
});

export const reprintSchema = z.object({
    reason: z.string().min(1),
});

export const acknowledgeSchema = z.object({
    letter_id: uuid,
    job_reference: z.string().optional().nullable(),
    file_url: z.string().min(1),
});

export const emailLinkSchema = z.object({
    letter_id: uuid.optional().nullable(),
    job_reference: z.string().optional().nullable(),
    sender: z.string().optional().nullable(),
    subject: z.string().optional().nullable(),
    body_excerpt: z.string().optional().nullable(),
    received_at: z.string().optional().nullable(),
});

export const demoCleanupSchema = z.object({
    dry_run: z.boolean().optional(),
});

export const deadlineSchema = z.object({
    approver_ids: z.array(uuid).min(1),
    due_at: z.string().min(1),
});
