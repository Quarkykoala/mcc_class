import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

const mockQuery = vi.fn();
const mockQueryOne = vi.fn();
const mockExecute = vi.fn();

vi.mock('./db', () => ({
  query: (...args: unknown[]) => mockQuery(...args),
  queryOne: (...args: unknown[]) => mockQueryOne(...args),
  execute: (...args: unknown[]) => mockExecute(...args),
  transaction: vi.fn(),
  queryWithConn: vi.fn(),
  queryOneWithConn: vi.fn(),
  executeWithConn: vi.fn(),
}));

vi.mock('./auth-middleware', () => ({
  authMiddleware: () => (req: any, _res: any, next: any) => {
    req.user = { id: 'user-123', roles: ['USER'] };
    next();
  }
}));

vi.mock('./auth-routes', () => {
  return { default: (req: any, res: any, next: any) => next(), verifyToken: vi.fn() };
});

import { app } from './app';

describe('GET /api/letters/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQuery.mockResolvedValue([]);
    mockQueryOne.mockResolvedValue(null);
  });

  it('fetches a single letter with content', async () => {
    // router.get('/letters/:id') calls queryOne for auth check:
    mockQueryOne.mockResolvedValueOnce({
      id: 'letter-detail-1', content: 'Full content of the letter', status: 'DRAFT',
      created_at: new Date().toISOString(), created_by: 'user-123',
      department_id: 'dept-1', dept_name: 'HR'
    });

    // getLetterDetail calls queryOne AGAIN for the actual fetch:
    mockQueryOne.mockResolvedValueOnce({
      id: 'letter-detail-1', content: 'Full content of the letter', status: 'DRAFT',
      created_at: new Date().toISOString(), created_by: 'user-123',
      department_id: 'dept-1', dept_name: 'HR'
    });

    // loadLetterRelations calls query twice for tags and assignments
    mockQuery
      .mockResolvedValueOnce([]) // tags
      .mockResolvedValueOnce([]); // assignments

    const res = await request(app).get('/api/letters/letter-detail-1');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('letter-detail-1');
    expect(res.body.content).toBe('Full content of the letter');
  });
});
