
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
          _table: '',
          select: vi.fn(function(this: any, cols: string) {
              this._columns = cols;
              return this;
          }),
          eq: vi.fn(function(this: any) { return this; }),
          single: vi.fn(function(this: any) { return this; }),
          then: function(this: any, resolve: any) {
             // Logic based on table name would be great, but 'from' created this builder.
             // We can capture table name in the factory closure if we change how it's called.
             // But here we rely on what columns were selected or just return a generic structure that works for both.

             // If query is for roles (select('role'))
             if (this._columns === 'role') {
                 resolve({ data: [{ role: 'USER' }], error: null });
                 return;
             }

             // If query is for user_departments (select('department_id'))
             if (this._columns === 'department_id') {
                 resolve({ data: [{ department_id: 'dept-1' }], error: null });
                 return;
             }

             // Otherwise assume it's the letter query
             const data = {
                id: 'letter-detail-1',
                content: 'Full content of the letter',
                status: 'DRAFT',
                created_at: new Date().toISOString(),
                created_by: 'user-123',
                department_id: 'dept-1',
                departments: { name: 'HR' },
                letter_tags: [],
                letter_approver_assignments: []
             };

             resolve({ data, error: null });
          }
      };
      return builder;
  };

  mockFrom.mockImplementation((table: string) => {
      const builder = createQueryBuilder();
      builder._table = table;
      return builder;
  });

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

describe('GET /api/letters/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthGetUser.mockResolvedValue({
        data: { user: { id: 'user-123', roles: ['USER'] } },
        error: null
    });
  });

  it('fetches a single letter with content', async () => {
    const res = await request(app)
        .get('/api/letters/letter-detail-1')
        .set('Authorization', 'Bearer test-token');

    if (res.status !== 200) {
        console.log('Error Response:', res.body);
    }
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('letter-detail-1');
    expect(res.body.content).toBe('Full content of the letter');
  });
});
