import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

// Mocks must be hoisted
const { mockSupabase, mockQuery } = vi.hoisted(() => {
  const query: any = {
    select: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn(), eq: vi.fn(), in: vi.fn(),
    single: vi.fn(), order: vi.fn(), limit: vi.fn(), range: vi.fn(), or: vi.fn(), then: vi.fn()
  };

  // Chainable methods return the query object
  Object.keys(query).forEach((key) => {
    if (key !== 'then') query[key].mockReturnValue(query);
  });

  // Default resolution
  query.then.mockImplementation((resolve: any) => resolve({ data: [], error: null, count: 0 }));

  const supabase: any = {
    from: vi.fn(() => query),
  };
  return { mockSupabase: supabase, mockQuery: query };
});

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => mockSupabase,
}));

// Mock Auth Middleware to simulate a regular user (not admin)
vi.mock('./auth-middleware', () => ({
  authMiddleware: () => (req: any, _res: any, next: any) => {
    req.user = { id: 'user-123', roles: ['USER'] }; // Not ADMIN
    req.supabase = mockSupabase;
    next();
  }
}));

import { app } from './index';

describe('Performance Index Verification', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Reset chainable returns
    Object.keys(mockQuery).forEach((key) => {
      if (key !== 'then') mockQuery[key].mockReturnValue(mockQuery);
    });
    mockQuery.then.mockImplementation((resolve: any) => resolve({ data: [], error: null, count: 0 }));
  });

  it('filters by department_id for non-admin users with department access', async () => {
    // 1. Mock getUserDepartmentIds response
    // The code calls: req.supabase.from('user_departments').select('department_id').eq('user_id', req.user.id)

    // We need to handle the chain of calls for user_departments lookup
    // The same query mock is used for both 'letters' and 'user_departments'
    // So we need to handle the sequence or context.

    // Since `mockSupabase.from` returns `mockQuery`, we can't easily distinguish tables unless we inspect the call.
    // However, the code flow is:
    // 1. getUserDepartmentIds -> selects from user_departments
    // 2. main query -> selects from letters

    // Let's inspect the `mockSupabase.from` calls to distinguish.

    // Simpler approach: mockQuery.then returns different things based on order.
    // First call is likely user_departments (if we assume serial execution and no other queries).

    mockQuery.then
      // First call: user_departments
      .mockImplementationOnce((resolve: any) => resolve({
        data: [{ department_id: 'dept-A' }, { department_id: 'dept-B' }],
        error: null
      }))
      // Second call: letters query execution
      .mockImplementationOnce((resolve: any) => resolve({
        data: [],
        error: null,
        count: 0
      }));

    const res = await request(app).get('/api/letters');

    expect(res.status).toBe(200);

    // Verify 'letters' table was queried
    expect(mockSupabase.from).toHaveBeenCalledWith('letters');

    // Verify .or() was called with department_id logic
    // The code: query.or(`created_by.eq.${req.user.id},department_id.in.(${deptIds.join(',')})`);

    const expectedOrClause = `created_by.eq.user-123,department_id.in.(dept-A,dept-B)`;
    expect(mockQuery.or).toHaveBeenCalledWith(expectedOrClause);
  });

  it('does NOT filter by department_id if user has no departments', async () => {
      mockQuery.then
        // First call: user_departments -> empty
        .mockImplementationOnce((resolve: any) => resolve({
          data: [],
          error: null
        }))
        // Second call: letters query
        .mockImplementationOnce((resolve: any) => resolve({
          data: [],
          error: null,
          count: 0
        }));

      const res = await request(app).get('/api/letters');

      expect(res.status).toBe(200);

      // Verify .or() was NOT called
      expect(mockQuery.or).not.toHaveBeenCalled();

      // Verify .eq('created_by', ...) was called instead
      expect(mockQuery.eq).toHaveBeenCalledWith('created_by', 'user-123');
    });
});
