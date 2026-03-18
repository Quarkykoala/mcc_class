import { useEffect, useState } from 'react';
import { auth } from './lib/auth';
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
  if (Array.isArray(payload)) return payload;
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
  const [selectedLetterId, setSelectedLetterId] = useState<string | null>(null);

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
    if (res.ok) return res;
    let message = `Request failed (${res.status})`;
    try {
      const errorBody = await res.json();
      if (errorBody?.error) message = String(errorBody.error);
    } catch (e) {
      console.error('Failed to parse error body', e);
    }
    throw new Error(message);
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
    }

    if (tagsResult.status === 'fulfilled' && tagsResult.value.ok) {
      setTags(parseCollection<any>(await tagsResult.value.json()));
    }

    if (logsResult.status === 'fulfilled' && logsResult.value.ok) {
      const logsJson = await logsResult.value.json();
      setAuditLogs(Array.isArray(logsJson) ? logsJson : (logsJson.data || []));
    }

    if (approversResult.status === 'fulfilled' && approversResult.value.ok) {
      const apiApprovers = parseCollection<any>(await approversResult.value.json())
        .filter((item) => typeof item?.id === 'string')
        .map((item) => ({
          id: item.id,
          roles: Array.isArray(item.roles) ? item.roles.map((role: unknown) => String(role)) : [],
          label: typeof item.label === 'string' && item.label.length > 0 ? item.label : formatApproverLabel(item.id, item.roles || [])
        } satisfies ApproverOption));
      setApprovers(apiApprovers.sort((left, right) => left.label.localeCompare(right.label)));
    }

    if (pendingResult.status === 'fulfilled' && pendingResult.value.ok) {
      setPendingApprovals(parseCollection<Letter>(await pendingResult.value.json()));
    }
  };

  useEffect(() => {
    if (session && !isVerificationRoute) refresh();
  }, [session]);

  useEffect(() => {
    if (letters.length === 0) {
      if (selectedLetterId !== null) setSelectedLetterId(null);
      return;
    }
    const hasSelectedLetter = selectedLetterId !== null && letters.some((letter) => letter.id === selectedLetterId);
    if (!hasSelectedLetter) setSelectedLetterId(letters[0].id);
  }, [letters, selectedLetterId]);

  if (isVerificationRoute) {
    return (
      <div className="off-canvas-sidebar">
        <div className="wrapper-full-page">
          <div className="page-header login-page" style={{ backgroundImage: 'url(https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&q=80&w=1200)' }}>
            <div className="container mx-auto px-4 relative z-10 flex justify-center">
              <div className="card max-w-4xl">
                <div className="card-header card-header-primary text-center">
                   <h4 className="card-title">Verification Results</h4>
                </div>
                <div className="card-body p-8">
                   <pre className="md-verification-pre">{JSON.stringify(verificationData, null, 2)}</pre>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="off-canvas-sidebar">
        <div className="wrapper-full-page">
          <div className="page-header login-page" style={{ backgroundImage: 'url(https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&q=80&w=1200)' }}>
            <div className="container mx-auto px-4 relative z-10 flex justify-center">
              <div className="w-full max-w-md">
                <form className="form" onSubmit={(e) => e.preventDefault()}>
                  <div className="card">
                    <div className="card-header card-header-primary text-center">
                      <h4 className="card-title font-bold">Login</h4>
                      <div className="social-line flex justify-center gap-4 mt-4">
                         <a href="#" className="btn btn-just-icon btn-link text-white"><i className="fa fa-facebook-square"></i></a>
                         <a href="#" className="btn btn-just-icon btn-link text-white"><i className="fa fa-twitter"></i></a>
                         <a href="#" className="btn btn-just-icon btn-link text-white"><i className="fa fa-google-plus"></i></a>
                      </div>
                    </div>
                    <p className="description text-center mt-4 text-gray-500 font-medium">Or Be Classical</p>
                    <div className="card-body px-8 py-4 space-y-6">
                      <div className="input-group flex items-end gap-4">
                        <div className="input-group-prepend">
                          <span className="input-group-text"><i className="material-icons text-gray-400">email</i></span>
                        </div>
                        <input
                          type="email"
                          className="form-control"
                          placeholder="Email..."
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                        />
                      </div>
                      <div className="input-group flex items-end gap-4">
                        <div className="input-group-prepend">
                          <span className="input-group-text"><i className="material-icons text-gray-400">lock_outline</i></span>
                        </div>
                        <input
                          type="password"
                          className="form-control"
                          placeholder="Password..."
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                        />
                      </div>
                      
                      <div className="bg-primary/5 p-4 rounded-lg border border-primary/10 flex items-start gap-3 mt-8">
                         <i className="material-icons text-primary">info</i>
                         <div className="text-[11px] font-bold text-primary uppercase leading-tight">
                            Demo account: admin@mcc.local / admin123
                         </div>
                      </div>
                    </div>
                    <div className="footer text-center pb-8 pt-4">
                      <button
                        className="btn btn-primary btn-link btn-lg font-bold text-sm uppercase"
                        onClick={async () => {
                          const result = await auth.signInWithPassword({ email, password });
                          if (result.error) alert(result.error);
                        }}
                      >
                        Get Started
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <AppShell
      activeView={view}
      onChangeView={setView}
      onNewLetter={async () => {
        const response = await fetchOrThrow('/letters', {
          method: 'POST',
          body: JSON.stringify({
            context: WORKSPACE_CONTEXT,
            title: 'Untitled letter',
            content: 'Start writing your letter here.',
            tag_ids: []
          })
        });
        const createdLetter = await response.json();
        await refresh();
        if (typeof createdLetter?.id === 'string') setSelectedLetterId(createdLetter.id);
        setView('workspace');
      }}
      onSignOut={() => auth.signOut()}
      email={session?.user?.email}
    >
      {view === 'dashboard' ? (
        <Dashboard />
      ) : (
        <LetterWorkspace
          selectedId={selectedLetterId}
          onSelectLetter={setSelectedLetterId}
          letters={letters}
          tags={tags}
          auditLogs={auditLogs}
          approvers={approvers}
          pendingApprovals={pendingApprovals}
          hasMore={hasMore}
          onLoadMore={async () => {
             if (loadingMore || !hasMore) return;
             setLoadingMore(true);
             try {
               const nextPage = page + 1;
               const res = await authedFetch(`/letters?context=${WORKSPACE_CONTEXT}&page=${nextPage}&limit=${PAGE_SIZE}`);
               const payload = await res.json();
               const newLetters = parseCollection<Letter>(payload);
               setLetters((prev) => [...prev, ...newLetters]);
               setPage(nextPage);
               setHasMore(Boolean(payload?.meta?.hasMore));
             } finally { setLoadingMore(false); }
          }}
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
