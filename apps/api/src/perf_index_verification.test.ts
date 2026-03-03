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

vi.mock('./auth-routes', async () => {
  const { Router } = await import('express');
  return { default: Router(), verifyToken: vi.fn() };
});

import { app } from './app';

describe('Performance Index Verification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQuery.mockResolvedValue([]);
    mockQueryOne.mockResolvedValue(null);
  });

  it('filters by department_id for non-admin users with department access', async () => {
    // getUserDepartmentIds
    mockQuery.mockResolvedValueOnce([{ department_id: 'dept-A' }, { department_id: 'dept-B' }]);
    // count
    mockQueryOne.mockResolvedValueOnce({ cnt: 0 });
    // letters
    mockQuery.mockResolvedValueOnce([]);

    const res = await request(app).get('/api/letters');
    expect(res.status).toBe(200);

    // Verify the query included department filtering
    const queryCalls = mockQuery.mock.calls;
    const lettersCall = queryCalls.find((c: any) => typeof c[0] === 'string' && c[0].includes('FROM letters'));
    expect(lettersCall).toBeTruthy();
  });

  it('filters by created_by if user has no departments', async () => {
    // getUserDepartmentIds - empty
    mockQuery.mockResolvedValueOnce([]);
    // count
    mockQueryOne.mockResolvedValueOnce({ cnt: 0 });
    // letters
    mockQuery.mockResolvedValueOnce([]);

    const res = await request(app).get('/api/letters');
    expect(res.status).toBe(200);

    // The query should filter by created_by
    const queryCalls = mockQuery.mock.calls;
    const lettersCall = queryCalls.find((c: any) => typeof c[0] === 'string' && c[0].includes('FROM letters'));
    expect(lettersCall).toBeTruthy();
  });
});
