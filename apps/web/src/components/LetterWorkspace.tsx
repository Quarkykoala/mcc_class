import React, { useMemo, useState, useRef } from 'react';
import { LETTER_STATUSES } from '@mcc/shared';
import { auth } from '../lib/auth';
import { RichTextEditor } from './RichTextEditor';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
const STAGES = LETTER_STATUSES;
type Stage = typeof STAGES[number];
type Tag = { id: string; name: string };
type Letter = any;
type ApproverOption = {
  id: string;
  label: string;
  roles: string[];
};

type Props = {
  selectedId: string | null;
  onSelectLetter: (id: string | null) => void;
  letters: Letter[];
  tags: Tag[];
  auditLogs: any[];
  approvers: ApproverOption[];
  pendingApprovals: Letter[];
  hasMore?: boolean;
  onLoadMore?: () => Promise<void>;
  loadingMore?: boolean;
  onCreateOrUpdate: (payload: any) => Promise<void>;
  onRoute: (id: string, payload: any) => Promise<void>;
  onSubmit: (id: string) => Promise<void>;
  onApprove: (id: string, comment?: string) => Promise<void>;
  onReject: (id: string, reason: string) => Promise<void>;
  onIssue: (id: string, payload?: any) => Promise<void>;
  onPrint: (id: string, payload?: any) => Promise<void>;
  onFetchLetter: (id: string) => Promise<any>;
};

const formatApproverFallback = (approverId: string) => {
  if (!approverId) return 'Unknown approver';
  return approverId.length > 12 ? `User - ${approverId.slice(0, 8)}...${approverId.slice(-4)}` : `User - ${approverId}`;
};

