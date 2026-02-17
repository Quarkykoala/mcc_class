process.env.SUPABASE_URL = 'http://localhost';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';

import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

const { mockSupabase, mockLettersQuery, mockLetterTagsQuery, mockAuditLogsQuery } = vi.hoisted(() => {
  const createChainableQuery = () => {
    const query: any = {
      select: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      eq: vi.fn(),
      in: vi.fn(),
      single: vi.fn(),
      order: vi.fn(),
      limit: vi.fn(),
      range: vi.fn(),
      or: vi.fn(),
      then: vi.fn()
    };

    query.select.mockReturnValue(query);
    query.insert.mockReturnValue(query);
    query.update.mockReturnValue(query);
    query.delete.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.in.mockReturnValue(query);
    query.single.mockResolvedValue({ data: null, error: null });
    query.order.mockReturnValue(query);
    query.limit.mockReturnValue(query);
    query.range.mockReturnValue(query);
    query.or.mockReturnValue(query);
    query.then.mockImplementation((resolve: any) => resolve({ data: [], error: null }));

    return query;
  };

  const lettersQuery = createChainableQuery();
  const letterTagsQuery = createChainableQuery();
  const auditLogsQuery = createChainableQuery();
  const genericQuery = createChainableQuery();

  const supabase: any = {
    from: vi.fn((table: string) => {
      if (table === 'letters') return lettersQuery;
      if (table === 'letter_tags') return letterTagsQuery;
      if (table === 'audit_logs') return auditLogsQuery;
      return genericQuery;
    }),
    rpc: vi.fn(async () => ({ data: null, error: null }))
  };

  return {
    mockSupabase: supabase,
    mockLettersQuery: lettersQuery,
    mockLetterTagsQuery: letterTagsQuery,
    mockAuditLogsQuery: auditLogsQuery
  };
});

vi.mock('@supabase/supabase-js', () => ({ createClient: () => mockSupabase }));
vi.mock('./version-manager', () => ({
  handleLetterVersionUpdate: vi.fn(async () => ({ version: 2, hash: 'hash' }))
}));
vi.mock('./auth-middleware', () => ({
  authMiddleware: () => (req: any, _res: any, next: any) => {
    req.user = { id: 'user-1', roles: ['ADMIN', 'APPROVER', 'ISSUER'] };
    req.supabase = mockSupabase;
    next();
  }
}));

import { app } from './index';

describe('POST /api/letters (Save Draft)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'letters') return mockLettersQuery;
      if (table === 'letter_tags') return mockLetterTagsQuery;
      if (table === 'audit_logs') return mockAuditLogsQuery;
      return mockLettersQuery;
    });
    mockLettersQuery.select.mockReturnValue(mockLettersQuery);
    mockLettersQuery.eq.mockReturnValue(mockLettersQuery);
    mockLettersQuery.update.mockReturnValue(mockLettersQuery);
    mockLettersQuery.single.mockResolvedValue({ data: null, error: null });
    mockLetterTagsQuery.delete.mockReturnValue(mockLetterTagsQuery);
    mockLetterTagsQuery.eq.mockReturnValue(mockLetterTagsQuery);
    mockLetterTagsQuery.insert.mockReturnValue(mockLetterTagsQuery);
    mockLetterTagsQuery.then.mockImplementation((resolve: any) => resolve({ data: [], error: null }));
    mockAuditLogsQuery.insert.mockReturnValue(mockAuditLogsQuery);
    mockAuditLogsQuery.then.mockImplementation((resolve: any) => resolve({ data: [], error: null }));
  });

  it('updates a draft and persists selected tags', async () => {
    mockLettersQuery.single
      .mockResolvedValueOnce({
        data: { id: 'l1', context: 'COMPANY', department_id: 'd1', status: 'DRAFT', created_by: 'user-1' },
        error: null
      })
      .mockResolvedValueOnce({
        data: { id: 'l1', content: 'updated content', status: 'DRAFT' },
        error: null
      });

    const res = await request(app).post('/api/letters').send({
      id: 'l1',
      context: 'COMPANY',
      content: 'updated content',
      tag_ids: ['tag-1', 'tag-2']
    });

    expect(res.status).toBe(200);
    expect(mockSupabase.from).toHaveBeenCalledWith('letter_tags');
    expect(mockLetterTagsQuery.delete).toHaveBeenCalled();
    expect(mockLetterTagsQuery.eq).toHaveBeenCalledWith('letter_id', 'l1');
    expect(mockLetterTagsQuery.insert).toHaveBeenCalledWith([
      { letter_id: 'l1', tag_id: 'tag-1' },
      { letter_id: 'l1', tag_id: 'tag-2' }
    ]);
  });

  it('rejects empty draft content', async () => {
    const res = await request(app).post('/api/letters').send({
      id: 'l1',
      content: ''
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('content is required.');
  });
});
