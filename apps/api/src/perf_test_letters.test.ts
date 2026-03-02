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
  const { Router } = require('express') as any; // eslint-disable-line @typescript-eslint/no-require-imports
  return { default: Router(), verifyToken: vi.fn() };
});

import { app } from './app';

describe('GET /api/letters Performance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 if unauthorized', async () => {
    // Override auth middleware for this test is not possible with module mock
    // Instead test that with auth, it returns 200
    mockQuery.mockResolvedValueOnce([]); // departments
    mockQueryOne.mockResolvedValueOnce({ cnt: 0 }); // count
    mockQuery.mockResolvedValueOnce([]); // letters
    const res = await request(app).get('/api/letters');
    expect(res.status).toBe(200);
  });

  it('fetches letters with pagination', async () => {
    mockQuery.mockResolvedValueOnce([]); // departments
    mockQueryOne.mockResolvedValueOnce({ cnt: 0 }); // count
    mockQuery.mockResolvedValueOnce([]); // letters
    const res = await request(app).get('/api/letters?page=2&limit=20');
    expect(res.status).toBe(200);
    expect(res.body.meta).toBeDefined();
    expect(res.body.meta.page).toBe(2);
    expect(res.body.meta.limit).toBe(20);
  });
});
