import React, { useState, useEffect } from 'react';
import { supabase } from './lib/supabase';
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { LetterTrackingFlow } from "./components/LetterTrackingFlow"
import { OnboardingTour } from "./components/OnboardingTour"
import { DemoRoleSelector, type DemoRole } from "./components/DemoRoleSelector"
import { DemoDebugMenu } from "./components/DemoDebugMenu"
import { LogStream, logEvent } from "./components/LogStream"
import QRCode from "react-qr-code"
import { Loader2, Lock, ShieldCheck, Mail, FileCheck, LogOut, Eye, EyeOff, Network, QrCode, HelpCircle } from "lucide-react"

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
const isDemoMode = import.meta.env.VITE_DEMO_MODE === 'true';
const isVerificationRoute = typeof window !== 'undefined' && window.location.pathname.includes('/verify/');

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
  const [showPassword, setShowPassword] = useState(false);

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
  const [reprintRequests, setReprintRequests] = useState<any[]>([]);
  const [selectedLog, setSelectedLog] = useState<any>(null);
  const [trackingLetter, setTrackingLetter] = useState<any>(null);
  const [viewingContent, setViewingContent] = useState<any>(null);

  const [viewingQR, setViewingQR] = useState<any>(null);
  const [verifyLinks, setVerifyLinks] = useState<Record<string, string>>(() => {
    if (typeof window === 'undefined') return {};
    try {
      return JSON.parse(localStorage.getItem('mcc-verify-links') || '{}');
    } catch {
      return {};
    }
  });
  const [demoRole, setDemoRole] = useState<DemoRole>('REQUESTER');
  const [newTag, setNewTag] = useState('');

  const isActionAllowed = (action: 'CREATE' | 'APPROVE' | 'ISSUE' | 'PRINT' | 'REJECT' | 'MANAGE') => {
    if (demoRole === 'AUDITOR') return false;
    if (demoRole === 'REQUESTER') return action === 'CREATE';
    if (demoRole === 'APPROVER') return action === 'APPROVE' || action === 'REJECT';
    if (demoRole === 'PRINTER') return action === 'ISSUE' || action === 'PRINT' || action === 'MANAGE' || action === 'REJECT';
    return true;
  };

  const [view, setView] = useState<'DASHBOARD' | 'AUDIT'>('DASHBOARD');

  const coerceArray = (value: unknown) => (Array.isArray(value) ? value : []);

  const setDemoSession = () => {
    setSession({
      user: {
        id: '00000000-0000-0000-0000-000000000001',
        email: 'demo@example.com'
      },
      access_token: 'demo-token'
    });
  };

  useEffect(() => {
    if (isDemoMode) {
      setDemoSession();
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
    if (isDemoMode && !session && !isVerificationRoute) {
      setDemoSession();
    }
  }, [session]);

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
    const method = options.method || 'GET';
    const endpoint = url.replace(API_BASE, '');

    // Log Request
    logEvent('API', `REQ: ${method} ${endpoint}`);

    if (!session) {
      logEvent('AUTH', 'Blocked: No Session');
      return new Response(null, { status: 401, statusText: "Unauthorized" });
    }

    const headers = {
      ...options.headers,
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json'
    };

    const start = Date.now();
    try {
      const res = await fetch(url, { ...options, headers });
      const duration = Date.now() - start;

      let statusType = 'INFO';
      if (res.status >= 400) statusType = 'API'; // Error/Warn? Using API type color for now.
      if (res.status >= 500) statusType = 'DB'; // Assume backend error might be DB related for demo color variety

      logEvent(statusType as any, `RES: ${res.status} ${endpoint} (${duration}ms)`);

      return res;
    } catch (e: any) {
      logEvent('API', `ERR: ${e.message}`);
      throw e;
    }
  };

  const fetchLetters = () => {
    if (!session) return;
    authenticatedFetch(`${API_BASE}/letters`)
      .then(res => (res.ok ? res.json() : { data: [] }))
      .then(response => {
        const lettersData = Array.isArray(response) ? response : (response.data || []);
        setLetters(coerceArray(lettersData));
      })
      .catch((err) => {
        console.error('Failed to fetch letters:', err);
        setLetters([]);
      });
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


  const fetchReprintRequests = () => {
    if (!session) return;
    authenticatedFetch(`${API_BASE}/reprints/requests`)
      .then(res => (res.ok ? res.json() : []))
      .then(data => setReprintRequests(coerceArray(data)))
      .catch(() => setReprintRequests([]));
  };

  useEffect(() => {
    if (session) {
      fetchLetters();
      fetchAuditLogs();
      fetchEmailLinks();
      fetchReprintRequests();
    }
  }, [session]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem('mcc-verify-links', JSON.stringify(verifyLinks));
  }, [verifyLinks]);

  const handleReprintApprove = async (id: string) => {
    setLoading(true);
    try {
      const res = await authenticatedFetch(`${API_BASE}/reprints/${id}/approve`, {
        method: 'POST',
        body: JSON.stringify({})
      });
      if (res.ok) {
        alert('Reprint approved.');
        fetchReprintRequests();
        fetchAuditLogs();
      } else {
        const err = await res.json();
        alert(`Error: ${err.error}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleAddTag = async () => {
    if (!newTag.trim()) return;
    try {
      const res = await authenticatedFetch(`${API_BASE}/tags`, {
        method: 'POST',
        body: JSON.stringify({ name: newTag, context })
      });
      if (res.ok) {
        const tag = await res.json();
        // Avoid duplicates if checking by ID/name in frontend, but here backend returns unique.
        setTags(prev => [...prev, tag]);
        setSelectedTags(prev => [...prev, tag.id]);
        setNewTag('');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isDemoMode) {
      setDemoSession();
      return;
    }
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
    if (isDemoMode) {
      setDemoSession();
      return;
    }
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

  const handleSignOut = async () => {
    if (isDemoMode) {
      setSession(null);
      return;
    }
    await supabase.auth.signOut();
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
        fetchLetters();
        fetchAuditLogs();
        if (data.verifyUrl) {
          setVerifyLinks(prev => ({ ...prev, [id]: data.verifyUrl }));
        }
        if (data.pdf) {
          window.open(data.pdf, '_blank');
        }
      } else {
        alert(`Error: ${data.error}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async (id: string) => {
    const reason = prompt('Enter rejection reason:');
    if (!reason) return;
    setLoading(true);
    try {
      const res = await authenticatedFetch(`${API_BASE}/letters/${id}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reason })
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

  const handleReprintRequest = async (id: string) => {
    const reason = prompt('Enter reason for reprint:');
    if (!reason) return;
    setLoading(true);
    try {
      const res = await authenticatedFetch(`${API_BASE}/letters/${id}/reprint-request`, {
        method: 'POST',
        body: JSON.stringify({ reason })
      });
      if (res.ok) {
        alert('Reprint request submitted.');
        fetchAuditLogs();
      } else {
        const err = await res.json();
        alert(`Error: ${err.error}`);
      }
    } finally {
      setLoading(false);
    }
  };


  const handlePrint = async (id: string) => {
    setLoading(true);
    try {
      const res = await authenticatedFetch(`${API_BASE}/letters/${id}/print`, {
        method: 'POST',
        body: JSON.stringify({ printer_id: 'DEFAULT' })
      });
      const data = await res.json();
      if (res.ok) {
        alert(`Print recorded. Count: ${data.print_count}`);
        fetchAuditLogs();
      } else {
        if (res.status === 403 && data.error.includes('limit reached')) {
          if (confirm('Print limit reached. Do you want to request a reprint?')) {
            handleReprintRequest(id);
          }
        } else {
          alert(`Error: ${data.error}`);
        }
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

  // --- VIEWS ---

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
                {verificationData.document_details.letter_number && (
                  <div className="flex justify-between border-b pb-2">
                    <span className="text-muted-foreground">Ref #</span>
                    <span className="font-mono font-medium">{verificationData.document_details.letter_number}</span>
                  </div>
                )}
                <div className="flex justify-between border-b pb-2">
                  <span className="text-muted-foreground">Department</span>
                  <span className="font-medium">{verificationData.document_details.department}</span>
                </div>
                <div className="flex justify-between border-b pb-2">
                  <span className="text-muted-foreground">Status</span>
                  <Badge variant="outline">{verificationData.document_details.status}</Badge>
                </div>
                <div className="flex justify-between pt-2">
                  <span className="text-muted-foreground">Issued At</span>
                  <span className="font-medium">{verificationData.document_details.issued_at ? new Date(verificationData.document_details.issued_at).toLocaleString() : '-'}</span>
                </div>
                <div className="flex justify-between pt-2">
                  <span className="text-muted-foreground">Issued By</span>
                  <span className="font-mono font-medium">
                    {verificationData.document_details.issued_by ? verificationData.document_details.issued_by.substring(0, 8) + '...' : '-'}
                  </span>
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

  if (!session) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 relative overflow-hidden bg-background">
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
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="********"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    className="pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex={-1}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Eye className="h-4 w-4 text-muted-foreground" />
                    )}
                  </Button>
                </div>
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
                  if (isDemoMode) {
                    setDemoSession();
                    return;
                  }
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
            <DemoRoleSelector currentRole={demoRole} onRoleChange={setDemoRole} />
            <div className="flex items-center gap-2">
              <div className="text-xs text-muted-foreground mr-2">
                {session.user.email}
              </div>
              <Button variant="ghost" size="icon" title="Restart Tour" onClick={() => {
                  localStorage.removeItem('mcc-demo-onboarding-seen');
                  window.location.reload();
              }}>
                <HelpCircle className="h-5 w-5" />
              </Button>
              <Button variant="ghost" size="icon" onClick={handleSignOut}>
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
                {reprintRequests.length > 0 && (
                  <Card className="border-orange-500/50 bg-orange-500/10">
                    <CardHeader>
                      <CardTitle className="text-orange-600">Pending Reprints</CardTitle>
                      <CardDescription>Requests needing approval.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {reprintRequests.map(r => (
                        <div key={r.id} className="text-sm border-b pb-2 last:border-0">
                          <div className="font-medium">{r.issuances?.letter_versions?.letters?.departments?.name}</div>
                          <div className="text-muted-foreground text-xs">{r.reason}</div>
                          <div className="text-xs text-muted-foreground mt-1">
                            By: {r.requester_id.substring(0, 8)}...
                          </div>
                          <Button size="sm" className="w-full mt-2" onClick={() => handleReprintApprove(r.id)} disabled={loading}>
                            Approve
                          </Button>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}

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
                        <div className="flex gap-2 pt-2">
                          <Input
                            placeholder="Add custom tag..."
                            value={newTag}
                            onChange={e => setNewTag(e.target.value)}
                            className="h-8 text-xs"
                            onKeyDown={e => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleAddTag();
                              }
                            }}
                          />
                          <Button type="button" size="sm" variant="secondary" onClick={handleAddTag} disabled={loading || !newTag.trim()}>
                            +
                          </Button>
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
                          <div className="flex items-center gap-2">
                            <CardTitle className="text-base font-medium">{l.departments?.name}</CardTitle>
                            {l.letter_number && <span className="font-mono text-xs text-muted-foreground">Ref #{l.letter_number}</span>}
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant={l.context === 'COMPANY' ? 'default' : 'secondary'}>{l.context}</Badge>
                            <Badge variant="outline">{l.status}</Badge>
                          </div>
                          {l.status === 'REJECTED' && l.rejection_reason && (
                            <div className="text-xs text-destructive mt-1">
                              Rejected: {l.rejection_reason}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2">

                          <Button size="icon" variant="ghost" onClick={() => setViewingContent(l)} title="View Content" className="h-8 w-8 text-zinc-400 hover:text-white">
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => setTrackingLetter(l)} title="Track Status" className="h-8 w-8 text-blue-400 hover:text-blue-300">
                            <Network className="h-4 w-4" />
                          </Button>

                          {(l.status === 'APPROVED' || l.status === 'ISSUED') && (
                            <Button size="icon" variant="ghost" onClick={() => setViewingQR(l)} title="View QR Code" className="h-8 w-8 text-green-400 hover:text-green-300">
                              <QrCode className="h-4 w-4" />
                            </Button>
                          )}
                          {(l.status === 'APPROVED' || l.status === 'ISSUED' || l.status === 'REJECTED') && <Lock className="h-4 w-4 text-muted-foreground" />}
                        </div>
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
                          <div className="flex gap-2 w-full">
                            <Button
                              size="sm"
                              className="flex-1"
                              variant={l.context === 'COMPANY' ? 'default' : 'secondary'}
                              onClick={() => l.context === 'COMPANY' ? handleApprove(l.id) : handleCommitteeApprove(l.id)} disabled={loading || !isActionAllowed('APPROVE')}
                            >
                              <FileCheck className="mr-2 h-4 w-4" />
                              {l.context === 'COMPANY' ? 'Approve' : 'Cmte Approve'}
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleReject(l.id)} disabled={loading || !isActionAllowed('REJECT')}
                            >
                              Reject
                            </Button>
                          </div>
                        )}
                        {l.status === 'APPROVED' && (
                          <div className="flex gap-2 w-full">
                            <Button size="sm" className="flex-1" onClick={() => handleIssue(l.id)} disabled={loading || !isActionAllowed('ISSUE')}>
                              <ShieldCheck className="mr-2 h-4 w-4" />
                              Issue
                            </Button>
                            <Button size="sm" variant="destructive" onClick={() => handleReject(l.id)} disabled={loading || !isActionAllowed('REJECT')}>
                              Reject
                            </Button>
                          </div>
                        )}
                        {l.status === 'ISSUED' && (
                          <div className="flex gap-2 w-full flex-wrap">
                            <Button size="sm" variant="outline" className="flex-1" onClick={() => handlePrint(l.id)} disabled={loading || !isActionAllowed('PRINT')}>Print</Button>
                            <Button size="sm" variant="outline" className="flex-1" onClick={() => handleReprintRequest(l.id)} disabled={loading || !isActionAllowed('PRINT')}>Request Reprint</Button>
                            <Button size="sm" variant="outline" className="flex-1" onClick={() => handleAcknowledge(l.id)} disabled={loading || !isActionAllowed('PRINT')}>Ack</Button>
                            <Button size="sm" variant="outline" className="flex-1" onClick={() => handleEmailLink(l.id)} disabled={loading || !isActionAllowed('PRINT')}>Link</Button>
                          </div>
                        )}
                        {(l.status !== 'ISSUED' && l.status !== 'APPROVED' && l.status !== 'DRAFT') && (
                          <Button size="sm" variant="ghost" className="w-full text-xs" onClick={() => handleEmailLink(l.id)} disabled={loading || !isActionAllowed('PRINT')}>
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
      <Dialog open={!!trackingLetter} onOpenChange={(open: boolean) => !open && setTrackingLetter(null)}>
        <DialogContent className="max-w-4xl bg-zinc-950 border-zinc-800 h-[600px]">
          <DialogHeader>
            <DialogTitle className="text-white">Letter Tracking</DialogTitle>
            <DialogDescription className="text-zinc-400">Visual status tracking for letter {trackingLetter?.id?.substring(0, 8)}</DialogDescription>
          </DialogHeader>
          <div className="flex-1 w-full h-full min-h-[400px]">
            {trackingLetter && (
              <LetterTrackingFlow letter={trackingLetter} auditLogs={auditLogs.filter(l => l.entity_id === trackingLetter.id)} />
            )}
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={!!viewingContent} onOpenChange={(open: boolean) => !open && setViewingContent(null)}>
        <DialogContent className="max-w-2xl bg-zinc-950 border-zinc-800">
          <DialogHeader>
            <DialogTitle className="text-white">Letter Content</DialogTitle>
            <DialogDescription className="text-zinc-400">
              {viewingContent?.context} Letter - Ref #{viewingContent?.letter_number || viewingContent?.id?.substring(0, 8)}
            </DialogDescription>
          </DialogHeader>
          <div className="bg-zinc-900 p-4 rounded-md border border-zinc-800 text-sm text-zinc-300 whitespace-pre-wrap min-h-[200px]">
            {viewingContent?.content || "No content."}
          </div>
          <div className="flex gap-2 mt-4">
            {viewingContent?.letter_tags?.map((lt: any) => (
              <Badge key={lt.tags.name} variant="secondary" className="text-xs">{lt.tags.name}</Badge>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewingQR} onOpenChange={(open: boolean) => !open && setViewingQR(null)}>
        <DialogContent className="max-w-sm bg-white border-zinc-200">
          <DialogHeader>
            <DialogTitle className="text-black">Verification QR</DialogTitle>
            <DialogDescription className="text-zinc-500">
              Scan to verify this letter.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center justify-center p-6 gap-4">
            {viewingQR && verifyLinks[viewingQR.id] ? (
              <>
                <div className="bg-white p-2">
                  <QRCode value={verifyLinks[viewingQR.id]} size={200} />
                </div>
                <div className="text-[10px] text-center text-zinc-500 font-mono break-all">
                  {verifyLinks[viewingQR.id]}
                </div>
              </>
            ) : (
              <div className="w-[200px] h-[200px] bg-zinc-100 border border-dashed border-zinc-300 flex items-center justify-center text-center text-zinc-500 text-xs px-4">
                Issue the letter to generate a secure verification QR.
              </div>
            )}
            <div className="text-xs text-center text-zinc-500 font-mono">
              {viewingQR?.id}
            </div>
            <div className="flex items-center gap-2 text-green-600 font-medium text-sm">
              <ShieldCheck className="h-4 w-4" />
              Ready for Print
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <OnboardingTour />
      <DemoDebugMenu onRefresh={() => { fetchLetters(); fetchAuditLogs(); }} />
      <LogStream />

    </div>
  );
}

export default App;
