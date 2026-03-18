import { useEffect, useState } from 'react';
import { auth } from './lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LetterWorkspace } from './components/LetterWorkspace';
import { DemoDebugMenu } from './components/DemoDebugMenu';
import { Dashboard } from './components/Dashboard';
import { AppShell } from './components/AppShell';

const API_BASE = import.meta.env.VITE_API_URL || (typeof window !== 'undefined' ? `${window.location.origin}/api` : 'http://localhost:3000/api');
const isVerificationRoute = typeof window !== 'undefined' && window.location.pathname.includes('/verify/');
const WORKSPACE_CONTEXT = 'COMPANY';
const PAGE_SIZE = 50;

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
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [verificationData, setVerificationData] = useState<any>(null);
  const [view, setView] = useState<'workspace' | 'dashboard'>('workspace');

  useEffect(() => {
    auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!isVerificationRoute || !window.location.pathname.includes('/verify/')) return;
    const token = window.location.pathname.split('/verify/')[1];
    fetch(`${API_BASE}/verify/${token}`).then((res) => res.json()).then(setVerificationData).catch(() => setVerificationData({ valid: false }));
  }, []);

  const authedFetch = async (path: string, options: RequestInit = {}) => {
    const token = auth.getAccessToken() ?? session?.access_token;
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
      authedFetch(`/letters?context=${contextQuery}&page=1&limit=${PAGE_SIZE}`),
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
      const meta = (lettersJson && typeof lettersJson === 'object') ? (lettersJson as any).meta : null;
      setPage(1);
      setHasMore(Boolean(meta?.hasMore));
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

  const loadMoreLetters = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const contextQuery = encodeURIComponent(WORKSPACE_CONTEXT);
      const nextPage = page + 1;
      const res = await authedFetch(`/letters?context=${contextQuery}&page=${nextPage}&limit=${PAGE_SIZE}`);
      if (!res.ok) throw new Error('Failed to load more letters');
      const payload = await res.json();
      const newLetters = parseCollection<Letter>(payload);
      setLetters((prev) => [...prev, ...newLetters]);
      const meta = payload?.meta;
      setPage(nextPage);
      setHasMore(Boolean(meta?.hasMore));
    } catch (err) {
      console.error('Failed to load more letters', err);
    } finally {
      setLoadingMore(false);
    }
  };

  if (isVerificationRoute) {
    return (
      <div className="md-auth-page">
        <div className="md-auth-card md-auth-card--wide">
          <p className="md-eyebrow">Verification</p>
          <h1 className="md-auth-card__title">Letter verification payload</h1>
          <pre className="md-verification-pre">{JSON.stringify(verificationData, null, 2)}</pre>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="md-auth-page">
        <div className="md-auth-card">
          <p className="md-eyebrow">Material dashboard theme</p>
          <h1 className="md-auth-card__title">Sign in to the letter workflow</h1>
          <p className="md-auth-card__subtitle">
            This keeps the React app intact while applying the shared admin-shell language you wanted.
          </p>
          <div className="space-y-4">
            <Input
              className="md-auth-input"
              placeholder="Email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <Input
              className="md-auth-input"
              placeholder="Password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <Button
              className="md-auth-submit"
              onClick={async () => {
                const result = await auth.signInWithPassword({ email, password });
                if (result.error) alert(result.error);
              }}
            >
              <span className="material-icons text-base" aria-hidden="true">login</span>
              Sign in
            </Button>
          </div>
          <div className="md-auth-note">
            <span className="material-icons text-base" aria-hidden="true">info</span>
            <span>Demo login: `admin@mcc.local` / `admin123`</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <AppShell
      activeView={view}
      onChangeView={setView}
      onSignOut={() => auth.signOut()}
      email={session?.user?.email}
    >
      {view === 'dashboard' ? (
        <Dashboard />
      ) : (
        <LetterWorkspace
          letters={letters}
          tags={tags}
          auditLogs={auditLogs}
          approvers={approvers}
          pendingApprovals={pendingApprovals}
          hasMore={hasMore}
          onLoadMore={loadMoreLetters}
          loadingMore={loadingMore}
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
      )}
      <DemoDebugMenu onRefresh={refresh} />
    </AppShell>
  );
}
