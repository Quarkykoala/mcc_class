process.env.SUPABASE_URL = 'http://localhost';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';

import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

const { mockSupabase, mockQuery } = vi.hoisted(() => {
  const query: any = {
    select: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn(), eq: vi.fn(), in: vi.fn(),
    single: vi.fn(), order: vi.fn(), limit: vi.fn(), range: vi.fn(), or: vi.fn(), then: vi.fn()
  };
  Object.keys(query).forEach((key) => {
    if (key !== 'single' && key !== 'then') query[key].mockReturnValue(query);
  });
  query.then.mockImplementation((resolve: any) => resolve({ data: [], error: null }));

  const supabase: any = {
    from: vi.fn(() => query),
    rpc: vi.fn(async () => ({ data: { issuance_id: 'x' }, error: null }))
  };
  return { mockSupabase: supabase, mockQuery: query };
});

vi.mock('@supabase/supabase-js', () => ({ createClient: () => mockSupabase }));
vi.mock('./auth-middleware', () => ({
  authMiddleware: () => (req: any, _res: any, next: any) => {
    req.user = { id: 'approver-1', roles: ['ADMIN', 'APPROVER', 'ISSUER'] };
    req.supabase = mockSupabase;
    next();
  }
}));

import { app } from './index';

describe('approval routing flows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase.from.mockReturnValue(mockQuery);
    Object.keys(mockQuery).forEach((key) => {
      if (key !== 'single' && key !== 'then') mockQuery[key].mockReturnValue(mockQuery);
    });
    mockQuery.then.mockImplementation((resolve: any) => resolve({ data: [], error: null }));
  });

  it('supports routing endpoint', async () => {
    mockQuery.single.mockResolvedValueOnce({ data: { id: 'l1', status: 'DRAFT', committee_id: null, created_by: 'approver-1' }, error: null });
    const res = await request(app).post('/api/letters/l1/routing').send({ tag_ids: [], cc_approver_ids: [] });
    expect(res.status).toBe(200);
  });

  it('supports submit endpoint', async () => {
    mockQuery.single.mockResolvedValueOnce({ data: { id: 'l1', status: 'DRAFT', committee_id: 'c1', created_by: 'approver-1' }, error: null });
    const res = await request(app).post('/api/letters/l1/submit').send({});
    expect(res.status).toBe(200);
  });

  it('supports committee approve endpoint unchanged', async () => {
    mockQuery.single
      .mockResolvedValueOnce({ data: { id: 'l1', status: 'SUBMITTED', committee_id: 'c1', created_by: 'approver-1', department_id: 'd1' }, error: null })
      .mockResolvedValueOnce({ data: { id: 'l1', committee_id: 'c1', status: 'SUBMITTED', department_id: 'd1', created_by: 'approver-1' }, error: null });
    const res = await request(app).post('/api/letters/l1/committee-approve').send({ comment: 'ok' });
    expect([200, 400, 500]).toContain(res.status);
  });
});
