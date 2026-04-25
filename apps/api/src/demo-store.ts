import { uuidv4 } from './uuid';

export type DemoLetter = {
    id: string;
    context: string;
    department_id: string | null;
    status: string;
    content: string;
    created_by: string;
    created_at: string;
    updated_at: string;
    title: string | null;
    job_reference: string | null;
    to_text: string | null;
    cc_text: string | null;
    subject: string | null;
    signature_name: string | null;
    signature_title: string | null;
    template_key: string | null;
    letter_tags: Array<{ tag_id: string; tags?: { name?: string | null } }>;
    letter_approver_assignments: Array<{ id: string; approver_id: string; decision: string }>;
    approval_summary: { pending: number };
    canApprove: boolean;
};

const demoLetters = new Map<string, DemoLetter>();

const nowIso = () => new Date().toISOString();

export const isDemoMode = () => String(process.env.DEMO_MODE).toLowerCase() === 'true';

export const listDemoLetters = (context?: string | null) => {
    const letters = Array.from(demoLetters.values())
        .filter((letter) => !context || letter.context === context)
        .sort((left, right) => new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime());
    return {
        data: letters,
        meta: {
            total: letters.length,
            page: 1,
            limit: 50,
            hasMore: false,
        },
    };
};

export const getDemoLetter = (id: string) => demoLetters.get(id) ?? null;

export const saveDemoLetter = (input: {
    id?: string;
    context: string;
    content: string;
    userId: string;
    title?: string | null;
    job_reference?: string | null;
    to_text?: string | null;
    cc_text?: string | null;
    subject?: string | null;
    signature_name?: string | null;
    signature_title?: string | null;
    template_key?: string | null;
    department_id?: string | null;
}) => {
    const existing = input.id ? demoLetters.get(input.id) : null;
    const timestamp = nowIso();
    const letter: DemoLetter = {
        id: existing?.id ?? uuidv4(),
        context: input.context,
        department_id: input.department_id ?? existing?.department_id ?? 'demo-department',
        status: existing?.status ?? 'DRAFT',
        content: input.content,
        created_by: existing?.created_by ?? input.userId,
        created_at: existing?.created_at ?? timestamp,
        updated_at: timestamp,
        title: input.title ?? existing?.title ?? null,
        job_reference: input.job_reference ?? existing?.job_reference ?? null,
        to_text: input.to_text ?? existing?.to_text ?? null,
        cc_text: input.cc_text ?? existing?.cc_text ?? null,
        subject: input.subject ?? existing?.subject ?? null,
        signature_name: input.signature_name ?? existing?.signature_name ?? null,
        signature_title: input.signature_title ?? existing?.signature_title ?? null,
        template_key: input.template_key ?? existing?.template_key ?? null,
        letter_tags: existing?.letter_tags ?? [],
        letter_approver_assignments: existing?.letter_approver_assignments ?? [],
        approval_summary: existing?.approval_summary ?? { pending: 0 },
        canApprove: existing?.canApprove ?? false,
    };
    demoLetters.set(letter.id, letter);
    return letter;
};