export function LetterWorkspace({ selectedId, onSelectLetter, letters, tags, auditLogs, approvers, pendingApprovals, hasMore, onLoadMore, loadingMore, onCreateOrUpdate, onRoute, onSubmit, onApprove, onReject, onIssue, onPrint, onFetchLetter }: Props) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedApproverIds, setSelectedApproverIds] = useState<string[]>([]);
  const [jobReference, setJobReference] = useState('');
  const [showAudit, setShowAudit] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [workflowMessage, setWorkflowMessage] = useState<string | null>(null);
  const [workflowLoading, setWorkflowLoading] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<any[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedLetter = letters.find((letter) => letter.id === selectedId) ?? null;

  React.useEffect(() => {
    let disposed = false;
    setSaveMessage(null);
    setWorkflowMessage(null);
    setWorkflowLoading(null);
    setShowAudit(false);
    if (!selectedLetter) {
      setTitle('');
      setContent('');
      setSelectedTags([]);
      setSelectedApproverIds([]);
      setJobReference('');
      setAttachments([]);
      return () => { disposed = true; };
    }
    setTitle(selectedLetter.title || '');
    setSelectedTags((selectedLetter.letter_tags || []).map((item: any) => item.tag_id));
    setSelectedApproverIds(
      Array.from(new Set(
        (selectedLetter.letter_approver_assignments || [])
          .map((assignment: any) => assignment.approver_id)
          .filter((value: unknown): value is string => typeof value === 'string' && value.length > 0)
      ))
    );
    setJobReference(selectedLetter.job_reference || '');

    if (selectedLetter.content) {
      setContent(selectedLetter.content);
    } else {
      setContent('Loading...');
      onFetchLetter(selectedLetter.id).then((fullLetter) => {
        if (disposed) return;
        setContent(fullLetter.content || '');
        if (typeof fullLetter?.job_reference === 'string') setJobReference(fullLetter.job_reference);
      }).catch((err) => {
        if (disposed) return;
        console.error('Failed to fetch letter content', err);
        setContent('Error loading content.');
      });
    }
    return () => { disposed = true; };
  }, [selectedLetter?.id]);

  const grouped = useMemo(() => {
    return STAGES.reduce((acc, stage) => {
      acc[stage] = letters.filter((item) => item.status === stage);
      return acc;
    }, {} as Record<Stage, Letter[]>);
  }, [letters]);

  const approverLookup = useMemo(() => {
    return new Map(approvers.map((item) => [item.id, item]));
  }, [approvers]);

  const selectedApprovers = useMemo(() => {
    return selectedApproverIds.map((id) => approverLookup.get(id) ?? { id, label: formatApproverFallback(id), roles: [] });
  }, [selectedApproverIds, approverLookup]);

  const selectableApprovers = useMemo(() => {
    return approvers.filter((item) => !selectedApproverIds.includes(item.id));
  }, [approvers, selectedApproverIds]);

  const selectedStatus = selectedLetter?.status ?? null;
  const isDraft = selectedStatus === 'DRAFT';
  const isSubmitted = selectedStatus === 'SUBMITTED';
  const isApproved = selectedStatus === 'APPROVED';
  const isIssued = selectedStatus === 'ISSUED';

  const toggleTag = (tagId: string) => {
    setSelectedTags((prev) => prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]);
  };

  const removeApprover = (approverId: string) => {
    setSelectedApproverIds((prev) => prev.filter((id) => id !== approverId));
  };

  const addApprover = (approverId: string) => {
    setSelectedApproverIds((prev) => prev.includes(approverId) ? prev : [...prev, approverId]);
  };

  const handleSaveDraft = async () => {
    setSaveMessage(null);
    if (selectedLetter && selectedLetter.status !== 'DRAFT') {
      setSaveMessage(`Only DRAFT letters can be saved (current: ${selectedLetter.status}).`);
      return;
    }
    if (!content.trim()) {
      setSaveMessage('Draft content cannot be empty.');
      return;
    }
    setIsSaving(true);
    try {
      await onCreateOrUpdate({
        id: selectedLetter?.id,
        context: selectedLetter?.context ?? 'COMPANY',
        content,
        title,
        tag_ids: selectedTags,
        job_reference: jobReference.trim() || null
      });
      setSaveMessage('Draft saved successfully.');
    } catch (error) {
      setSaveMessage(error instanceof Error ? error.message : 'Failed to save draft.');
    } finally {
      setIsSaving(false);
    }
  };

  const runWorkflowAction = async (label: string, callback: () => Promise<void>) => {
    setWorkflowMessage(null);
    if (!selectedLetter) {
      setWorkflowMessage('Select a letter first.');
      return;
    }
    setWorkflowLoading(label);
    try {
      await callback();
      setWorkflowMessage(`${label} completed.`);
    } catch (error) {
      setWorkflowMessage(error instanceof Error ? error.message : `${label} failed.`);
    } finally {
      setWorkflowLoading(null);
    }
  };

  React.useEffect(() => {
    if (!selectedLetter?.id) { setAttachments([]); return; }
    const fetchAttachments = async () => {
      const token = auth.getAccessToken();
      if (!token) return;
      try {
        const res = await fetch(`${API_BASE}/letters/${selectedLetter.id}/attachments`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setAttachments(Array.isArray(data) ? data : []);
        }
      } catch (err) { console.error(err); }
    };
    fetchAttachments();
  }, [selectedLetter?.id]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedLetter?.id) return;
    const files = event.target.files;
    if (!files || files.length === 0) return;
    setIsUploading(true);
    try {
      const token = auth.getAccessToken();
      if (!token) return;
      for (const file of Array.from(files)) {
        await fetch(`${API_BASE}/attachments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            letter_id: selectedLetter.id,
            file_name: file.name,
            file_path: `local://${file.name}`,
            file_size: file.size,
            mime_type: file.type,
          }),
        });
      }
      const res = await fetch(`${API_BASE}/letters/${selectedLetter.id}/attachments`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setAttachments(data || []);
    } catch (err) { console.error(err); } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDeleteAttachment = async (attachmentId: string) => {
    if (!confirm('Delete this attachment?')) return;
    try {
      const token = auth.getAccessToken();
      if (!token) return;
      const res = await fetch(`${API_BASE}/attachments/${attachmentId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok && selectedLetter?.id) {
        const attRes = await fetch(`${API_BASE}/letters/${selectedLetter.id}/attachments`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await attRes.json();
        setAttachments(data || []);
      }
    } catch (err) { console.error(err); }
  };

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[2fr_1fr]">
      <div className="card">
        <div className="card-header card-header-primary">
          <h4 className="card-title">Letter Workspace</h4>
          <p className="card-category">Context scope: COMPANY</p>
        </div>
        <div className="card-body pt-8 space-y-8">
          <div className="form-group">
            <input 
              value={title} 
              onChange={(e) => setTitle(e.target.value)} 
              placeholder="Letter title" 
              className="form-control font-bold text-lg" 
            />
          </div>
          <div className="form-group">
            <input
              value={jobReference}
              onChange={(e) => setJobReference(e.target.value)}
              placeholder="Job reference (optional)"
              className="form-control text-sm"
            />
          </div>
          
          <div className="rounded-xl border border-gray-100 overflow-hidden shadow-sm">
             <RichTextEditor value={content} onChange={setContent} />
          </div>

          <div className="space-y-4">
             <p className="text-[11px] font-bold text-gray-400 uppercase">Tags</p>
             <div className="flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <button 
                    key={tag.id} 
                    type="button" 
                    className={`btn btn-sm ${selectedTags.includes(tag.id) ? 'btn-primary' : 'btn-white border border-gray-200'}`} 
                    onClick={() => toggleTag(tag.id)}
                  >
                    {tag.name}
                  </button>
                ))}
             </div>
          </div>

          <div className="p-6 rounded-xl bg-gray-50 border border-gray-100 space-y-4">
            <div className="flex justify-between items-center">
              <p className="text-sm font-bold text-gray-700 uppercase">Routing & Approvers</p>
              <p className="text-[10px] text-gray-400 font-bold uppercase italic">Tag defaults apply on route</p>
            </div>
            
            <div className="form-group">
               <select
                 className="form-control"
                 onChange={(e) => addApprover(e.target.value)}
                 disabled={!selectedLetter || !isDraft || selectableApprovers.length === 0}
                 value=""
               >
                 <option value="" disabled>{selectableApprovers.length > 0 ? 'Add manual approver...' : 'No additional approvers'}</option>
                 {selectableApprovers.map((approver) => (
                   <option key={approver.id} value={approver.id}>
                     {approver.label}
                   </option>
                 ))}
               </select>
            </div>

            <div className="flex flex-wrap gap-2">
              {selectedApprovers.length === 0 ? (
                <p className="text-xs text-gray-400 italic">No manual approvers selected.</p>
              ) : (
                selectedApprovers.map((approver) => (
                  <button
                    key={approver.id}
                    type="button"
                    className="btn btn-rose btn-sm lowercase font-medium"
                    onClick={() => removeApprover(approver.id)}
                  >
                    {approver.label} <i className="material-icons text-xs ml-1">close</i>
                  </button>
                ))
              )}
            </div>
          </div>

          {selectedLetter && (
            <div className="p-6 rounded-xl bg-gray-50 border border-gray-100 space-y-4">
              <div className="flex justify-between items-center">
                <p className="text-sm font-bold text-gray-700 uppercase">Attachments</p>
                <label className={`btn btn-link btn-info btn-sm mb-0 cursor-pointer font-bold ${isUploading ? 'opacity-50 pointer-events-none' : ''}`}>
                  <i className="material-icons text-sm mr-1">add</i> {isUploading ? 'Uploading...' : 'Add Files'}
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    multiple
                    className="hidden"
                    disabled={isUploading}
                  />
                </label>
              </div>
              
              {!Array.isArray(attachments) || attachments.length === 0 ? (
                <p className="text-xs text-gray-400 italic">No attachments for this letter.</p>
              ) : (
                <div className="space-y-2">
                  {attachments.map((attachment) => (
                    <div key={attachment.id} className="flex items-center justify-between bg-white p-3 rounded-lg shadow-sm border border-gray-100">
                      <div className="flex items-center gap-2 overflow-hidden">
                        <i className="material-icons text-info text-lg">description</i>
                        <span className="text-xs font-bold text-gray-600 truncate">{attachment.file_name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <a href={attachment.file_path} target="_blank" rel="noopener noreferrer" className="btn btn-link btn-info p-1">View</a>
                        <button onClick={() => handleDeleteAttachment(attachment.id)} className="btn btn-link btn-danger p-1">Delete</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="pt-8 border-t border-gray-100 space-y-6">
            <button 
              className="btn btn-primary btn-lg" 
              onClick={handleSaveDraft} 
              disabled={isSaving || (selectedLetter && !isDraft)}
            >
              <i className="material-icons text-base mr-2">save</i>
              {isSaving ? 'Saving...' : 'Save Draft'}
            </button>

            <div className="p-6 rounded-xl border-2 border-dashed border-gray-200 space-y-4">
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Lifecycle Actions</p>
              <div className="flex flex-wrap gap-2">
                <button
                  className="btn btn-info btn-sm"
                  disabled={!isDraft || !!workflowLoading}
                  onClick={() => runWorkflowAction('Route', () => onRoute(selectedLetter.id, { tag_ids: selectedTags, cc_approver_ids: selectedApproverIds, approval_mode: 'ALL', job_reference: jobReference.trim() || undefined }))}
                >
                  <i className="material-icons text-base mr-1">route</i> Route
                </button>
                <button
                  className="btn btn-warning btn-sm"
                  disabled={!isDraft || !!workflowLoading}
                  onClick={() => runWorkflowAction('Submit', () => onSubmit(selectedLetter.id))}
                >
                  <i className="material-icons text-base mr-1">send</i> Submit
                </button>
                <button
                  className="btn btn-success btn-sm"
                  disabled={!isSubmitted || !selectedLetter?.canApprove || !!workflowLoading}
                  onClick={() => runWorkflowAction('Approve', () => onApprove(selectedLetter.id))}
                >
                  <i className="material-icons text-base mr-1">check</i> Approve
                </button>
                <button
                  className="btn btn-danger btn-sm"
                  disabled={!isSubmitted || !selectedLetter?.canApprove || !!workflowLoading}
                  onClick={() => runWorkflowAction('Reject', () => onReject(selectedLetter.id, 'Rejected from workspace'))}
                >
                  <i className="material-icons text-base mr-1">close</i> Reject
                </button>
                <button
                  className="btn btn-primary btn-sm"
                  disabled={!isApproved || !!workflowLoading}
                  onClick={() => runWorkflowAction('Issue', () => onIssue(selectedLetter.id, { job_reference: jobReference.trim() || undefined }))}
                >
                  <i className="material-icons text-base mr-1">verified</i> Issue
                </button>
                <button
                  className="btn btn-rose btn-sm"
                  disabled={!isIssued || !!workflowLoading}
                  onClick={() => runWorkflowAction('Print', () => onPrint(selectedLetter.id, { job_reference: jobReference.trim() || undefined }))}
                >
                  <i className="material-icons text-base mr-1">print</i> Print
                </button>
              </div>
            </div>

            <div className="flex gap-4">
              <button className="btn btn-link btn-sm font-bold uppercase" onClick={() => setShowAudit(true)}>
                <i className="material-icons text-base mr-1">history</i> View Audit Trail
              </button>
            </div>
          </div>

          {(saveMessage || workflowMessage) && (
            <div className={`p-4 rounded-lg text-sm font-bold uppercase text-center ${saveMessage?.includes('success') || workflowMessage?.includes('complete') ? 'bg-success/10 text-success' : 'bg-rose/10 text-rose'}`}>
               {saveMessage || workflowMessage}
            </div>
          )}

          {selectedLetter && (
            <div className="card mt-8 shadow-none border border-gray-100 bg-gray-50/50">
              <div className="card-body">
                <h4 className="font-bold text-gray-700 uppercase text-xs mb-4">Approver Checklist</h4>
                <div className="space-y-3">
                  {(selectedLetter.letter_approver_assignments || []).map((assignment: any) => {
                    const displayLabel = approverLookup.get(assignment.approver_id)?.label || formatApproverFallback(assignment.approver_id);
                    return (
                      <div key={assignment.id} className="flex items-center justify-between text-xs p-2 bg-white rounded border border-gray-100">
                        <span className="font-medium">{displayLabel}</span>
                        <span className={`font-bold uppercase px-2 py-0.5 rounded ${assignment.decision === 'APPROVED' ? 'bg-success text-white' : assignment.decision === 'REJECTED' ? 'bg-danger text-white' : 'bg-gray-200 text-gray-600'}`}>
                          {assignment.decision}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-8">
        <div className="card">
          <div className="card-header card-header-warning">
            <h4 className="card-title">My Pending Tasks</h4>
            <p className="card-category">Action required from you.</p>
          </div>
          <div className="card-body p-4 space-y-3">
            {pendingApprovals.length === 0 ? (
              <div className="py-8 text-center text-gray-400 text-xs italic">No pending items.</div>
            ) : (
              pendingApprovals.map((letter) => (
                <button
                  key={letter.id}
                  type="button"
                  className={`w-full p-4 rounded-xl border text-left transition-all ${selectedId === letter.id ? 'border-primary bg-primary/5 shadow-sm' : 'border-gray-100 bg-white hover:bg-gray-50'}`}
                  onClick={() => onSelectLetter(letter.id)}
                >
                  <p className="text-sm font-bold text-gray-700">{letter.title || 'Untitled'}</p>
                  <p className="text-[10px] text-gray-400 font-bold uppercase mt-1">{new Date(letter.updated_at || letter.created_at).toLocaleString()}</p>
                  <div className="mt-2">
                    <span className="px-2 py-0.5 bg-warning text-white text-[9px] font-bold rounded uppercase shadow-sm">
                      {letter.approval_summary?.pending ?? 0} Pending
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header card-header-info">
            <h4 className="card-title">Document Stages</h4>
            <p className="card-category">Overview of all active letters.</p>
          </div>
          <div className="card-body p-4 space-y-8">
            {STAGES.map((stage) => (
              <div key={stage} className="space-y-3">
                <div className="flex justify-between items-center border-b border-gray-50 pb-2">
                   <h4 className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">{stage}</h4>
                   <span className="text-[10px] font-bold bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{grouped[stage].length}</span>
                </div>
                {grouped[stage].map((letter) => (
                  <button 
                    key={letter.id} 
                    type="button" 
                    className={`w-full p-3 rounded-lg border text-left transition-all ${selectedId === letter.id ? 'border-info bg-info/5 shadow-sm' : 'border-gray-50 bg-white hover:bg-gray-50'}`} 
                    onClick={() => onSelectLetter(letter.id)}
                  >
                    <p className="text-xs font-bold text-gray-700 truncate">{letter.title || 'Untitled document'}</p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {(letter.letter_tags || []).map((item: any, index: number) => (
                        <span key={`${item.tag_id}-${index}`} className="text-[9px] font-bold uppercase bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">{item.tags?.name || 'TAG'}</span>
                      ))}
                      {letter.status === 'SUBMITTED' && letter.canApprove && (
                        <span className="text-[9px] font-bold uppercase bg-rose text-white px-1.5 py-0.5 rounded shadow-sm">My Decision</span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            ))}
            {hasMore && onLoadMore && (
              <button 
                className="btn btn-link btn-info btn-sm w-full font-bold uppercase" 
                onClick={() => void onLoadMore()} 
                disabled={!!loadingMore}
              >
                {loadingMore ? 'Loading...' : 'Load more letters'}
              </button>
            )}
          </div>
        </div>
      </div>

      {showAudit && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="card w-[600px] max-h-[80vh] flex flex-col mt-0">
            <div className="card-header card-header-rose flex justify-between items-center">
              <h4 className="card-title">Audit Trail</h4>
              <button className="text-white p-1 hover:bg-white/10 rounded" onClick={() => setShowAudit(false)}>
                 <i className="material-icons">close</i>
              </button>
            </div>
            <div className="card-body overflow-y-auto p-6 space-y-4">
              {auditLogs.map((log) => (
                <div key={log.id} className="p-4 rounded-xl border border-gray-100 bg-gray-50 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-bold text-gray-700 uppercase">{log.action}</span>
                    <span className="text-[10px] text-gray-400 font-bold">{new Date(log.created_at).toLocaleString()}</span>
                  </div>
                  <pre className="text-[10px] bg-white p-3 rounded border border-gray-100 overflow-auto max-h-40">{JSON.stringify(log.metadata, null, 2)}</pre>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
