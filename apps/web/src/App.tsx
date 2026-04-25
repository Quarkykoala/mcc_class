import { useEffect, useState } from 'react';
import { auth } from './lib/auth';
import { LetterWorkspace } from './components/LetterWorkspace';
import { DemoDebugMenu } from './components/DemoDebugMenu';
import { Dashboard } from './components/Dashboard';
import { AppShell } from './components/AppShell';
import { MyTasks } from './components/MyTasks';
import { API_BASE } from './lib/api';
const isVerificationRoute = typeof window !== 'undefined' && window.location.pathname.includes('/verify/');
const WORKSPACE_CONTEXT = 'COMPANY';
const PAGE_SIZE = 50;

type Letter = any;
type ApproverOption = {
  id: string;
  label: string;
  roles: string[];
};

type LetterTemplate = {
  key: string;
  label: string;
  description: string;
  title: string;
  subject: string;
  content: string;
  to_text: string;
  cc_text: string;
};

const LETTER_TEMPLATES: LetterTemplate[] = [
  {
    key: 'blank',
    label: 'Blank letter',
    description: 'Start with an empty draft and fill each section yourself.',
    title: 'Untitled letter',
    subject: '',
    content: 'Start drafting here.',
    to_text: '',
    cc_text: ''
  },
  {
    key: 'official',
    label: 'Official template',
    description: 'Prefill the common MCC letter structure with editable sections.',
    title: 'Official letter',
    subject: 'Subject:',
    content: 'Dear Sir/Madam,\n\nPlease write the draft content here.\n\nRegards,',
    to_text: 'To,\nRecipient name\nRecipient designation',
    cc_text: 'CC:'
  }
];

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

const deriveDisplayName = (email?: string) => {
  if (!email) return 'Authorized Signatory';
  const localPart = email.split('@')[0] || email;
  return localPart
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
};

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [letters, setLetters] = useState<any[]>([]);
  const [tags, setTags] = useState<any[]>([]);
  const [approvers, setApprovers] = useState<ApproverOption[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<Letter[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [verificationData, setVerificationData] = useState<any>(null);
  const [view, setView] = useState<'tasks' | 'workspace' | 'dashboard'>('tasks');
  const [selectedLetterId, setSelectedLetterId] = useState<string | null>(null);

  useEffect(() => {
    auth.getSession().then(({ data }) => {
      if (data.session) {
        setSession(data.session);
      } else if (!isVerificationRoute) {
        auth.signInWithPassword({ email: 'admin@mcc.local', password: 'admin123' });
      }
    });
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
    const [lettersResult, tagsResult, approversResult, pendingResult] = await Promise.allSettled([
      authedFetch(`/letters?context=${contextQuery}&page=1&limit=${PAGE_SIZE}`),
      authedFetch(`/tags?context=${contextQuery}`),
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

  const createLetterFromTemplate = async (templateKey: string) => {
    const template = LETTER_TEMPLATES.find((item) => item.key === templateKey) || LETTER_TEMPLATES[0];
    const signerName = deriveDisplayName(session?.user?.email);
    const response = await fetchOrThrow('/letters', {
      method: 'POST',
      body: JSON.stringify({
        context: WORKSPACE_CONTEXT,
        title: template.title,
        content: template.content || ' ',
        tag_ids: [],
        to_text: template.to_text,
        cc_text: template.cc_text,
        subject: template.subject,
        signature_name: signerName,
        signature_title: 'Authorized Signatory',
        template_key: template.key
      })
    });
    const createdLetter = await response.json();
    await refresh();
    if (typeof createdLetter?.id === 'string') setSelectedLetterId(createdLetter.id);
    setView('workspace');
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
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <p className="text-gray-500 font-medium">Auto-logging into demo...</p>
      </div>
    );
  }

  return (
    <AppShell
      activeView={view}
      onChangeView={setView}
      onNewBlankLetter={() => void createLetterFromTemplate('blank')}
      onNewTemplateLetter={() => void createLetterFromTemplate('official')}
      email={session?.user?.email}
      pendingTaskCount={pendingApprovals.length}
    >
      {view === 'dashboard' ? (
        <Dashboard />
      ) : view === 'tasks' ? (
        <MyTasks
          currentUserId={session?.user?.id}
          letters={letters}
          pendingApprovals={pendingApprovals}
          onOpenLetter={(id) => {
            setSelectedLetterId(id);
            setView('workspace');
          }}
        />
      ) : (
        <LetterWorkspace
          selectedId={selectedLetterId}
          onSelectLetter={setSelectedLetterId}
          letters={letters}
          tags={tags}
          approvers={approvers}
          pendingApprovals={pendingApprovals}
          currentUserLabel={deriveDisplayName(session?.user?.email)}
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
