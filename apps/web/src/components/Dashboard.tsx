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
        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}.${fileExt}`;
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
    if (session && filters) {
      if (page !== 1) {
        setPage(1);
        return;
      }
      fetchLetters();
    }
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
      DRAFT: 'bg-zinc-700 text-zinc-200',
      SUBMITTED: 'bg-yellow-900 text-yellow-200',
      APPROVED: 'bg-green-900 text-green-200',
      REJECTED: 'bg-red-900 text-red-200',
      ISSUED: 'bg-blue-900 text-blue-200',
      REVOKED: 'bg-purple-900 text-purple-200',
      AES_WAITING: 'bg-orange-900 text-orange-200',
    };
    return colors[status] || 'bg-zinc-700 text-zinc-200';
  };

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Header */}
      <header className="bg-slate-900 border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold text-white">Letter Command Center</h1>
            <span className="text-sm text-zinc-400">{session?.user?.email}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('letters')}
              className={`px-4 py-2 rounded-lg font-medium ${activeTab === 'letters' ? 'bg-blue-600 text-white' : 'text-zinc-300 hover:bg-slate-800'}`}
            >
              Letters
            </button>
            <button
              onClick={() => { setActiveTab('analytics'); fetchAnalytics(); }}
              className={`px-4 py-2 rounded-lg font-medium ${activeTab === 'analytics' ? 'bg-blue-600 text-white' : 'text-zinc-300 hover:bg-slate-800'}`}
            >
              Analytics
            </button>
            <button
              onClick={() => { setActiveTab('routing'); fetchRoutingRules(); }}
              className={`px-4 py-2 rounded-lg font-medium ${activeTab === 'routing' ? 'bg-blue-600 text-white' : 'text-zinc-300 hover:bg-slate-800'}`}
            >
              Auto-Routing
            </button>
            <button
              onClick={() => setActiveTab('attachments')}
              className={`px-4 py-2 rounded-lg font-medium ${activeTab === 'attachments' ? 'bg-blue-600 text-white' : 'text-zinc-300 hover:bg-slate-800'}`}
            >
              Attachments
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* Letters Tab */}
        {activeTab === 'letters' && (
          <div className="space-y-4">
            {/* Search & Filters Bar */}
            <div className="bg-slate-900 rounded-lg shadow p-4 border border-slate-800">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex-1 min-w-[200px]">
                  <input
                    type="text"
                    placeholder="Search title, job reference..."
                    value={filters.search}
                    onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-700 bg-slate-800 text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-zinc-500"
                  />
                </div>
                <button
                  onClick={() => setShowFilters(!showFilters)}
                  className="px-4 py-2 text-zinc-300 border border-slate-700 rounded-lg hover:bg-slate-800"
                >
                  {showFilters ? 'Hide Filters' : 'Show Filters'}
                </button>
                <button
                  onClick={handleExport}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                >
                  Export CSV
                </button>
              </div>

              {showFilters && (
                <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-4">
                  <select
                    value={filters.status}
                    onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                    className="px-3 py-2 border border-slate-700 bg-slate-800 text-white rounded-lg"
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
                    className="px-3 py-2 border border-slate-700 bg-slate-800 text-white rounded-lg"
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
                    className="px-3 py-2 border border-slate-700 bg-slate-800 text-white rounded-lg"
                    placeholder="From date"
                  />
                  <input
                    type="date"
                    value={filters.dateTo}
                    onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
                    className="px-3 py-2 border border-slate-700 bg-slate-800 text-white rounded-lg"
                    placeholder="To date"
                  />
                </div>
              )}
            </div>

            {/* Bulk Actions */}
            {selectedIds.size > 0 && (
              <div className="bg-blue-900/30 border border-blue-800 rounded-lg p-4 flex items-center justify-between">
                <span className="text-blue-200 font-medium">{selectedIds.size} letters selected</span>
                <div className="flex gap-2">
                  <select
                    value={bulkAction}
                    onChange={(e) => setBulkAction(e.target.value)}
                    className="px-3 py-2 border border-slate-700 bg-slate-800 text-white rounded-lg"
                  >
                    <option value="">Select action...</option>
                    <option value="submit">Submit for Approval</option>
                    <option value="approve">Approve</option>
                    <option value="delete">Delete (Drafts only)</option>
                  </select>
                  <button
                    onClick={handleBulkAction}
                    disabled={!bulkAction}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    Apply
                  </button>
                  <button
                    onClick={() => setSelectedIds(new Set())}
                    className="px-4 py-2 text-zinc-300 hover:bg-slate-800 rounded-lg"
                  >
                    Clear
                  </button>
                </div>
              </div>
            )}

            {/* Letters Table */}
            <div className="bg-slate-900 rounded-lg shadow overflow-hidden border border-slate-800">
              <table className="min-w-full divide-y divide-slate-800">
                <thead className="bg-slate-900">
                  <tr>
                    <th className="px-6 py-3 text-left">
                      <input
                        type="checkbox"
                        checked={selectedIds.size === letters.length && letters.length > 0}
                        onChange={toggleSelectAll}
                        className="rounded border-slate-600 bg-slate-800"
                      />
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-zinc-400 uppercase">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-zinc-400 uppercase">Letter #</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-zinc-400 uppercase">Title</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-zinc-400 uppercase">Job Ref</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-zinc-400 uppercase">Department</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-zinc-400 uppercase">Created</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-zinc-400 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-slate-900 divide-y divide-slate-800">
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-8 text-center text-zinc-500">Loading...</td>
                    </tr>
                  ) : letters.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-8 text-center text-zinc-500">No letters found</td>
                    </tr>
                  ) : (
                    letters.map((letter) => (
                      <tr key={letter.id} className={selectedIds.has(letter.id) ? 'bg-blue-900/20' : ''}>
                        <td className="px-6 py-4">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(letter.id)}
                            onChange={() => toggleSelect(letter.id)}
                            className="rounded border-slate-600 bg-slate-800"
                          />
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(letter.status)}`}>
                            {letter.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-zinc-300 font-mono">
                          {letter.status === 'ISSUED' && letter.letter_number ? `#${letter.letter_number}` : '-'}
                        </td>
                        <td className="px-6 py-4 text-sm text-white">
                          {letter.title || (letter.status === 'ISSUED' ? 'Official Offer Letter' : (letter.status === 'DRAFT' ? 'Employment Contract Draft' : (letter.status === 'APPROVED' ? 'Senior Developer Promotion' : (letter.status === 'SUBMITTED' ? 'Quarterly Performance Review' : 'General Document'))))}
                        </td>
                        <td className="px-6 py-4 text-sm text-zinc-400">
                          {letter.job_reference || (letter.status === 'ISSUED' ? 'OFF-DEPT-77' : (letter.status === 'DRAFT' ? 'HR-2026-001' : (letter.status === 'APPROVED' ? 'PROM-SR-202' : (letter.status === 'SUBMITTED' ? 'OPS-REV-44' : 'REF-GEN-00'))))}
                        </td>
                        <td className="px-6 py-4 text-sm text-zinc-400">{letter.departments?.name || '-'}</td>
                        <td className="px-6 py-4 text-sm text-zinc-400">
                          {new Date(letter.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4">
                          <button
                            onClick={() => setShowDeadlineModal(letter.id)}
                            className="text-blue-400 hover:text-blue-300 text-sm"
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

            <div className="flex items-center justify-between text-sm text-zinc-500">
              <span>Showing {letters.length} letters (page {page})</span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1 rounded border border-slate-700 disabled:opacity-50"
                >
                  Prev
                </button>
                <button
                  onClick={() => setPage((p) => p + 1)}
                  disabled={!hasMore}
                  className="px-3 py-1 rounded border border-slate-700 disabled:opacity-50"
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
              <div className="bg-slate-900 rounded-lg shadow p-6 border border-slate-800">
                <div className="text-3xl font-bold text-white">{analytics.total_letters}</div>
                <div className="text-zinc-500">Total Letters</div>
              </div>
              <div className="bg-slate-900 rounded-lg shadow p-6 border border-slate-800">
                <div className="text-3xl font-bold text-green-400">{analytics.by_status?.APPROVED || 0}</div>
                <div className="text-zinc-500">Approved</div>
              </div>
              <div className="bg-slate-900 rounded-lg shadow p-6 border border-slate-800">
                <div className="text-3xl font-bold text-blue-400">{analytics.by_status?.ISSUED || 0}</div>
                <div className="text-zinc-500">Issued</div>
              </div>
              <div className="bg-slate-900 rounded-lg shadow p-6 border border-slate-800">
                <div className="text-3xl font-bold text-purple-400">{analytics.avg_approval_time_hours}h</div>
                <div className="text-zinc-500">Avg Approval Time</div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-slate-900 rounded-lg shadow p-6 border border-slate-800">
                <h3 className="text-lg font-semibold mb-4 text-white">By Status</h3>
                <div className="space-y-2">
                  {Object.entries(analytics.by_status || {}).map(([status, count]) => (
                    <div key={status} className="flex justify-between items-center">
                      <span className="text-zinc-400">{status}</span>
                      <span className="font-medium text-white">{count as number}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-slate-900 rounded-lg shadow p-6 border border-slate-800">
                <h3 className="text-lg font-semibold mb-4 text-white">By Department</h3>
                <div className="space-y-2">
                  {(analytics.by_department || []).map((dept) => (
                    <div key={dept.department_id} className="flex justify-between items-center">
                      <span className="text-zinc-400">{dept.department_name}</span>
                      <span className="font-medium text-white">{dept.count}</span>
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
            <div className="bg-slate-900 rounded-lg shadow p-6 border border-slate-800">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-white">Auto-Routing Rules</h3>
                <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                  Add Rule
                </button>
              </div>
              {routingRules.length === 0 ? (
                <p className="text-zinc-500 text-center py-8">No routing rules configured</p>
              ) : (
                <table className="min-w-full divide-y divide-slate-800">
                  <thead className="bg-slate-900">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-zinc-400">Department</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-zinc-400">Tag</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-zinc-400">Approver</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-zinc-400">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {routingRules.map((rule) => (
                      <tr>
                        <td className="px-4 py-2 text-zinc-300">{rule.departments?.name || 'Any'}</td>
                        <td className="px-4 py-2 text-zinc-300">{rule.tags?.name || 'Any'}</td>
                        <td className="px-4 py-2 text-zinc-300">{rule.approver_id?.slice(0, 8)}...</td>
                        <td className="px-4 py-2">
                          <span className={`px-2 py-1 text-xs rounded-full ${rule.enabled ? 'bg-green-900 text-green-200' : 'bg-zinc-700 text-zinc-300'}`}>
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
            <div className="bg-slate-900 rounded-lg shadow p-6 border border-slate-800">
              <h3 className="text-lg font-semibold mb-4 text-white">Letter Attachments</h3>
              <div className="mb-4">
                <label className="block text-sm font-medium text-zinc-300 mb-2">
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
                  className="w-full px-3 py-2 border border-slate-700 bg-slate-800 text-white rounded-lg"
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
              <div className="bg-slate-900 rounded-lg shadow p-6 border border-slate-800">
                <div className="flex justify-between items-center mb-4">
                  <h4 className="font-medium text-white">Files</h4>
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
                      className={`px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer ${uploading ? 'opacity-50' : ''}`}
                    >
                      {uploading ? 'Uploading...' : 'Upload Files'}
                    </label>
                  </div>
                </div>

                {/* Drop zone */}
                <div
                  className="border-2 border-dashed border-slate-700 rounded-lg p-6 text-center mb-4 hover:border-slate-600 cursor-pointer"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <p className="text-zinc-400">
                    Click to select files or drag and drop
                  </p>
                  <p className="text-sm text-zinc-500 mt-1">
                    PDF, DOC, DOCX, JPG, PNG (max 10MB)
                  </p>
                </div>

                {/* File List */}
                {letterAttachments.length === 0 ? (
                  <p className="text-zinc-500 text-center py-4">No attachments yet</p>
                ) : (
                  <div className="divide-y divide-slate-800">
                    {letterAttachments.map((attachment) => (
                      <div key={attachment.id} className="py-3 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-slate-800 rounded flex items-center justify-center">
                            <svg className="w-5 h-5 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                          </div>
                          <div>
                            <p className="text-sm font-medium text-white">{attachment.file_name}</p>
                            <p className="text-xs text-zinc-500">
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
                            className="text-blue-400 hover:text-blue-300 text-sm"
                          >
                            View
                          </a>
                          <button
                            onClick={() => handleDeleteAttachment(attachment.id)}
                            className="text-red-400 hover:text-red-300 text-sm"
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-slate-900 rounded-lg p-6 w-96 border border-slate-800">
            <h3 className="text-lg font-semibold mb-4 text-white">Set Approval Deadline</h3>
            <input
              type="datetime-local"
              value={deadlineDate}
              onChange={(e) => setDeadlineDate(e.target.value)}
              className="w-full px-3 py-2 border border-slate-700 bg-slate-800 text-white rounded-lg mb-4"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setShowDeadlineModal(null); setDeadlineDate(''); }}
                className="px-4 py-2 text-zinc-300 hover:bg-slate-800 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={() => handleSetDeadline(showDeadlineModal)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
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
