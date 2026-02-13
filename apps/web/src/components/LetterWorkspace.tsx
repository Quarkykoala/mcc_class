import React, { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { RichTextEditor } from './RichTextEditor';

const STAGES = ['DRAFT', 'SUBMITTED', 'APPROVED', 'ISSUED', 'REJECTED', 'REVOKED'] as const;

type Stage = typeof STAGES[number];

type Tag = { id: string; name: string };
type Letter = any;

type Props = {
  letters: Letter[];
  tags: Tag[];
  auditLogs: any[];
  onCreateOrUpdate: (payload: any) => Promise<void>;
  onRoute: (id: string, payload: any) => Promise<void>;
  onSubmit: (id: string) => Promise<void>;
  onApprove: (id: string, comment?: string) => Promise<void>;
  onReject: (id: string, reason: string) => Promise<void>;
  onIssue: (id: string) => Promise<void>;
  onPrint: (id: string) => Promise<void>;
  onFetchLetter: (id: string) => Promise<any>;
};

export function LetterWorkspace({ letters, tags, auditLogs, onCreateOrUpdate, onRoute, onSubmit, onApprove, onReject, onIssue, onPrint, onFetchLetter }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(letters[0]?.id ?? null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [ccApprovers, setCcApprovers] = useState('');
  const [showAudit, setShowAudit] = useState(false);

  const selectedLetter = letters.find((letter) => letter.id === selectedId) ?? null;

  React.useEffect(() => {
    if (!selectedLetter) return;
    setTitle(selectedLetter.title || '');
    if (selectedLetter.content) {
      setContent(selectedLetter.content);
    } else {
      setContent('Loading...');
      onFetchLetter(selectedLetter.id).then((fullLetter) => {
        setContent(fullLetter.content || '');
      }).catch((err) => {
        console.error('Failed to fetch letter content', err);
        setContent('Error loading content.');
      });
    }
    setSelectedTags((selectedLetter.letter_tags || []).map((item: any) => item.tag_id));
  }, [selectedLetter?.id]);

  const grouped = useMemo(() => {
    return STAGES.reduce((acc, stage) => {
      acc[stage] = letters.filter((item) => item.status === stage);
      return acc;
    }, {} as Record<Stage, Letter[]>);
  }, [letters]);

  const toggleTag = (tagId: string) => {
    setSelectedTags((prev) => prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]);
  };

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
      <Card>
        <CardHeader>
          <CardTitle>Letter Workspace</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Letter title" />
          <RichTextEditor value={content} onChange={setContent} />

          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <Button key={tag.id} type="button" size="sm" variant={selectedTags.includes(tag.id) ? 'default' : 'outline'} onClick={() => toggleTag(tag.id)}>
                {tag.name}
              </Button>
            ))}
          </div>

          <Input value={ccApprovers} onChange={(event) => setCcApprovers(event.target.value)} placeholder="To/CC approver UUIDs (comma separated)" />

          <div className="flex flex-wrap gap-2">
            <Button onClick={() => onCreateOrUpdate({ id: selectedLetter?.id, content, title, tag_ids: selectedTags })}>Save Draft</Button>
            {selectedLetter && <Button variant="outline" onClick={() => onRoute(selectedLetter.id, { tag_ids: selectedTags, cc_approver_ids: ccApprovers.split(',').map((x) => x.trim()).filter(Boolean), approval_mode: 'ALL' })}>Route</Button>}
            {selectedLetter && <Button variant="outline" onClick={() => onSubmit(selectedLetter.id)}>Submit</Button>}
            {selectedLetter && <Button variant="outline" onClick={() => onApprove(selectedLetter.id)}>Approve</Button>}
            {selectedLetter && <Button variant="outline" onClick={() => onReject(selectedLetter.id, 'Rejected from workspace')}>Reject</Button>}
            {selectedLetter && <Button variant="outline" onClick={() => onIssue(selectedLetter.id)}>Issue</Button>}
            {selectedLetter && <Button variant="outline" onClick={() => onPrint(selectedLetter.id)}>Print</Button>}
            <Button variant="secondary" onClick={() => setShowAudit(true)}>Audit</Button>
          </div>

          <details>
            <summary>Advanced</summary>
            <p className="text-sm text-muted-foreground">ReactFlow lifecycle remains available in legacy view.</p>
          </details>

          {selectedLetter && (
            <div className="rounded border p-3">
              <h4 className="mb-2 font-medium">Approver Checklist</h4>
              <div className="space-y-1 text-sm">
                {(selectedLetter.letter_approver_assignments || []).map((assignment: any) => (
                  <div key={assignment.id} className="flex items-center justify-between">
                    <span>{assignment.approver_id}</span>
                    <Badge>{assignment.decision}</Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Stage Panel</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {STAGES.map((stage) => (
            <div key={stage} className="space-y-2">
              <h4 className="text-sm font-semibold">{stage}</h4>
              {grouped[stage].map((letter) => (
                <button key={letter.id} type="button" className="w-full rounded border p-2 text-left" onClick={() => setSelectedId(letter.id)}>
                  <p className="text-sm font-medium">{letter.title || 'Untitled letter'}</p>
                  <p className="text-xs text-muted-foreground">{new Date(letter.updated_at || letter.created_at).toLocaleString()}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {(letter.letter_tags || []).map((item: any, index: number) => (
                      <Badge key={`${item.tag_id}-${index}`} variant="secondary">{item.tags?.name || item.tag_id}</Badge>
                    ))}
                  </div>
                </button>
              ))}
            </div>
          ))}
        </CardContent>
      </Card>

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
