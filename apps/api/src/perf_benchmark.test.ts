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
  const { Router } = require('express');
  return { default: Router(), verifyToken: vi.fn() };
});

import { app } from './app';

describe('Performance Benchmark: GET /api/letters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('measures response size', async () => {
    // getUserDepartmentIds
    mockQuery.mockResolvedValueOnce([{ department_id: 'd1' }]);
    // count query
    mockQueryOne.mockResolvedValueOnce({ cnt: 10 });
    // letters query
    const letters = Array(10).fill(0).map((_, i) => ({
      id: `letter-${i}`, status: 'DRAFT', created_at: new Date().toISOString(),
      dept_name: 'HR', created_by: 'user-123', department_id: 'd1',
      context: 'COMPANY', title: null, job_reference: null, letter_number: null,
      rejection_reason: null, approval_mode: 'ALL', updated_at: null
    }));
    mockQuery.mockResolvedValueOnce(letters);
    // tags + assignments
    mockQuery.mockResolvedValueOnce([]);
    mockQuery.mockResolvedValueOnce([]);

    const res = await request(app).get('/api/letters');
    expect(res.status).toBe(200);
    const size = JSON.stringify(res.body).length;
    console.log('Response Size:', size, 'bytes');
  });
});
