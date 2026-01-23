import React, { useState, useEffect } from 'react';
import { supabase } from './lib/supabase';
// import './App.css'; // Disabled to rely on Tailwind/shadcn theme
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Textarea } from "@/components/ui/textarea"
import { Loader2, Lock, ShieldCheck, Mail, FileCheck, LogOut } from "lucide-react"

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

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
  const [session, setSession] = useState<any>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

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
  // State for expanded audit log
  const [selectedLog, setSelectedLog] = useState<any>(null);

  const coerceArray = (value: unknown) => (Array.isArray(value) ? value : []);

  useEffect(() => {
    if (import.meta.env.VITE_DEMO_MODE === 'true') {
      setSession({
        user: {
          id: '00000000-0000-0000-0000-000000000001',
          email: 'demo@example.com'
        },
        access_token: 'demo-token'
      });
      return;
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    // Verification doesn't require auth (unless protected by key)
    const token = window.location.pathname.split('/verify/')[1];
    if (token) {
      const fetchVerification = async (accessKey?: string) => {
        const res = await fetch(`${API_BASE}/verify/${token}`, {
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
    if (!session) return;

    fetch(`${API_BASE}/departments?context=${context}`)
      .then(res => (res.ok ? res.json() : []))
      .then(data => setDepartments(coerceArray(data)))
      .catch(() => setDepartments([]));
    fetch(`${API_BASE}/tags?context=${context}`)
      .then(res => (res.ok ? res.json() : []))
      .then(data => setTags(coerceArray(data)))
      .catch(() => setTags([]));
  }, [context, session]);

  const authenticatedFetch = async (url: string, options: RequestInit = {}) => {
    if (!session) return new Response(null, { status: 401, statusText: "Unauthorized" });
    const headers = {
      ...options.headers,
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json'
    };
    return fetch(url, { ...options, headers });
  };

  const fetchLetters = () => {
    if (!session) return;
    authenticatedFetch(`${API_BASE}/letters`)
      .then(res => (res.ok ? res.json() : []))
      .then(data => setLetters(coerceArray(data)))
      .catch(() => setLetters([]));
  };

  const fetchAuditLogs = () => {
    if (!session) return;
    authenticatedFetch(`${API_BASE}/audit-logs`)
      .then(res => (res.ok ? res.json() : []))
      .then(data => setAuditLogs(coerceArray(data)))
      .catch(() => setAuditLogs([]));
  };

  const fetchEmailLinks = () => {
    if (!session) return;
    authenticatedFetch(`${API_BASE}/email-links`)
      .then(res => (res.ok ? res.json() : []))
      .then(data => setEmailLinks(coerceArray(data)))
      .catch(() => setEmailLinks([]));
  };

  const fetchCommittees = () => {
    if (!session) return;
    authenticatedFetch(`${API_BASE}/committees`)
      .then(res => (res.ok ? res.json() : []))
      .then(data => setCommittees(coerceArray(data)))
      .catch(() => setCommittees([]));
  };

  useEffect(() => {
    if (session) {
      fetchLetters();
      fetchAuditLogs();
      fetchEmailLinks();
      fetchCommittees();
    }
  }, [session]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError(null);
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setAuthLoading(false);
    if (error) setAuthError(error.message);
  };

  const handleSignUp = async () => {
    setAuthLoading(true);
    setAuthError(null);
    const { error } = await supabase.auth.signUp({
      email,
      password
    });
    setAuthLoading(false);
    if (error) setAuthError(error.message);
    else alert('Check your email for the login link!');
  };


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await authenticatedFetch(`${API_BASE}/letters`, {
        method: 'POST',
        body: JSON.stringify({
          context,
          department_id: selectedDept,
          tag_ids: selectedTags,
          content
        })
      });
      if (res.ok) {
        setContent('');
        setSelectedTags([]);
        setSelectedDept('');
        fetchLetters();
        fetchAuditLogs();
      } else {
        const err = await res.json();
        alert(`Error: ${err.error}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (id: string) => {
    setLoading(true);
    try {
      const res = await authenticatedFetch(`${API_BASE}/letters/${id}/approve`, {
        method: 'POST',
        body: JSON.stringify({
          comment: 'Approved via dashboard'
        })
      });
      if (res.ok) {
        fetchLetters();
        fetchAuditLogs();
      } else {
        const err = await res.json();
        alert(`Error: ${err.error}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCommitteeApprove = async (id: string) => {
    if (committees.length === 0) return;

    setLoading(true);
    try {
      const res = await authenticatedFetch(`${API_BASE}/letters/${id}/committee-approve`, {
        method: 'POST',
        body: JSON.stringify({
          comment: 'Approved via committee dashboard'
        })
      });
      if (res.ok) {
        fetchLetters();
        fetchAuditLogs();
      } else {
        const err = await res.json();
        alert(`Error: ${err.error}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleIssue = async (id: string) => {
    setLoading(true);
    try {
      const res = await authenticatedFetch(`${API_BASE}/letters/${id}/issue`, {
        method: 'POST',
        body: JSON.stringify({
          channel: 'PRINT',
          printer_id: 'HP-LASERJET-400'
        })
      });
      const data = await res.json();
      if (res.ok) {
        if (data.pdf) {
          const win = window.open();
          if (win) {
            win.document.write(`<iframe src="${data.pdf}" frameborder="0" style="border:0; top:0px; left:0px; bottom:0px; right:0px; width:100%; height:100%;" allowfullscreen></iframe>`);
          }
        }
        fetchLetters();
        fetchAuditLogs();
      } else {
        alert(`Error: ${data.error}`);
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
      const res = await authenticatedFetch(`${API_BASE}/acknowledgements`, {
        method: 'POST',
        body: JSON.stringify({
          letter_id: id,
          job_reference,
          file_url
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
      const res = await authenticatedFetch(`${API_BASE}/email-links`, {
        method: 'POST',
        body: JSON.stringify({
          letter_id: id,
          job_reference,
          sender,
          subject,
          body_excerpt,
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
    const token = window.location.pathname.split('/verify/')[1];
    if (!token || !verifyAccessKey) return;
    const res = await fetch(`${API_BASE}/verify/${token}`, {
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

  // Verification View (Public or Protected by Key)
  if (verificationData) {
    return (
      <div className="container min-h-screen flex flex-col items-center justify-center p-4">
        <Card className={`w-full max-w-lg shadow-2xl ${verificationData.valid ? 'border-green-500' : 'border-red-500'}`}>
          <CardHeader>
            <CardTitle>{verificationData.valid ? '✅ Authentic Document' : '❌ Invalid Document'}</CardTitle>
            <CardDescription>{verificationData.valid ? 'The document integrity has been verified.' : 'The document appears to be tampered with or revoked.'}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {verificationData.valid && (
              <div className="space-y-2 text-sm">
                <div className="flex justify-between border-b pb-2">
                  <span className="text-muted-foreground">Context</span>
                  <span className="font-medium">{verificationData.document_details.context}</span>
                </div>
                <div className="flex justify-between border-b pb-2">
                  <span className="text-muted-foreground">Department</span>
                  <span className="font-medium">{verificationData.document_details.department}</span>
                </div>
                <div className="flex justify-between border-b pb-2">
                  <span className="text-muted-foreground">Status</span>
                  <Badge variant="outline">{verificationData.document_details.status}</Badge>
                </div>
                <div className="flex justify-between pt-2">
                  <span className="text-muted-foreground">Approved At</span>
                  <span className="font-medium">{new Date(verificationData.document_details.approved_at).toLocaleString()}</span>
                </div>
              </div>
            )}
            {!verificationData.valid && <p className="text-destructive font-medium">This document is not valid.</p>}
          </CardContent>
          <CardFooter>
            <Button variant="outline" className="w-full" onClick={() => window.location.href = '/'}>Back to Dashboard</Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  if (requiresAccessKey) {
    return (
      <div className="container min-h-screen flex flex-col items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-blue-400">Locked Document</CardTitle>
            <CardDescription>Authorized access is required to verify this document.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Access Key</Label>
              <Input
                type="password"
                placeholder="Enter access key..."
                value={verifyAccessKey}
                onChange={e => setVerifyAccessKey(e.target.value)}
              />
            </div>
            {verifyError && <p className="text-destructive text-sm">{verifyError}</p>}
          </CardContent>
          <CardFooter className="flex flex-col gap-2">
            <Button className="w-full" onClick={handleVerifyAccess}>Verify</Button>
            <Button variant="ghost" className="w-full" onClick={() => window.location.href = '/'}>Back to Dashboard</Button>
          </CardFooter>
        </Card>
      </div>
    )
  }

  // Auth View
  if (!session) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 relative overflow-hidden bg-background">
        {/* Background decoration */}
        <div className="absolute top-0 left-0 w-full h-full bg-grid-white/[0.02] -z-10" />
        <div className="absolute -top-40 -left-40 w-80 h-80 bg-primary/20 rounded-full blur-[100px]" />
        <div className="absolute -bottom-40 -right-40 w-80 h-80 bg-accent/20 rounded-full blur-[100px]" />

        <div className="mb-8 text-center">
          <div className="flex items-center justify-center mb-4">
            <ShieldCheck className="h-12 w-12 text-primary" />
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight lg:text-5xl mb-2 bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
            MCC Letter Issuance
          </h1>
          <p className="text-muted-foreground">Secure document generation and verification system.</p>
        </div>

        <Card className="w-full max-w-md shadow-xl border-border/50 bg-card/50 backdrop-blur-xl">
          <CardHeader>
            <CardTitle>Sign In</CardTitle>
            <CardDescription>Enter your credentials to access the system.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="name@example.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                />
              </div>
              {authError && <p className="text-destructive text-sm font-medium">{authError}</p>}
              <Button type="submit" className="w-full" disabled={authLoading}>
                {authLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Sign In'}
              </Button>
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">Or</span>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={authLoading}
                onClick={async () => {
                  setAuthLoading(true);
                  setAuthError(null);
                  const { error } = await supabase.auth.signInWithPassword({
                    email: 'demo@mcc.local',
                    password: 'Demo@12345',
                  });
                  setAuthLoading(false);
                  if (error) setAuthError(error.message);
                }}
              >
                Login as Guest / Demo
              </Button>
            </form>
          </CardContent>
          <CardFooter>
            <div className="w-full text-center text-sm">
              Don't have an account? <span className="text-primary hover:underline cursor-pointer" onClick={handleSignUp}>Sign Up</span>
            </div>
          </CardFooter>
        </Card>
      </div>
    );
  }



  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Detail Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <Card className="w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col shadow-2xl">
            <CardHeader className="border-b bg-muted/40">
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>Audit Log Details</CardTitle>
                  <CardDescription>Transaction ID: <span className="font-mono">{selectedLog.id}</span></CardDescription>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setSelectedLog(null)}><LogOut className="h-4 w-4" /></Button>
              </div>
            </CardHeader>
            <CardContent className="p-0 overflow-auto">
              <div className="p-4 space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground block mb-1">Action</span>
                    <Badge variant="outline">{selectedLog.action}</Badge>
                  </div>
                  <div>
                    <span className="text-muted-foreground block mb-1">Entity</span>
                    <span className="font-medium">{selectedLog.entity_type}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block mb-1">Entity ID</span>
                    <span className="font-mono">{selectedLog.entity_id}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block mb-1">Timestamp</span>
                    <span>{new Date(selectedLog.created_at).toLocaleString()}</span>
                  </div>
                </div>

                <div>
                  <span className="text-muted-foreground block mb-2 font-medium">Full Metadata Payload</span>
                  <pre className="p-4 rounded-md border font-mono text-xs overflow-auto whitespace-pre-wrap bg-card text-card-foreground">
                    {JSON.stringify(selectedLog.metadata, null, 2)}
                  </pre>
                </div>
              </div>
            </CardContent>
            <CardFooter className="border-t bg-muted/40 p-4 justify-end">
              <Button onClick={() => setSelectedLog(null)}>Close</Button>
            </CardFooter>
          </Card>
        </div>
      )}

      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 items-center">
          <div className="mr-4 hidden md:flex">
            <a className="mr-6 flex items-center space-x-2" href="/">
              <ShieldCheck className="h-6 w-6" />
              <span className="hidden font-bold sm:inline-block">MCC Issuance</span>
            </a>
          </div>

          <div className="flex flex-1 items-center justify-between space-x-2 md:justify-end">
            <nav className="flex items-center space-x-2">
              <Tabs value={context} onValueChange={(v: string) => setContext(v as any)} className="w-[400px]">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="COMPANY">Company Ops</TabsTrigger>
                  <TabsTrigger value="BCBA">BCBA Association</TabsTrigger>
                </TabsList>
              </Tabs>
            </nav>
            <div className="flex items-center gap-2">
              <div className="text-xs text-muted-foreground mr-2">
                {session.user.email}
              </div>
              <Button variant="ghost" size="icon" onClick={() => supabase.auth.signOut()}>
                <LogOut className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 container py-6 grid gap-6">

        <Tabs value={view} onValueChange={(v: string) => setView(v as any)} className="w-full">
          <div className="flex items-center justify-between mb-4">
            <TabsList>
              <TabsTrigger value="DASHBOARD">Dashboard</TabsTrigger>
              <TabsTrigger value="AUDIT">Audit Log</TabsTrigger>
            </TabsList>
          </div>


          <TabsContent value="DASHBOARD" className="space-y-6">
            <div className="grid gap-6 md:grid-cols-[350px_1fr]">
              <section className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Create Letter</CardTitle>
                    <CardDescription>Draft a new letter for approval.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-4">
                      <div className="space-y-2">
                        <Label>Department</Label>
                        <Select value={selectedDept} onValueChange={setSelectedDept}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select Department" />
                          </SelectTrigger>
                          <SelectContent>
                            {departments.map(d => (
                              <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Tags</Label>
                        <div className="grid grid-cols-2 gap-2">
                          {tags.map(t => (
                            <div key={t.id} className="flex items-center space-x-2">
                              <Checkbox
                                id={t.id}
                                checked={selectedTags.includes(t.id)}
                                onCheckedChange={(checked) => {
                                  if (checked) setSelectedTags([...selectedTags, t.id]);
                                  else setSelectedTags(selectedTags.filter(id => id !== t.id));
                                }}
                              />
                              <Label htmlFor={t.id} className="text-xs">{t.name}</Label>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Content</Label>
                        <Textarea
                          className="min-h-[120px]"
                          placeholder="Draft content..."
                          value={content}
                          onChange={e => setContent(e.target.value)}
                          required
                        />
                      </div>
                      <Button type="submit" className="w-full" disabled={loading}>
                        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Create Draft
                      </Button>
                    </form>
                  </CardContent>
                </Card>
              </section>

              <section className="grid gap-4 content-start">
                <h2 className="text-lg font-semibold tracking-tight">Active Letters</h2>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-2">
                  {letters.map((l: any) => (
                    <Card key={l.id} className={`transition-all hover:shadow-md ${l.status === 'APPROVED' || l.status === 'ISSUED' ? 'bg-muted/50 border-primary/20' : ''}`}>
                      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                        <div className="space-y-1">
                          <CardTitle className="text-base font-medium">{l.departments?.name}</CardTitle>
                          <div className="flex items-center gap-2">
                            <Badge variant={l.context === 'COMPANY' ? 'default' : 'secondary'}>{l.context}</Badge>
                            <Badge variant="outline">{l.status}</Badge>
                          </div>
                        </div>
                        {(l.status === 'APPROVED' || l.status === 'ISSUED') && <Lock className="h-4 w-4 text-muted-foreground" />}
                      </CardHeader>
                      <CardContent>
                        <div className="flex flex-wrap gap-1 mt-2">
                          {l.letter_tags?.map((lt: any) => (
                            <Badge key={lt.tags.name} variant="secondary" className="text-[10px]">{lt.tags.name}</Badge>
                          ))}
                        </div>
                      </CardContent>
                      <CardFooter className="flex flex-col gap-2 pt-2">
                        {l.status === 'DRAFT' && (
                          <Button
                            size="sm"
                            className="w-full"
                            variant={l.context === 'COMPANY' ? 'default' : 'secondary'}
                            onClick={() => l.context === 'COMPANY' ? handleApprove(l.id) : handleCommitteeApprove(l.id)}
                            disabled={loading}
                          >
                            <FileCheck className="mr-2 h-4 w-4" />
                            {l.context === 'COMPANY' ? 'Approve' : 'Committee Approve'}
                          </Button>
                        )}
                        {l.status === 'APPROVED' && (
                          <Button size="sm" className="w-full" onClick={() => handleIssue(l.id)} disabled={loading}>
                            <ShieldCheck className="mr-2 h-4 w-4" />
                            Issue Letter
                          </Button>
                        )}
                        {l.status === 'ISSUED' && (
                          <div className="flex gap-2 w-full">
                            <Button size="sm" variant="outline" className="flex-1" onClick={() => handleAcknowledge(l.id)} disabled={loading}>Link Ack</Button>
                            <Button size="sm" variant="outline" className="flex-1" onClick={() => handleEmailLink(l.id)} disabled={loading}>Link Email</Button>
                          </div>
                        )}
                        {(l.status !== 'ISSUED' && l.status !== 'APPROVED') && (
                          <Button size="sm" variant="ghost" className="w-full text-xs" onClick={() => handleEmailLink(l.id)} disabled={loading}>
                            <Mail className="mr-2 h-3 w-3" />
                            Link Email
                          </Button>
                        )}
                      </CardFooter>
                    </Card>
                  ))}
                </div>
              </section>
            </div>
          </TabsContent>

          <TabsContent value="AUDIT">
            <Card>
              <CardHeader>
                <CardTitle>Audit Log</CardTitle>
                <CardDescription>Recent system activity and security events.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr className="text-left">
                        <th className="p-3 font-medium text-muted-foreground">Action</th>
                        <th className="p-3 font-medium text-muted-foreground">Entity</th>
                        <th className="p-3 font-medium text-muted-foreground">ID</th>
                        <th className="p-3 font-medium text-muted-foreground">Time</th>
                        <th className="p-3 font-medium text-muted-foreground">Metadata</th>
                      </tr>
                    </thead>
                    <tbody>
                      {auditLogs.map(log => (
                        <tr
                          key={log.id}
                          className="border-t hover:bg-muted/50 cursor-pointer transition-colors"
                          onClick={() => setSelectedLog(log)}
                        >
                          <td className="p-3"><Badge variant="outline">{log.action}</Badge></td>
                          <td className="p-3">{log.entity_type}</td>
                          <td className="p-3 font-mono text-xs text-muted-foreground">{log.entity_id.substring(0, 8)}...</td>
                          <td className="p-3 text-muted-foreground">{new Date(log.created_at).toLocaleString()}</td>
                          <td className="p-3">
                            <code className="text-xs bg-muted px-1 py-0.5 rounded text-muted-foreground">
                              Click to view details
                            </code>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-8">
                  <h3 className="text-lg font-semibold mb-4">Email Linkages</h3>
                  <div className="rounded-md border">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50">
                        <tr className="text-left">
                          <th className="p-3 font-medium text-muted-foreground">Letter</th>
                          <th className="p-3 font-medium text-muted-foreground">Reference</th>
                          <th className="p-3 font-medium text-muted-foreground">Sender</th>
                          <th className="p-3 font-medium text-muted-foreground">Received</th>
                        </tr>
                      </thead>
                      <tbody>
                        {emailLinks.map(link => (
                          <tr key={link.id} className="border-t">
                            <td className="p-3 font-mono text-xs">{link.letter_id?.substring(0, 8)}...</td>
                            <td className="p-3">{link.job_reference}</td>
                            <td className="p-3">{link.sender}</td>
                            <td className="p-3 text-muted-foreground">{link.received_at ? new Date(link.received_at).toLocaleDateString() : '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

export default App;
