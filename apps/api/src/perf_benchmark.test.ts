
// Set environment variables BEFORE importing anything else
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'example-key';
process.env.DEMO_MODE = 'false';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

// Mock Supabase Auth
const { mockFrom, mockAuthGetUser } = vi.hoisted(() => {
  const mockAuthGetUser = vi.fn();
  const mockFrom = vi.fn();

  const createQueryBuilder = () => {
      const builder: any = {
          _columns: '',
          select: vi.fn(function(this: any, cols: string) {
              this._columns = cols;
              return this;
          }),
          order: vi.fn(function(this: any) { return this; }),
          range: vi.fn(function(this: any) { return this; }),
          eq: vi.fn(function(this: any) { return this; }),
          or: vi.fn(function(this: any) { return this; }),
          count: 'exact',
          then: function(this: any, resolve: any) {
             // Simulate data based on columns
             const hasContent = this._columns && this._columns.includes('content');
             // console.log('Query Resolving. Columns:', this._columns, 'HasContent:', hasContent);

             const data = Array(10).fill(0).map((_, i) => ({
                id: `letter-${i}`,
                content: hasContent ? 'A'.repeat(50000) : undefined, // 50KB per item
                status: 'DRAFT',
                created_at: new Date().toISOString(),
                departments: { name: 'HR' },
                letter_tags: [],
                letter_approver_assignments: []
             }));

             // If this was the 'user_departments' query (hacky check), return something else
             if (this._columns === 'department_id') {
                 resolve({ data: [{ department_id: 'd1' }], error: null });
             } else {
                 resolve({ data, error: null, count: 10 });
             }
          }
      };
      return builder;
  };

  mockFrom.mockImplementation(() => createQueryBuilder());

  return { mockFrom, mockAuthGetUser };
});

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: mockFrom,
    auth: {
        getUser: mockAuthGetUser
    }
  }),
}));

// Import app AFTER mocking
import { app } from './index';

describe('Performance Benchmark: GET /api/letters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthGetUser.mockResolvedValue({
        data: { user: { id: 'user-123', roles: ['USER'] } },
        error: null
    });
  });

  it('measures response size', async () => {
    const res = await request(app)
        .get('/api/letters')
        .set('Authorization', 'Bearer test-token');

    expect(res.status).toBe(200);

    const size = JSON.stringify(res.body).length;
    console.log(`Response Size: ${size} bytes`);

    // 500KB + overhead
    if (size > 100000) {
        console.log('PERF_RESULT: LARGE_PAYLOAD_DETECTED');
    } else {
        console.log('PERF_RESULT: OPTIMIZED_PAYLOAD_DETECTED');
    }
  });
});
