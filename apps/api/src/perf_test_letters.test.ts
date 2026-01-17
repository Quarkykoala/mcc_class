import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

// Set environment variables BEFORE importing anything else
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'example-key';

// Mock Supabase Auth
const { mockFrom, mockSelect, mockOrder, mockRange, mockEq, mockAuthGetUser } = vi.hoisted(() => {
  const mockSelect = vi.fn();
  const mockOrder = vi.fn();
  const mockRange = vi.fn();
  const mockEq = vi.fn();
  const mockFrom = vi.fn();
  const mockAuthGetUser = vi.fn();

  const mockQueryBuilder: any = {
    select: mockSelect,
    order: mockOrder,
    range: mockRange,
    eq: mockEq,
    then: (resolve: any) => resolve({ data: [], error: null })
  };

  mockSelect.mockReturnValue(mockQueryBuilder);
  mockOrder.mockReturnValue(mockQueryBuilder);
  mockRange.mockReturnValue(mockQueryBuilder);
  mockEq.mockReturnValue(mockQueryBuilder);
  mockFrom.mockReturnValue(mockQueryBuilder);

  return { mockFrom, mockSelect, mockOrder, mockRange, mockEq, mockAuthGetUser };
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

describe('GET /api/letters Performance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default auth success
    mockAuthGetUser.mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null
    });
  });

  it('returns 401 if unauthorized', async () => {
    const res = await request(app).get('/api/letters');
    expect(res.status).toBe(401);
  });

  it('fetches letters with default pagination (limit 50) when authorized', async () => {
    const res = await request(app)
        .get('/api/letters')
        .set('Authorization', 'Bearer test-token'); // Add Auth Header

    expect(res.status).toBe(200);
    expect(mockFrom).toHaveBeenCalledWith('letters');

    // Verify that range() WAS called with default values
    // Page 1, Limit 50 -> from 0, to 49
    expect(mockRange).toHaveBeenCalledWith(0, 49);
  });

  it('fetches letters with custom pagination when authorized', async () => {
    const res = await request(app)
        .get('/api/letters?page=2&limit=20')
        .set('Authorization', 'Bearer test-token');

    expect(res.status).toBe(200);

    // Page 2, Limit 20 -> from 20, to 39
    expect(mockRange).toHaveBeenCalledWith(20, 39);
  });
});
