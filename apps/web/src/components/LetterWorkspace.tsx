import React, { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RichTextEditor } from './RichTextEditor';

const STAGES = ['DRAFT', 'SUBMITTED', 'APPROVED', 'ISSUED', 'REJECTED', 'REVOKED'] as const;

type Stage = typeof STAGES[number];

type Tag = { id: string; name: string };
type Letter = any;
type ApproverOption = {
  id: string;
  label: string;
  roles: string[];
};

type Props = {
  letters: Letter[];
  tags: Tag[];
  auditLogs: any[];
  approvers: ApproverOption[];
  pendingApprovals: Letter[];
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

export function LetterWorkspace({ letters, tags, auditLogs, approvers, pendingApprovals, onCreateOrUpdate, onRoute, onSubmit, onApprove, onReject, onIssue, onPrint, onFetchLetter }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(letters[0]?.id ?? null);
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

  const selectedLetter = letters.find((letter) => letter.id === selectedId) ?? null;

  React.useEffect(() => {
    if (letters.length === 0) {
      if (selectedId !== null) {
        setSelectedId(null);
      }
      return;
    }

    const hasSelectedLetter = selectedId !== null && letters.some((letter) => letter.id === selectedId);
    if (!hasSelectedLetter) {
      setSelectedId(letters[0].id);
    }
  }, [letters, selectedId]);

  React.useEffect(() => {
    let disposed = false;

    if (!selectedLetter) {
      setTitle('');
      setContent('');
      setSelectedTags([]);
      setSelectedApproverIds([]);
      setJobReference('');
      return () => {
        disposed = true;
      };
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
        if (typeof fullLetter?.job_reference === 'string') {
          setJobReference(fullLetter.job_reference);
        }
      }).catch((err) => {
        if (disposed) return;
        console.error('Failed to fetch letter content', err);
        setContent('Error loading content.');
      });
    }

    return () => {
      disposed = true;
    };
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

  const hasLetters = letters.length > 0;
  const workflowDisabledReason = !hasLetters
    ? 'No letters available yet. Create a draft or use the Demo menu (wand icon) to generate sample data.'
    : 'Select a letter from the Stage Panel to enable workflow actions.';
  const selectedStatus = selectedLetter?.status ?? null;
  const isDraft = selectedStatus === 'DRAFT';
  const isSubmitted = selectedStatus === 'SUBMITTED';
  const isApproved = selectedStatus === 'APPROVED';
  const isIssued = selectedStatus === 'ISSUED';

  const routeDisabledReason = !selectedLetter
    ? workflowDisabledReason
    : !isDraft
      ? `Route is only available while status is DRAFT (current: ${selectedStatus}).`
      : null;
  const submitDisabledReason = !selectedLetter
    ? workflowDisabledReason
    : !isDraft
      ? `Submit is only available while status is DRAFT (current: ${selectedStatus}).`
      : null;
  const approveDisabledReason = !selectedLetter
    ? workflowDisabledReason
    : !isSubmitted
      ? `Approve is only available while status is SUBMITTED (current: ${selectedStatus}).`
      : !selectedLetter.canApprove
        ? 'Approve is available only to assigned pending approvers (or admins).'
        : null;
  const rejectDisabledReason = !selectedLetter
    ? workflowDisabledReason
    : !isSubmitted
      ? `Reject is only available while status is SUBMITTED (current: ${selectedStatus}).`
      : !selectedLetter.canApprove
        ? 'Reject is available only to assigned pending approvers (or admins).'
        : null;
  const issueDisabledReason = !selectedLetter
    ? workflowDisabledReason
    : !isApproved
      ? `Issue is only available while status is APPROVED (current: ${selectedStatus}).`
      : null;
  const printDisabledReason = !selectedLetter
    ? workflowDisabledReason
    : !isIssued
      ? `Print is only available while status is ISSUED (current: ${selectedStatus}).`
      : null;
  const saveDisabledReason = selectedLetter && !isDraft
    ? `Save Draft is only available while status is DRAFT (current: ${selectedStatus}).`
    : undefined;

  const workflowHelperText = !selectedLetter
    ? workflowDisabledReason
    : `Current status: ${selectedStatus}. Route sets approvers, Submit starts review, Approve/Reject decide submissions, Issue finalizes approval, and Print records issued copies.`;

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
    setWorkflowMessage(null);

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
      setSaveMessage('Draft saved.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save draft.';
      setSaveMessage(message);
    } finally {
      setIsSaving(false);
    }
  };

  const runWorkflowAction = async (label: string, callback: () => Promise<void>) => {
    setWorkflowMessage(null);
    if (!selectedLetter) {
      setWorkflowMessage('Select a letter from the Stage Panel first.');
      return;
    }

    setWorkflowLoading(label);
    try {
      await callback();
      setWorkflowMessage(`${label} completed.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : `${label} failed.`;
      setWorkflowMessage(message);
    } finally {
      setWorkflowLoading(null);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
      <Card>
        <CardHeader>
          <CardTitle>Letter Workspace</CardTitle>
          <p className="text-xs text-muted-foreground">Context scope: COMPANY</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Letter title" />
          <Input
            value={jobReference}
            onChange={(event) => setJobReference(event.target.value)}
            placeholder="Job reference (optional, e.g. JOB-2026-0042)"
          />
          <RichTextEditor value={content} onChange={setContent} />

          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <Button key={tag.id} type="button" size="sm" variant={selectedTags.includes(tag.id) ? 'default' : 'outline'} onClick={() => toggleTag(tag.id)}>
                {tag.name}
              </Button>
            ))}
          </div>

          <div className="space-y-2 rounded border p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <p className="text-sm font-semibold">Approver picker</p>
              <p className="text-xs text-muted-foreground">
                Route uses these approvers (plus tag defaults). No UUID typing required.
              </p>
            </div>
            <Select
              onValueChange={addApprover}
              disabled={!selectedLetter || !isDraft || selectableApprovers.length === 0}
            >
              <SelectTrigger title={routeDisabledReason ?? 'Select an approver to add to routing for this draft.'}>
                <SelectValue placeholder={selectableApprovers.length > 0 ? 'Add approver' : 'No additional approvers available'} />
              </SelectTrigger>
              <SelectContent>
                {selectableApprovers.map((approver) => (
                  <SelectItem key={approver.id} value={approver.id}>
                    {approver.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex flex-wrap gap-2">
              {selectedApprovers.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No manual approvers selected. Tag defaults will still apply when routing.
                </p>
              ) : (
                selectedApprovers.map((approver) => (
                  <Button
                    key={approver.id}
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => removeApprover(approver.id)}
                    title="Remove approver from route selection"
                  >
                    {approver.label} x
                  </Button>
                ))
              )}
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button onClick={handleSaveDraft} disabled={isSaving || !!saveDisabledReason} title={saveDisabledReason}>
                {isSaving ? 'Saving...' : 'Save Draft'}
              </Button>
            </div>

            <div className="rounded border border-dashed p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <p className="text-sm font-semibold">Workflow actions</p>
                <p className="text-xs text-muted-foreground">{workflowHelperText}</p>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  disabled={!!routeDisabledReason || !!workflowLoading}
                  title={routeDisabledReason ?? 'Route saves tag + approver assignments for this draft before submission.'}
                  onClick={() => {
                    void runWorkflowAction('Route', async () => {
                      if (!selectedLetter) return;
                      await onRoute(selectedLetter.id, {
                        tag_ids: selectedTags,
                        cc_approver_ids: selectedApproverIds,
                        approval_mode: 'ALL',
                        job_reference: jobReference.trim() || undefined
                      });
                    });
                  }}
                >
                  {workflowLoading === 'Route' ? 'Routing...' : 'Route'}
                </Button>
                <Button
                  variant="outline"
                  disabled={!!submitDisabledReason || !!workflowLoading}
                  title={submitDisabledReason ?? 'Submit moves this draft into SUBMITTED and starts approval review.'}
                  onClick={() => {
                    void runWorkflowAction('Submit', async () => {
                      if (!selectedLetter) return;
                      await onSubmit(selectedLetter.id);
                    });
                  }}
                >
                  {workflowLoading === 'Submit' ? 'Submitting...' : 'Submit'}
                </Button>
                <Button
                  variant="outline"
                  disabled={!!approveDisabledReason || !!workflowLoading}
                  title={approveDisabledReason ?? 'Approve records your decision on this submitted letter.'}
                  onClick={() => {
                    void runWorkflowAction('Approve', async () => {
                      if (!selectedLetter) return;
                      await onApprove(selectedLetter.id);
                    });
                  }}
                >
                  {workflowLoading === 'Approve' ? 'Approving...' : 'Approve'}
                </Button>
                <Button
                  variant="outline"
                  disabled={!!rejectDisabledReason || !!workflowLoading}
                  title={rejectDisabledReason ?? 'Reject records a rejection decision and marks the letter as REJECTED.'}
                  onClick={() => {
                    void runWorkflowAction('Reject', async () => {
                      if (!selectedLetter) return;
                      await onReject(selectedLetter.id, 'Rejected from workspace');
                    });
                  }}
                >
                  {workflowLoading === 'Reject' ? 'Rejecting...' : 'Reject'}
                </Button>
                <Button
                  variant="outline"
                  disabled={!!issueDisabledReason || !!workflowLoading}
                  title={issueDisabledReason ?? 'Issue creates an issuance record for an APPROVED letter.'}
                  onClick={() => {
                    void runWorkflowAction('Issue', async () => {
                      if (!selectedLetter) return;
                      await onIssue(selectedLetter.id, { job_reference: jobReference.trim() || undefined });
                    });
                  }}
                >
                  {workflowLoading === 'Issue' ? 'Issuing...' : 'Issue'}
                </Button>
                <Button
                  variant="outline"
                  disabled={!!printDisabledReason || !!workflowLoading}
                  title={printDisabledReason ?? 'Print records a print event for the latest ISSUED version.'}
                  onClick={() => {
                    void runWorkflowAction('Print', async () => {
                      if (!selectedLetter) return;
                      await onPrint(selectedLetter.id, { job_reference: jobReference.trim() || undefined });
                    });
                  }}
                >
                  {workflowLoading === 'Print' ? 'Printing...' : 'Print'}
                </Button>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => setShowAudit(true)}>Audit</Button>
            </div>
          </div>

          {saveMessage && (
            <p className="text-sm text-muted-foreground">{saveMessage}</p>
          )}

          {workflowMessage && (
            <p className="text-sm text-muted-foreground">{workflowMessage}</p>
          )}

          <details>
            <summary>Advanced</summary>
            <p className="text-sm text-muted-foreground">ReactFlow lifecycle remains available in legacy view.</p>
          </details>

          {selectedLetter && (
            <div className="rounded border p-3">
              <h4 className="mb-2 font-medium">Approver Checklist</h4>
              <div className="space-y-1 text-sm">
                {(selectedLetter.letter_approver_assignments || []).map((assignment: any) => {
                  const displayLabel = approverLookup.get(assignment.approver_id)?.label || formatApproverFallback(assignment.approver_id);
                  return (
                    <div key={assignment.id} className="flex items-center justify-between">
                      <span>{displayLabel}</span>
                      <Badge>{assignment.decision}</Badge>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>My Pending Approvals</CardTitle>
            <p className="text-xs text-muted-foreground">
              Submitted letters waiting on your approval decision.
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            {pendingApprovals.length === 0 ? (
              <p className="text-sm text-muted-foreground">No pending approvals assigned to you.</p>
            ) : (
              pendingApprovals.map((letter) => (
                <button
                  key={letter.id}
                  type="button"
                  className={`w-full rounded border p-2 text-left ${selectedId === letter.id ? 'border-primary bg-muted/40' : ''}`}
                  onClick={() => setSelectedId(letter.id)}
                >
                  <p className="text-sm font-medium">{letter.title || 'Untitled letter'}</p>
                  <p className="text-xs text-muted-foreground">{new Date(letter.updated_at || letter.created_at).toLocaleString()}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <Badge variant="secondary">
                      Pending: {letter.approval_summary?.pending ?? 0}
                    </Badge>
                  </div>
                </button>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Stage Panel</CardTitle>
            <p className="text-xs text-muted-foreground">
              Letters are grouped by lifecycle status. Click any letter card to load it into the workspace and run actions.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {STAGES.map((stage) => (
              <div key={stage} className="space-y-2">
                <h4 className="text-sm font-semibold">{stage} ({grouped[stage].length})</h4>
                {grouped[stage].map((letter) => (
                  <button key={letter.id} type="button" className="w-full rounded border p-2 text-left" onClick={() => setSelectedId(letter.id)}>
                    <p className="text-sm font-medium">{letter.title || 'Untitled letter'}</p>
                    <p className="text-xs text-muted-foreground">{new Date(letter.updated_at || letter.created_at).toLocaleString()}</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {(letter.letter_tags || []).map((item: any, index: number) => (
                        <Badge key={`${item.tag_id}-${index}`} variant="secondary">{item.tags?.name || item.tag_id}</Badge>
                      ))}
                      {letter.status === 'SUBMITTED' && letter.canApprove && (
                        <Badge>My decision needed</Badge>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Dialog open={showAudit} onOpenChange={setShowAudit}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Audit Trail</DialogTitle>
          </DialogHeader>
          <div className="max-h-[420px] space-y-2 overflow-auto text-sm">
            {auditLogs.map((log) => (
              <div key={log.id} className="rounded border p-2">
                <p>{log.action}</p>
                <p className="text-xs text-muted-foreground">{log.created_at}</p>
                <pre className="overflow-auto text-xs">{JSON.stringify(log.metadata, null, 2)}</pre>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
