import React, { useMemo, useState, useRef } from 'react';
import { auth } from '../lib/auth';
import { API_BASE } from '../lib/api';
import { RichTextEditor } from './RichTextEditor';
import { LETTER_STATUSES } from '../shared-constants';
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
  approvers: ApproverOption[];
  pendingApprovals: Letter[];
  currentUserLabel: string;
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

const getHeaderStatusClass = (status: string) => {
  const statusClasses: Record<string, string> = {
    DRAFT: 'bg-white/20 text-white border border-white/30 backdrop-blur-sm',
    SUBMITTED: 'bg-warning text-white',
    APPROVED: 'bg-success text-white',
    REJECTED: 'bg-danger text-white',
    ISSUED: 'bg-info text-white',
    REVOKED: 'bg-purple text-white',
    AES_WAITING: 'bg-orange text-white',
  };

  return statusClasses[status] || 'bg-white/20 text-white border border-white/30';
};

export function LetterWorkspace({ selectedId, onSelectLetter, letters, tags, approvers, pendingApprovals, currentUserLabel, hasMore, onLoadMore, loadingMore, onCreateOrUpdate, onRoute, onSubmit, onApprove, onReject, onIssue, onPrint, onFetchLetter }: Props) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [toText, setToText] = useState('');
  const [ccText, setCcText] = useState('');
  const [subject, setSubject] = useState('');
  const [signatureName, setSignatureName] = useState('');
  const [signatureTitle, setSignatureTitle] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedApproverIds, setSelectedApproverIds] = useState<string[]>([]);
  const [jobReference, setJobReference] = useState('');
  const [showAudit, setShowAudit] = useState(false);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [workflowMessage, setWorkflowMessage] = useState<string | null>(null);
  const [workflowLoading, setWorkflowLoading] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<any[]>([]);
  const [libraryAttachments, setLibraryAttachments] = useState<any[]>([]);
  const [selectedLibraryAttachmentId, setSelectedLibraryAttachmentId] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isLinkingAttachment, setIsLinkingAttachment] = useState(false);
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
      setToText('');
      setCcText('');
      setSubject('');
      setSignatureName(currentUserLabel);
      setSignatureTitle('Authorized Signatory');
      setSelectedTags([]);
      setSelectedApproverIds([]);
      setJobReference('');
      setAttachments([]);
      return () => { disposed = true; };
    }
    setTitle(selectedLetter.title || '');
    setToText(selectedLetter.to_text || '');
    setCcText(selectedLetter.cc_text || '');
    setSubject(selectedLetter.subject || '');
    setSignatureName(selectedLetter.signature_name || currentUserLabel);
    setSignatureTitle(selectedLetter.signature_title || 'Authorized Signatory');
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
        if (typeof fullLetter?.to_text === 'string') setToText(fullLetter.to_text);
        if (typeof fullLetter?.cc_text === 'string') setCcText(fullLetter.cc_text);
        if (typeof fullLetter?.subject === 'string') setSubject(fullLetter.subject);
        if (typeof fullLetter?.signature_name === 'string' && fullLetter.signature_name) setSignatureName(fullLetter.signature_name);
        if (typeof fullLetter?.signature_title === 'string' && fullLetter.signature_title) setSignatureTitle(fullLetter.signature_title);
      }).catch((err) => {
        if (disposed) return;
        console.error('Failed to fetch letter content', err);
        setContent('Error loading content.');
      });
    }
    return () => { disposed = true; };
  }, [currentUserLabel, selectedLetter?.id]);

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

  const pendingTaskLetters = useMemo(() => {
    const taskMap = new Map<string, Letter>();
    for (const letter of letters) {
      if (letter.status === 'DRAFT' || letter.status === 'SUBMITTED') {
        taskMap.set(letter.id, letter);
      }
    }
    for (const letter of pendingApprovals) {
      if (letter?.id && letter.status !== 'APPROVED' && letter.status !== 'REJECTED') {
        taskMap.set(letter.id, taskMap.get(letter.id) ?? letter);
      }
    }
    return Array.from(taskMap.values()).sort((left, right) => {
      const leftTime = new Date(left.updated_at || left.created_at || 0).getTime();
      const rightTime = new Date(right.updated_at || right.created_at || 0).getTime();
      return rightTime - leftTime;
    });
  }, [letters, pendingApprovals]);

  const getActionButtonClass = (enabled: boolean, variant: string) => (
    enabled ? `btn ${variant} btn-sm` : 'btn btn-disabled btn-sm'
  );

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
        to_text: toText.trim() || null,
        cc_text: ccText.trim() || null,
        subject: subject.trim() || null,
        signature_name: signatureName.trim() || null,
        signature_title: signatureTitle.trim() || null,
        template_key: selectedLetter?.template_key ?? null,
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

  React.useEffect(() => {
    const fetchLibraryAttachments = async () => {
      const token = auth.getAccessToken();
      if (!token) return;
      try {
        const res = await fetch(`${API_BASE}/attachments/library`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        setLibraryAttachments(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error(err);
      }
    };
    void fetchLibraryAttachments();
  }, []);

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

  const handleLinkAttachment = async () => {
    if (!selectedLetter?.id || !selectedLibraryAttachmentId) return;
    setIsLinkingAttachment(true);
    try {
      const token = auth.getAccessToken();
      if (!token) return;
      const res = await fetch(`${API_BASE}/letters/${selectedLetter.id}/attachments/link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ attachment_id: selectedLibraryAttachmentId }),
      });
      if (!res.ok) return;
      const attRes = await fetch(`${API_BASE}/letters/${selectedLetter.id}/attachments`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await attRes.json();
      setAttachments(Array.isArray(data) ? data : []);
      setSelectedLibraryAttachmentId('');
    } catch (err) {
      console.error(err);
    } finally {
      setIsLinkingAttachment(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[2fr_1fr]">
      <div className="card">
        <div className="card-header card-header-primary flex justify-between items-start">
          <div>
            <h4 className="card-title">Letter Workspace</h4>
            <p className="card-category">Owning Department: {selectedLetter?.departments?.name || 'Unassigned'}</p>
          </div>
          {selectedLetter && (
            <div className="flex flex-col items-end gap-2 mt-1 mr-1">
              <span className={`px-2 py-0.5 text-[10px] font-bold rounded uppercase shadow-sm ${getHeaderStatusClass(String(selectedLetter.status))}`}>
                {selectedLetter.status}
              </span>
              {selectedLetter.job_reference && (
                <span className="px-2 py-0.5 rounded bg-white/20 text-white text-xs font-medium border border-white/30 shadow-sm backdrop-blur-sm">
                  C Number: {selectedLetter.job_reference}
                </span>
              )}
            </div>
          )}
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
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="form-group">
              <textarea
                value={toText}
                onChange={(e) => setToText(e.target.value)}
                placeholder="To section"
                rows={4}
                className="form-control text-sm leading-relaxed"
              />
            </div>
            <div className="space-y-4">
              <div className="form-group">
                <input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Subject"
                  className="form-control text-sm"
                />
              </div>
              <div className="form-group">
                <input
                  value={jobReference}
                  onChange={(e) => setJobReference(e.target.value)}
                  placeholder="C Number / Customs Job Reference (optional)"
                  className="form-control text-sm"
                />
              </div>
            </div>
          </div>
          
          <div className="rounded-xl border border-gray-100 overflow-hidden shadow-sm">
             <RichTextEditor value={content} onChange={setContent} />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="form-group">
              <textarea
                value={ccText}
                onChange={(e) => setCcText(e.target.value)}
                placeholder="CC section"
                rows={4}
                className="form-control text-sm leading-relaxed"
              />
            </div>
            <div className="p-6 rounded-xl bg-gray-50 border border-gray-100 space-y-3">
              <p className="text-[11px] font-bold text-gray-400 uppercase">Signature</p>
              <input
                value={signatureName}
                onChange={(e) => setSignatureName(e.target.value)}
                placeholder="Signature name"
                className="form-control text-sm"
              />
              <input
                value={signatureTitle}
                onChange={(e) => setSignatureTitle(e.target.value)}
                placeholder="Signature title"
                className="form-control text-sm"
              />
            </div>
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
              <p className="text-sm font-bold text-gray-700 uppercase">Department Routing</p>
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
              <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto]">
                <select
                  className="form-control"
                  value={selectedLibraryAttachmentId}
                  onChange={(e) => setSelectedLibraryAttachmentId(e.target.value)}
                  disabled={!selectedLetter || isLinkingAttachment}
                >
                  <option value="">Select an already uploaded customs file...</option>
                  {libraryAttachments
                    .filter((attachment) => !attachments.some((item) => item.file_name === attachment.file_name && item.file_path === attachment.file_path))
                    .map((attachment) => (
                      <option key={attachment.id} value={attachment.id}>
                        {attachment.file_name}{attachment.letter_title ? ` - ${attachment.letter_title}` : ''}
                      </option>
                    ))}
                </select>
                <button
                  type="button"
                  className="btn btn-white border border-gray-200"
                  onClick={() => void handleLinkAttachment()}
                  disabled={!selectedLibraryAttachmentId || isLinkingAttachment}
                >
                  {isLinkingAttachment ? 'Linking...' : 'Use Uploaded File'}
                </button>
              </div>
              <p className="text-[11px] text-gray-400 font-medium">
                You can upload a new file or attach one that was already uploaded elsewhere in the system.
              </p>
              
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
                  className={getActionButtonClass(isDraft && !workflowLoading, 'btn-info')}
                  disabled={!isDraft || !!workflowLoading}
                  onClick={() => runWorkflowAction('Route', () => onRoute(selectedLetter.id, { tag_ids: selectedTags, cc_approver_ids: selectedApproverIds, approval_mode: 'ALL', job_reference: jobReference.trim() || undefined }))}
                >
                  <i className="material-icons text-base mr-1">route</i> Route
                </button>
                <button
                  className={getActionButtonClass(isDraft && !workflowLoading, 'btn-warning')}
                  disabled={!isDraft || !!workflowLoading}
                  onClick={() => runWorkflowAction('Submit', () => onSubmit(selectedLetter.id))}
                >
                  <i className="material-icons text-base mr-1">send</i> Submit
                </button>
                <button
                  className={getActionButtonClass(isSubmitted && !!selectedLetter?.canApprove && !workflowLoading, 'btn-success')}
                  disabled={!isSubmitted || !selectedLetter?.canApprove || !!workflowLoading}
                  onClick={() => runWorkflowAction('Approve', () => onApprove(selectedLetter.id))}
                >
                  <i className="material-icons text-base mr-1">check</i> Approve
                </button>
                <button
                  className={getActionButtonClass(isSubmitted && !!selectedLetter?.canApprove && !workflowLoading, 'btn-danger')}
                  disabled={!isSubmitted || !selectedLetter?.canApprove || !!workflowLoading}
                  onClick={() => runWorkflowAction('Reject', () => onReject(selectedLetter.id, 'Rejected from workspace'))}
                >
                  <i className="material-icons text-base mr-1">close</i> Reject
                </button>
                <button
                  className={getActionButtonClass(isApproved && !workflowLoading, 'btn-primary')}
                  disabled={!isApproved || !!workflowLoading}
                  onClick={() => runWorkflowAction('Issue', () => onIssue(selectedLetter.id, { job_reference: jobReference.trim() || undefined }))}
                >
                  <i className="material-icons text-base mr-1">verified</i> Issue
                </button>
                <button
                  className={getActionButtonClass(isIssued && !workflowLoading, 'btn-rose')}
                  disabled={!isIssued || !!workflowLoading}
                  onClick={() => runWorkflowAction('Print', () => onPrint(selectedLetter.id, { job_reference: jobReference.trim() || undefined }))}
                >
                  <i className="material-icons text-base mr-1">print</i> Print
                </button>
              </div>
            </div>

            <div className="flex gap-4">
              <button className="btn btn-link btn-sm font-bold uppercase" onClick={async () => {
                setShowAudit(true);
                try {
                  if (!selectedLetter?.id) {
                    setAuditLogs([]);
                    return;
                  }
                  const sessionResult = await auth.getSession();
                  const token = sessionResult.data.session?.access_token || auth.getAccessToken();
                  const res = await fetch(`${API_BASE}/letters/${selectedLetter.id}/audit-logs`, {
                    headers: { Authorization: `Bearer ${token}` }
                  });
                  if (res.ok) {
                    setAuditLogs(await res.json());
                  } else {
                    setAuditLogs([]);
                  }
                } catch {
                  setAuditLogs([]);
                }
              }}>
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
                <h4 className="font-bold text-gray-700 uppercase text-xs mb-4">Department Approvals</h4>
                <div className="space-y-3">
                  {(selectedLetter.letter_approver_assignments || []).map((assignment: any) => {
                    const approver = approverLookup.get(assignment.approver_id);
                    const displayLabel = approver?.label || formatApproverFallback(assignment.approver_id);
                    const roleLabel = approver && approver.roles.length > 0 ? approver.roles.join(', ') : 'Assigned approver';
                    return (
                      <div key={assignment.id} className="flex items-center justify-between text-xs p-2 bg-white rounded border border-gray-100">
                        <span className="font-medium">
                          {displayLabel}
                          <span className="block text-[10px] uppercase text-gray-400 font-bold mt-0.5">{roleLabel}</span>
                        </span>
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
            {pendingTaskLetters.length === 0 ? (
              <div className="py-8 text-center text-gray-400 text-xs italic">No pending items.</div>
            ) : (
              pendingTaskLetters.map((letter) => (
                <button
                  key={letter.id}
                  type="button"
                  className={`w-full p-4 rounded-xl border text-left transition-all ${selectedId === letter.id ? 'border-primary bg-primary/5 shadow-sm' : 'border-gray-100 bg-white hover:bg-gray-50'}`}
                  onClick={() => onSelectLetter(letter.id)}
                >
                  <p className="text-sm font-bold text-gray-700">{letter.title || 'Untitled'}</p>
                  <p className="text-[10px] text-gray-400 font-bold uppercase mt-1">{new Date(letter.updated_at || letter.created_at).toLocaleString()}</p>
                  <div className="mt-2">
                    <span className={`px-2 py-0.5 text-white text-[9px] font-bold rounded uppercase shadow-sm ${letter.status === 'DRAFT' ? 'bg-info' : 'bg-warning'}`}>
                      {letter.status === 'DRAFT' ? 'Draft' : `${letter.approval_summary?.pending ?? 0} Pending Approvers`}
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
