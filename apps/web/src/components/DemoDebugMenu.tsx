import { useState } from 'react';
import { auth } from '@/lib/auth';
import { API_BASE } from '@/lib/api';

interface DemoDebugMenuProps {
    onRefresh: () => Promise<void>;
}

export function DemoDebugMenu({ onRefresh }: DemoDebugMenuProps) {
    const [loading, setLoading] = useState(false);
    const [isOpen, setIsOpen] = useState(false);

    const authenticatedFetch = async (url: string, options: any = {}) => {
        const { data } = await auth.getSession();
        if (!data.session?.access_token) throw new Error("No session");
        return fetch(url, {
            ...options,
            headers: {
                ...options.headers,
                'Authorization': `Bearer ${data.session.access_token}`,
                'Content-Type': 'application/json'
            }
        });
    };

    const getDepartmentId = async () => {
        const deptRes = await authenticatedFetch(`${API_BASE}/departments?context=COMPANY`);
        const depts = await deptRes.json();
        const deptList = Array.isArray(depts) ? depts : (depts.data || []);
        if (!deptList.length) throw new Error('No departments available');
        return deptList[0].id;
    };

    const createDraft = async (departmentId: string, title: string, content: string) => {
        const res = await authenticatedFetch(`${API_BASE}/letters`, {
            method: 'POST',
            body: JSON.stringify({ context: 'COMPANY', department_id: departmentId, title, content, tag_ids: [] })
        });
        return res.json();
    };

    const runAction = async (path: string, body: Record<string, unknown> = {}) => {
        await authenticatedFetch(`${API_BASE}${path}`, { method: 'POST', body: JSON.stringify(body) });
    };

    const handleAction = async (label: string, action: () => Promise<void>) => {
        setLoading(true);
        try {
            await action();
            await onRefresh();
            setIsOpen(false);
            alert(`${label} success.`);
        } catch (e) {
            alert(`${label} failed: ${e instanceof Error ? e.message : String(e)}`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            <button
                className="btn btn-rose btn-just-icon btn-round fixed bottom-6 left-6 w-12 h-12 rounded-full shadow-lg z-[3000] flex items-center justify-center"
                onClick={() => setIsOpen(true)}
                title="Demo Magic Menu"
            >
                <i className="material-icons text-2xl">auto_fix_high</i>
            </button>

            {isOpen && (
                <div className="fixed inset-0 z-[4000] flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="card w-96 mt-0">
                        <div className="card-header card-header-rose flex justify-between items-center">
                            <h4 className="card-title">Demo Scenarios</h4>
                            <button onClick={() => setIsOpen(false)} className="text-white hover:bg-white/10 p-1 rounded">
                                <i className="material-icons">close</i>
                            </button>
                        </div>
                        <div className="card-body p-6 flex flex-col gap-3">
                            <button 
                                className="btn btn-white border border-gray-100 text-left flex items-center gap-3 lowercase font-bold"
                                disabled={loading}
                                onClick={() => handleAction('Generate Drafts', async () => {
                                    const deptId = await getDepartmentId();
                                    await createDraft(deptId, 'Demo Draft A', 'Content sample for demo.');
                                    await createDraft(deptId, 'Demo Draft B', 'Another content sample.');
                                })}
                            >
                                <i className="material-icons text-success">play_circle</i> 
                                {loading ? 'Processing...' : 'Generate 2 Random Drafts'}
                            </button>
                            
                            <button 
                                className="btn btn-white border border-gray-100 text-left flex items-center gap-3 lowercase font-bold"
                                disabled={loading}
                                onClick={() => handleAction('Approve Pending', async () => {
                                    const res = await authenticatedFetch(`${API_BASE}/letters`);
                                    const data = await res.json();
                                    const letters = Array.isArray(data) ? data : (data.data || []);
                                    for (const l of letters.filter((item: any) => item.status === 'DRAFT' || item.status === 'SUBMITTED')) {
                                        if (l.status === 'DRAFT') await runAction(`/letters/${l.id}/submit`);
                                        await runAction(`/letters/${l.id}/approve`);
                                    }
                                })}
                            >
                                <i className="material-icons text-info">done_all</i> 
                                Approve Pending Drafts
                            </button>

                            <button 
                                className="btn btn-white border border-gray-100 text-left flex items-center gap-3 lowercase font-bold"
                                disabled={loading}
                                onClick={() => handleAction('Issue Approved', async () => {
                                    const res = await authenticatedFetch(`${API_BASE}/letters`);
                                    const data = await res.json();
                                    const letters = Array.isArray(data) ? data : (data.data || []);
                                    for (const l of letters.filter((item: any) => item.status === 'APPROVED')) {
                                        await runAction(`/letters/${l.id}/issue`, { channel: 'PRINT', printer_id: 'DEMO' });
                                    }
                                })}
                            >
                                <i className="material-icons text-warning">verified</i> 
                                Issue Approved Letters
                            </button>

                            <button 
                                className="btn btn-white border border-gray-100 text-left flex items-center gap-3 lowercase font-bold"
                                disabled={loading}
                                onClick={() => handleAction('Cleanup', async () => {
                                    await authenticatedFetch(`${API_BASE}/demo/cleanup-drafts`, { method: 'POST' });
                                })}
                            >
                                <i className="material-icons text-danger">delete_sweep</i> 
                                Cleanup Drafts
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
