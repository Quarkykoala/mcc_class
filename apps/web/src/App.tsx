import { useEffect, useState } from 'react';
import { supabase } from './lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LetterWorkspace } from './components/LetterWorkspace';

const API_BASE = import.meta.env.VITE_API_URL || (typeof window !== 'undefined' ? `${window.location.origin}/api` : 'http://localhost:3000/api');
const isVerificationRoute = typeof window !== 'undefined' && window.location.pathname.includes('/verify/');

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [letters, setLetters] = useState<any[]>([]);
  const [tags, setTags] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [verificationData, setVerificationData] = useState<any>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!isVerificationRoute || !window.location.pathname.includes('/verify/')) return;
    const token = window.location.pathname.split('/verify/')[1];
    fetch(`${API_BASE}/verify/${token}`).then((res) => res.json()).then(setVerificationData).catch(() => setVerificationData({ valid: false }));
  }, []);

  const authedFetch = async (path: string, options: RequestInit = {}) => {
    const token = session?.access_token;
    return fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(options.headers || {})
      }
    });
  };

  const refresh = async () => {
    const [lettersRes, tagsRes, logsRes] = await Promise.all([
      authedFetch('/letters'),
      authedFetch('/tags'),
      authedFetch('/audit-logs')
    ]);
    const lettersJson = await lettersRes.json();
    setLetters(Array.isArray(lettersJson) ? lettersJson : (lettersJson.data || []));
    setTags(await tagsRes.json());
    setAuditLogs(await logsRes.json());
  };

  useEffect(() => {
    if (session && !isVerificationRoute) refresh();
  }, [session]);

  if (isVerificationRoute) {
    return <pre className="p-6 text-sm">{JSON.stringify(verificationData, null, 2)}</pre>;
  }

  if (!session) {
    return (
      <div className="mx-auto mt-16 max-w-md space-y-3 p-4">
        <Input placeholder="Email" value={email} onChange={(event) => setEmail(event.target.value)} />
        <Input placeholder="Password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
        <Button onClick={() => supabase.auth.signInWithPassword({ email, password })}>Sign in</Button>
      </div>
    );
  }

  return (
    <main className="p-4">
      <div className="mb-4 flex justify-end">
        <Button variant="outline" onClick={() => supabase.auth.signOut()}>Sign out</Button>
      </div>
      <LetterWorkspace
        letters={letters}
        tags={tags}
        auditLogs={auditLogs}
        onCreateOrUpdate={async (payload) => { await authedFetch('/letters', { method: 'POST', body: JSON.stringify(payload) }); await refresh(); }}
        onRoute={async (id, payload) => { await authedFetch(`/letters/${id}/routing`, { method: 'POST', body: JSON.stringify(payload) }); await refresh(); }}
        onSubmit={async (id) => { await authedFetch(`/letters/${id}/submit`, { method: 'POST', body: JSON.stringify({}) }); await refresh(); }}
        onApprove={async (id) => { await authedFetch(`/letters/${id}/approve`, { method: 'POST', body: JSON.stringify({}) }); await refresh(); }}
        onReject={async (id, reason) => { await authedFetch(`/letters/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) }); await refresh(); }}
        onIssue={async (id) => { await authedFetch(`/letters/${id}/issue`, { method: 'POST', body: JSON.stringify({ channel: 'PRINT', printer_id: 'DEMO' }) }); await refresh(); }}
        onPrint={async (id) => { await authedFetch(`/letters/${id}/print`, { method: 'POST', body: JSON.stringify({ printer_id: 'DEMO' }) }); await refresh(); }}
      />
    </main>
  );
}
