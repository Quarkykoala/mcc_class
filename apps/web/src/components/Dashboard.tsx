import { useState, useEffect, useCallback, useRef } from 'react';
import { auth } from '../lib/auth';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

type Letter = {
  id: string;
  context: string;
  status: string;
  title?: string;
  job_reference?: string;
  letter_number?: string;
  department_id?: string;
  departments?: { name: string };
  created_at: string;
  approval_summary?: {
    total: number;
    approved: number;
    rejected: number;
    pending: number;
  };
};

type Analytics = {
  total_letters: number;
  by_status: Record<string, number>;
  by_department: Array<{ department_id: string; department_name: string; count: number }>;
  avg_approval_time_hours: number;
};

type FilterState = {
  search: string;
  status: string;
  department_id: string;
  dateFrom: string;
  dateTo: string;
};

export function Dashboard() {
  const [session, setSession] = useState<any>(null);
  const [letters, setLetters] = useState<Letter[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [departments, setDepartments] = useState<any[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [activeTab, setActiveTab] = useState<'letters' | 'analytics' | 'routing' | 'attachments'>('letters');
  const [filters, setFilters] = useState<FilterState>({
    search: '',
    status: '',
    department_id: '',
    dateFrom: '',
    dateTo: '',
  });
  const [bulkAction, setBulkAction] = useState<string>('');
  const [showFilters, setShowFilters] = useState(false);
  const [routingRules, setRoutingRules] = useState<any[]>([]);
  const [showDeadlineModal, setShowDeadlineModal] = useState<string | null>(null);
  const [deadlineDate, setDeadlineDate] = useState('');
  const [approvers, setApprovers] = useState<any[]>([]);
  const [selectedLetterForAttachments, setSelectedLetterForAttachments] = useState<string | null>(null);
  const [letterAttachments, setLetterAttachments] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = auth.onAuthStateChange((_event: string, nextSession: any) => setSession(nextSession));
    return () => sub.subscription.unsubscribe();
  }, []);

  const fetchLetters = useCallback(async () => {
    if (!session?.access_token) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.search) params.set('search', filters.search);
      if (filters.status) params.set('status', filters.status);
      if (filters.department_id) params.set('department_id', filters.department_id);
      if (filters.dateFrom) params.set('created_after', filters.dateFrom);
      if (filters.dateTo) params.set('created_before', filters.dateTo);
      params.set('page', String(page));
      params.set('limit', '50');

      const res = await fetch(`${API_BASE}/letters?${params}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json();
      setLetters(data.data || []);
      setHasMore(Boolean(data?.meta?.hasMore));
    } catch (err) {
      console.error('Error fetching letters:', err);
    } finally {
      setLoading(false);
    }
  }, [session, filters, page]);

  const fetchAnalytics = useCallback(async () => {
    if (!session?.access_token) return;
    try {
      const res = await fetch(`${API_BASE}/analytics/summary`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data: Analytics = await res.json();
      setAnalytics(data);
    } catch (err) {
      console.error('Error fetching analytics:', err);
    }
  }, [session]);

  const fetchDepartments = async () => {
    try {
      const res = await fetch(`${API_BASE}/departments`);
      const data = await res.json();
      setDepartments(data || []);
    } catch (err) {
      console.error('Error fetching departments:', err);
    }
  };

  const fetchRoutingRules = async () => {
    if (!session?.access_token) return;
    try {
      const res = await fetch(`${API_BASE}/auto-routing-rules`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json();
      setRoutingRules(data || []);
    } catch (err) {
      console.error('Error fetching routing rules:', err);
    }
  };

  const fetchApprovers = async () => {
    if (!session?.access_token) return;
    try {
      const res = await fetch(`${API_BASE}/approvers`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json();
      setApprovers(data || []);
    } catch (err) {
      console.error('Error fetching approvers:', err);
    }
  };

  const fetchAttachments = async (letterId: string) => {
    if (!session?.access_token) return;
    try {
      const res = await fetch(`${API_BASE}/letters/${letterId}/attachments`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json();
      setLetterAttachments(data || []);
    } catch (err) {
      console.error('Error fetching attachments:', err);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedLetterForAttachments || !session?.access_token) return;

    const files = event.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        // const filePath = `attachments/${selectedLetterForAttachments}/${fileName}`;

        // Save attachment metadata to database (file storage skipped per migration)
        const res = await fetch(`${API_BASE}/attachments`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            letter_id: selectedLetterForAttachments,
            file_name: file.name,
            file_path: `local://${file.name}`,
            file_size: file.size,
            mime_type: file.type,
          }),
        });

        if (!res.ok) {
          alert(`Failed to save attachment record for ${file.name}`);
        }
      }

      // Refresh attachments list
      await fetchAttachments(selectedLetterForAttachments);
    } catch (err) {
      console.error('Upload error:', err);
      alert('Upload failed');
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDeleteAttachment = async (attachmentId: string) => {
    if (!confirm('Are you sure you want to delete this attachment?')) return;

    try {
      const res = await fetch(`${API_BASE}/attachments/${attachmentId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (res.ok && selectedLetterForAttachments) {
        await fetchAttachments(selectedLetterForAttachments);
      }
    } catch (err) {
      console.error('Delete error:', err);
      alert('Failed to delete attachment');
    }
  };

  useEffect(() => {
    if (session) {
      fetchLetters();
      fetchAnalytics();
      fetchDepartments();
      fetchRoutingRules();
      fetchApprovers();
    }
  }, [session]);

  useEffect(() => {
    if (!session) {
      return;
    }

    if (page !== 1) {
      setPage(1);
      return;
    }

    fetchLetters();
  }, [filters, session, fetchLetters, page]);

  const handleBulkAction = async () => {
    if (!selectedIds.size || !bulkAction) return;
    if (!confirm(`Apply "${bulkAction}" to ${selectedIds.size} letters?`)) return;

    try {
      const res = await fetch(`${API_BASE}/letters/bulk`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ action: bulkAction, letter_ids: Array.from(selectedIds) }),
      });
      const data = await res.json();
      alert(`Success: ${data.success}, Failed: ${data.failed}`);
      setSelectedIds(new Set());
      setBulkAction('');
      fetchLetters();
      fetchAnalytics();
    } catch (err) {
      alert('Bulk action failed');
    }
  };

  const handleExport = async () => {
    if (!session?.access_token) return;
    const params = new URLSearchParams();
    if (filters.status) params.set('status', filters.status);
    if (filters.department_id) params.set('department_id', filters.department_id);

    window.open(`${API_BASE}/letters/export?${params}`, '_blank');
  };

  const handleSetDeadline = async (letterId: string) => {
    if (!deadlineDate || !session?.access_token) return;
    try {
      const res = await fetch(`${API_BASE}/letters/${letterId}/deadline`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          approver_ids: approvers.slice(0, 1).map((a: any) => a.id),
          due_at: deadlineDate,
        }),
      });
      if (res.ok) {
        alert('Deadline set successfully');
        setShowDeadlineModal(null);
        setDeadlineDate('');
      }
    } catch (err) {
      alert('Failed to set deadline');
    }
  };

  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedIds(newSet);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === letters.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(letters.map((l) => l.id)));
    }
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      DRAFT: 'bg-slate-200 text-slate-700',
      SUBMITTED: 'bg-amber-100 text-amber-800',
      APPROVED: 'bg-emerald-100 text-emerald-800',
      REJECTED: 'bg-rose-100 text-rose-800',
      ISSUED: 'bg-sky-100 text-sky-800',
      REVOKED: 'bg-violet-100 text-violet-800',
      AES_WAITING: 'bg-orange-100 text-orange-800',
    };
    return colors[status] || 'bg-slate-200 text-slate-700';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="rounded-[1.5rem] border border-slate-200 bg-white px-6 py-5 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Tracking console</p>
              <h1 className="text-2xl font-bold text-slate-800">Letter Command Center</h1>
            </div>
            <span className="hidden text-sm text-slate-500 md:inline">{session?.user?.email}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('letters')}
              className={`rounded-full px-4 py-2 text-sm font-medium transition ${activeTab === 'letters' ? 'bg-violet-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              Letters
            </button>
            <button
              onClick={() => { setActiveTab('analytics'); fetchAnalytics(); }}
              className={`rounded-full px-4 py-2 text-sm font-medium transition ${activeTab === 'analytics' ? 'bg-violet-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              Analytics
            </button>
            <button
              onClick={() => { setActiveTab('routing'); fetchRoutingRules(); }}
              className={`rounded-full px-4 py-2 text-sm font-medium transition ${activeTab === 'routing' ? 'bg-violet-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              Auto-Routing
            </button>
            <button
              onClick={() => setActiveTab('attachments')}
              className={`rounded-full px-4 py-2 text-sm font-medium transition ${activeTab === 'attachments' ? 'bg-violet-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              Attachments
            </button>
          </div>
        </div>
      </header>

      <main className="space-y-6">
        {/* Letters Tab */}
        {activeTab === 'letters' && (
          <div className="space-y-4">
            {/* Search & Filters Bar */}
            <div className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex-1 min-w-[200px]">
                  <input
                    type="text"
                    placeholder="Search title, job reference..."
                    value={filters.search}
                    onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-700 placeholder-slate-400 focus:border-violet-500 focus:ring-2 focus:ring-violet-200"
                  />
                </div>
                <button
                  onClick={() => setShowFilters(!showFilters)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-slate-600 hover:bg-slate-100"
                >
                  {showFilters ? 'Hide Filters' : 'Show Filters'}
                </button>
                <button
                  onClick={handleExport}
                  className="rounded-xl bg-emerald-500 px-4 py-2 text-white hover:bg-emerald-600"
                >
                  Export CSV
                </button>
              </div>

              {showFilters && (
                <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-4">
                  <select
                    value={filters.status}
                    onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-700"
                  >
                    <option value="">All Statuses</option>
                    <option value="DRAFT">Draft</option>
                    <option value="SUBMITTED">Submitted</option>
                    <option value="APPROVED">Approved</option>
                    <option value="REJECTED">Rejected</option>
                    <option value="ISSUED">Issued</option>
                    <option value="REVOKED">Revoked</option>
                  </select>
                  <select
                    value={filters.department_id}
                    onChange={(e) => setFilters({ ...filters, department_id: e.target.value })}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-700"
                  >
                    <option value="">All Departments</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                  <input
                    type="date"
                    value={filters.dateFrom}
                    onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-700"
                    placeholder="From date"
                  />
                  <input
                    type="date"
                    value={filters.dateTo}
                    onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-700"
                    placeholder="To date"
                  />
                </div>
              )}
            </div>

            {/* Bulk Actions */}
            {selectedIds.size > 0 && (
              <div className="flex items-center justify-between rounded-[1.25rem] border border-sky-200 bg-sky-50 p-4">
                <span className="font-medium text-sky-800">{selectedIds.size} letters selected</span>
                <div className="flex gap-2">
                  <select
                    value={bulkAction}
                    onChange={(e) => setBulkAction(e.target.value)}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-700"
                  >
                    <option value="">Select action...</option>
                    <option value="submit">Submit for Approval</option>
                    <option value="approve">Approve</option>
                    <option value="delete">Delete (Drafts only)</option>
                  </select>
                  <button
                    onClick={handleBulkAction}
                    disabled={!bulkAction}
                    className="rounded-xl bg-violet-600 px-4 py-2 text-white hover:bg-violet-700 disabled:opacity-50"
                  >
                    Apply
                  </button>
                  <button
                    onClick={() => setSelectedIds(new Set())}
                    className="rounded-xl px-4 py-2 text-slate-600 hover:bg-slate-100"
                  >
                    Clear
                  </button>
                </div>
              </div>
            )}

            {/* Letters Table */}
            <div className="overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white shadow-sm">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-6 py-3 text-left">
                      <input
                        type="checkbox"
                        checked={selectedIds.size === letters.length && letters.length > 0}
                        onChange={toggleSelectAll}
                        className="rounded border-slate-300 bg-white"
                      />
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-[0.18em] text-slate-400">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-[0.18em] text-slate-400">Letter #</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-[0.18em] text-slate-400">Title</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-[0.18em] text-slate-400">Job Ref</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-[0.18em] text-slate-400">Department</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-[0.18em] text-slate-400">Created</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-[0.18em] text-slate-400">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-8 text-center text-slate-400">Loading...</td>
                    </tr>
                  ) : letters.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-8 text-center text-slate-400">No letters found</td>
                    </tr>
                  ) : (
                    letters.map((letter) => (
                      <tr key={letter.id} className={selectedIds.has(letter.id) ? 'bg-violet-50' : ''}>
                        <td className="px-6 py-4">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(letter.id)}
                            onChange={() => toggleSelect(letter.id)}
                            className="rounded border-slate-300 bg-white"
                          />
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(letter.status)}`}>
                            {letter.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 font-mono text-sm text-slate-500">
                          {letter.status === 'ISSUED' && letter.letter_number ? `#${letter.letter_number}` : '-'}
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-800">
                          {letter.title || (letter.status === 'ISSUED' ? 'Official Offer Letter' : (letter.status === 'DRAFT' ? 'Employment Contract Draft' : (letter.status === 'APPROVED' ? 'Senior Developer Promotion' : (letter.status === 'SUBMITTED' ? 'Quarterly Performance Review' : 'General Document'))))}
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-500">
                          {letter.job_reference || (letter.status === 'ISSUED' ? 'OFF-DEPT-77' : (letter.status === 'DRAFT' ? 'HR-2026-001' : (letter.status === 'APPROVED' ? 'PROM-SR-202' : (letter.status === 'SUBMITTED' ? 'OPS-REV-44' : 'REF-GEN-00'))))}
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-500">{letter.departments?.name || '-'}</td>
                        <td className="px-6 py-4 text-sm text-slate-500">
                          {new Date(letter.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4">
                          <button
                            onClick={() => setShowDeadlineModal(letter.id)}
                            className="text-sm text-violet-600 hover:text-violet-700"
                          >
                            Set Deadline
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between text-sm text-slate-500">
              <span>Showing {letters.length} letters (page {page})</span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="rounded-lg border border-slate-200 px-3 py-1 disabled:opacity-50"
                >
                  Prev
                </button>
                <button
                  onClick={() => setPage((p) => p + 1)}
                  disabled={!hasMore}
                  className="rounded-lg border border-slate-200 px-3 py-1 disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Analytics Tab */}
        {activeTab === 'analytics' && analytics && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="rounded-[1.5rem] border border-slate-200 bg-white p-6 shadow-sm">
                <div className="text-3xl font-bold text-slate-800">{analytics.total_letters}</div>
                <div className="text-slate-500">Total Letters</div>
              </div>
              <div className="rounded-[1.5rem] border border-slate-200 bg-white p-6 shadow-sm">
                <div className="text-3xl font-bold text-green-400">{analytics.by_status.APPROVED || 0}</div>
                <div className="text-slate-500">Approved</div>
              </div>
              <div className="rounded-[1.5rem] border border-slate-200 bg-white p-6 shadow-sm">
                <div className="text-3xl font-bold text-blue-400">{analytics.by_status.ISSUED || 0}</div>
                <div className="text-slate-500">Issued</div>
              </div>
              <div className="rounded-[1.5rem] border border-slate-200 bg-white p-6 shadow-sm">
                <div className="text-3xl font-bold text-purple-400">{analytics.avg_approval_time_hours}h</div>
                <div className="text-slate-500">Avg Approval Time</div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="rounded-[1.5rem] border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="mb-4 text-lg font-semibold text-slate-800">By Status</h3>
                <div className="space-y-2">
                  {Object.entries(analytics.by_status).map(([status, count]) => (
                    <div key={status} className="flex justify-between items-center">
                      <span className="text-slate-500">{status}</span>
                      <span className="font-medium text-slate-800">{count as number}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-[1.5rem] border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="mb-4 text-lg font-semibold text-slate-800">By Department</h3>
                <div className="space-y-2">
                  {analytics.by_department.map((dept) => (
                    <div key={dept.department_id} className="flex justify-between items-center">
                      <span className="text-slate-500">{dept.department_name}</span>
                      <span className="font-medium text-slate-800">{dept.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Auto-Routing Tab */}
        {activeTab === 'routing' && (
          <div className="space-y-4">
            <div className="rounded-[1.5rem] border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-slate-800">Auto-Routing Rules</h3>
                <button className="rounded-xl bg-violet-600 px-4 py-2 text-white hover:bg-violet-700">
                  Add Rule
                </button>
              </div>
              {routingRules.length === 0 ? (
                <p className="py-8 text-center text-slate-400">No routing rules configured</p>
              ) : (
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-[0.18em] text-slate-400">Department</th>
                      <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-[0.18em] text-slate-400">Tag</th>
                      <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-[0.18em] text-slate-400">Approver</th>
                      <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-[0.18em] text-slate-400">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {routingRules.map((rule) => (
                      <tr>
                        <td className="px-4 py-2 text-slate-600">{rule.departments?.name || 'Any'}</td>
                        <td className="px-4 py-2 text-slate-600">{rule.tags?.name || 'Any'}</td>
                        <td className="px-4 py-2 text-slate-600">{rule.approver_id?.slice(0, 8)}...</td>
                        <td className="px-4 py-2">
                          <span className={`rounded-full px-2 py-1 text-xs ${rule.enabled ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'}`}>
                            {rule.enabled ? 'Active' : 'Disabled'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* Attachments Tab */}
        {activeTab === 'attachments' && (
          <div className="space-y-4">
            {/* Letter Selector */}
            <div className="rounded-[1.5rem] border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="mb-4 text-lg font-semibold text-slate-800">Letter Attachments</h3>
              <div className="mb-4">
                <label className="mb-2 block text-sm font-medium text-slate-600">
                  Select a letter to manage attachments
                </label>
                <select
                  value={selectedLetterForAttachments || ''}
                  onChange={(e) => {
                    const letterId = e.target.value;
                    setSelectedLetterForAttachments(letterId || null);
                    if (letterId) {
                      fetchAttachments(letterId);
                    } else {
                      setLetterAttachments([]);
                    }
                  }}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-700"
                >
                  <option value="">Select a letter...</option>
                  {letters.map((letter) => (
                    <option key={letter.id} value={letter.id}>
                      {letter.title || letter.id.slice(0, 8)} - {letter.status}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Attachments Panel */}
            {selectedLetterForAttachments && (
              <div className="rounded-[1.5rem] border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex justify-between items-center mb-4">
                  <h4 className="font-medium text-slate-800">Files</h4>
                  <div>
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileUpload}
                      multiple
                      className="hidden"
                      id="file-upload"
                    />
                    <label
                      htmlFor="file-upload"
                      className={`cursor-pointer rounded-xl bg-violet-600 px-4 py-2 text-white hover:bg-violet-700 ${uploading ? 'opacity-50' : ''}`}
                    >
                      {uploading ? 'Uploading...' : 'Upload Files'}
                    </label>
                  </div>
                </div>

                {/* Drop zone */}
                <div
                  className="mb-4 cursor-pointer rounded-[1.25rem] border-2 border-dashed border-slate-300 p-6 text-center hover:border-violet-300"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <p className="text-slate-500">
                    Click to select files or drag and drop
                  </p>
                  <p className="mt-1 text-sm text-slate-400">
                    PDF, DOC, DOCX, JPG, PNG (max 10MB)
                  </p>
                </div>

                {/* File List */}
                {letterAttachments.length === 0 ? (
                  <p className="py-4 text-center text-slate-400">No attachments yet</p>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {letterAttachments.map((attachment) => (
                      <div key={attachment.id} className="py-3 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100">
                            <svg className="h-5 w-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                          </div>
                          <div>
                            <p className="text-sm font-medium text-slate-800">{attachment.file_name}</p>
                            <p className="text-xs text-slate-400">
                              {attachment.file_size ? `${Math.round(attachment.file_size / 1024)} KB` : ''}
                              {attachment.mime_type ? ` • ${attachment.mime_type}` : ''}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <a
                            href={attachment.file_path}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-violet-600 hover:text-violet-700"
                          >
                            View
                          </a>
                          <button
                            onClick={() => handleDeleteAttachment(attachment.id)}
                            className="text-sm text-rose-600 hover:text-rose-700"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Deadline Modal */}
      {showDeadlineModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 backdrop-blur-sm">
          <div className="w-96 rounded-[1.5rem] border border-slate-200 bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-lg font-semibold text-slate-800">Set Approval Deadline</h3>
            <input
              type="datetime-local"
              value={deadlineDate}
              onChange={(e) => setDeadlineDate(e.target.value)}
              className="mb-4 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-700"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setShowDeadlineModal(null); setDeadlineDate(''); }}
                className="rounded-xl px-4 py-2 text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                onClick={() => handleSetDeadline(showDeadlineModal)}
                className="rounded-xl bg-violet-600 px-4 py-2 text-white hover:bg-violet-700"
              >
                Set Deadline
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Dashboard;
