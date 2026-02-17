import { useEffect, useState } from 'react';
import { supabase } from './lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LetterWorkspace } from './components/LetterWorkspace';
import { DemoDebugMenu } from './components/DemoDebugMenu';

const API_BASE = import.meta.env.VITE_API_URL || (typeof window !== 'undefined' ? `${window.location.origin}/api` : 'http://localhost:3000/api');
const isVerificationRoute = typeof window !== 'undefined' && window.location.pathname.includes('/verify/');
const WORKSPACE_CONTEXT = 'COMPANY';

type Letter = any;
type ApproverOption = {
  id: string;
  label: string;
  roles: string[];
};

const parseCollection = <T,>(payload: unknown): T[] => {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (payload && typeof payload === 'object' && Array.isArray((payload as { data?: unknown }).data)) {
    return (payload as { data: T[] }).data;
  }
  return [];
};

const formatApproverLabel = (id: string, roles: string[]) => {
  const roleLabel = roles.length > 0 ? roles.join('/') : 'User';
  const shortId = id.length > 12 ? `${id.slice(0, 8)}...${id.slice(-4)}` : id;
  return `${roleLabel} - ${shortId}`;
};

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [letters, setLetters] = useState<any[]>([]);
  const [tags, setTags] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [approvers, setApprovers] = useState<ApproverOption[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<Letter[]>([]);
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
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token ?? session?.access_token;
    return fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(options.headers || {})
      }
    });
  };

  const fetchOrThrow = async (path: string, options: RequestInit = {}) => {
    const res = await authedFetch(path, options);
    if (res.ok) {
      return res;
    }

    let message = `Request failed (${res.status})`;
    try {
      const errorBody = await res.json();
      if (errorBody?.error) {
        message = String(errorBody.error);
      }
    } catch {
      // keep default message
    }

    throw new Error(message);
  };

  const buildPendingApprovals = (lettersSnapshot: Letter[]) => {
    const currentUserId = session?.user?.id;

    return lettersSnapshot
      .filter((letter) => {
        if (letter?.status !== 'SUBMITTED') return false;
        if (letter?.canApprove) return true;
        if (!currentUserId) return false;
        const assignments = Array.isArray(letter?.letter_approver_assignments) ? letter.letter_approver_assignments : [];
        return assignments.some((assignment: any) =>
          assignment?.approver_id === currentUserId && assignment?.decision === 'PENDING'
        );
      })
      .sort((left, right) => {
        const leftTime = new Date(left?.updated_at || left?.created_at || 0).getTime();
        const rightTime = new Date(right?.updated_at || right?.created_at || 0).getTime();
        return rightTime - leftTime;
      });
  };

  const refresh = async () => {
    const contextQuery = encodeURIComponent(WORKSPACE_CONTEXT);
    const [lettersResult, tagsResult, logsResult, approversResult, pendingResult] = await Promise.allSettled([
      authedFetch(`/letters?context=${contextQuery}`),
      authedFetch(`/tags?context=${contextQuery}`),
      authedFetch('/audit-logs'),
      authedFetch('/approvers'),
      authedFetch(`/approvals/pending?context=${contextQuery}`)
    ]);

    let nextLetters: Letter[] = [];

    if (lettersResult.status === 'fulfilled' && lettersResult.value.ok) {
      const lettersJson = await lettersResult.value.json();
      nextLetters = parseCollection<Letter>(lettersJson);
      setLetters(nextLetters);
    } else {
      console.error('Failed to refresh letters list', lettersResult);
      setPendingApprovals([]);
    }

    if (tagsResult.status === 'fulfilled' && tagsResult.value.ok) {
      const tagsJson = await tagsResult.value.json();
      setTags(parseCollection<any>(tagsJson));
    } else {
      console.error('Failed to refresh tags', tagsResult);
    }

    if (logsResult.status === 'fulfilled' && logsResult.value.ok) {
      const logsJson = await logsResult.value.json();
      setAuditLogs(Array.isArray(logsJson) ? logsJson : (logsJson.data || []));
    } else {
      console.error('Failed to refresh audit logs', logsResult);
    }

    if (approversResult.status === 'fulfilled' && approversResult.value.ok) {
      const approversJson = await approversResult.value.json();
      const apiApprovers = parseCollection<any>(approversJson)
        .filter((item) => typeof item?.id === 'string')
        .map((item) => {
          const roles = Array.isArray(item.roles) ? item.roles.map((role: unknown) => String(role)) : [];
          return {
            id: item.id,
            roles,
            label: typeof item.label === 'string' && item.label.length > 0 ? item.label : formatApproverLabel(item.id, roles)
          } satisfies ApproverOption;
        });

      const assignedApproverIds = nextLetters.flatMap((letter) =>
        (Array.isArray(letter?.letter_approver_assignments) ? letter.letter_approver_assignments : [])
          .map((assignment: any) => assignment?.approver_id)
          .filter((value: unknown): value is string => typeof value === 'string' && value.length > 0)
      );
      const missingAssigned = Array.from(new Set(assignedApproverIds))
        .filter((id) => !apiApprovers.some((item) => item.id === id))
        .map((id) => ({ id, roles: [] as string[], label: formatApproverLabel(id, []) }));

      setApprovers([...apiApprovers, ...missingAssigned].sort((left, right) => left.label.localeCompare(right.label)));
    } else {
      console.error('Failed to refresh approvers', approversResult);
      setApprovers([]);
    }

    if (pendingResult.status === 'fulfilled' && pendingResult.value.ok) {
      const pendingJson = await pendingResult.value.json();
      setPendingApprovals(parseCollection<Letter>(pendingJson));
    } else {
      // Fallback to derived pending queue from visible letters
      setPendingApprovals(buildPendingApprovals(nextLetters));
    }
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
        approvers={approvers}
        pendingApprovals={pendingApprovals}
        onCreateOrUpdate={async (payload) => {
          await fetchOrThrow('/letters', { method: 'POST', body: JSON.stringify({ ...payload, context: payload?.context ?? WORKSPACE_CONTEXT }) });
          await refresh();
        }}
        onRoute={async (id, payload) => { await fetchOrThrow(`/letters/${id}/routing`, { method: 'POST', body: JSON.stringify(payload) }); await refresh(); }}
        onSubmit={async (id) => { await fetchOrThrow(`/letters/${id}/submit`, { method: 'POST', body: JSON.stringify({}) }); await refresh(); }}
        onApprove={async (id) => { await fetchOrThrow(`/letters/${id}/approve`, { method: 'POST', body: JSON.stringify({}) }); await refresh(); }}
        onReject={async (id, reason) => { await fetchOrThrow(`/letters/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) }); await refresh(); }}
        onIssue={async (id, payload) => {
          await fetchOrThrow(`/letters/${id}/issue`, {
            method: 'POST',
            body: JSON.stringify({ channel: 'PRINT', printer_id: 'DEMO', ...(payload || {}) })
          });
          await refresh();
        }}
        onPrint={async (id, payload) => {
          await fetchOrThrow(`/letters/${id}/print`, {
            method: 'POST',
            body: JSON.stringify({ printer_id: 'DEMO', ...(payload || {}) })
          });
          await refresh();
        }}
        onFetchLetter={async (id) => { const res = await fetchOrThrow(`/letters/${id}`); return res.json(); }}
      />
      <DemoDebugMenu onRefresh={refresh} />
    </main>
  );
}
