import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Wand2, Play, CheckCheck, Loader2, FastForward, Workflow, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { auth } from '@/lib/auth';

interface DemoDebugMenuProps {
    onRefresh: () => Promise<void>;
}

export function DemoDebugMenu({ onRefresh }: DemoDebugMenuProps) {
    const [loading, setLoading] = useState(false);
    const [isOpen, setIsOpen] = useState(false);

    const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

    const formatErrorMessage = (value: unknown) => {
        if (value instanceof Error) return value.message;
        if (typeof value === 'string') return value;
        if (value == null) return 'Unknown error';
        try {
            return JSON.stringify(value);
        } catch {
            return String(value);
        }
    };

    const withLabeledAction = async <T,>(label: string, action: () => Promise<T>) => {
        try {
            return await action();
        } catch (error) {
            const message = `${label} failed: ${formatErrorMessage(error)}`;
            throw new Error(message);
        }
    };

    const handleDemoError = (context: string, error: unknown) => {
        const message = `${context} failed: ${formatErrorMessage(error)}`;
        console.error(message, error);
        alert(message);
    };

    const getSession = async () => {
        const { data } = await auth.getSession();
        return data.session;
    };

    const authenticatedFetch = async (url: string, options: any = {}) => {
        const session = await getSession();
        if (!session?.access_token) throw new Error("No session");

        return fetch(url, {
            ...options,
            headers: {
                ...options.headers,
                'Authorization': `Bearer ${session.access_token}`,
                'Content-Type': 'application/json'
            }
        });
    };

    const getDepartmentId = async () => {
        const deptRes = await authenticatedFetch(`${API_BASE}/departments?context=COMPANY`);
        if (!deptRes.ok) {
            const errorBody = await deptRes.text();
            throw new Error(`Failed to fetch departments: ${errorBody}`);
        }
        const depts = await deptRes.json();
        const deptList = Array.isArray(depts) ? depts : (depts.data || []);
        if (!deptList.length) throw new Error('No departments available for demo flow');
        return deptList[0].id;
    };

    const createDraft = async (departmentId: string, title: string, content: string) => {
        const res = await authenticatedFetch(`${API_BASE}/letters`, {
            method: 'POST',
            body: JSON.stringify({
                context: 'COMPANY',
                department_id: departmentId,
                title,
                content,
                tag_ids: []
            })
        });
        if (!res.ok) {
            const errorBody = await res.text();
            throw new Error(`Failed to create draft: ${errorBody}`);
        }
        return res.json();
    };

    const runAction = async (path: string, body: Record<string, unknown> = {}) => {
        const res = await authenticatedFetch(`${API_BASE}${path}`, {
            method: 'POST',
            body: JSON.stringify(body)
        });
        if (!res.ok) {
            const errorBody = await res.text();
            throw new Error(`Action ${path} failed: ${errorBody}`);
        }
        return res.json();
    };

    const fetchVisibleLetters = async () => {
        const res = await authenticatedFetch(`${API_BASE}/letters`);
        if (!res.ok) {
            const errorBody = await res.text();
            throw new Error(`Failed to fetch visible letters: ${errorBody}`);
        }

        const data = await res.json();
        return Array.isArray(data) ? data : (data.data || []);
    };

    const generateDrafts = async () => {
        setLoading(true);
        try {
            const departmentId = await withLabeledAction('Department lookup', () => getDepartmentId());
            const drafts = [
                {
                    title: 'Employment Confirmation',
                    content: 'This letter confirms active employment status as of today.'
                },
                {
                    title: 'Invoice Receipt Acknowledgement',
                    content: 'We acknowledge receipt of payment for invoice INV-992.'
                },
                {
                    title: 'Policy Advisory Notice',
                    content: 'Please review and implement the updated internal policy guidelines.'
                }
            ];
            const createdIds: string[] = [];

            for (const draft of drafts) {
                const created = await withLabeledAction(
                    `Draft "${draft.title}" creation`,
                    () => createDraft(departmentId, draft.title, `${draft.content} (Demo ${Date.now()})`)
                );
                if (created?.id) {
                    createdIds.push(created.id);
                }
            }

            await onRefresh();
            const visibleLetters = await fetchVisibleLetters();
            const visibleIds = new Set(visibleLetters.map((item: any) => item.id));
            const visibleCreatedCount = createdIds.filter((id) => visibleIds.has(id)).length;
            if (visibleCreatedCount === 0) {
                throw new Error('Drafts were created but are not visible in your Stage Panel. This usually means token/permission filtering is hiding them.');
            }

            setIsOpen(false);
            alert(`Generated ${visibleCreatedCount} draft(s) visible in Stage Panel.`);
        } catch (e) {
            handleDemoError('Generate 3 Random Drafts', e);
        } finally {
            setLoading(false);
        }
    };

    const approveAll = async () => {
        setLoading(true);
        try {
            const res = await withLabeledAction('Fetch letters for approval', () =>
                authenticatedFetch(`${API_BASE}/letters`)
            );
            if (!res.ok) {
                const errorBody = await res.text();
                throw new Error(`Failed to fetch letters: ${errorBody}`);
            }
            const data = await res.json();
            const letters = Array.isArray(data) ? data : (data.data || []);
            const drafts = letters.filter((l: any) => l.status === 'DRAFT');
            const submitted = letters.filter((l: any) => l.status === 'SUBMITTED');

            for (const l of drafts) {
                await runAction(`/letters/${l.id}/submit`);
                await runAction(`/letters/${l.id}/approve`);
                await new Promise(r => setTimeout(r, 200));
            }

            for (const l of submitted) {
                await runAction(`/letters/${l.id}/approve`);
                await new Promise(r => setTimeout(r, 200));
            }

            await onRefresh();
            setIsOpen(false);
            alert('Pending drafts/submitted letters approved.');
        } catch (e) {
            handleDemoError('Approve Pending Drafts', e);
        } finally {
            setLoading(false);
        }
    };

    const issueAll = async () => {
        setLoading(true);
        try {
            const res = await withLabeledAction('Fetch letters for issuance', () =>
                authenticatedFetch(`${API_BASE}/letters`)
            );
            if (!res.ok) {
                const errorBody = await res.text();
                throw new Error(`Failed to fetch letters: ${errorBody}`);
            }
            const data = await res.json();
            const letters = Array.isArray(data) ? data : (data.data || []);
            const approved = letters.filter((l: any) => l.status === 'APPROVED');

            for (const l of approved) {
                await runAction(`/letters/${l.id}/issue`, { channel: 'PRINT', printer_id: 'DEMO' });
                await new Promise(r => setTimeout(r, 200));
            }
            await onRefresh();
            setIsOpen(false);
            alert('Approved letters issued.');
        } catch (e) {
            handleDemoError('Issue Approved Letters', e);
        } finally {
            setLoading(false);
        }
    };

    const generateFlowDataset = async () => {
        setLoading(true);
        try {
            const departmentId = await withLabeledAction('Department lookup', () => getDepartmentId());
            const suffix = Date.now();

            const draft = await withLabeledAction(
                'Draft state creation',
                () => createDraft(departmentId, `Demo Draft ${suffix}`, 'This draft remains in DRAFT state.')
            );

            const submitted = await withLabeledAction(
                'Submitted state creation',
                () => createDraft(departmentId, `Demo Submitted ${suffix}`, 'This draft is submitted for review.')
            );
            await withLabeledAction('Submitting submitted letter', () => runAction(`/letters/${submitted.id}/submit`));

            const approved = await withLabeledAction(
                'Approved state creation',
                () => createDraft(departmentId, `Demo Approved ${suffix}`, 'This draft is approved but not issued.')
            );
            await withLabeledAction('Submitting approved letter', () => runAction(`/letters/${approved.id}/submit`));
            await withLabeledAction('Approving approved letter', () => runAction(`/letters/${approved.id}/approve`));

            const issued = await withLabeledAction(
                'Issued state creation',
                () => createDraft(departmentId, `Demo Issued ${suffix}`, 'This draft is approved and then issued.')
            );
            await withLabeledAction('Submitting issued letter', () => runAction(`/letters/${issued.id}/submit`));
            await withLabeledAction('Approving issued letter', () => runAction(`/letters/${issued.id}/approve`));
            await withLabeledAction('Issuing issued letter', () =>
                runAction(`/letters/${issued.id}/issue`, { channel: 'PRINT', printer_id: 'DEMO' })
            );

            const rejected = await withLabeledAction(
                'Rejected state creation',
                () => createDraft(departmentId, `Demo Rejected ${suffix}`, 'This draft gets rejected after submission.')
            );
            await withLabeledAction('Submitting rejected letter', () => runAction(`/letters/${rejected.id}/submit`));
            await withLabeledAction('Rejecting rejected letter', () =>
                runAction(`/letters/${rejected.id}/reject`, { reason: 'Demo rejection sample' })
            );

            // keep variable referenced for readability and possible future extension
            if (!draft?.id) {
                throw new Error('Draft creation failed during demo flow setup.');
            }

            await onRefresh();
            const visibleLetters = await fetchVisibleLetters();
            const createdIds = [draft?.id, submitted?.id, approved?.id, issued?.id, rejected?.id].filter(Boolean) as string[];
            const visibleIds = new Set(visibleLetters.map((item: any) => item.id));
            const visibleCount = createdIds.filter((id) => visibleIds.has(id)).length;
            if (visibleCount === 0) {
                throw new Error('Flow dataset was created but none of those letters are visible in Stage Panel. Check user visibility scope.');
            }

            setIsOpen(false);
            alert(`Demo flow dataset created. ${visibleCount}/5 letter(s) visible in Stage Panel.`);
        } catch (e) {
            handleDemoError('Generate Full Flow Dataset', e);
        } finally {
            setLoading(false);
        }
    };

    const cleanupDrafts = async () => {
        setLoading(true);
        try {
            await withLabeledAction('Draft cleanup', () => runAction('/demo/cleanup-drafts'));
            await onRefresh();
            setIsOpen(false);
            alert('Cleaned up old draft letters. Kept a small recent set.');
        } catch (e) {
            handleDemoError('Cleanup Drafts', e);
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            <Button
                size="icon"
                className="fixed bottom-4 left-4 rounded-full h-12 w-12 bg-indigo-600 hover:bg-indigo-700 shadow-lg border-2 border-white/10 z-50"
                onClick={() => setIsOpen(true)}
                title="Demo Magic Menu"
            >
                <Wand2 className="h-6 w-6 text-white" />
            </Button>

            <Dialog open={isOpen} onOpenChange={setIsOpen}>
                <DialogContent className="max-w-sm bg-zinc-950 border-zinc-800">
                    <DialogHeader>
                        <DialogTitle className="text-white flex items-center gap-2">
                            <Wand2 className="h-5 w-5 text-indigo-400" />
                            Demo Scenarios
                        </DialogTitle>
                        <DialogDescription className="text-zinc-500">
                            Quickly populate data to simulate activity.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex flex-col gap-3 py-4">
                        <Button variant="outline" onClick={generateDrafts} disabled={loading} className="justify-start">
                            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4 text-green-500" />}
                            Generate 3 Random Drafts
                        </Button>
                        <Button variant="outline" onClick={approveAll} disabled={loading} className="justify-start">
                            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCheck className="mr-2 h-4 w-4 text-blue-500" />}
                            Approve Pending Drafts
                        </Button>
                        <Button variant="outline" onClick={issueAll} disabled={loading} className="justify-start">
                            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FastForward className="mr-2 h-4 w-4 text-orange-500" />}
                            Issue Approved Letters
                        </Button>
                        <Button variant="outline" onClick={generateFlowDataset} disabled={loading} className="justify-start">
                            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Workflow className="mr-2 h-4 w-4 text-purple-500" />}
                            Generate Full Flow Dataset
                        </Button>
                        <Button variant="outline" onClick={cleanupDrafts} disabled={loading} className="justify-start">
                            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4 text-red-500" />}
                            Cleanup 90% Drafts
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}
