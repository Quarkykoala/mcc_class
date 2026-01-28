import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Wand2, Play, CheckCheck, Loader2, FastForward } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

interface DemoDebugMenuProps {
    onRefresh: () => void;
}

export function DemoDebugMenu({ onRefresh }: DemoDebugMenuProps) {
    const [loading, setLoading] = useState(false);
    const [isOpen, setIsOpen] = useState(false);

    const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

    // Helper to get token (assuming standard location or just mocking for demo if demo mode is open)
    // In demo mode, backend might be permissive or we use the stored session.
    // We'll try to find the session in localStorage "sb-..." or rely on the App wrapper handling it?
    // Actually, we should probably pass the fetch function or token as prop.
    // BUT the 'authenticatedFetch' logic is inside App.tsx.
    // We will re-implement a simple fetch here that grabs the token from storage if possible.
    // OR, we assume App.tsx passes a "executeAction" prop.
    // SIMPLER: Define the logic in App.tsx and pass handlers? No, too much prop drilling.
    // Let's assume we can fetch directly using the same logic if we can get the token.
    // The token is in `localStorage.getItem('sb-<ref>-auth-token')`.
    // Wait, `supabase-js` handles it.
    // We can import `supabase` client and use `supabase.auth.getSession()`.

    const getSession = async () => {
        const { data } = await import('../lib/supabase').then(m => m.supabase.auth.getSession());
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

    const generateDrafts = async () => {
        setLoading(true);
        try {
            const contents = [
                "This letter confirms the employment details of the subject.",
                "We acknowledge receipt of the payment regarding invoice #992.",
                "The committee has reviewed the proposal and grants approval.",
                "Please be advised that the audit for Q3 is complete."
            ];

            for (let i = 0; i < 3; i++) {
                // Demo user is usually in a department.
                // Let's try to post with a hardcoded department or random if we knew IDs.
                // Default demo department ID is often fixed or we can just send "Legal" if backend handles name lookup? backend expects ID.
                // Let's use the one from the dropdown in App, but we don't have it here.
                // We'll guess or pick the first one from the list if we could fetch.
                // Let's fetch departments first.

                const deptRes = await authenticatedFetch(`${API_BASE}/departments`);
                const depts = await deptRes.json();
                const deptList = Array.isArray(depts) ? depts : (depts.data || []);
                const randomDept = deptList[Math.floor(Math.random() * deptList.length)];

                if (!randomDept) continue;

                await authenticatedFetch(`${API_BASE}/letters`, {
                    method: 'POST',
                    body: JSON.stringify({
                        department_id: randomDept.id,
                        content: contents[Math.floor(Math.random() * contents.length)] + ` (Auto-Gen #${Math.floor(Math.random() * 1000)})`,
                        tags: { urgent: Math.random() > 0.5, confidential: Math.random() > 0.8 },
                        internal_only: false
                    })
                });
            }
            onRefresh();
            setIsOpen(false);
        } catch (e) {
            console.error(e);
            alert("Failed to generate drafts");
        } finally {
            setLoading(false);
        }
    };

    const approveAll = async () => {
        setLoading(true);
        try {
            // Get all letters
            const res = await authenticatedFetch(`${API_BASE}/letters`);
            const data = await res.json();
            const drafts = data.data.filter((l: any) => l.status === 'DRAFT');

            for (const l of drafts) {
                await authenticatedFetch(`${API_BASE}/letters/${l.id}/approve`, { method: 'POST' });
                // Simulate small delay for effect
                await new Promise(r => setTimeout(r, 200));
            }
            onRefresh();
            setIsOpen(false);
        } catch (e) { console.error(e); } finally { setLoading(false); }
    };

    const issueAll = async () => {
        setLoading(true);
        try {
            const res = await authenticatedFetch(`${API_BASE}/letters`);
            const data = await res.json();
            const approved = data.data.filter((l: any) => l.status === 'APPROVED');

            for (const l of approved) {
                await authenticatedFetch(`${API_BASE}/letters/${l.id}/issue`, { method: 'POST' });
                await new Promise(r => setTimeout(r, 200));
            }
            onRefresh();
            setIsOpen(false);
        } catch (e) { console.error(e); } finally { setLoading(false); }
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
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}
