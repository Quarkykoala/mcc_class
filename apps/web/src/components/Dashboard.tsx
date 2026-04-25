import { useState, useEffect, useCallback, useRef } from 'react';
import { auth } from '../lib/auth';
import { API_BASE } from '../lib/api';

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

const EMPTY_ANALYTICS: Analytics = {
  total_letters: 0,
  by_status: {},
  by_department: [],
  avg_approval_time_hours: 0,
};

export function Dashboard() {
  const [session, setSession] = useState<any>(null);
  const [letters, setLetters] = useState<Letter[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<Letter[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [departments, setDepartments] = useState<any[]>([]);
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
  const [showFilters, setShowFilters] = useState(false);
  const [routingRules, setRoutingRules] = useState<any[]>([]);
  const [showDeadlineModal, setShowDeadlineModal] = useState<string | null>(null);
  const [deadlineDate, setDeadlineDate] = useState('');
  const [approvers, setApprovers] = useState<any[]>([]);
  const [selectedLetterForAttachments, setSelectedLetterForAttachments] = useState<string | null>(null);
  const [letterAttachments, setLetterAttachments] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = auth.onAuthStateChange((_event: string, nextSession: any) => setSession(nextSession));
    return () => sub.subscription.unsubscribe();
  }, []);

  const getToken = () => auth.getAccessToken() ?? session?.access_token ?? null;

  const authedFetch = async (path: string, options: RequestInit = {}) => {
    const token = getToken();
    return fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
    });
  };

  const isUnauthorized = async (res: Response) => {
    if (res.status !== 401) return false;
    setAuthError('Dashboard session expired. Please sign in again.');
    await auth.signOut();
    return true;
  };

  const fetchLetters = useCallback(async () => {
    if (!getToken()) return;
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

      const res = await authedFetch(`/letters?${params}`);
      if (await isUnauthorized(res)) {
        setLetters([]);
        setHasMore(false);
        return;
      }
      if (!res.ok) throw new Error(`Failed to load letters (${res.status})`);
      const data = await res.json();
      setLetters(data.data || []);
      setHasMore(Boolean(data?.meta?.hasMore));
    } catch (err) {
      console.error('Error fetching letters:', err);
      setLetters([]);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, [filters, page, session]);

  const fetchAnalytics = useCallback(async () => {
    if (!getToken()) return;
    try {
      const res = await authedFetch('/analytics/summary');
      if (await isUnauthorized(res)) {
        setAnalytics(EMPTY_ANALYTICS);
        return;
      }
      if (!res.ok) throw new Error(`Failed to load analytics (${res.status})`);
      const data: Partial<Analytics> = await res.json();
      setAnalytics({
        total_letters: typeof data.total_letters === 'number' ? data.total_letters : 0,
        by_status: data.by_status && typeof data.by_status === 'object' ? data.by_status : {},
        by_department: Array.isArray(data.by_department) ? data.by_department : [],
        avg_approval_time_hours: typeof data.avg_approval_time_hours === 'number' ? data.avg_approval_time_hours : 0,
      });
    } catch (err) {
      console.error('Error fetching analytics:', err);
      setAnalytics(EMPTY_ANALYTICS);
    }
  }, [session]);

  const fetchDepartments = async () => {
    try {
      const res = await authedFetch('/departments');
      if (await isUnauthorized(res)) {
        setDepartments([]);
        return;
      }
      if (!res.ok) throw new Error(`Failed to load departments (${res.status})`);
      const data = await res.json();
      setDepartments(data || []);
    } catch (err) {
      console.error('Error fetching departments:', err);
      setDepartments([]);
    }
  };

  const fetchRoutingRules = async () => {
    if (!getToken()) return;
    try {
      const res = await authedFetch('/auto-routing-rules');
      if (await isUnauthorized(res)) {
        setRoutingRules([]);
        return;
      }
      if (!res.ok) throw new Error(`Failed to load routing rules (${res.status})`);
      const data = await res.json();
      setRoutingRules(data || []);
    } catch (err) {
      console.error('Error fetching routing rules:', err);
      setRoutingRules([]);
    }
  };

  const fetchApprovers = async () => {
    if (!getToken()) return;
    try {
      const res = await authedFetch('/approvers');
      if (await isUnauthorized(res)) {
        setApprovers([]);
        return;
      }
      if (!res.ok) throw new Error(`Failed to load approvers (${res.status})`);
      const data = await res.json();
      setApprovers(data || []);
    } catch (err) {
      console.error('Error fetching approvers:', err);
      setApprovers([]);
    }
  };

  const fetchPendingApprovals = async () => {
    if (!getToken()) return;
    try {
      const res = await authedFetch('/approvals/pending?context=COMPANY');
      if (await isUnauthorized(res)) {
        setPendingApprovals([]);
        return;
      }
      if (!res.ok) throw new Error(`Failed to load pending approvals (${res.status})`);
      const data = await res.json();
      setPendingApprovals(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error fetching pending approvals:', err);
      setPendingApprovals([]);
    }
  };

  const fetchAttachments = async (letterId: string) => {
    if (!getToken()) return;
    try {
      const res = await authedFetch(`/letters/${letterId}/attachments`);
      if (await isUnauthorized(res)) {
        setLetterAttachments([]);
        return;
      }
      if (!res.ok) throw new Error(`Failed to load attachments (${res.status})`);
      const data = await res.json();
      setLetterAttachments(data || []);
    } catch (err) {
      console.error('Error fetching attachments:', err);
      setLetterAttachments([]);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedLetterForAttachments || !getToken()) return;

    const files = event.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const res = await authedFetch('/attachments', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            letter_id: selectedLetterForAttachments,
            file_name: file.name,
            file_path: `local://${file.name}`,
            file_size: file.size,
            mime_type: file.type,
          }),
        });
        if (await isUnauthorized(res)) return;
      }
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
      const res = await authedFetch(`/attachments/${attachmentId}`, {
        method: 'DELETE',
      });
      if (await isUnauthorized(res)) return;
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
      setAuthError(null);
      fetchLetters();
      fetchAnalytics();
      fetchDepartments();
      fetchRoutingRules();
      fetchApprovers();
      fetchPendingApprovals();
    }
  }, [session]);

  useEffect(() => {
    if (!session) return;
    if (page !== 1) {
      setPage(1);
      return;
    }
    fetchLetters();
  }, [filters, session, fetchLetters, page]);

  const handleExport = async () => {
    if (!getToken()) return;
    const params = new URLSearchParams();
    if (filters.status) params.set('status', filters.status);
    if (filters.department_id) params.set('department_id', filters.department_id);
    window.open(`${API_BASE}/letters/export?${params}`, '_blank');
  };

  const handleSetDeadline = async (letterId: string) => {
    if (!deadlineDate || !getToken()) return;
    try {
      const res = await authedFetch(`/letters/${letterId}/deadline`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          approver_ids: approvers.slice(0, 1).map((a: any) => a.id),
          due_at: deadlineDate,
        }),
      });
      if (await isUnauthorized(res)) return;
      if (res.ok) {
        alert('Deadline set successfully');
        setShowDeadlineModal(null);
        setDeadlineDate('');
      }
    } catch (err) {
      alert('Failed to set deadline');
    }
  };

  const getStatusBadgeClass = (status: string) => {
    const classes: Record<string, string> = {
      DRAFT: 'bg-gray-200 text-gray-700',
      SUBMITTED: 'bg-warning text-white',
      APPROVED: 'bg-success text-white',
      REJECTED: 'bg-danger text-white',
      ISSUED: 'bg-info text-white',
      REVOKED: 'bg-purple text-white',
      AES_WAITING: 'bg-orange text-white',
    };
    return classes[status] || 'bg-gray-200 text-gray-700';
  };

  const safeAnalytics = analytics ?? EMPTY_ANALYTICS;

  return (
    <div className="space-y-12">
      {authError && (
        <div className="card">
          <div className="card-body p-5 text-danger font-medium">
            {authError}
          </div>
        </div>
      )}
      {/* Stats Cards Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="card card-stats">
          <div className="card-header card-header-warning card-header-icon">
            <div className="card-icon">
              <i className="material-icons">content_copy</i>
            </div>
            <p className="card-category">Total Letters</p>
            <h3 className="card-title">{safeAnalytics.total_letters}</h3>
          </div>
          <div className="card-footer">
            <div className="stats">
              <i className="material-icons text-danger">warning</i>
              <a href="#pablo">View details</a>
            </div>
          </div>
        </div>
        <div className="card card-stats">
          <div className="card-header card-header-success card-header-icon">
            <div className="card-icon">
              <i className="material-icons">check_circle</i>
            </div>
            <p className="card-category">Approved</p>
            <h3 className="card-title">{safeAnalytics.by_status.APPROVED || 0}</h3>
          </div>
          <div className="card-footer">
            <div className="stats">
              <i className="material-icons">date_range</i> Last 24 Hours
            </div>
          </div>
        </div>
        <div className="card card-stats">
          <div className="card-header card-header-info card-header-icon">
            <div className="card-icon">
              <i className="material-icons">print</i>
            </div>
            <p className="card-category">Issued</p>
            <h3 className="card-title">{safeAnalytics.by_status.ISSUED || 0}</h3>
          </div>
          <div className="card-footer">
            <div className="stats">
              <i className="material-icons">update</i> Just Updated
            </div>
          </div>
        </div>
        <div className="card card-stats">
          <div className="card-header card-header-rose card-header-icon">
            <div className="card-icon">
              <i className="material-icons">timer</i>
            </div>
            <p className="card-category">Avg Time</p>
            <h3 className="card-title">{safeAnalytics.avg_approval_time_hours}h</h3>
          </div>
          <div className="card-footer">
            <div className="stats">
              <i className="material-icons">local_offer</i> Tracked by system
            </div>
          </div>
        </div>
      </div>

      {/* Main Tabs Navigation */}
      <div className="flex justify-center mb-8">
        <ul className="nav nav-pills nav-pills-primary flex gap-2 p-1 bg-white/50 rounded-xl shadow-sm border border-white">
          <li className="nav-item">
            <a 
              className={`nav-link flex items-center gap-2 px-6 py-2 rounded-lg font-bold text-xs uppercase transition-all ${activeTab === 'letters' ? 'bg-primary text-white shadow-md' : 'text-gray-500 hover:bg-white/80'}`} 
              href="#" onClick={(e) => { e.preventDefault(); setActiveTab('letters'); }}
            >
              <i className="material-icons text-lg">list</i> Letters
            </a>
          </li>
          <li className="nav-item">
            <a 
              className={`nav-link flex items-center gap-2 px-6 py-2 rounded-lg font-bold text-xs uppercase transition-all ${activeTab === 'analytics' ? 'bg-primary text-white shadow-md' : 'text-gray-500 hover:bg-white/80'}`} 
              href="#" onClick={(e) => { e.preventDefault(); setActiveTab('analytics'); fetchAnalytics(); }}
            >
              <i className="material-icons text-lg">assessment</i> Analytics
            </a>
          </li>
          <li className="nav-item">
            <a 
              className={`nav-link flex items-center gap-2 px-6 py-2 rounded-lg font-bold text-xs uppercase transition-all ${activeTab === 'routing' ? 'bg-primary text-white shadow-md' : 'text-gray-500 hover:bg-white/80'}`} 
              href="#" onClick={(e) => { e.preventDefault(); setActiveTab('routing'); fetchRoutingRules(); }}
            >
              <i className="material-icons text-lg">account_tree</i> Auto-Routing
            </a>
          </li>
          <li className="nav-item">
            <a 
              className={`nav-link flex items-center gap-2 px-6 py-2 rounded-lg font-bold text-xs uppercase transition-all ${activeTab === 'attachments' ? 'bg-primary text-white shadow-md' : 'text-gray-500 hover:bg-white/80'}`} 
              href="#" onClick={(e) => { e.preventDefault(); setActiveTab('attachments'); }}
            >
              <i className="material-icons text-lg">attach_file</i> Attachments
            </a>
          </li>
        </ul>
      </div>

      <div className="content-area">
        {/* Letters Tab */}
        {activeTab === 'letters' && (
          <div className="space-y-12">
            <div className="card">
              <div className="card-header card-header-primary">
                <h4 className="card-title">Letter Management</h4>
                <p className="card-category">Track and manage the lifecycle of official letters.</p>
              </div>
              <div className="card-body">
                <div className="mb-8 p-5 rounded-xl bg-warning/10 border border-warning/20">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-[11px] font-bold uppercase text-warning">My Pending Approvals</p>
                      <h5 className="text-lg font-bold text-gray-700 mt-1">{pendingApprovals.length} item(s) need your action</h5>
                    </div>
                    <button className="btn btn-link btn-warning btn-sm" onClick={() => void fetchPendingApprovals()}>
                      Refresh
                    </button>
                  </div>
                  {pendingApprovals.length > 0 && (
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      {pendingApprovals.slice(0, 4).map((letter) => (
                        <div key={letter.id} className="p-4 rounded-lg bg-white border border-warning/10">
                          <p className="text-sm font-bold text-gray-700">{letter.title || 'Untitled'}</p>
                          <p className="text-[11px] text-gray-500 mt-1">{letter.job_reference || 'No C Number'}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
                  <div className="flex-1 min-w-[300px]">
                    <div className="form-group">
                      <input
                        type="text"
                        placeholder="Search title, C Number / Customs Job Reference..."
                        value={filters.search}
                        onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                        className="form-control"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowFilters(!showFilters)}
                      className={`btn btn-sm ${showFilters ? 'btn-rose' : 'btn-white'} border border-gray-200`}
                    >
                      <i className="material-icons text-base">filter_list</i>
                      {showFilters ? 'Hide Filters' : 'Show Filters'}
                    </button>
                    <button
                      onClick={handleExport}
                      className="btn btn-success btn-sm"
                    >
                      <i className="material-icons text-base">file_download</i>
                      Export CSV
                    </button>
                  </div>
                </div>

                {showFilters && (
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8 p-6 bg-gray-50 rounded-lg border border-gray-100">
                    <select
                      value={filters.status}
                      onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                      className="form-control"
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
                      className="form-control"
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
                      className="form-control"
                    />
                    <input
                      type="date"
                      value={filters.dateTo}
                      onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
                      className="form-control"
                    />
                  </div>
                )}

                <div className="table-responsive">
                  <table className="table table-hover w-full text-left">
                    <thead className="text-primary font-bold uppercase text-[11px]">
                      <tr>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4">Letter #</th>
                        <th className="py-3 px-4">Title</th>
                        <th className="py-3 px-4">Department</th>
                        <th className="py-3 px-4">Created</th>
                        <th className="py-3 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="text-sm divide-y divide-gray-100">
                      {loading ? (
                        <tr><td colSpan={6} className="py-12 text-center text-gray-400">Loading records...</td></tr>
                      ) : letters.length === 0 ? (
                        <tr><td colSpan={6} className="py-12 text-center text-gray-400">No letters matching filters.</td></tr>
                      ) : (
                        letters.map((letter) => (
                          <tr key={letter.id} className="hover:bg-gray-50">
                            <td className="py-4 px-4">
                              <span className={`px-2 py-0.5 text-[10px] font-bold rounded uppercase ${getStatusBadgeClass(letter.status)}`}>
                                {letter.status}
                              </span>
                              {letter.status === 'SUBMITTED' && letter.approval_summary && (
                                <div className="text-[10px] text-gray-500 mt-1 font-medium">
                                  {letter.approval_summary.pending} pending
                                </div>
                              )}
                            </td>
                            <td className="py-4 px-4 font-mono text-xs text-gray-500">
                              {letter.status === 'ISSUED' && letter.letter_number ? `#${letter.letter_number}` : '-'}
                            </td>
                            <td className="py-4 px-4 font-medium">
                              {letter.title || 'Official Document'}
                              <div className="text-[10px] font-mono font-bold text-info mt-0.5">{letter.job_reference || 'C-N/A'}</div>
                            </td>
                            <td className="py-4 px-4 text-gray-600">{letter.departments?.name || '-'}</td>
                            <td className="py-4 px-4 text-gray-500">
                              {new Date(letter.created_at).toLocaleDateString()}
                            </td>
                            <td className="py-4 px-4 text-right">
                              <button
                                onClick={() => setShowDeadlineModal(letter.id)}
                                className="btn btn-link btn-just-icon p-1"
                                title="Set Deadline"
                              >
                                <i className="material-icons text-primary text-xl">event_available</i>
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="flex items-center justify-between mt-8 pt-6 border-t border-gray-100 text-[11px] font-bold text-gray-400 uppercase">
                  <span>Showing {letters.length} results</span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="btn btn-white btn-sm border border-gray-200 disabled:opacity-30"
                    >
                      Prev
                    </button>
                    <button
                      onClick={() => setPage((p) => p + 1)}
                      disabled={!hasMore}
                      className="btn btn-white btn-sm border border-gray-200 disabled:opacity-30"
                    >
                      Next
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Analytics Tab */}
        {activeTab === 'analytics' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="card">
              <div className="card-header card-header-success">
                <h4 className="card-title">Volume by Status</h4>
                <p className="card-category">Distribution across the document lifecycle.</p>
              </div>
              <div className="card-body p-6">
                 <div className="space-y-4">
                    {Object.entries(safeAnalytics.by_status).map(([status, count]) => (
                      <div key={status} className="flex justify-between items-center group">
                        <span className="text-sm font-medium text-gray-600 group-hover:text-primary transition-colors">{status}</span>
                        <div className="flex items-center gap-4 flex-1 mx-6">
                           <div className="h-1 bg-gray-100 rounded-full flex-1 overflow-hidden">
                              <div 
                                className={`h-full ${getStatusBadgeClass(status).split(' ')[0]}`} 
                                style={{ width: `${((count as number) / Math.max(safeAnalytics.total_letters, 1)) * 100}%` }}
                              />
                           </div>
                           <span className="text-sm font-bold w-8 text-right">{count as number}</span>
                        </div>
                      </div>
                    ))}
                 </div>
              </div>
            </div>

            <div className="card">
              <div className="card-header card-header-info">
                <h4 className="card-title">Departmental Reach</h4>
                <p className="card-category">Letters processed per business unit.</p>
              </div>
              <div className="card-body p-6">
                 <div className="space-y-4">
                    {safeAnalytics.by_department.map((dept) => (
                      <div key={dept.department_id} className="flex justify-between items-center group">
                        <span className="text-sm font-medium text-gray-600 group-hover:text-info transition-colors">{dept.department_name}</span>
                        <div className="flex items-center gap-4 flex-1 mx-6">
                           <div className="h-1 bg-gray-100 rounded-full flex-1 overflow-hidden">
                              <div 
                                className="h-full bg-info" 
                                style={{ width: `${(dept.count / Math.max(safeAnalytics.total_letters, 1)) * 100}%` }}
                              />
                           </div>
                           <span className="text-sm font-bold w-8 text-right">{dept.count}</span>
                        </div>
                      </div>
                    ))}
                 </div>
              </div>
            </div>
          </div>
        )}

        {/* Auto-Routing Tab */}
        {activeTab === 'routing' && (
          <div className="card">
            <div className="card-header card-header-rose flex justify-between items-center">
               <div>
                <h4 className="card-title">Auto-Routing Rules</h4>
                <p className="card-category">Configured logic for automated approval flows.</p>
               </div>
               <button className="btn btn-white btn-sm font-bold">
                 <i className="material-icons text-base">add</i> Add Rule
               </button>
            </div>
            <div className="card-body">
              {routingRules.length === 0 ? (
                <div className="py-16 text-center text-gray-400">
                  <i className="material-icons text-6xl mb-4 block opacity-20">route</i>
                  No routing rules found.
                </div>
              ) : (
                <div className="table-responsive">
                  <table className="table w-full text-left">
                    <thead className="text-rose font-bold uppercase text-[11px]">
                      <tr>
                        <th className="py-3 px-4">Department</th>
                        <th className="py-3 px-4">Tag</th>
                        <th className="py-3 px-4">Approver</th>
                        <th className="py-3 px-4">Status</th>
                      </tr>
                    </thead>
                    <tbody className="text-sm">
                      {routingRules.map((rule) => (
                        <tr key={rule.id} className="border-b border-gray-50">
                          <td className="py-4 px-4 font-medium text-gray-700">{rule.departments?.name || 'Any'}</td>
                          <td className="py-4 px-4 text-gray-500">{rule.tags?.name || 'Any'}</td>
                          <td className="py-4 px-4 text-xs font-mono">{rule.approver_id?.slice(0, 12)}...</td>
                          <td className="py-4 px-4">
                            <span className={`px-2 py-0.5 text-[10px] font-bold rounded uppercase ${rule.enabled ? 'bg-success text-white' : 'bg-gray-200 text-gray-600'}`}>
                              {rule.enabled ? 'Active' : 'Disabled'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Attachments Tab */}
        {activeTab === 'attachments' && (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-8">
            <div className="card">
               <div className="card-header card-header-warning">
                  <h4 className="card-title">Select Letter</h4>
                  <p className="card-category">Choose a document to manage.</p>
               </div>
               <div className="card-body">
                  <div className="form-group pt-4">
                    <select
                      value={selectedLetterForAttachments || ''}
                      onChange={(e) => {
                        const letterId = e.target.value;
                        setSelectedLetterForAttachments(letterId || null);
                        if (letterId) fetchAttachments(letterId);
                        else setLetterAttachments([]);
                      }}
                      className="form-control"
                    >
                      <option value="">Select a letter...</option>
                      {letters.map((letter) => (
                        <option key={letter.id} value={letter.id}>
                          {letter.title || letter.id.slice(0, 8)}
                        </option>
                      ))}
                    </select>
                  </div>
                  {selectedLetterForAttachments && (
                    <div className="mt-8 p-4 bg-gray-50 rounded-lg text-xs font-medium text-gray-500 italic">
                       Selected ID: {selectedLetterForAttachments}
                    </div>
                  )}
               </div>
            </div>

            <div className="card">
               <div className="card-header card-header-info flex justify-between items-center">
                  <div>
                    <h4 className="card-title">Attachment Repository</h4>
                    <p className="card-category">Stored files for the selected letter.</p>
                  </div>
                  {selectedLetterForAttachments && (
                    <label className={`btn btn-white btn-sm mb-0 cursor-pointer ${uploading ? 'opacity-50' : ''}`}>
                      <i className="material-icons text-base">cloud_upload</i>
                      {uploading ? 'Uploading...' : 'Upload'}
                      <input type="file" ref={fileInputRef} onChange={handleFileUpload} multiple className="hidden" />
                    </label>
                  )}
               </div>
               <div className="card-body">
                  {!selectedLetterForAttachments ? (
                    <div className="py-16 text-center text-gray-400">
                       Select a letter from the left panel to view its files.
                    </div>
                  ) : letterAttachments.length === 0 ? (
                    <div className="py-16 text-center text-gray-400">
                       No attachments found for this letter.
                    </div>
                  ) : (
                    <div className="space-y-3">
                       {letterAttachments.map((attachment) => (
                         <div key={attachment.id} className="p-4 flex items-center justify-between bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors border border-gray-100">
                            <div className="flex items-center gap-3">
                               <div className="w-10 h-10 rounded-lg bg-white shadow-sm flex items-center justify-center text-info">
                                  <i className="material-icons">insert_drive_file</i>
                               </div>
                               <div>
                                  <p className="text-sm font-bold text-gray-700">{attachment.file_name}</p>
                                  <p className="text-[10px] text-gray-400 uppercase font-bold">
                                     {attachment.file_size ? `${Math.round(attachment.file_size / 1024)} KB` : ''} • {attachment.mime_type || 'Unknown'}
                                  </p>
                               </div>
                            </div>
                            <div className="flex gap-2">
                               <a href={attachment.file_path} target="_blank" rel="noopener noreferrer" className="btn btn-link btn-info btn-just-icon p-1">
                                  <i className="material-icons text-xl">visibility</i>
                               </a>
                               <button onClick={() => handleDeleteAttachment(attachment.id)} className="btn btn-link btn-danger btn-just-icon p-1">
                                  <i className="material-icons text-xl">delete_outline</i>
                               </button>
                            </div>
                         </div>
                       ))}
                    </div>
                  )}
               </div>
            </div>
          </div>
        )}
      </div>

      {/* Deadline Modal */}
      {showDeadlineModal && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="card w-96 mt-0">
            <div className="card-header card-header-primary">
              <h4 className="card-title">Set Approval Deadline</h4>
            </div>
            <div className="card-body pt-8">
              <input
                type="datetime-local"
                value={deadlineDate}
                onChange={(e) => setDeadlineDate(e.target.value)}
                className="form-control mb-8"
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => { setShowDeadlineModal(null); setDeadlineDate(''); }}
                  className="btn btn-link text-gray-400"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleSetDeadline(showDeadlineModal)}
                  className="btn btn-primary"
                >
                  Save Deadline
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Dashboard;
