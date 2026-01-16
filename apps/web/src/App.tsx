import React, { useState, useEffect } from 'react';
import './App.css';

const API_BASE = 'http://localhost:3000/api';

interface Department {
  id: string;
  name: string;
  context: string;
}

interface Tag {
  id: string;
  name: string;
  context: string;
}

function App() {
  const [context, setContext] = useState<'COMPANY' | 'BCBA'>('COMPANY');
  const [departments, setDepartments] = useState<Department[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [selectedDept, setSelectedDept] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [content, setContent] = useState('');
  const [letters, setLetters] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [verificationData, setVerificationData] = useState<any>(null);
  const [verifyAccessKey, setVerifyAccessKey] = useState('');
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [requiresAccessKey, setRequiresAccessKey] = useState(false);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [emailLinks, setEmailLinks] = useState<any[]>([]);
  const [view, setView] = useState<'DASHBOARD' | 'AUDIT'>('DASHBOARD');
  const [committees, setCommittees] = useState<any[]>([]);

  const coerceArray = (value: unknown) => (Array.isArray(value) ? value : []);

  useEffect(() => {
    const hash = window.location.pathname.split('/verify/')[1];
    if (hash) {
      const fetchVerification = async (accessKey?: string) => {
        const res = await fetch(`${API_BASE}/verify/${hash}`, {
          headers: accessKey ? { 'x-verify-key': accessKey } : undefined
        });
        if (res.status === 401) {
          setRequiresAccessKey(true);
          setVerifyError('Authorized access required to validate this letter.');
          return;
        }
        const data = await res.json();
        setVerificationData(data);
        setVerifyError(null);
      };

      fetchVerification();
    }
  }, []);

  useEffect(() => {
    fetch(`${API_BASE}/departments?context=${context}`)
      .then(res => (res.ok ? res.json() : []))
      .then(data => setDepartments(coerceArray(data)))
      .catch(() => setDepartments([]));
    fetch(`${API_BASE}/tags?context=${context}`)
      .then(res => (res.ok ? res.json() : []))
      .then(data => setTags(coerceArray(data)))
      .catch(() => setTags([]));
  }, [context]);

  const fetchLetters = () => {
    fetch(`${API_BASE}/letters`)
      .then(res => (res.ok ? res.json() : []))
      .then(data => setLetters(coerceArray(data)))
      .catch(() => setLetters([]));
  };

  const fetchAuditLogs = () => {
    fetch(`${API_BASE}/audit-logs`)
      .then(res => (res.ok ? res.json() : []))
      .then(data => setAuditLogs(coerceArray(data)))
      .catch(() => setAuditLogs([]));
  };

  const fetchEmailLinks = () => {
    fetch(`${API_BASE}/email-links`)
      .then(res => (res.ok ? res.json() : []))
      .then(data => setEmailLinks(coerceArray(data)))
      .catch(() => setEmailLinks([]));
  };

  const fetchCommittees = () => {
    fetch(`${API_BASE}/committees`)
      .then(res => (res.ok ? res.json() : []))
      .then(data => setCommittees(coerceArray(data)))
      .catch(() => setCommittees([]));
  };

  useEffect(() => {
    fetchLetters();
    fetchAuditLogs();
    fetchEmailLinks();
    fetchCommittees();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/letters`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context,
          department_id: selectedDept,
          tag_ids: selectedTags,
          content,
          created_by: '00000000-0000-0000-0000-000000000000'
        })
      });
      if (res.ok) {
        setContent('');
        setSelectedTags([]);
        setSelectedDept('');
        fetchLetters();
        fetchAuditLogs();
      }
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (id: string) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/letters/${id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          approver_id: '00000000-0000-0000-0000-000000000000',
          comment: 'Approved via dashboard'
        })
      });
      if (res.ok) {
        fetchLetters();
        fetchAuditLogs();
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCommitteeApprove = async (id: string) => {
    if (committees.length === 0) return;
    const committeeId = committees[0].id;

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/letters/${id}/committee-approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          committee_id: committeeId,
          approver_id: '00000000-0000-0000-0000-000000000000'
        })
      });
      if (res.ok) {
        fetchLetters();
        fetchAuditLogs();
      }
    } finally {
      setLoading(false);
    }
  };

  const handleIssue = async (id: string) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/letters/${id}/issue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          issued_by: '00000000-0000-0000-0000-000000000000',
          channel: 'PRINT',
          printer_id: 'HP-LASERJET-400'
        })
      });
      const data = await res.json();
      if (data.pdf) {
        const win = window.open();
        if (win) {
          win.document.write(`<iframe src="${data.pdf}" frameborder="0" style="border:0; top:0px; left:0px; bottom:0px; right:0px; width:100%; height:100%;" allowfullscreen></iframe>`);
        }
        fetchLetters();
        fetchAuditLogs();
      }
    } finally {
      setLoading(false);
    }
  };

  const handleAcknowledge = async (id: string) => {
    const job_reference = prompt('Enter Job Reference:');
    const file_url = prompt('Enter File URL:');
    if (!job_reference || !file_url) return;

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/acknowledgements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          letter_id: id,
          job_reference,
          file_url,
          captured_by: '00000000-0000-0000-0000-000000000000'
        })
      });
      if (res.ok) {
        fetchLetters();
        fetchAuditLogs();
      }
    } finally {
      setLoading(false);
    }
  };

  const handleEmailLink = async (id: string) => {
    const job_reference = prompt('Enter Job Reference (optional):') || undefined;
    const sender = prompt('Enter Email Sender:') || undefined;
    const subject = prompt('Enter Email Subject:') || undefined;
    const body_excerpt = prompt('Enter Email Excerpt:') || undefined;

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/email-links`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          letter_id: id,
          job_reference,
          sender,
          subject,
          body_excerpt,
          classified_by: '00000000-0000-0000-0000-000000000000',
          received_at: new Date().toISOString()
        })
      });
      if (res.ok) {
        fetchEmailLinks();
        fetchAuditLogs();
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyAccess = async () => {
    const hash = window.location.pathname.split('/verify/')[1];
    if (!hash || !verifyAccessKey) return;
    const res = await fetch(`${API_BASE}/verify/${hash}`, {
      headers: { 'x-verify-key': verifyAccessKey }
    });
    if (res.status === 401) {
      setVerifyError('Invalid access key. Please contact your administrator.');
      return;
    }
    const data = await res.json();
    setVerificationData(data);
    setVerifyError(null);
  };

  if (verificationData) {
    return (
      <div className="container verification-view">
        <header><h1>Document Verification</h1></header>
        <div className={`verification-card ${verificationData.valid ? 'valid' : 'invalid'}`}>
          {verificationData.valid ? (
            <>
              <div className="status-header">✅ AUTHENTIC DOCUMENT</div>
              <div className="details">
                <p><strong>Context:</strong> {verificationData.document_details.context}</p>
                <p><strong>Department:</strong> {verificationData.document_details.department}</p>
                <p><strong>Status:</strong> {verificationData.document_details.status}</p>
                <p><strong>Approved At:</strong> {new Date(verificationData.document_details.approved_at).toLocaleString()}</p>
              </div>
            </>
          ) : (
            <div className="status-header">❌ INVALID OR TAMPERED</div>
          )}
          <button className="back-btn" onClick={() => window.location.href = '/'}>Back to Dashboard</button>
        </div>
      </div>
    );
  }

  if (requiresAccessKey) {
    return (
      <div className="container verification-view">
        <header><h1>Document Verification</h1></header>
        <div className="verification-card gated">
          <div className="status-header">🔒 AUTHORIZED ACCESS REQUIRED</div>
          <p className="verification-message">
            Enter the verification access key to view document authenticity.
          </p>
          <div className="verification-form">
            <input
              type="password"
              placeholder="Access key"
              value={verifyAccessKey}
              onChange={e => setVerifyAccessKey(e.target.value)}
            />
            <button className="verify-btn" onClick={handleVerifyAccess}>Verify Document</button>
          </div>
          {verifyError && <p className="error-text">{verifyError}</p>}
          <button className="back-btn" onClick={() => window.location.href = '/'}>Back to Dashboard</button>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <header>
        <h1>Letter Issuance System</h1>
        <nav className="main-nav">
          <button onClick={() => setView('DASHBOARD')} className={view === 'DASHBOARD' ? 'active' : ''}>Dashboard</button>
          <button onClick={() => setView('AUDIT')} className={view === 'AUDIT' ? 'active' : ''}>Audit Log</button>
        </nav>
        <div className="context-switcher">
          <button className={context === 'COMPANY' ? 'active' : ''} onClick={() => setContext('COMPANY')}>Company Ops</button>
          <button className={context === 'BCBA' ? 'active' : ''} onClick={() => setContext('BCBA')}>BCBA Association</button>
        </div>
      </header>

      {view === 'AUDIT' ? (
        <section className="audit-section">
          <h2>System Audit Trail</h2>
          <div className="audit-table">
            <table>
              <thead>
                <tr>
                  <th>Action</th>
                  <th>Entity</th>
                  <th>ID</th>
                  <th>Timestamp</th>
                  <th>Metadata</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.map(log => (
                  <tr key={log.id}>
                    <td><span className={`action-badge ${log.action.toLowerCase()}`}>{log.action}</span></td>
                    <td>{log.entity_type}</td>
                    <td className="monospace">{log.entity_id.substring(0, 8)}...</td>
                    <td>{new Date(log.created_at).toLocaleString()}</td>
                    <td><pre>{JSON.stringify(log.metadata)}</pre></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="email-links">
            <h3>Email Classifier Linkage</h3>
            <p>Recent inbox-to-letter matches captured for follow-up.</p>
            <div className="email-table">
              <table>
                <thead>
                  <tr>
                    <th>Letter</th>
                    <th>Job Ref</th>
                    <th>Sender</th>
                    <th>Subject</th>
                    <th>Received</th>
                  </tr>
                </thead>
                <tbody>
                  {emailLinks.map(link => (
                    <tr key={link.id}>
                      <td className="monospace">{link.letter_id?.substring(0, 8)}...</td>
                      <td>{link.job_reference || '-'}</td>
                      <td>{link.sender || '-'}</td>
                      <td>{link.subject || '-'}</td>
                      <td>{link.received_at ? new Date(link.received_at).toLocaleString() : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      ) : (
        <main>
          <section className="creation-section">
            <h2>Create New Letter</h2>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Department</label>
                <select value={selectedDept} onChange={e => setSelectedDept(e.target.value)} required>
                  <option value="">Select Department</option>
                  {departments.map(d => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Tags</label>
                <div className="tag-grid">
                  {tags.map(t => (
                    <label key={t.id} className="tag-item">
                      <input
                        type="checkbox"
                        value={t.id}
                        checked={selectedTags.includes(t.id)}
                        onChange={e => {
                          if (e.target.checked) setSelectedTags([...selectedTags, t.id]);
                          else setSelectedTags(selectedTags.filter(id => id !== t.id));
                        }}
                      />
                      {t.name}
                    </label>
                  ))}
                </div>
              </div>

              <div className="form-group">
                <label>Content</label>
                <textarea
                  value={content}
                  onChange={e => setContent(e.target.value)}
                  placeholder="Draft your letter here..."
                  required
                />
              </div>

              <button type="submit" disabled={loading}>
                {loading ? 'Creating...' : 'Create Draft'}
              </button>
            </form>
          </section>

          <section className="list-section">
            <h2>Existing Letters</h2>
            <div className="letter-grid">
              {letters.map((l: any) => (
                <div key={l.id} className={`letter-card ${l.status === 'APPROVED' || l.status === 'ISSUED' ? 'locked' : ''}`}>
                  <span className={`badge ${l.context.toLowerCase()}`}>{l.context}</span>
                  {(l.status === 'APPROVED' || l.status === 'ISSUED') && <span className="lock-icon">LOCK</span>}
                  <h3>{l.departments?.name}</h3>
                  <p className="status">Status: <strong>{l.status}</strong></p>
                  <div className="tags">
                    {l.letter_tags?.map((lt: any) => (
                      <span key={lt.tags.name} className="tag-chip">{lt.tags.name}</span>
                    ))}
                  </div>
                  {l.status === 'DRAFT' && (
                    <>
                      {l.context === 'COMPANY' ? (
                        <button className="approve-btn" onClick={() => handleApprove(l.id)} disabled={loading}>
                          Approve
                        </button>
                      ) : (
                        <button className="approve-btn committee" onClick={() => handleCommitteeApprove(l.id)} disabled={loading}>
                          Committee Approve
                        </button>
                      )}
                    </>
                  )}
                  {l.status === 'APPROVED' && (
                    <button className="issue-btn" onClick={() => handleIssue(l.id)} disabled={loading}>
                      Issue Letter
                    </button>
                  )}
                  {l.status === 'ISSUED' && (
                    <button className="ack-btn" onClick={() => handleAcknowledge(l.id)} disabled={loading}>
                      Link Acknowledgement
                    </button>
                  )}
                  <button className="email-btn" onClick={() => handleEmailLink(l.id)} disabled={loading}>
                    Link Email
                  </button>
                </div>
              ))}
            </div>
          </section>
        </main>
      )}
    </div>
  );
}

export default App;
